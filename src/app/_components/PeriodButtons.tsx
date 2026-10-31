"use client";
import { useActionState } from "react";
import { endTodayAction, startTodayAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

export function StartTodayButton() {
  const [state, action] = useActionState<FormState, FormData>(startTodayAction, null);
  return (
    <form action={action}>
      <Submit>오늘 시작했어요</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}

export function EndTodayButton({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(endTodayAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Submit>오늘 끝났어요</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}
