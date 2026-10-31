import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import type { DB } from "../db";
import { careRequests, careResponses } from "../db/schema";
import { addDays, todaySeoul } from "../dates";
import { fail } from "../errors";
import type { User } from "./auth";
import { activeCouple, requireRole, type Couple } from "./couples";

export const CARE_PRESETS = {
  rest: "조용히 쉬고 싶어",
  warm_food: "따뜻한 거 같이 먹고 싶어",
  empathy: "해결책보다 공감해 줘",
  easy_plans: "약속은 편하게 잡아줘",
  company: "옆에 있어 줘",
} as const;
export type PresetKey = keyof typeof CARE_PRESETS;

export const RESPONSES = { seen: "봤어요", will_help: "도와줄게요", done: "했어요" } as const;
export type ResponseKey = keyof typeof RESPONSES;

export type CareView = {
  id: string; day: string; presets: PresetKey[]; message: string | null; shareWithPartner: boolean;
  response: ResponseKey | null;
};

async function responseFor(db: DB, careId: string, coupleId: string | undefined): Promise<ResponseKey | null> {
  if (!coupleId) return null;
  const [row] = await db.select({ response: careResponses.response }).from(careResponses)
    .where(and(eq(careResponses.careId, careId), eq(careResponses.coupleId, coupleId)));
  return row?.response ?? null;
}

export async function getCare(db: DB, user: User, day = todaySeoul()): Promise<CareView | null> {
  const [row] = await db.select().from(careRequests).where(and(eq(careRequests.ownerId, user.id), eq(careRequests.day, day)));
  if (!row) return null;
  const couple = await activeCouple(db, user.id);
  return { id: row.id, day: row.day, presets: row.presets as PresetKey[], message: row.message,
    shareWithPartner: row.shareWithPartner, response: await responseFor(db, row.id, couple?.id) };
}

export async function saveCare(db: DB, user: User, input: { presets: unknown[]; message: unknown; share: unknown }, day = todaySeoul()) {
  requireRole(user, "recorder");
  const presets = [...new Set(input.presets.map(String))].filter((p): p is PresetKey => p in CARE_PRESETS);
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
    const changed = JSON.stringify(old.presets) !== JSON.stringify(presets) || old.message !== message;
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

/** 파트너가 볼 수 있는 배려 요청: 배려 공유 켜짐 + 요청별 공유 켜짐 + 공유 시작일 이후 + 최근 7일 */
export async function sharedCare(db: DB, couple: Couple, today = todaySeoul()): Promise<CareView[]> {
  if (couple.paused || !couple.permissions.care) return [];
  const from = [couple.shareFrom, addDays(today, -6)].sort()[1];
  const rows = await db.select().from(careRequests)
    .where(and(eq(careRequests.ownerId, couple.recorderId), eq(careRequests.shareWithPartner, true), gte(careRequests.day, from)))
    .orderBy(desc(careRequests.day));
  return Promise.all(rows.filter((r) => r.day <= today).map(async (r) => ({
    id: r.id, day: r.day, presets: r.presets as PresetKey[], message: r.message, shareWithPartner: true,
    response: await responseFor(db, r.id, couple.id),
  })));
}

export async function respondToCare(db: DB, user: User, careId: string, response: unknown, today = todaySeoul()) {
  requireRole(user, "partner");
  if (typeof response !== "string" || !(response in RESPONSES)) fail("답장을 골라 주세요");
  const couple = await activeCouple(db, user.id);
  if (!couple) fail("연결된 상대가 없어요", 404);
  // 서버에서 공유 조건을 다시 확인한다. 화면에 보였다고 믿지 않는다.
  const visible = await sharedCare(db, couple, today);
  const shown = visible.find((c) => c.id === careId);
  if (!shown) fail("공유된 배려 요청을 찾을 수 없어요", 404);
  await db.insert(careResponses).values({ careId, coupleId: couple.id, response: response as ResponseKey })
    .onConflictDoUpdate({ target: [careResponses.careId, careResponses.coupleId], set: { response: response as ResponseKey, updatedAt: new Date() } });
  return shown.response === null; // 첫 답장인지
}

