"use client";
import { useActionState } from "react";
import { consentAction, type FormState } from "../actions";
import { Consents } from "./AuthForm";
import { ErrorText, Submit } from "./Submit";

export function ConsentForm({ health }: { health: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(consentAction, null);
  return (
    <form action={action} className="space-y-6">
      <Consents health={health} />
      <ErrorText message={state?.error} />
      <Submit className="btn w-full">동의하고 계속하기</Submit>
    </form>
  );
}
