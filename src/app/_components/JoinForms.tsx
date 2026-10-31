"use client";
import Link from "next/link";
import { useActionState } from "react";
import { joinAction, joinWithLinkAction, type FormState } from "../actions";
import { HealthConsent } from "./AuthForm";
import { ErrorText, Submit } from "./Submit";

export function JoinForm({ code }: { code: string }) {
  const [state, action] = useActionState<FormState, FormData>(joinAction, null);
  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className="text-sm text-muted">받은 코드 8자리</span>
        <input
          name="code" className="field font-mono text-2xl tracking-wider uppercase" placeholder="ABCD-EFGH"
          autoComplete="off" autoCapitalize="characters" maxLength={12} required defaultValue={state?.values?.code ?? code}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted">상대에게 보일 이름</span>
        <input name="nickname" className="field" maxLength={20} required placeholder="예: 도윤" defaultValue={state?.values?.nickname} />
      </label>
      <label className="block">
        <span className="text-sm text-muted">이메일</span>
        <input name="email" type="email" className="field" autoComplete="email" required defaultValue={state?.values?.email} />
      </label>
      <label className="block">
        <span className="text-sm text-muted">비밀번호 (8자 이상)</span>
        <input name="password" type="password" className="field" minLength={8} required autoComplete="new-password" />
      </label>
      <HealthConsent />
      <ErrorText message={state?.error} />
      <div className="pt-4"><Submit>시작하기</Submit></div>
      <p className="text-center text-sm"><Link href="/login" className="link">이미 계정이 있어요</Link></p>
    </form>
  );
}

/** 로그인한 사람은 코드를 넣어도 바로 연결하지 않는다. 버튼을 눌러야 연결한다. */
export function JoinWithLink({ code }: { code: string }) {
  return (
    <>
      <h1 className="mt-10 text-3xl font-semibold leading-snug tracking-tight">이 코드로 연결할까요?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">바로 연결되고 파트너 화면으로 바뀌어요. 내 기록은 지워지지 않아요.</p>
      <form action={joinWithLinkAction} className="mt-10 flex items-center gap-4">
        <input type="hidden" name="code" value={code} />
        <Submit>연결하기</Submit>
        <Link href="/" className="link shrink-0 px-2 text-sm">취소</Link>
      </form>
    </>
  );
}
