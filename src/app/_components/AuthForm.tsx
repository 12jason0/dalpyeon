"use client";
import Link from "next/link";
import { useActionState } from "react";
import { HEALTH_NOTICE, TRANSFER_NOTICE } from "@/lib/content/consents";
import { changePasswordAction, loginAction, signupAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

function Notice({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <details className="ml-8 mt-1 text-[13px] leading-relaxed text-muted">
      <summary className="cursor-pointer">자세히 보기</summary>
      <dl className="mt-1 space-y-1">
        {rows.map(([label, text]) => <div key={label}><dt className="inline font-medium">{label}: </dt><dd className="inline">{text}</dd></div>)}
      </dl>
    </details>
  );
}

function Check({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-[15px] leading-relaxed">
      <input type="checkbox" name={name} required className="mt-1 h-5 w-5 shrink-0 accent-accent" />
      <span>{children}</span>
    </label>
  );
}

/** 필수 동의 세 가지. 예전에 건강 정보에 동의한 계정에는 health를 끄고 나머지만 받는다. */
export function Consents({ health = true }: { health?: boolean }) {
  return (
    <div className="space-y-3">
      <Check name="ageConfirmed">만 14세 이상입니다 (필수)</Check>
      {health && (
        <div>
          <Check name="healthConsent">건강정보(민감정보) 수집·이용 동의 (필수)</Check>
          <Notice rows={HEALTH_NOTICE} />
        </div>
      )}
      <div>
        <Check name="transferConsent">개인정보 국외 이전 동의 (필수)</Check>
        <Notice rows={TRANSFER_NOTICE} />
      </div>
      <p className="text-sm"><Link href="/me/privacy" target="_blank" className="link">개인정보 처리방침</Link></p>
    </div>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm text-muted">현재 비밀번호</span>
        <input name="current" type="password" className="field" autoComplete="current-password" required />
      </label>
      <label className="block">
        <span className="text-sm text-muted">새 비밀번호 (8~20자)</span>
        <input name="next" type="password" className="field" minLength={8} maxLength={20} autoComplete="new-password" required />
      </label>
      <label className="block">
        <span className="text-sm text-muted">새 비밀번호 확인</span>
        <input name="confirm" type="password" className="field" minLength={8} maxLength={20} autoComplete="new-password" required />
      </label>
      <ErrorText message={state?.error} />
      {state?.ok && <p role="status" className="text-sm text-muted">바꿨어요. 다른 기기에서는 로그아웃됐어요.</p>}
      <Submit>비밀번호 바꾸기</Submit>
    </form>
  );
}

/** code가 있으면 초대 링크에서 온 로그인이다. 로그인하자마자 연결하고, 가입 링크는 초대 가입으로 돌려보낸다. */
export function AuthForm({ mode, code }: { mode: "login" | "signup"; code?: string }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, null);
  return (
    <form action={action} className="space-y-6">
      {code && <input type="hidden" name="code" value={code} />}
      {mode === "signup" && (
        <label className="block">
          <span className="text-sm text-muted">상대에게 보일 이름</span>
          <input name="nickname" className="field" maxLength={20} required placeholder="예: 지민" defaultValue={state?.values?.nickname} />
        </label>
      )}
      <label className="block">
        <span className="text-sm text-muted">이메일</span>
        <input name="email" type="email" className="field" autoComplete="email" required defaultValue={state?.values?.email} />
      </label>
      <label className="block">
        <span className="text-sm text-muted">비밀번호{mode === "signup" && " (8~20자)"}</span>
        <input
          name="password" type="password" className="field" minLength={8} maxLength={mode === "signup" ? 20 : undefined} required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {mode === "signup" && <Consents />}
      <ErrorText message={state?.error} />
      <div className="pt-4">
        <Submit className="btn w-full">{mode === "login" ? "로그인" : "시작하기"}</Submit>
      </div>
      <p className="text-center text-sm">
        {mode === "login" ? (
          <Link href={code ? `/join?code=${encodeURIComponent(code)}` : "/signup"} className="link">처음이에요</Link>
        ) : (
          <Link href="/login" className="link">이미 계정이 있어요</Link>
        )}
      </p>
      {!code && (
        <p className="text-center text-sm text-muted">
          연인에게 코드를 받았나요? <Link href="/join" className="link">코드로 시작하기</Link>
        </p>
      )}
    </form>
  );
}
