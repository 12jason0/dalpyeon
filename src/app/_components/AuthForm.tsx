"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, signupAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "login" ? loginAction : signupAction, null);
  const [role, setRole] = useState<"recorder" | "partner">("recorder");
  return (
    <form action={action} className="space-y-6">
      {mode === "signup" && (
        <fieldset>
          <legend className="mb-3 text-sm text-muted">어떻게 쓸까요?</legend>
          <input type="hidden" name="role" value={role} />
          <div className="grid grid-cols-2 gap-3">
            {([
              ["recorder", "내 주기를 기록해요"],
              ["partner", "파트너 편이 되어줄게요"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                aria-pressed={role === value}
                className={`rounded-2xl border px-4 py-5 text-left text-[15px] leading-snug transition ${
                  role === value ? "border-ink text-ink" : "border-line text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
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
    </form>
  );
}
