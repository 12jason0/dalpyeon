import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DB } from "../db";
import { rateLimits, sessions, users, type Role } from "../db/schema";
import { fail } from "../errors";

export const SESSION_DAYS = 30;

export type User = { id: string; email: string; role: Role; nickname: string };

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const key = await derive(password, Buffer.from(salt, "base64url"));
  const target = Buffer.from(expected, "base64url");
  return key.length === target.length && timingSafeEqual(key, target);
}

// 없는 이메일로 로그인할 때도 같은 시간이 걸리게 해서, 가입 여부가 드러나지 않게 한다.
let dummyHash: Promise<string> | null = null;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function cleanEmail(email: unknown): string {
  const value = String(email ?? "").trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail("이메일 형식을 확인해 주세요");
  return value;
}

function cleanPassword(password: unknown): string {
  const value = String(password ?? "");
  if (value.length < 8 || value.length > 128) fail("비밀번호는 8자 이상으로 정해 주세요");
  return value;
}

function cleanNickname(nickname: unknown): string {
  const value = String(nickname ?? "").trim();
  if (value.length < 1 || value.length > 20) fail("이름은 1~20자로 적어 주세요");
  return value;
}

/** 고정 창 요청 제한. 창이 끝나면 다시 1부터 센다. */
export async function limit(db: DB, bucket: string, identity: string, max: number, seconds: number) {
  const key = sha256(`${bucket}:${identity}`);
  const resetAt = new Date(Date.now() + seconds * 1000);
  const [row] = await db.insert(rateLimits).values({ key, hits: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        hits: sql`case when ${rateLimits.resetAt} < now() then 1 else ${rateLimits.hits} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} < now() then excluded.reset_at else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ hits: rateLimits.hits });
  if (row.hits > max) fail("시도가 너무 많아요. 잠시 후 다시 해 주세요", 429);
}

export async function signup(db: DB, input: { email: unknown; password: unknown; nickname: unknown }): Promise<User> {
  const email = cleanEmail(input.email);
  const password = cleanPassword(input.password);
  const nickname = cleanNickname(input.nickname);
  // 누구나 기록자로 시작한다. 파트너는 연결이 승인될 때만 된다.
  const role: Role = "recorder";
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const inserted = await db.insert(users).values({ id, email, passwordHash, role, nickname })
    .onConflictDoNothing({ target: users.email }).returning({ id: users.id });
  if (!inserted.length) fail("이 이메일로는 가입할 수 없어요", 409);
  return { id, email, role, nickname };
}

export async function login(db: DB, input: { email: unknown; password: unknown }): Promise<User> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  dummyHash ??= hashPassword("timing-dummy-password");
  const ok = await verifyPassword(password, row ? row.passwordHash : await dummyHash);
  if (!row || !ok) fail("이메일 또는 비밀번호를 확인해 주세요", 401);
  return { id: row.id, email: row.email, role: row.role, nickname: row.nickname };
}

export async function createSession(db: DB, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userFromToken(db: DB, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [row] = await db.select({ id: users.id, email: users.email, role: users.role, nickname: users.nickname })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row ?? null;
}

export async function deleteSession(db: DB, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}
