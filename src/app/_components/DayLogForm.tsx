"use client";
import { useActionState, useState } from "react";
import { MOODS, PAINS, type DayLog, type Pain } from "@/lib/daylog";
import { saveDayLogAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

const PILL = "flex h-11 cursor-pointer items-center justify-center rounded-full border border-line px-4 text-[15px] text-muted transition";
const PICKED = "border-accent bg-accent font-semibold text-white";

/** 생리 중인 날의 통증·기분. 통증은 다시 누르면 풀린다. 둘 다 비우고 저장하면 그날 기록이 지워진다. */
export function DayLogForm({ day, initial }: { day: string; initial: DayLog | null }) {
  const [state, action] = useActionState<FormState, FormData>(saveDayLogAction, null);
  const [pain, setPain] = useState<Pain | null>(initial?.pain ?? null);
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="day" value={day} />
      {pain && <input type="hidden" name="pain" value={pain} />}
      <fieldset>
        <legend className="text-sm text-muted">통증</legend>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {Object.entries(PAINS).map(([key, label]) => (
            <button
              key={key} type="button" aria-pressed={pain === key} className={`${PILL} px-0 ${pain === key ? PICKED : ""}`}
              onClick={() => setPain(pain === key ? null : key as Pain)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm text-muted">기분 (여러 개 골라도 돼요)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(MOODS).map(([key, label]) => (
            <label key={key} className={`${PILL} has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:font-semibold has-[:checked]:text-white`}>
              <input type="checkbox" name="moods" value={key} defaultChecked={initial?.moods.includes(key as keyof typeof MOODS)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <ErrorText message={state?.error} />
      {state?.ok && <p role="status" className="text-sm text-muted">저장했어요.</p>}
      <Submit>저장</Submit>
    </form>
  );
}
