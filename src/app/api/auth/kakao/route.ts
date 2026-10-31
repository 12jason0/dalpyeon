import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { normalizeCode } from "@/lib/services/couples";
import { KAKAO_CALLBACK, kakaoAuthorizeUrl, kakaoEnabled } from "@/lib/services/kakao";
import { rememberKakaoLogin, siteOrigin } from "@/lib/session";

export async function GET(request: Request) {
  if (!kakaoEnabled()) redirect("/login");
  const code = normalizeCode(new URL(request.url).searchParams.get("code") ?? "");
  const state = randomBytes(32).toString("base64url");
  await rememberKakaoLogin(state, code.length === 8 ? code : null);
  redirect(kakaoAuthorizeUrl(state, `${await siteOrigin()}${KAKAO_CALLBACK}`));
}
