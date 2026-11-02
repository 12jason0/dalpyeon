import { redirect } from "next/navigation";
import { consentDone } from "@/lib/services/auth";
import { requireLogin } from "@/lib/session";
import { ConsentForm } from "../_components/ConsentForm";
import { Logo } from "../_components/HomeCards";
import { LogoutButton } from "../_components/NotificationSettings";

export const dynamic = "force-dynamic";

/** 카카오로 처음 온 사람과 동의 항목이 늘기 전에 가입한 계정이 거치는 화면. 탭 없이 이 화면만 보인다. */
export default async function ConsentPage() {
  const user = await requireLogin();
  if (consentDone(user)) redirect("/");
  const returning = Boolean(user.healthConsentAt);
  return (
    <>
      <Logo />
      <h1 className="mt-10 text-3xl font-semibold leading-snug tracking-tight">계속 쓰려면 동의가 필요해요</h1>
      <p className="mt-3 mb-4 text-[15px] leading-relaxed text-muted">우리주기는 생리 기록 같은 건강 정보를 저장해요. 동의해야 이어서 쓸 수 있어요.</p>
      {returning && (
        <p className="mb-6 text-[15px] leading-relaxed">
          파트너 공유도 바뀌었어요. 연결돼 있으면 생리 기록·예상·가임기·배란일·그날의 통증과 기분이 항목 구분 없이 상대에게 보여요.
          원하지 않으면 연결 화면에서 잠시 멈추거나 연결을 끊을 수 있어요.
        </p>
      )}
      <ConsentForm health={!returning} />
      <LogoutButton />
    </>
  );
}
