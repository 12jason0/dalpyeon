import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt, lte, ne } from "drizzle-orm";
import { cache } from "react";
import type { DB } from "../db";
import { careRequests, careResponses } from "../db/schema";
import { addDays, diffDays, todaySeoul } from "../dates";
import { fail } from "../errors";
import type { User } from "./auth";
import { activeCouple, requireRole, type Couple } from "./couples";

export const CARE_PRESETS = {
  heat_pack: "핫팩 필요해",
  warm_food: "따뜻한 거 먹고 싶어",
  sweet: "단 거 먹고 싶어",
  medicine: "약 좀 사다 줘",
  listen: "그냥 들어줘",
  company: "옆에 있어 줘",
  rest: "혼자 쉬고 싶어",
  understand: "예민해도 이해해 줘",
  stay_home: "오늘은 집에서",
  postpone: "약속 미루자",
  sleep_early: "일찍 잘래",
} as const;
export type PresetKey = keyof typeof CARE_PRESETS;

const PRESET_GROUPS: Record<"body" | "mind" | "plan", PresetKey[]> = {
  body: ["heat_pack", "warm_food", "sweet", "medicine"],
  mind: ["listen", "company", "rest", "understand"],
  plan: ["stay_home", "postpone", "sleep_early"],
};
const RECENT_DAYS = 30;
const BEFORE_PERIOD_DAYS = 7;

/** 이름이 바뀐 옛 칩. 저장된 값은 그대로 두고 읽을 때 바꾼다. */
const OLD_PRESETS: Record<string, PresetKey> = { empathy: "listen", easy_plans: "postpone" };
const isPreset = (key: string): key is PresetKey => Object.hasOwn(CARE_PRESETS, key);
const currentPresets = (keys: string[]) => [...new Set(keys.map((key) => (Object.hasOwn(OLD_PRESETS, key) ? OLD_PRESETS[key] : key)))];

/** 칩 글자. 모르는 값은 저장된 글자 그대로 보여준다. */
export const careLabel = (key: string) => (isPreset(key) ? CARE_PRESETS[key] : key);

/** 시기별로 먼저 보여줄 칩 묶음. 생리 중이면 몸, 생리 전 7일이면 마음, 그 외는 없다. */
export function careGroup(inPeriod: boolean, nextStart: string | null | undefined, today: string) {
  if (inPeriod) return "body";
  if (!nextStart) return null;
  const days = diffDays(nextStart, today);
  return days >= 0 && days <= BEFORE_PERIOD_DAYS ? "mind" : null;
}

/** 칩 순서. 많이 고른 칩을 앞에 두고, 나머지는 시기별 묶음 순서를 따른다. 묶음이 없으면 번갈아 섞는다. */
export function orderPresets(used: string[], group: "body" | "mind" | null) {
  const { body, mind, plan } = PRESET_GROUPS;
  const base = group === "body" ? [...body, ...mind, ...plan]
    : group === "mind" ? [...mind, ...body, ...plan]
      : body.flatMap((key, i) => [key, mind[i], plan[i]]).filter(Boolean);
  const count = (key: string) => used.filter((u) => u === key).length;
  const ordered = [...base.filter((key) => count(key) > 0).sort((a, b) => count(b) - count(a)), ...base.filter((key) => count(key) === 0)];
  return Object.fromEntries(ordered.map((key) => [key, CARE_PRESETS[key]])) as Record<PresetKey, string>;
}

/** 최근 30일에 고른 칩. 오늘은 빼서 누르는 동안 순서가 바뀌지 않게 한다. */
export async function recentPresets(db: DB, user: User, today: string) {
  const rows = await db.select({ presets: careRequests.presets }).from(careRequests)
    .where(and(eq(careRequests.ownerId, user.id), gte(careRequests.day, addDays(today, -RECENT_DAYS)), lt(careRequests.day, today)));
  return rows.flatMap((r) => currentPresets(r.presets));
}

export const RESPONSES = { seen: "봤어요", will_help: "도와줄게요", done: "했어요" } as const;
export type ResponseKey = keyof typeof RESPONSES;

/** 기록자 홈 배려 카드와 새 소식이 같이 쓰는 답장 문장. 도윤님이 '도와줄게요'라고 답했어요 */
export function replySentence(name: string, response: ResponseKey) {
  return `${name}님이 '${RESPONSES[response]}'라고 답했어요`;
}

/** 기록자 홈 배려 카드의 칩 글자. 상대에게 간 것은 true다. 보낸 게 없거나 상대가 봤으면(제목 옆에 적는다) 칩이 없다. */
export function careChip(care: { shareWithPartner: boolean; response?: ResponseKey | null } | null, canShare: boolean) {
  if (!care || care.response) return null;
  return care.shareWithPartner && canShare ? { label: "보냈어요", sent: true } : { label: "나만 봐요", sent: false };
}

export type CareView = {
  id: string; day: string; presets: string[]; message: string | null; shareWithPartner: boolean; updatedAt: Date;
  response: ResponseKey | null; respondedAt: Date | null;
};

/** 배려 요청과 이 연결의 답장을 한 번에 읽는다(답장은 left join). 연결이 없으면 답장은 비어 있다. */
function careWithResponse(db: DB, coupleId: string | undefined) {
  return db.select({ care: careRequests, response: careResponses.response, respondedAt: careResponses.updatedAt }).from(careRequests)
    .leftJoin(careResponses, and(eq(careResponses.careId, careRequests.id), eq(careResponses.coupleId, coupleId ?? "")));
}

type CareRow = { care: typeof careRequests.$inferSelect; response: ResponseKey | null; respondedAt: Date | null };
const careView = ({ care: r, response, respondedAt }: CareRow): CareView => ({
  id: r.id, day: r.day, presets: currentPresets(r.presets), message: r.message, shareWithPartner: r.shareWithPartner, updatedAt: r.updatedAt,
  response, respondedAt,
});

/** 기록자의 새 소식 화면에 보이는 파트너 답장. 최근 답장부터. */
export async function recentReplies(db: DB, couple: Couple) {
  const rows = await db.select({
    id: careRequests.id, day: careRequests.day, presets: careRequests.presets, message: careRequests.message, response: careResponses.response,
    respondedAt: careResponses.updatedAt,
  }).from(careResponses).innerJoin(careRequests, eq(careRequests.id, careResponses.careId))
    .where(eq(careResponses.coupleId, couple.id)).orderBy(desc(careResponses.updatedAt)).limit(20);
  return rows.map((r) => ({ ...r, presets: currentPresets(r.presets) }));
}

export async function getCare(db: DB, user: User, day = todaySeoul()): Promise<CareView | null> {
  const couple = await activeCouple(db, user.id);
  const [row] = await careWithResponse(db, couple?.id).where(and(eq(careRequests.ownerId, user.id), eq(careRequests.day, day)));
  return row ? careView(row) : null;
}

/** 기록자 홈: 오늘 요청(답장 포함)과 최근 30일에 고른 칩을 한 번의 조회로. 칩 순서용 목록에서 오늘은 뺀다. */
export async function careForHome(db: DB, user: User, today = todaySeoul()) {
  const couple = await activeCouple(db, user.id);
  const rows = await careWithResponse(db, couple?.id)
    .where(and(eq(careRequests.ownerId, user.id), gte(careRequests.day, addDays(today, -RECENT_DAYS)), lte(careRequests.day, today)));
  const todays = rows.find((r) => r.care.day === today);
  return { care: todays ? careView(todays) : null, used: rows.filter((r) => r.care.day < today).flatMap((r) => currentPresets(r.care.presets)) };
}

export async function saveCare(db: DB, user: User, input: { presets: unknown[]; message: unknown; share: unknown }, day = todaySeoul()) {
  requireRole(user, "recorder");
  const presets = currentPresets(input.presets.map(String)).filter(isPreset);
  const message = String(input.message ?? "").trim().slice(0, 300) || null;
  const shareWithPartner = input.share === true;
  if (!presets.length && !message) fail("하나 이상 고르거나 한마디 적어 주세요");

  // 돌려주는 값: 이번 저장으로 처음 공유됐는지. 수정할 때마다 알림이 가지 않게 한다.
  return db.transaction(async (tx) => {
    const [old] = await tx.select().from(careRequests).where(and(eq(careRequests.ownerId, user.id), eq(careRequests.day, day)));
    if (!old) {
      await tx.insert(careRequests).values({ id: randomUUID(), ownerId: user.id, day, presets, message, shareWithPartner });
      return shareWithPartner;
    }
    const changed = JSON.stringify(currentPresets(old.presets)) !== JSON.stringify(presets) || old.message !== message;
    await tx.update(careRequests).set({ presets, message, shareWithPartner, updatedAt: new Date() }).where(eq(careRequests.id, old.id));
    // 요청 내용이 바뀌면 예전 답장은 지운다 (바뀐 요청에 옛 답이 붙지 않게)
    if (changed) await tx.delete(careResponses).where(eq(careResponses.careId, old.id));
    return shareWithPartner && !old.shareWithPartner;
  }) as Promise<boolean>;
}

export async function clearCare(db: DB, user: User, day = todaySeoul()) {
  requireRole(user, "recorder");
  await db.delete(careRequests).where(and(eq(careRequests.ownerId, user.id), eq(careRequests.day, day)));
}

/** 파트너가 볼 수 있는 배려 요청: 일시정지 아님 + 요청별 공유 켜짐 + 공유 시작일 이후 + 최근 7일 */
export const sharedCare = cache(async (db: DB, couple: Couple, today = todaySeoul()): Promise<CareView[]> => {
  if (couple.paused) return [];
  const from = [couple.shareFrom, addDays(today, -6)].sort()[1];
  const rows = await careWithResponse(db, couple.id)
    .where(and(eq(careRequests.ownerId, couple.recorderId), eq(careRequests.shareWithPartner, true), gte(careRequests.day, from), lte(careRequests.day, today)))
    .orderBy(desc(careRequests.day));
  return rows.map(careView);
});

export async function respondToCare(db: DB, user: User, careId: string, response: unknown, today = todaySeoul()) {
  requireRole(user, "partner");
  if (typeof response !== "string" || !(response in RESPONSES)) fail("답장을 골라 주세요");
  const couple = await activeCouple(db, user.id);
  if (!couple) fail("연결된 상대가 없어요", 404);
  // 서버에서 공유 조건을 다시 확인한다. 화면에 보였다고 믿지 않는다.
  const visible = await sharedCare(db, couple, today);
  const shown = visible.find((c) => c.id === careId);
  if (!shown) fail("공유된 배려 요청을 찾을 수 없어요", 404);
  // 같은 답장을 다시 누르면 아무것도 바꾸지 않는다. 동시에 눌러도 바뀐 한 번만 true가 되도록 DB에서 비교한다.
  const changed = await db.insert(careResponses).values({ careId, coupleId: couple.id, response: response as ResponseKey })
    .onConflictDoUpdate({
      target: [careResponses.careId, careResponses.coupleId],
      set: { response: response as ResponseKey, updatedAt: new Date() },
      setWhere: ne(careResponses.response, response as ResponseKey),
    })
    .returning({ careId: careResponses.careId });
  return changed.length > 0; // 답장이 새로 생겼거나 바뀌었는지
}


/** 파트너가 홈을 열면 오늘 보이는 요청에 "봤어요"를 남긴다. 이미 답장이 있으면(예전 도와줄게요·했어요 포함) 그대로 둔다. */
export async function markCareSeen(db: DB, user: User, today = todaySeoul()) {
  requireRole(user, "partner");
  const couple = await activeCouple(db, user.id);
  if (!couple) return;
  const unseen = (await sharedCare(db, couple, today)).filter((c) => c.day === today && !c.response);
  if (!unseen.length) return;
  await db.insert(careResponses).values(unseen.map((c) => ({ careId: c.id, coupleId: couple.id, response: "seen" as const }))).onConflictDoNothing();
}
