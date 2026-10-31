import { redirect } from "next/navigation";
import { kakaoEnabled } from "@/lib/services/kakao";
import { currentUser } from "@/lib/session";
import { JoinForm, JoinWithLink } from "../_components/JoinForms";
import { Logo } from "../_components/HomeCards";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string | string[]; kakao?: string }> }) {
  const { code: param, kakao } = await searchParams;
  const code = typeof param === "string" ? param.slice(0, 12) : "";
  const user = await currentUser();

  if (user) {
    if (!user.healthConsentAt) redirect("/consent");
    if (!code) redirect("/connect");
    return (
      <>
        <Logo />
        <JoinWithLink code={code} />
      </>
    );
  }
  return (
    <>
      <Logo />
      <h1 className="mt-10 text-3xl font-semibold leading-snug tracking-tight">받은 코드로 시작해요</h1>
      <p className="mt-3 mb-10 text-[15px] leading-relaxed text-muted">가입하면 코드를 준 사람과 바로 연결돼요.</p>
      <JoinForm code={code} kakao={kakaoEnabled()} kakaoFailed={kakao === "failed"} />
    </>
  );
}
