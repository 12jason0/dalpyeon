"use client";
import Link from "next/link";
import { useActionState } from "react";
import { changePasswordAction, loginAction, signupAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

export function HealthConsent() {
  return (
    <label className="flex items-start gap-3 text-[15px] leading-relaxed">
      <input type="checkbox" name="healthConsent" required className="mt-1 h-5 w-5 shrink-0 accent-accent" />
      생리 기록 등 건강 정보를 저장하는 데 동의해요
    </label>
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
        <span className="text-sm text-muted">새 비밀번호 (8자 이상)</span>
        <input name="next" type="password" className="field" minLength={8} autoComplete="new-password" required />
      </label>
      <label className="block">
        <span className="text-sm text-muted">새 비밀번호 확인</span>
        <input name="confirm" type="password" className="field" minLength={8} autoComplete="new-password" required />
      </label>
      <ErrorText message={state?.error} />
      {state?.ok && <p role="status" className="text-sm text-muted">바꿨어요. 다른 기기에서는 로그아웃됐어요.</p>}
      <Submit>비밀번호 바꾸기</Submit>
    </form>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, null);
  return (
    <form action={action} className="space-y-6">
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
        <span className="text-sm text-muted">비밀번호{mode === "signup" && " (8자 이상)"}</span>
        <input
          name="password" type="password" className="field" minLength={8} required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {mode === "signup" && <HealthConsent />}
      <ErrorText message={state?.error} />
      <div className="pt-4">
        <Submit>{mode === "login" ? "로그인" : "시작하기"}</Submit>
      </div>
      <p className="text-center text-sm">
        {mode === "login" ? (
          <Link href="/signup" className="link">처음이에요</Link>
        ) : (
          <Link href="/login" className="link">이미 계정이 있어요</Link>
        )}
      </p>
      <p className="text-center text-sm text-muted">
        연인에게 코드를 받았나요? <Link href="/join" className="link">코드로 시작하기</Link>
      </p>
    </form>
  );
}
