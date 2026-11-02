import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { errorKind } from "@/lib/errors";
import { limit } from "@/lib/services/auth";
import { KAKAO_CALLBACK, kakaoEnabled, kakaoLanding, signInWithKakao } from "@/lib/services/kakao";
import { clientIp, kakaoJoinCode, siteOrigin, startSession, takeJoinCode, takeKakaoState } from "@/lib/session";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const code = query.get("code");
  const state = await takeKakaoState();
  const joinCode = await kakaoJoinCode();
  let next = joinCode ? `/join?code=${encodeURIComponent(joinCode)}&kakao=failed` : "/login?kakao=failed";
  // 로그인을 취소하면 code 없이 돌아온다
  if (kakaoEnabled() && code && state && query.get("state") === state) {
    try {
      const db = await getDb();
      await limit(db, "login-ip", await clientIp(), 30, 900);
      const user = await signInWithKakao(db, code, `${await siteOrigin()}${KAKAO_CALLBACK}`);
      await startSession(user.id);
      next = kakaoLanding(user, joinCode);
    } catch (e) {
      console.error("kakao login failed", errorKind(e));
    }
  }
  if (next !== "/consent") await takeJoinCode();
  redirect(next);
}
