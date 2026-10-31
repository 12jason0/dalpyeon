"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { dayRange, diffDays, monthDay } from "@/lib/dates";
import type { CalendarMark } from "@/lib/prediction";
import { savePeriodAction } from "../actions";
import { MonthCalendar } from "./MonthCalendar";

type Draft = { start: string; end: string | null };
type PeriodRow = { id: string; startDate: string; endDate: string | null };

/** 기록 탭 달력. 기간 선택은 이 화면 안에서만 오가고, 저장할 때 서버 액션을 한 번 부른다. */
export function RecordsCalendar({ month, marks, today, selected, periods, ongoing, children }: {
  month: string;
  marks: CalendarMark[];
  today: string;
  selected: string | null;
  periods: PeriodRow[];
  /** 종료일 없는 기록이 진행 중인 날짜. 새 시작 대신 [이날 끝났어요]를 보여준다. */
  ongoing: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isRecorded = (day: string) => periods.some((p) => p.startDate <= day && day <= (p.endDate ?? p.startDate));
  const isFree = (day: string) => day <= today && !isRecorded(day) && !ongoing.includes(day);

  const [draft, setDraft] = useState<Draft | null>(selected && isFree(selected) ? { start: selected, end: null } : null);
  const [saving, keepPainted] = useOptimistic<Draft | null, Draft>(null, (_, next) => next);
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = saving ?? draft;

  const openDay = (day: string) => {
    setDraft(null);
    router.push(`/records?month=${month}&day=${day}`, { scroll: false });
  };
  const leaveDraft = () => {
    setDraft(null);
    setError(null);
    router.replace(`/records?month=${month}`, { scroll: false });
  };

  const pick = (day: string) => {
    if (pending) return;
    setError(null);
    if (!draft || day < draft.start) {
      if (isFree(day)) setDraft({ start: day, end: null });
      else if (!draft || day <= today) openDay(day);
      return;
    }
    if (day > today) return;
    setDraft({ start: draft.start, end: day === draft.start ? null : day });
  };

  const overlaps = shown
    ? periods.some((p) => shown.start <= (p.endDate ?? p.startDate) && p.startDate <= (shown.end ?? shown.start))
    : false;

  const save = () => {
    if (!draft || overlaps) return;
    const form = new FormData();
    form.set("startDate", draft.start);
    if (draft.end) form.set("endDate", draft.end);
    startSaving(async () => {
      keepPainted(draft);
      const result = await savePeriodAction(null, form);
      if (result?.error) setError(result.error);
      else leaveDraft();
    });
  };

  return (
    <>
      <MonthCalendar
        month={month} marks={marks} today={today} basePath="/records" selected={shown ? null : selected} onPick={pick}
        isPainted={(day) => Boolean(shown && shown.start <= day && day <= (shown.end ?? shown.start))}
      />
      <section className="mt-10 min-h-16">
        {shown ? (
          <>
            <h2 className="text-xl font-medium">
              {shown.end ? `${dayRange(shown.start, shown.end)} · ${diffDays(shown.end, shown.start) + 1}일` : `${monthDay(shown.start)} 시작일 선택됨`}
            </h2>
            {!shown.end && <p className="mt-1 text-[15px] text-muted">끝난 날을 누르거나, 그대로 저장하면 진행 중으로 기록돼요.</p>}
            {overlaps && <p role="alert" className="mt-3 text-sm text-period-ink">다른 생리 기록과 날짜가 겹쳐요</p>}
            {error && <p role="alert" className="mt-3 text-sm text-period-ink">{error}</p>}
            <div className="mt-5 flex items-center gap-4">
              <button type="button" className="btn" onClick={save} disabled={pending || overlaps}>{pending ? "저장 중…" : "저장"}</button>
              <button type="button" className="link h-11 shrink-0 px-2 text-sm" onClick={leaveDraft} disabled={pending}>취소</button>
            </div>
          </>
        ) : children}
      </section>
    </>
  );
}
