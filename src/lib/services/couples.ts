import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import type { DB } from "../db";
import { couples, invitations, NO_PERMISSIONS, users, type Permissions } from "../db/schema";
import { isDay, todaySeoul } from "../dates";
import { fail } from "../errors";
import { sha256, type User } from "./auth";

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

export async function activeCouple(db: DB, userId: string): Promise<Couple | null> {
  const [row] = await db.select().from(couples)
    .where(and(eq(couples.status, "active"), or(eq(couples.recorderId, userId), eq(couples.partnerId, userId)))).limit(1);
  return row ?? null;
}

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
    // 새 코드를 만들면 이전 코드와 아직 승인 안 한 요청은 무효
    await tx.update(invitations).set({ status: "revoked" })
      .where(and(eq(invitations.recorderId, user.id), inArray(invitations.status, ["open", "pending"])));
    await tx.insert(invitations).values({ id: randomUUID(), recorderId: user.id, codeHash: sha256(code), expiresAt, status: "open" });
  });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

export async function claimInvite(db: DB, user: User, rawCode: unknown) {
  requireRole(user, "partner");
  const code = normalizeCode(String(rawCode ?? ""));
  if (code.length !== 8) fail("코드 8자리를 확인해 주세요");
  if (await activeCouple(db, user.id)) fail("이미 연결된 상대가 있어요", 409);
  const updated = await db.update(invitations).set({ status: "pending", claimantId: user.id })
    .where(and(eq(invitations.codeHash, sha256(code)), eq(invitations.status, "open"), gt(invitations.expiresAt, new Date())))
    .returning({ id: invitations.id });
  if (!updated.length) fail("사용할 수 없는 코드예요. 만료됐을 수 있어요", 404);
  return updated[0];
}

/** 파트너 쪽: 내가 코드를 입력하고 승인을 기다리는 요청 */
export async function waitingClaim(db: DB, user: User) {
  const [row] = await db.select({ id: invitations.id, nickname: users.nickname }).from(invitations)
    .innerJoin(users, eq(users.id, invitations.recorderId))
    .where(and(eq(invitations.claimantId, user.id), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** 기록자 쪽: 승인 대기 중인 요청 */
export async function pendingRequests(db: DB, user: User) {
  requireRole(user, "recorder");
  return db.select({ id: invitations.id, nickname: users.nickname, email: users.email, expiresAt: invitations.expiresAt })
    .from(invitations).innerJoin(users, eq(users.id, invitations.claimantId))
    .where(and(eq(invitations.recorderId, user.id), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())));
}

export async function approveRequest(db: DB, user: User, requestId: string, today = todaySeoul()) {
  requireRole(user, "recorder");
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(invitations)
      .where(and(eq(invitations.id, requestId), eq(invitations.recorderId, user.id), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
      .limit(1);
    if (!invite?.claimantId) fail("유효한 연결 요청이 없어요. 코드를 새로 만들어 주세요", 404);
    const partnerId = invite.claimantId;
    const busy = await tx.select({ id: couples.id }).from(couples)
      .where(and(eq(couples.status, "active"), or(eq(couples.recorderId, user.id), eq(couples.partnerId, partnerId))));
    if (busy.length) fail("둘 중 한 명은 이미 다른 사람과 연결돼 있어요", 409);
    // 연결해도 공유는 전부 꺼진 상태로 시작. 공유 시작일은 오늘.
    const [couple] = await tx.insert(couples).values({
      id: randomUUID(), recorderId: user.id, partnerId, status: "active", paused: false,
      permissions: NO_PERMISSIONS, shareFrom: today,
    }).returning();
    await tx.update(invitations).set({ status: "revoked" })
      .where(and(or(eq(invitations.recorderId, user.id), eq(invitations.claimantId, partnerId)), inArray(invitations.status, ["open", "pending"])));
    await tx.update(invitations).set({ status: "approved" }).where(eq(invitations.id, requestId));
    return couple;
  }) as Promise<Couple>;
}

export async function rejectRequest(db: DB, user: User, requestId: string) {
  requireRole(user, "recorder");
  const changed = await db.update(invitations).set({ status: "rejected" })
    .where(and(eq(invitations.id, requestId), eq(invitations.recorderId, user.id), inArray(invitations.status, ["open", "pending"])))
    .returning({ id: invitations.id });
  if (!changed.length) fail("연결 요청을 찾을 수 없어요", 404);
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

export async function disconnect(db: DB, user: User) {
  const couple = await activeCouple(db, user.id);
  if (!couple) fail("연결된 상대가 없어요", 404);
  // 다시 연결하면 새 연결이 만들어지고 공유 설정도 처음부터 다시 한다.
  await db.update(couples).set({ status: "disconnected", paused: true, permissions: NO_PERMISSIONS })
    .where(eq(couples.id, couple.id));
}
