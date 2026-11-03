import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { users } from "../db/schema";
import { errorKind } from "../errors";
import { consentDone, sessionUserFields, type SessionUser } from "./auth";

export const KAKAO_CALLBACK = "/api/auth/kakao/callback";
const DEFAULT_NICKNAME = "디어데이 사용자";

export function kakaoEnabled() {
  return Boolean(process.env.KAKAO_REST_API_KEY && process.env.KAKAO_CLIENT_SECRET);
}

export function kakaoAuthorizeUrl(state: string, redirectUri: string) {
  const query = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "", redirect_uri: redirectUri, response_type: "code", scope: "profile_nickname", state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${query}`;
}

async function kakaoProfile(code: string, redirectUri: string, fetcher: typeof fetch) {
  const tokenRes = await fetcher("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: process.env.KAKAO_REST_API_KEY ?? "",
      client_secret: process.env.KAKAO_CLIENT_SECRET ?? "", redirect_uri: redirectUri, code,
    }),
  });
  if (!tokenRes.ok) throw new Error(`kakao token ${tokenRes.status}`);
  const { access_token: accessToken } = await tokenRes.json() as { access_token?: string };
  const meRes = await fetcher("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!meRes.ok) throw new Error(`kakao profile ${meRes.status}`);
  const me = await meRes.json() as { id?: number; properties?: { nickname?: string } };
  if (!me.id) throw new Error("kakao profile without id");
  return { kakaoId: String(me.id), nickname: me.properties?.nickname?.trim().slice(0, 20) || DEFAULT_NICKNAME };
}

/** 회원번호로 찾고, 없으면 기록자로 가입시킨다. 건강 정보 동의는 받기 전이라 동의 화면을 거친다. */
export async function signInWithKakao(db: DB, code: string, redirectUri: string, fetcher: typeof fetch = fetch): Promise<SessionUser> {
  const { kakaoId, nickname } = await kakaoProfile(code, redirectUri, fetcher);
  const find = async () => {
    const [row] = await db.select(sessionUserFields).from(users).where(eq(users.kakaoId, kakaoId)).limit(1);
    return row;
  };
  const found = await find();
  if (found) return found;
  await db.insert(users).values({ id: randomUUID(), kakaoId, role: "recorder", nickname }).onConflictDoNothing({ target: users.kakaoId });
  return find();
}

/** 카카오 쪽 앱 연결을 끊는다. 탈퇴는 이미 끝난 뒤라 실패해도 기록만 남긴다. */
export async function unlinkKakao(kakaoId: string, fetcher: typeof fetch = fetch) {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) return;
  try {
    const res = await fetcher("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: { Authorization: `KakaoAK ${adminKey}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ target_id_type: "user_id", target_id: kakaoId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("kakao unlink failed", res.status);
  } catch (e) {
    console.error("kakao unlink failed", errorKind(e));
  }
}

/** 동의 전이면 동의 화면. 초대 코드는 쿠키에 남아 있다가 동의 뒤(또는 쓰던 계정이면 바로) 연결한다. */
export function kakaoLanding(user: SessionUser) {
  return consentDone(user) ? "/" : "/consent";
}
