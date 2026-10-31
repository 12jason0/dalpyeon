import { redirect } from "next/navigation";
import { requireLogin } from "@/lib/session";
import { ConsentForm } from "../_components/ConsentForm";
import { Logo } from "../_components/HomeCards";
import { LogoutButton } from "../_components/NotificationSettings";

export const dynamic = "force-dynamic";

/** 동의 기능이 생기기 전에 가입한 계정이 한 번 거치는 화면. 탭 없이 이 화면만 보인다. */
export default async function ConsentPage() {
  const user = await requireLogin();
  if (user.healthConsentAt) redirect("/");
  return (
    <>
      <Logo />
      <h1 className="mt-10 text-3xl font-semibold leading-snug tracking-tight">계속 쓰려면 동의가 필요해요</h1>
      <p className="mt-3 mb-10 text-[15px] leading-relaxed text-muted">우리주기는 생리 기록 같은 건강 정보를 저장해요. 동의해야 이어서 쓸 수 있어요.</p>
      <ConsentForm />
      <LogoutButton />
    </>
  );
}
