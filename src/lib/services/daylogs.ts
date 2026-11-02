import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db";
import { dayLogs, periods } from "../db/schema";
import { isDay, todaySeoul } from "../dates";
import { MOODS, PAINS, type DayLog, type Mood, type Pain } from "../daylog";
import { fail } from "../errors";
import { currentPeriod } from "../prediction";
import type { User } from "./auth";
import { requireRole } from "./couples";

export async function listDayLogs(db: DB, ownerId: string): Promise<DayLog[]> {
  return db.select({ day: dayLogs.day, pain: dayLogs.pain, moods: dayLogs.moods }).from(dayLogs)
    .where(eq(dayLogs.ownerId, ownerId)).orderBy(asc(dayLogs.day));
}

export async function dayLogOn(db: DB, ownerId: string, day: string): Promise<DayLog | null> {
  const [row] = await db.select({ day: dayLogs.day, pain: dayLogs.pain, moods: dayLogs.moods }).from(dayLogs)
    .where(and(eq(dayLogs.ownerId, ownerId), eq(dayLogs.day, day)));
  return row ?? null;
}

/** 생리 중인 날만 남길 수 있다. 둘 다 비우면 그날 기록을 지운다. */
export async function saveDayLog(db: DB, user: User, input: { day: unknown; pain: unknown; moods: unknown[] }, today = todaySeoul()) {
  requireRole(user, "recorder");
  const day = String(input.day ?? "");
  if (!isDay(day) || day > today) fail("오늘이나 지난 날짜만 남길 수 있어요");
  const list = await db.select().from(periods).where(eq(periods.ownerId, user.id));
  if (!currentPeriod(list, day)) fail("생리 중인 날에만 남길 수 있어요");
  const pain = input.pain ? String(input.pain) : null;
  if (pain && !(pain in PAINS)) fail("통증을 다시 골라 주세요");
  const moods = (Object.keys(MOODS) as Mood[]).filter((m) => input.moods.includes(m));
  if (!pain && !moods.length) {
    await db.delete(dayLogs).where(and(eq(dayLogs.ownerId, user.id), eq(dayLogs.day, day)));
    return;
  }
  await db.insert(dayLogs).values({ ownerId: user.id, day, pain: pain as Pain | null, moods })
    .onConflictDoUpdate({ target: [dayLogs.ownerId, dayLogs.day], set: { pain: pain as Pain | null, moods, updatedAt: sql`now()` } });
}

/** 생리 기록을 지우거나 날짜를 줄이면 어느 기록에도 속하지 않게 된 날의 통증·기분을 함께 지운다. */
export async function pruneDayLogs(db: DB, ownerId: string) {
  const list = await db.select({ startDate: periods.startDate, endDate: periods.endDate }).from(periods).where(eq(periods.ownerId, ownerId));
  const logs = await db.select({ day: dayLogs.day }).from(dayLogs).where(eq(dayLogs.ownerId, ownerId));
  const orphans = logs.map((l) => l.day).filter((day) => !list.some((p) => p.startDate <= day && (!p.endDate || day <= p.endDate)));
  if (orphans.length) await db.delete(dayLogs).where(and(eq(dayLogs.ownerId, ownerId), inArray(dayLogs.day, orphans)));
}
