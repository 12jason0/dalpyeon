"use client";
import { useActionState } from "react";
import { monthDay } from "@/lib/dates";
import { endTodayAction, snoozeEndAction, startTodayAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

/** day를 주면 그 날짜로, 없으면 오늘로 시작한다. onStarted는 저장이 끝난 뒤 불린다. */
export function StartTodayButton({ day, onStarted }: { day?: string; onStarted?: () => void }) {
  // 저장되면 시트가 다른 화면으로 바뀌어 이 버튼이 사라지므로, 결과를 받는 자리에서 바로 알린다.
  const [state, action] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await startTodayAction(prev, form);
    if (result?.ok) onStarted?.();
    return result;
  }, null);
  return (
    <form action={action}>
      {day && <input type="hidden" name="day" value={day} />}
      <Submit>{day ? "이날 시작" : "오늘 시작했어요"}</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}

const ANSWER = "h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-40";

/** 예상 종료일이 지났는데 종료일이 없을 때 묻는다. "다른 날"만 펼쳐서 고른다. */
export function EndQuestion({ question: { id, startDate, date, day }, today }: {
  question: { id: string; startDate: string; date: string; day: number }; today: string;
}) {
  const [ended, end] = useActionState<FormState, FormData>(endTodayAction, null);
  const [snoozed, snooze] = useActionState<FormState, FormData>(snoozeEndAction, null);
  return (
    <section className="card">
      <p className="text-[15px] font-medium">{day}일째({monthDay(date)})에 끝났나요?</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <form action={end}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="day" value={date} />
          <Submit className={`${ANSWER} bg-accent text-white`}>네</Submit>
        </form>
        <form action={snooze}>
          <input type="hidden" name="id" value={id} />
          <Submit className={`${ANSWER} border border-line text-muted`}>아직이에요</Submit>
        </form>
      </div>
      <details className="mt-1 text-center">
        <summary className="link h-9 cursor-pointer list-none text-[13px] leading-9">다른 날</summary>
        <form action={end} className="text-left">
          <input type="hidden" name="id" value={id} />
          <label className="block">
            <span className="text-sm text-muted">끝난 날</span>
            <input type="date" name="day" className="field" min={startDate} max={today} defaultValue={date} required />
          </label>
          <div className="mt-3"><Submit className={`${ANSWER} bg-accent text-white`}>이날로 저장</Submit></div>
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
