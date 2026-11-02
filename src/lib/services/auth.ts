import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { rateLimits, sessions, users, type Role } from "../db/schema";
import { fail } from "../errors";

export const SESSION_DAYS = 30;

export type User = { id: string; email: string | null; role: Role; nickname: string };
export type Consents = { healthConsentAt: Date | null; ageConfirmedAt: Date | null; transferConsentAt: Date | null };
export type SessionUser = User & Consents;

/** 페이지와 서버 액션의 관문이 보는 값. 세 동의가 모두 있어야 앱을 쓸 수 있다. */
export const consentDone = (user: Consents) => Boolean(user.healthConsentAt && user.ageConfirmedAt && user.transferConsentAt);

export const sessionUserFields = {
  id: users.id, email: users.email, role: users.role, nickname: users.nickname,
  healthConsentAt: users.healthConsentAt, ageConfirmedAt: users.ageConfirmedAt, transferConsentAt: users.transferConsentAt,
};

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
  if (value.length < 8 || value.length > 20) fail("비밀번호는 8~20자로 정해 주세요");
  return value;
}

function cleanNickname(nickname: unknown): string {
  const value = String(nickname ?? "").trim();
  if (value.length < 1 || value.length > 20) fail("이름은 1~20자로 적어 주세요");
  return value;
}

/** 남친톡 닉네임은 따로라 바뀌지 않는다. 상대 화면은 이 칸을 읽으므로 함께 바뀐다. */
export async function updateNickname(db: DB, user: User, input: unknown) {
  const nickname = cleanNickname(input);
  await db.update(users).set({ nickname }).where(eq(users.id, user.id));
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

export async function signup(
  db: DB, input: { email: unknown; password: unknown; nickname: unknown; healthConsent: unknown; ageConfirmed: unknown; transferConsent: unknown },
): Promise<User> {
  if (input.ageConfirmed !== true) fail("만 14세 이상만 가입할 수 있어요");
  if (input.healthConsent !== true) fail("건강 정보 수집·이용에 동의해야 가입할 수 있어요");
  if (input.transferConsent !== true) fail("개인정보 국외 이전에 동의해야 가입할 수 있어요");
  const email = cleanEmail(input.email);
  const password = cleanPassword(input.password);
  const nickname = cleanNickname(input.nickname);
  // 누구나 기록자로 시작한다. 파트너는 코드로 연결될 때만 된다.
  const role: Role = "recorder";
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const now = new Date();
  const inserted = await db.insert(users).values({ id, email, passwordHash, role, nickname, healthConsentAt: now, ageConfirmedAt: now, transferConsentAt: now })
    .onConflictDoNothing({ target: users.email }).returning({ id: users.id });
  if (!inserted.length) fail("이 이메일로는 가입할 수 없어요", 409);
  return { id, email, role, nickname };
}

export async function login(db: DB, input: { email: unknown; password: unknown }): Promise<User> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  dummyHash ??= hashPassword("timing-dummy-password");
  const ok = await verifyPassword(password, row?.passwordHash ?? await dummyHash);
  if (!row?.passwordHash || !ok) fail("이메일 또는 비밀번호를 확인해 주세요", 401);
  return { id: row.id, email: row.email, role: row.role, nickname: row.nickname };
}

/** 비밀번호를 바꾸면 지금 쓰는 세션만 남기고 다른 기기는 모두 로그아웃한다. */
export async function changePassword(
  db: DB, user: User, input: { current: unknown; next: unknown; confirm: unknown }, keepToken: string | undefined,
) {
  await limit(db, "password", user.id, 5, 900);
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row?.hash) fail("이메일로 가입한 계정만 바꿀 수 있어요", 403);
  if (!(await verifyPassword(String(input.current ?? ""), row.hash))) fail("현재 비밀번호를 확인해 주세요", 401);
  const next = cleanPassword(input.next);
  if (next !== input.confirm) fail("새 비밀번호가 서로 달라요");
  if (next === input.current) fail("지금과 다른 비밀번호로 정해 주세요");
  const passwordHash = await hashPassword(next);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.tokenHash, sha256(keepToken ?? ""))));
  });
}

export async function createSession(db: DB, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userFromToken(db: DB, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db.select(sessionUserFields).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return row ?? null;
}

/** 카카오 가입과 예전 계정의 동의. 이미 동의한 건강 정보는 묻지 않고, 처음 동의한 시각을 바꾸지 않는다. */
export async function recordConsents(db: DB, user: SessionUser, input: { healthConsent: unknown; ageConfirmed: unknown; transferConsent: unknown }) {
  if (input.ageConfirmed !== true || input.transferConsent !== true || (!user.healthConsentAt && input.healthConsent !== true)) {
    fail("필수 항목에 모두 동의해야 쓸 수 있어요");
  }
  await db.update(users).set({
    healthConsentAt: sql`coalesce(${users.healthConsentAt}, now())`,
    ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())`,
    transferConsentAt: sql`coalesce(${users.transferConsentAt}, now())`,
  }).where(eq(users.id, user.id));
}

/** 매일 크론이 부른다. 만료된 세션과 창이 끝난 요청 제한을 지운다. */
export async function purgeExpired(db: DB, now = new Date()) {
  const expired = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.tokenHash });
  const limits = await db.delete(rateLimits).where(lt(rateLimits.resetAt, now)).returning({ id: rateLimits.key });
  return { sessions: expired.length, rateLimits: limits.length };
}

export async function deleteSession(db: DB, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}
