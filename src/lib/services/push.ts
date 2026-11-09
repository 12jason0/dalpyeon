import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { DB } from "../db";
import { couples, partnerAlerts, periods, pushSubscriptions, users, type PartnerAlertKind } from "../db/schema";
import { addDays, diffDays, formatDay, timeSeoul, todaySeoul } from "../dates";
import { errorKind, fail } from "../errors";
import { endQuestion, estimate } from "../prediction";
import { limit, type User } from "./auth";
import { careLabel, recentReplies, replySentence, sharedCare } from "./care";
import { activeCouple, otherNickname, requireRole, type Couple } from "./couples";
import { receivedNotes } from "./notes";
import { listPeriods, predictionFor } from "./periods";

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
async function senderName(db: DB, sender: Pick<User, "id">) {
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

export const NOTE_PUSH_MAX = 3;
export const NOTE_PUSH_SECONDS = 60;

/**
 * 상대에게 쪽지 알림. 제목은 보낸 사람 이름, 본문은 쪽지 그대로. 보낸 사람마다 1분에 3번까지만 보내고 넘으면 조용히 건너뛴다.
 * 보낼 수 있는지(연결·잠시 멈추기)는 sendNote가 이미 확인했다.
 */
export function notifyNote(db: DB, from: User, to: string, body: string, sender?: Sender) {
  return quietly(async () => {
    try {
      await limit(db, "note-push", from.id, NOTE_PUSH_MAX, NOTE_PUSH_SECONDS);
    } catch {
      return; // 1분 안에 3번을 넘김
    }
    await sendPush(db, to, { title: await senderName(db, from), body, url: "/" }, sender);
  });
}

// ── 파트너가 받는 주기 알림 ─────────────────────────
// 시작·끝은 기록자가 누를 때(끝은 크론의 자동 종료 때도), 예정일 하루 전·가임기 첫날·배란일은 매일 9시 크론이 보낸다.
// 쪽지의 1분 3번 제한과는 따로: 같은 알림은 (연결, 종류, 날)마다 한 번이다.

/** 마이의 토글 이름과 알림 본문. 잠금 화면에 보이므로 본문에 건강 단어를 쓰지 않는다. */
export const PARTNER_ALERTS: Record<PartnerAlertKind, { label: string; body: string }> = {
  start: { label: "시작", body: "오늘부터 조금 더 챙겨주세요" },
  upcoming: { label: "예정일 하루 전", body: "내일쯤 컨디션이 바뀔 수 있어요" },
  end: { label: "끝", body: "이번 주기가 끝났어요" },
  fertile: { label: "가임기·배란일", body: "달력에 새 표시가 생겼어요" },
};
export const ALERT_KINDS = Object.keys(PARTNER_ALERTS) as PartnerAlertKind[];
export type AlertSettings = Record<PartnerAlertKind, boolean>;

const ALERT_COLUMNS = { start: users.alertStart, upcoming: users.alertUpcoming, end: users.alertEnd, fertile: users.alertFertile } as const;

export async function alertSettings(db: DB, userId: string): Promise<AlertSettings> {
  const [row] = await db.select(ALERT_COLUMNS).from(users).where(eq(users.id, userId));
  return row ?? { start: true, upcoming: true, end: false, fertile: false };
}

/** 파트너 마이의 "받을 알림". 값이 true가 아니면 꺼짐으로 저장한다. */
export async function setAlertSettings(db: DB, user: User, input: Partial<Record<PartnerAlertKind, unknown>>) {
  requireRole(user, "partner");
  const on = (kind: PartnerAlertKind) => input[kind] === true;
  await db.update(users).set({ alertStart: on("start"), alertUpcoming: on("upcoming"), alertEnd: on("end"), alertFertile: on("fertile") })
    .where(eq(users.id, user.id));
}

/**
 * 파트너에게 주기 알림 하나. 잠시 멈췄거나 파트너가 끈 알림이면 아무것도 하지 않는다.
 * 보내기 전에 기록을 먼저 남긴다: 새 소식 시트에 같은 문구로 보이고(푸시를 안 켠 파트너도), 같은 날 같은 알림은 한 번만 간다.
 */
async function alertPartner(db: DB, couple: Couple, kind: PartnerAlertKind, today: string, sender?: Sender) {
  if (couple.status !== "active" || couple.paused) return false;
  const [partner] = await db.select({ on: ALERT_COLUMNS[kind] }).from(users).where(eq(users.id, couple.partnerId));
  if (!partner?.on) return false;
  const claimed = await db.insert(partnerAlerts).values({ id: randomUUID(), coupleId: couple.id, kind, day: today })
    .onConflictDoNothing().returning({ id: partnerAlerts.id });
  if (!claimed.length) return false;
  await sendPush(db, couple.partnerId, { title: await senderName(db, { id: couple.recorderId }), body: PARTNER_ALERTS[kind].body, url: "/" }, sender);
  return true;
}

/** 이 사람이 기록자인 연결. 그 기록이 파트너에게 보이지 않으면(공유 시작일 이전) null. */
async function recorderCouple(db: DB, ownerId: string, startDate: string) {
  const couple = await activeCouple(db, ownerId);
  return couple?.recorderId === ownerId && startDate >= couple.shareFrom ? couple : null;
}

/** "오늘 시작했어요". 지난 날짜로 넣은 기록은 알리지 않는다. */
export function notifyPeriodStart(db: DB, ownerId: string, startDate: string, today = todaySeoul(), sender?: Sender) {
  return quietly(async () => {
    if (startDate !== today) return;
    const couple = await recorderCouple(db, ownerId, startDate);
    if (couple) await alertPartner(db, couple, "start", today, sender);
  });
}

/** "끝났어요"를 누르거나 크론이 자동으로 끝냈을 때. */
export function notifyPeriodEnd(db: DB, ownerId: string, startDate: string, today = todaySeoul(), sender?: Sender) {
  return quietly(async () => {
    const couple = await recorderCouple(db, ownerId, startDate);
    if (couple) await alertPartner(db, couple, "end", today, sender);
  });
}

/** 매일 9시 크론: 예측 시작일이 내일이면 예정일 하루 전, 오늘이 가임기 첫날이거나 배란일이면 가임기 알림. 보낸 개수를 돌려준다. */
export async function sendPartnerAlerts(db: DB, today = todaySeoul(), sender?: Sender) {
  const rows = await db.select({ couple: couples }).from(couples).innerJoin(users, eq(users.id, couples.partnerId))
    .where(and(eq(couples.status, "active"), eq(couples.paused, false), or(eq(users.alertUpcoming, true), eq(users.alertFertile, true))));
  let sent = 0;
  for (const { couple } of rows) {
    await quietly(async () => {
      const prediction = await predictionFor(db, couple.recorderId, today);
      const due: PartnerAlertKind[] = [];
      if (prediction.period?.startDate === addDays(today, 1)) due.push("upcoming");
      if (prediction.fertileWindow?.startDate === today || prediction.ovulation?.estimatedDate === today) due.push("fertile");
      for (const kind of due) if (await alertPartner(db, couple, kind, today, sender)) sent++;
    });
  }
  return sent;
}

/** 새 소식 시트용: 이 연결에서 파트너에게 간 주기 알림, 최근 것부터. */
function recentAlerts(db: DB, couple: Couple) {
  return db.select().from(partnerAlerts).where(eq(partnerAlerts.coupleId, couple.id)).orderBy(desc(partnerAlerts.createdAt)).limit(20);
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

export type News = { replies: number; care: number; notes: number; alerts: number };

/**
 * 알림을 거부한 사람도 볼 수 있는 새 소식(헤더의 빨간 점). 페이지 데이터와 겹치는 조회는 다시 하지 않는다:
 * 확인 시각은 세션 조회에서 읽은 값(newsSeenAt)을, 연결·파트너에게 보이는 요청은 요청 안에서 캐시된 값을 쓴다.
 * 남은 숫자(답장 수·받은 쪽지 수)는 한 번의 조회로 같이 센다.
 */
export async function newsFor(db: DB, user: User & { newsSeenAt?: Date | null }, today = todaySeoul()): Promise<News> {
  const [seenAt, couple] = await Promise.all([
    "newsSeenAt" in user ? user.newsSeenAt : db.select({ seen: users.newsSeenAt }).from(users).where(eq(users.id, user.id)).then(([r]) => r?.seen ?? null),
    activeCouple(db, user.id),
  ]);
  const none = { replies: 0, care: 0, notes: 0, alerts: 0 };
  if (!couple) return none;
  const isPartner = couple.partnerId === user.id;
  if (user.role === "partner" && !isPartner) return none;
  const since = (seenAt ?? new Date(0)).toISOString();
  const [[counts], visible] = await Promise.all([
    db.select({
      replies: sql<number>`(select count(*) from care_responses where couple_id = ${couple.id} and updated_at > ${since}::timestamptz)`.mapWith(Number),
      notes: sql<number>`(select count(*) from notes where couple_id = ${couple.id} and sender_id <> ${user.id} and created_at > ${since}::timestamptz)`.mapWith(Number),
      alerts: sql<number>`(select count(*) from partner_alerts where couple_id = ${couple.id} and created_at > ${since}::timestamptz)`.mapWith(Number),
    }).from(couples).where(eq(couples.id, couple.id)),
    isPartner ? sharedCare(db, couple, today) : [],
  ]);
  const notes = counts?.notes ?? 0;
  if (!isPartner) return { replies: counts?.replies ?? 0, care: 0, notes, alerts: 0 };
  // 파트너: 아직 답하지 않았고 마지막으로 본 뒤에 바뀐 요청
  const care = visible.filter((c) => !c.response && c.updatedAt > new Date(since)).length;
  // 주기 알림은 잠시 멈추면 소식에서도 숨긴다
  return { replies: 0, care, notes, alerts: couple.paused ? 0 : counts?.alerts ?? 0 };
}

/** 새 소식 시트의 한 줄. 누르면 href로 간다(배려 요청·답장은 홈의 배려 카드). */
export type NewsItem = { id: string; title: string; body: string; detail: string; when: string; href: string };

/**
 * 새 소식 시트의 목록. 맨 위에 받은 쪽지(파트너는 주기 알림과 섞어 최근 것부터), 그 아래 기록자는 파트너 답장, 파트너는 지금 보이는 배려 요청.
 * 공유 조건(연결·잠시 멈추기·요청별 공유)은 sharedCare가 다시 본다. 주기 알림도 잠시 멈추면 숨긴다.
 */
export async function newsItems(db: DB, user: User, today = todaySeoul()): Promise<NewsItem[]> {
  const couple = await activeCouple(db, user.id);
  if (!couple) return [];
  const name = (await otherNickname(db, couple, user)) || "파트너";
  const when = (day: string) => (day === today ? "오늘" : formatDay(day));
  const what = (presets: string[], message: string | null) => [...presets.map(careLabel), ...(message ? [`“${message}”`] : [])].join(" · ");
  const received = (await receivedNotes(db, user, couple)).map((n) => ({
    at: n.createdAt,
    item: { id: `note-${n.id}`, title: `${name}님의 쪽지`, body: n.body, detail: "", when: `${when(todaySeoul(n.createdAt))} ${timeSeoul(n.createdAt)}`, href: "/" },
  }));
  const notes: NewsItem[] = received.map((n) => n.item);
  if (user.role === "recorder") {
    return [...notes, ...(await recentReplies(db, couple)).map((r) => ({
      id: `reply-${r.id}`, title: `${when(r.day)} 배려 요청`, body: replySentence(name, r.response), detail: what(r.presets, r.message),
      when: timeSeoul(r.respondedAt), href: "/",
    }))];
  }
  if (couple.partnerId !== user.id) return [];
  // 주기 알림: 제목은 기록자 이름, 본문은 푸시와 같은 문구
  const alerts = (couple.paused ? [] : await recentAlerts(db, couple)).map((a) => ({
    at: a.createdAt,
    item: { id: `alert-${a.id}`, title: name, body: PARTNER_ALERTS[a.kind].body, detail: "", when: `${when(a.day)} ${timeSeoul(a.createdAt)}`, href: "/" },
  }));
  const timeline = [...received, ...alerts].sort((a, b) => b.at.getTime() - a.at.getTime()).map((x) => x.item);
  return [...timeline, ...(await sharedCare(db, couple, today)).map((c) => ({
    id: `care-${c.id}`, title: `${name}님의 배려 요청`, body: what(c.presets, c.message),
    detail: "", when: when(c.day), href: "/",
  }))];
}

export async function markNewsSeen(db: DB, user: User) {
  await db.update(users).set({ newsSeenAt: new Date() }).where(eq(users.id, user.id));
}
