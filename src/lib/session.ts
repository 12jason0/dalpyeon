import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { createSession, deleteSession, userFromToken, type SessionUser, type User } from "./services/auth";

const COOKIE = "dp_session";

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null; // 로그인 전 화면은 DB를 건드리지 않는다
  return userFromToken(await getDb(), token);
}

/** 로그인만 확인한다. 동의 화면에서만 쓴다. */
export async function requireLogin(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** 페이지와 서버 액션의 관문. 건강 정보 동의 전에는 동의 화면 말고 아무것도 쓸 수 없다. */
export async function requireUser(role?: User["role"]): Promise<SessionUser> {
  const user = await requireLogin();
  if (!user.healthConsentAt) redirect("/consent");
  if (role && user.role !== role) redirect("/");
  return user;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession() {
  const jar = await cookies();
  await deleteSession(await getDb(), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/** 요청 제한용 IP. Vercel은 x-forwarded-for 첫 값이 실제 접속 IP. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
