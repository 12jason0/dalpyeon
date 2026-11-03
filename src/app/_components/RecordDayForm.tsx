"use client";
import { useActionState, useState } from "react";
import { MOODS, PAINS, type DayLog, type Mood, type Pain } from "@/lib/daylog";
import { deletePeriodAction, saveRecordDayAction, type FormState } from "../actions";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorText, Submit } from "./Submit";
import { BTN, chip } from "./ui";

type Period = { id: string; startDate: string; endDate: string | null };

/**
 * 기록이 있는 날의 시트. 시작일·끝난 날·그날 통증·기분을 맨 아래 "저장" 하나로 한 번에 저장한다.
 * 저장되면 onDone(시트 닫기), 실패하면 시트를 그대로 두고 에러만 보여준다. 달력은 서버 액션의 refresh로 바로 바뀐다.
 * "이날로 끝내기"는 끝난 날 칸에 이 날짜를 채울 뿐이고, 저장해야 반영된다. 삭제는 확인 창을 거쳐 바로 지우고 시트를 닫는다.
 */
export function RecordDayForm({ day, today, period, log, onDone }: {
  day: string; today: string; period: Period; log: DayLog | null; onDone: () => void;
}) {
  const [end, setEnd] = useState(period.endDate ?? "");
  const [pain, setPain] = useState<Pain | null>(log?.pain ?? null);
  const [moods, setMoods] = useState<Mood[]>(log?.moods ?? []);
  const [state, action] = useActionState<FormState, FormData>(async (prev, form) => {
    const result: FormState = await saveRecordDayAction(prev, form).catch(() => ({ error: "저장하지 못했어요. 다시 시도해 주세요" }));
    if (result?.ok) onDone();
    return result;
  }, null);

  const remove = async () => {
    const form = new FormData();
    form.set("id", period.id);
    form.set("stay", "on");
    await deletePeriodAction(form);
    onDone();
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={period.id} />
      <input type="hidden" name="day" value={day} />
      {pain && <input type="hidden" name="pain" value={pain} />}
      {moods.map((m) => <input key={m} type="hidden" name="moods" value={m} />)}

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-muted">시작일</span>
          <input type="date" name="startDate" className="field" max={today} required defaultValue={period.startDate} />
        </label>
        <div>
          <label className="block">
            <span className="text-sm text-muted">끝난 날</span>
            <input type="date" name="endDate" className="field" max={today} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          {end !== day && (
            <button type="button" className="link mt-1 h-8 text-[13px]" onClick={() => setEnd(day)}>이날로 끝내기</button>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="text-sm text-muted">통증</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.entries(PAINS) as [Pain, string][]).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={pain === key} className={chip(pain === key)} onClick={() => setPain(pain === key ? null : key)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm text-muted">기분</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.entries(MOODS) as [Mood, string][]).map(([key, label]) => {
            const on = moods.includes(key);
            return (
              <button key={key} type="button" aria-pressed={on} className={chip(on)} onClick={() => setMoods(on ? moods.filter((m) => m !== key) : [...moods, key])}>
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <ErrorText message={state?.error} />
      <div className="flex flex-col items-center gap-1 pt-1">
        <Submit className={BTN}>저장</Submit>
        <ConfirmButton
          label="이 기록 삭제" className="h-9 text-[13px] text-danger underline underline-offset-4"
          title="이 기록을 지울까요?" note="이 기간의 통증·기분도 함께 지워져요." confirmLabel="지우기" danger action={remove}
        />
      </div>
    </form>
  );
}
