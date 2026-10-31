import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { waitingClaim } from "@/lib/services/couples";
import { currentUser } from "@/lib/session";
import { JoinForm, JoinWithLink } from "../_components/JoinForms";
import { Logo } from "../_components/HomeCards";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const param = (await searchParams).code;
  const code = typeof param === "string" ? param.slice(0, 12) : "";
  const user = await currentUser();

  if (user) {
    // 이미 승인을 기다리는 중이면 링크를 다시 열어도 새 요청을 보내지 않는다
    if (!code || (await waitingClaim(await getDb(), user))) redirect("/connect");
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
      <p className="mt-3 mb-10 text-[15px] leading-relaxed text-muted">가입하면 코드를 준 사람에게 연결 요청이 가요.</p>
      <JoinForm code={code} />
    </>
  );
}
