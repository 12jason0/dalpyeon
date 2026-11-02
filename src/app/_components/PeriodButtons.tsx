"use client";
import { useActionState } from "react";
import { endTodayAction, snoozeEndAction, startTodayAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

/** day를 주면 그 날짜로, 없으면 오늘로 시작한다. */
export function StartTodayButton({ day }: { day?: string }) {
  const [state, action] = useActionState<FormState, FormData>(startTodayAction, null);
  return (
    <form action={action}>
      {day && <input type="hidden" name="day" value={day} />}
      <Submit>{day ? "이날 시작했어요" : "오늘 시작했어요"}</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}

/** 예상 종료일이 지났는데 종료일이 없을 때 묻는다. 질문은 시트 제목에 있다. */
export function EndQuestion({ question: { id, startDate, date }, today }: {
  question: { id: string; startDate: string; date: string }; today: string;
}) {
  const [ended, end] = useActionState<FormState, FormData>(endTodayAction, null);
  const [snoozed, snooze] = useActionState<FormState, FormData>(snoozeEndAction, null);
  return (
    <section>
      <form action={end}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="day" value={date} />
        <Submit>네, 그날 끝났어요</Submit>
      </form>
      <form action={snooze} className="mt-2 text-center">
        <input type="hidden" name="id" value={id} />
        <Submit className="link h-11 text-[15px]">아직 하고 있어요</Submit>
      </form>
      <details className="text-center">
        <summary className="link h-11 cursor-pointer list-none text-[15px] leading-11">다른 날 끝났어요</summary>
        <form action={end} className="mt-2 text-left">
          <input type="hidden" name="id" value={id} />
          <label className="block">
            <span className="text-sm text-muted">끝난 날</span>
            <input type="date" name="day" className="field" min={startDate} max={today} defaultValue={date} required />
          </label>
          <div className="mt-4"><Submit>이날로 저장</Submit></div>
        </form>
      </details>
      <ErrorText message={ended?.error ?? snoozed?.error} />
    </section>
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
