import { randomUUID } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import type { DB } from "../db";
import { periods, users } from "../db/schema";
import { isDay, todaySeoul } from "../dates";
import { fail } from "../errors";
import { currentPeriod, estimate, type Prediction } from "../prediction";
import type { User } from "./auth";
import { requireRole } from "./couples";

export { currentPeriod };

export type Period = typeof periods.$inferSelect;

export async function listPeriods(db: DB, ownerId: string): Promise<Period[]> {
  return db.select().from(periods).where(eq(periods.ownerId, ownerId)).orderBy(asc(periods.startDate));
}

export type PeriodInput = { id?: string | null; startDate: unknown; endDate?: unknown; excluded?: boolean; excludeReason?: unknown };

export async function savePeriod(db: DB, ownerId: string, input: PeriodInput, today = todaySeoul()): Promise<Period> {
  const startDate = String(input.startDate ?? "");
  const endDate = input.endDate ? String(input.endDate) : null;
  const excluded = Boolean(input.excluded);
  const excludeReason = excluded ? String(input.excludeReason ?? "").trim().slice(0, 200) : null;
  if (!isDay(startDate) || startDate > today || startDate < "1900-01-01") fail("시작일은 오늘이나 그 이전 날짜로 적어 주세요");
  if (endDate && (!isDay(endDate) || endDate < startDate || endDate > today)) fail("종료일은 시작일 이후, 오늘 이전으로 적어 주세요");
  if (excluded && !excludeReason) fail("예측에서 빼는 이유를 적어 주세요");

  return db.transaction(async (tx) => {
    const existing = input.id
      ? (await tx.select().from(periods).where(and(eq(periods.id, input.id), eq(periods.ownerId, ownerId))).limit(1))[0]
      : undefined;
    if (input.id && !existing) fail("기록을 찾을 수 없어요", 404);

    const others = await tx.select().from(periods)
      .where(existing ? and(eq(periods.ownerId, ownerId), ne(periods.id, existing.id)) : eq(periods.ownerId, ownerId));
    const myEnd = endDate ?? startDate;
    for (const p of others) {
      // 진행 중인 기록은 오늘까지 이어진 것으로 본다. 안 그러면 한 번의 생리가 두 기록으로 쪼개져 주기 간격이 망가진다.
      const theirEnd = p.endDate ?? (currentPeriod([p], today)?.open ? today : p.startDate);
      if (startDate <= theirEnd && p.startDate <= myEnd) fail("다른 생리 기록과 날짜가 겹쳐요", 409);
    }

    const values = { startDate, endDate, excluded, excludeReason, updatedAt: new Date() };
    if (existing) {
      const [row] = await tx.update(periods).set(values).where(eq(periods.id, existing.id)).returning();
      return row;
    }
    const [row] = await tx.insert(periods).values({ id: randomUUID(), ownerId, ...values }).returning();
    return row;
  }) as Promise<Period>;
}

export async function deletePeriod(db: DB, ownerId: string, id: string) {
  const deleted = await db.delete(periods).where(and(eq(periods.id, id), eq(periods.ownerId, ownerId))).returning({ id: periods.id });
  if (!deleted.length) fail("기록을 찾을 수 없어요", 404);
}

export async function usualCycle(db: DB, ownerId: string): Promise<number | null> {
  const [row] = await db.select({ days: users.usualCycleDays }).from(users).where(eq(users.id, ownerId));
  return row?.days ?? null;
}

/** 비워 두면 지운다. */
export async function setUsualCycle(db: DB, user: User, input: unknown) {
  requireRole(user, "recorder");
  const text = String(input ?? "").trim();
  const days = text ? Number(text) : null;
  if (days !== null && (!Number.isInteger(days) || days < 21 || days > 45)) fail("평소 주기는 21~45일로 적어 주세요");
  await db.update(users).set({ usualCycleDays: days }).where(eq(users.id, user.id));
}

export async function predictionFor(db: DB, ownerId: string, today = todaySeoul()): Promise<Prediction> {
  const [list, usual] = await Promise.all([listPeriods(db, ownerId), usualCycle(db, ownerId)]);
  return estimate(list, [], today, usual);
}
