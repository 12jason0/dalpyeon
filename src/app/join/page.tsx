import { redirect } from "next/navigation";
import { kakaoEnabled } from "@/lib/services/kakao";
import { consentDone } from "@/lib/services/auth";
import { currentUser } from "@/lib/session";
import { AuthForm } from "../_components/AuthForm";
import { JoinForm, JoinWithLink } from "../_components/JoinForms";
import { KakaoButton } from "../_components/KakaoButton";
import { Logo } from "../_components/HomeCards";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string | string[]; kakao?: string; login?: string }> }) {
  const { code: param, kakao, login } = await searchParams;
  const code = typeof param === "string" ? param.slice(0, 12) : "";
  const user = await currentUser();

  if (user) {
    if (!consentDone(user)) redirect("/consent");
    if (!code) redirect("/connect");
    return (
      <>
        <Logo />
        <JoinWithLink code={code} />
      </>
    );
  }
  // 초대 링크에서 "이미 계정이 있어요"를 누른 경우. 로그인하면 바로 연결된다.
  if (code && login) {
    return (
      <>
        <Logo />
        <h1 className="mt-10 text-3xl font-medium leading-snug tracking-tight">로그인하고 연결해요</h1>
        <p className="mt-3 mb-10 text-[15px] leading-relaxed text-muted">로그인하면 코드를 준 사람과 바로 연결돼요. 내 기록은 지워지지 않아요.</p>
        {kakaoEnabled() && <KakaoButton code={code} failed={kakao === "failed"} />}
        <AuthForm mode="login" code={code} />
      </>
    );
  }
  return (
    <>
      <Logo />
      <h1 className="mt-10 text-3xl font-medium leading-snug tracking-tight">받은 코드로 시작해요</h1>
      <p className="mt-3 mb-10 text-[15px] leading-relaxed text-muted">가입하면 코드를 준 사람과 바로 연결돼요.</p>
      <JoinForm code={code} kakao={kakaoEnabled()} kakaoFailed={kakao === "failed"} />
    </>
  );
}
