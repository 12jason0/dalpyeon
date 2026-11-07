import { redirect } from "next/navigation";
import { kakaoEnabled } from "@/lib/services/kakao";
import { currentUser } from "@/lib/session";
import { AuthForm } from "../_components/AuthForm";
import { Brand } from "../_components/Brand";
import { KakaoButton } from "../_components/KakaoButton";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta("로그인", "디어데이 로그인. 이메일이나 카카오로 로그인하고 연인과 공유한 생리 달력을 확인해요.", "/login");

export default async function Page({ searchParams }: { searchParams: Promise<{ kakao?: string }> }) {
  if (await currentUser()) redirect("/");
  return (
    <>
      <Brand />
      {kakaoEnabled() && <KakaoButton failed={(await searchParams).kakao === "failed"} />}
      <AuthForm mode="login" />
    </>
  );
}
