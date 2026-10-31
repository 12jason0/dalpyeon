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

/** day를 주면 그 날짜로, 없으면 오늘로 끝낸다. */
export function EndTodayButton({ id, day }: { id: string; day?: string }) {
  const [state, action] = useActionState<FormState, FormData>(endTodayAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {day && <input type="hidden" name="day" value={day} />}
      <Submit>{day ? "이날 끝났어요" : "오늘 끝났어요"}</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}
