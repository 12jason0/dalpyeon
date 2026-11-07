import { redirect } from "next/navigation";
import { kakaoEnabled } from "@/lib/services/kakao";
import { currentUser } from "@/lib/session";
import { AuthForm } from "../_components/AuthForm";
import { Brand } from "../_components/Brand";
import { KakaoButton } from "../_components/KakaoButton";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta("처음 시작하기", "무료 커플 생리 앱 디어데이 가입. 생리주기를 기록하고 코드 하나로 연인과 공유해요. 이메일이나 카카오로 바로 시작해요.", "/signup");

export default async function Page() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <Brand />
      {kakaoEnabled() && <KakaoButton />}
      <AuthForm mode="signup" />
    </>
  );
}
