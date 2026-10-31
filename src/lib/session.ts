import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { createSession, deleteSession, userFromToken, type SessionUser, type User } from "./services/auth";

const COOKIE = "dp_session";
const KAKAO_STATE = "dp_kakao_state";
const JOIN_CODE = "dp_join_code";

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null; // 로그인 전 화면은 DB를 건드리지 않는다
  return userFromToken(await getDb(), token);
});

/** 로그인만 확인한다. 동의 화면에서만 쓴다. */
export const requireLogin = cache(async (): Promise<SessionUser> => {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
});

/** 페이지와 서버 액션의 관문. 건강 정보 동의 전에는 동의 화면 말고 아무것도 쓸 수 없다. */
export const requireUser = cache(async (role?: User["role"]): Promise<SessionUser> => {
  const user = await requireLogin();
  if (!user.healthConsentAt) redirect("/consent");
  if (role && user.role !== role) redirect("/");
  return user;
});

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });
}

const shortCookie = () => ({
  httpOnly: true, sameSite: "lax", path: "/", maxAge: 900,
  secure: process.env.NODE_ENV === "production",
} as const);

/** 카카오로 떠나기 전에 state와, /join에서 왔다면 코드를 쿠키에 남긴다. */
export async function rememberKakaoLogin(state: string, joinCode: string | null) {
  const jar = await cookies();
  jar.set(KAKAO_STATE, state, shortCookie());
  if (joinCode) jar.set(JOIN_CODE, joinCode, shortCookie());
  else jar.delete(JOIN_CODE);
}

export async function takeKakaoState() {
  const jar = await cookies();
  const state = jar.get(KAKAO_STATE)?.value;
  jar.delete(KAKAO_STATE);
  return state;
}

export async function kakaoJoinCode() {
  return (await cookies()).get(JOIN_CODE)?.value;
}

export async function takeJoinCode() {
  const jar = await cookies();
  const code = jar.get(JOIN_CODE)?.value;
  jar.delete(JOIN_CODE);
  return code;
}

export async function endSession() {
  const jar = await cookies();
  await deleteSession(await getDb(), jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}

/** 링크와 카카오 redirect_uri에 쓸 주소. 요청 헤더에서 읽는다. */
export async function siteOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** 요청 제한용 IP. Vercel은 x-forwarded-for 첫 값이 실제 접속 IP. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
