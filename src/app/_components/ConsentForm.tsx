"use client";
import { useActionState } from "react";
import { healthConsentAction, type FormState } from "../actions";
import { HealthConsent } from "./AuthForm";
import { ErrorText, Submit } from "./Submit";

export function ConsentForm() {
  const [state, action] = useActionState<FormState, FormData>(healthConsentAction, null);
  return (
    <form action={action} className="space-y-6">
      <HealthConsent />
      <ErrorText message={state?.error} />
      <Submit>동의하고 계속하기</Submit>
    </form>
  );
}
