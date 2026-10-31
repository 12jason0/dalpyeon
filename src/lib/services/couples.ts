import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { cache } from "react";
import type { DB } from "../db";
import { couples, invitations, NO_PERMISSIONS, users, type Permissions } from "../db/schema";
import { isDay, todaySeoul } from "../dates";
import { AppError, fail } from "../errors";
import { limit, sha256, type User } from "./auth";

export type Couple = typeof couples.$inferSelect;
export const INVITE_MINUTES = 15;
export const PERMISSION_KEYS = ["periods", "predictions", "fertility", "care"] as const;

// 헷갈리는 글자(0/O, 1/I/L)를 뺀 32자 → 8자리 = 약 1조 가지
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function requireRole(user: User, role: User["role"]) {
  if (user.role !== role) fail("이 계정에서는 쓸 수 없는 기능이에요", 403);
}

/** 화면을 그리는 한 요청 안에서는 한 번만 조회한다. 서버 액션에서는 매번 조회한다. */
export const activeCouple = cache(async (db: DB, userId: string): Promise<Couple | null> => {
  const [row] = await db.select().from(couples)
    .where(and(eq(couples.status, "active"), or(eq(couples.recorderId, userId), eq(couples.partnerId, userId)))).limit(1);
  return row ?? null;
});

export async function otherNickname(db: DB, couple: Couple, user: User) {
  const otherId = user.id === couple.recorderId ? couple.partnerId : couple.recorderId;
  const [row] = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, otherId));
  return row?.nickname ?? "";
}

export async function createInvite(db: DB, user: User) {
  requireRole(user, "recorder");
  if (await activeCouple(db, user.id)) fail("이미 연결된 파트너가 있어요", 409);
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const expiresAt = new Date(Date.now() + INVITE_MINUTES * 60000);
  await db.transaction(async (tx) => {
    // 새 코드를 만들면 이전 코드는 무효
    await tx.update(invitations).set({ status: "revoked" })
      .where(and(eq(invitations.recorderId, user.id), inArray(invitations.status, ["open", "pending"])));
    await tx.insert(invitations).values({ id: randomUUID(), recorderId: user.id, codeHash: sha256(code), expiresAt, status: "open" });
  });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

/** 코드를 입력하면 승인 없이 바로 연결된다. 코드는 한 번 쓰면 끝. */
export async function claimInvite(db: DB, user: User, rawCode: unknown, today = todaySeoul()) {
  const code = normalizeCode(String(rawCode ?? ""));
  if (code.length !== 8) fail("코드 8자리를 확인해 주세요");
  if (await activeCouple(db, user.id)) fail("이미 연결된 상대가 있어요", 409);
  const usable = () => and(eq(invitations.codeHash, sha256(code)), eq(invitations.status, "open"), gt(invitations.expiresAt, new Date()));
  return db.transaction(async (tx) => {
    const [own] = await tx.select({ id: invitations.id }).from(invitations)
      .where(and(eq(invitations.codeHash, sha256(code)), eq(invitations.recorderId, user.id))).limit(1);
    if (own) fail("내가 만든 코드는 입력할 수 없어요");
    const [invite] = await tx.select().from(invitations).where(usable()).limit(1);
    if (!invite) fail("사용할 수 없는 코드예요. 만료됐을 수 있어요", 404);
    const both = [invite.recorderId, user.id];
    // 서로의 코드를 동시에 입력해도 한쪽만 연결되도록 두 사람을 먼저 잠근다.
    await tx.select({ id: users.id }).from(users).where(inArray(users.id, both)).orderBy(users.id).for("update");
    // 코드를 입력한 사람도 다른 연결의 기록자일 수 있어서, 두 사람 모두 양쪽 자리를 다 본다.
    const busy = await tx.select({ id: couples.id }).from(couples)
      .where(and(eq(couples.status, "active"), or(inArray(couples.recorderId, both), inArray(couples.partnerId, both))));
    if (busy.length) fail("둘 중 한 명은 이미 다른 사람과 연결돼 있어요", 409);
    // 잠금을 기다리는 사이 코드가 쓰였을 수 있어 조건을 건 채로 바꾼다.
    const claimed = await tx.update(invitations).set({ status: "approved", claimantId: user.id })
      .where(and(eq(invitations.id, invite.id), usable())).returning({ id: invitations.id });
    if (!claimed.length) fail("사용할 수 없는 코드예요. 만료됐을 수 있어요", 404);
    // 연결해도 공유는 전부 꺼진 상태로 시작. 공유 시작일은 오늘.
    const [couple] = await tx.insert(couples).values({
      id: randomUUID(), recorderId: invite.recorderId, partnerId: user.id, status: "active", paused: false,
      permissions: NO_PERMISSIONS, shareFrom: today,
    }).returning();
    await tx.update(users).set({ role: "partner" }).where(eq(users.id, user.id));
    // 두 사람이 만든 다른 코드와 예전에 남은 대기 요청은 모두 무효
    await tx.update(invitations).set({ status: "revoked" })
      .where(and(or(inArray(invitations.recorderId, both), inArray(invitations.claimantId, both)), inArray(invitations.status, ["open", "pending"])));
    return couple;
  }) as Promise<Couple>;
}

/** 사용자가 보낸 코드 입력은 모두 이 제한을 거친다. */
export async function claimWithLimit(db: DB, user: User, rawCode: unknown, ip: string) {
  await limit(db, "claim", user.id, 10, 900);
  await limit(db, "claim-ip", ip, 30, 900);
  return claimInvite(db, user, rawCode);
}

export type ClaimProblem = "code" | "connected" | "limit";

/** 링크·/join 경로용. 코드가 틀려도 가입은 유지해야 하므로 실패를 던지지 않고 이유만 돌려준다. */
export async function tryClaim(db: DB, user: User, rawCode: unknown, ip: string): Promise<ClaimProblem | null> {
  try {
    await claimWithLimit(db, user, rawCode, ip);
    return null;
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    return e.status === 409 ? "connected" : e.status === 429 ? "limit" : "code";
  }
}

export async function updateSharing(db: DB, user: User, input: { permissions: Partial<Record<string, unknown>>; shareFrom: unknown; paused: unknown }, today = todaySeoul()) {
  requireRole(user, "recorder");
  const couple = await activeCouple(db, user.id);
  if (!couple) fail("연결된 파트너가 없어요", 404);
  const shareFrom = String(input.shareFrom ?? "");
  if (!isDay(shareFrom) || shareFrom > today) fail("공유 시작일은 오늘이나 그 이전으로 정해 주세요");
  const permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, input.permissions[k] === true])) as Permissions;
  const [row] = await db.update(couples).set({ permissions, shareFrom, paused: input.paused === true })
    .where(and(eq(couples.id, couple.id), eq(couples.status, "active"))).returning();
  return row;
}

/** 토글 하나만 바꾼다. 빠르게 여러 개를 눌러도 서로 덮어쓰지 않게 해당 키만 고친다. */
export async function setSharingItem(db: DB, user: User, key: unknown, on: unknown) {
  requireRole(user, "recorder");
  const value = on === true;
  const item = PERMISSION_KEYS.find((k) => k === key);
  if (!item && key !== "paused") fail("바꿀 수 없는 항목이에요");
  const couple = await activeCouple(db, user.id);
  if (!couple) fail("연결된 파트너가 없어요", 404);
  await db.update(couples)
    .set(item ? { permissions: sql`jsonb_set(${couples.permissions}, ${`{${item}}`}::text[], to_jsonb(${value}::boolean))` } : { paused: value })
    .where(and(eq(couples.id, couple.id), eq(couples.status, "active")));
}

export async function disconnect(db: DB, user: User) {
  const couple = await activeCouple(db, user.id);
  if (!couple) fail("연결된 상대가 없어요", 404);
  // 다시 연결하면 새 연결이 만들어지고 공유 설정도 처음부터 다시 한다.
  // 파트너는 다시 기록자로 돌아가고, 전에 남긴 기록도 그대로 다시 보인다.
  await db.transaction(async (tx) => {
    const changed = await tx.update(couples).set({ status: "disconnected", paused: true, permissions: NO_PERMISSIONS })
      .where(and(eq(couples.id, couple.id), eq(couples.status, "active"))).returning({ id: couples.id });
    if (changed.length) await tx.update(users).set({ role: "recorder" }).where(eq(users.id, couple.partnerId));
  });
}
