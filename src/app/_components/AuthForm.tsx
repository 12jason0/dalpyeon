"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

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
