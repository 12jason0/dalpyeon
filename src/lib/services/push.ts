import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import type { DB } from "../db";
import { careRequests, careResponses, periods, pushSubscriptions, users } from "../db/schema";
import { diffDays, formatDay, timeSeoul, todaySeoul } from "../dates";
import { errorKind, fail } from "../errors";
import { endQuestion, estimate } from "../prediction";
import { limit, type User } from "./auth";
import { careLabel, recentReplies, replySentence, RESPONSES, sharedCare, type ResponseKey } from "./care";
import { activeCouple, otherNickname } from "./couples";
import { listPeriods } from "./periods";

export const REMINDER_DAYS = 3;

/** title을 비우면 앱 이름. 상대가 보낸 알림은 상대 이름을 쓴다. 건강 정보·요청 내용은 잠금 화면에 보이므로 넣지 않는다. */
export type PushMessage = { title?: string; body: string; url: string };
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Sender = (target: PushTarget, payload: string) => Promise<void>;

// 서버가 이 주소로 직접 요청을 보내므로, 브라우저 공식 푸시 서비스만 받는다.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];

function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

const shortText = (value: unknown) => {
  const text = String(value ?? "");
  return text.length > 0 && text.length <= 256 ? text : "";
};

/** 같은 기기로 다른 계정이 구독하면 그 기기는 새 계정의 것이 된다. */
export async function saveSubscription(db: DB, user: User, input: { endpoint: unknown; p256dh: unknown; auth: unknown }) {
  const endpoint = String(input.endpoint ?? "");
  const p256dh = shortText(input.p256dh);
  const auth = shortText(input.auth);
  if (endpoint.length > 1024 || !isPushEndpoint(endpoint) || !p256dh || !auth) fail("알림을 켤 수 없는 기기예요");
  await db.insert(pushSubscriptions).values({ id: randomUUID(), userId: user.id, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh, auth } });
}

export async function removeSubscription(db: DB, user: User, endpoint: unknown) {
  await db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, String(endpoint ?? ""))));
}

const webPushSender: Sender = async (target, payload) => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return; // 키를 넣기 전에는 조용히 건너뛴다
  const { default: webpush } = await import("web-push");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webpush.sendNotification(target, payload, { TTL: 86400 });
};

/** 한 사람의 모든 기기로 보낸다. 사라진 구독(404·410)은 지우고, 다른 실패는 기록만 남긴다. */
export async function sendPush(db: DB, userId: string, message: PushMessage, sender: Sender = webPushSender) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const payload = JSON.stringify({ ...message, title: message.title || "디어데이" });
  await Promise.all(subs.map(async (sub) => {
    try {
      await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // 기기에서 알림을 끄거나 앱을 지우면 생긴다. 조용히 지우면 "왜 안 오지"를 알 수 없어서 남긴다.
        console.warn("push subscription gone", status);
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else console.error("push failed", status);
    }
  }));
}

/** 알림 실패가 원래 동작을 막으면 안 된다. */
async function quietly(work: () => Promise<void>) {
  try {
    await work();
  } catch (e) {
    console.error("notify failed", errorKind(e));
  }
}

/** 알림 제목에 쓸 보낸 사람 이름. 마이에서 바꾼 이름을 쓰려고 DB에서 다시 읽는다. 비어 있으면 "파트너". */
async function senderName(db: DB, sender: User) {
  const [row] = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, sender.id));
  return row?.nickname?.trim() || "파트너";
}

/** 코드로 연결된 직후. 모르는 사람이면 바로 끊을 수 있게 기록자에게 알린다. */
export function notifyConnected(db: DB, partner: User, sender?: Sender) {
  return quietly(async () => {
    const couple = await activeCouple(db, partner.id);
    if (couple?.partnerId === partner.id) await sendPush(db, couple.recorderId, { title: await senderName(db, partner), body: "연결됐어요", url: "/connect" }, sender);
  });
}

/** 파트너에게 실제로 보이는 오늘 요청이 있을 때만 알린다. 연결·일시정지·공유 조건은 sharedCare가 다시 본다. */
export function notifyCare(db: DB, owner: User, today = todaySeoul(), sender?: Sender) {
  return quietly(async () => {
    const couple = await activeCouple(db, owner.id);
    if (couple?.recorderId !== owner.id) return;
    const visible = await sharedCare(db, couple, today);
    if (visible.some((c) => c.day === today)) await sendPush(db, couple.partnerId, { title: await senderName(db, owner), body: "배려 요청을 보냈어요", url: "/news" }, sender);
  });
}

export const REPLY_PUSH_MAX = 3;
export const REPLY_PUSH_SECONDS = 60;

/**
 * 답장이 생기거나 바뀔 때마다 기록자에게 알린다(같은 답장을 다시 누른 것은 respondToCare가 걸러 부르지 않는다).
 * 내용은 답장 그대로("봤어요" 등). 한 요청에 1분 안에는 3번까지만 보내고 그 이상은 조용히 건너뛴다.
 */
export function notifyReply(db: DB, partner: User, careId: string, response: ResponseKey, today = todaySeoul(), sender?: Sender) {
  return quietly(async () => {
    const couple = await activeCouple(db, partner.id);
    if (couple?.partnerId !== partner.id) return;
    const visible = await sharedCare(db, couple, today);
    if (!visible.some((c) => c.id === careId)) return;
    try {
      await limit(db, "reply-push", careId, REPLY_PUSH_MAX, REPLY_PUSH_SECONDS);
    } catch {
      return; // 1분 안에 3번을 넘김
    }
    await sendPush(db, couple.recorderId, { title: await senderName(db, partner), body: RESPONSES[response], url: "/news" }, sender);
  });
}

export async function reminderEnabled(db: DB, userId: string) {
  const [row] = await db.select({ on: users.reminderEnabled }).from(users).where(eq(users.id, userId));
  return row?.on ?? false;
}

export async function setReminder(db: DB, user: User, on: boolean) {
  await db.update(users).set({ reminderEnabled: on }).where(eq(users.id, user.id));
}

/** 하루 한 번, 기록자 본인에게만: 예정일 3일 전 알림(예정일마다 한 번), 예상 종료일이 지난 생리 확인(기록마다 한 번). */
export async function sendReminders(db: DB, today = todaySeoul(), sender?: Sender) {
  const rows = await db.selectDistinct({ id: users.id, usual: users.usualCycleDays }).from(users)
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .where(and(eq(users.role, "recorder"), eq(users.reminderEnabled, true)));
  let sent = 0;
  for (const { id, usual } of rows) {
    await quietly(async () => {
      const prediction = estimate(await listPeriods(db, id), [], today, usual);
      const expected = prediction.period?.startDate;
      if (!expected || diffDays(expected, today) !== REMINDER_DAYS) return;
      const claimed = await db.update(users).set({ reminderSentFor: expected })
        .where(and(eq(users.id, id), or(isNull(users.reminderSentFor), ne(users.reminderSentFor, expected))))
        .returning({ id: users.id });
      if (!claimed.length) return;
      await sendPush(db, id, { body: "오늘 확인할 소식이 있어요", url: "/" }, sender);
      sent++;
    });
    await quietly(async () => {
      const question = endQuestion(await listPeriods(db, id), today);
      if (!question?.id) return;
      const claimed = await db.update(periods).set({ endAskSent: true })
        .where(and(eq(periods.id, question.id), eq(periods.endAskSent, false))).returning({ id: periods.id });
      if (!claimed.length) return;
      await sendPush(db, id, { body: "오늘 기록을 확인해 주세요", url: "/" }, sender);
      sent++;
    });
  }
  return sent;
}

/** CRON_SECRET이 비어 있으면 아무도 통과하지 못한다. */
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type News = { replies: number; care: number };

/** 알림을 거부한 사람도 볼 수 있는 새 소식. */
export async function newsFor(db: DB, user: User, today = todaySeoul()): Promise<News> {
  const [[me], couple] = await Promise.all([
    db.select({ seen: users.newsSeenAt }).from(users).where(eq(users.id, user.id)), activeCouple(db, user.id),
  ]);
  const since = me?.seen ?? new Date(0);
  if (user.role === "recorder") {
    if (!couple) return { replies: 0, care: 0 };
    const [{ total }] = await db.select({ total: count() }).from(careResponses)
      .where(and(eq(careResponses.coupleId, couple.id), gt(careResponses.updatedAt, since)));
    return { replies: total, care: 0 };
  }
  if (couple?.partnerId !== user.id) return { replies: 0, care: 0 };
  const unanswered = (await sharedCare(db, couple, today)).filter((c) => !c.response).map((c) => c.id);
  if (!unanswered.length) return { replies: 0, care: 0 };
  const [{ total }] = await db.select({ total: count() }).from(careRequests)
    .where(and(inArray(careRequests.id, unanswered), gt(careRequests.updatedAt, since)));
  return { replies: 0, care: total };
}

/** 새 소식 시트의 한 줄. 누르면 href로 간다(배려 요청·답장은 홈의 배려 카드). */
export type NewsItem = { id: string; title: string; body: string; detail: string; when: string; href: string };

/**
 * 새 소식 시트의 목록. 기록자는 파트너 답장(최근 것부터), 파트너는 지금 보이는 배려 요청.
 * 공유 조건(연결·잠시 멈추기·요청별 공유)은 sharedCare가 다시 본다.
 */
export async function newsItems(db: DB, user: User, today = todaySeoul()): Promise<NewsItem[]> {
  const couple = await activeCouple(db, user.id);
  if (!couple) return [];
  const name = (await otherNickname(db, couple, user)) || "파트너";
  const when = (day: string) => (day === today ? "오늘" : formatDay(day));
  const what = (presets: string[], message: string | null) => [...presets.map(careLabel), ...(message ? [`“${message}”`] : [])].join(" · ");
  if (user.role === "recorder") {
    return (await recentReplies(db, couple)).map((r) => ({
      id: `reply-${r.id}`, title: `${when(r.day)} 배려 요청`, body: replySentence(name, r.response), detail: what(r.presets, r.message),
      when: timeSeoul(r.respondedAt), href: "/",
    }));
  }
  if (couple.partnerId !== user.id) return [];
  return (await sharedCare(db, couple, today)).map((c) => ({
    id: `care-${c.id}`, title: `${name}님의 배려 요청`, body: what(c.presets, c.message),
    detail: c.response ? `내 답장: ${RESPONSES[c.response]}` : "아직 답장하지 않았어요", when: when(c.day), href: "/",
  }));
}

export async function markNewsSeen(db: DB, user: User) {
  await db.update(users).set({ newsSeenAt: new Date() }).where(eq(users.id, user.id));
}
