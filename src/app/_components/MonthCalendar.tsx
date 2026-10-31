import Link from "next/link";
import { addMonths, monthDay, monthGrid, monthLabel, WEEKDAYS } from "@/lib/dates";
import type { CalendarMark } from "@/lib/prediction";

type Kind = "period" | "predicted" | "fertile";

const LABELS: Record<Kind, string> = { period: "생리", predicted: "예상", fertile: "가임기(추정)" };

/** 하루에 표시가 겹치면 실제 기록 > 예상 > 가임기 순으로 하나만 그린다. */
export function kindOf(marks: CalendarMark[], day: string): Kind | null {
  const types = marks.filter((m) => m.date === day).map((m) => m.type);
  if (types.includes("period")) return "period";
  if (types.includes("predicted_period")) return "predicted";
  if (types.includes("estimated_fertile_window")) return "fertile";
  return null;
}

function Day({ day, kind, today, selected }: { day: string; kind: Kind | null; today: string; selected: boolean }) {
  const shape = kind === "period" ? "bg-period text-white"
    : kind === "predicted" ? "border-2 border-dotted border-period"
    : kind === "fertile" ? "text-fertile"
    : "";
  return (
    <span className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[17px] ${shape} ${
      selected ? "ring-2 ring-ink ring-offset-1 ring-offset-paper" : ""
    } ${day === today ? "font-bold underline underline-offset-4" : ""}`}>
      <span aria-hidden>{Number(day.slice(8))}</span>
      <span className="sr-only">{monthDay(day)}{kind && `, ${LABELS[kind]}`}{day === today && ", 오늘"}</span>
      {kind === "fertile" && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-fertile" />}
    </span>
  );
}

/** basePath 화면의 ?month=로 달을 옮긴다. dayHref를 주면 날짜를 누를 수 있고, 없으면 읽기 전용이다. */
export function MonthCalendar({ month, marks, today, basePath, selected, dayHref }: {
  month: string;
  marks: CalendarMark[];
  today: string;
  basePath: string;
  selected?: string | null;
  dayHref?: (day: string) => string;
}) {
  const { cells } = monthGrid(month);
  const arrow = (to: string, label: string, text: string) => (
    <Link href={`${basePath}?month=${to}`} scroll={false} aria-label={label} className="flex h-11 w-11 items-center justify-center text-2xl text-muted">
      {text}
    </Link>
  );
  return (
    <div>
      <div className="flex items-center justify-between">
        {arrow(addMonths(month, -1), "이전 달", "‹")}
        <p className="text-2xl font-semibold tracking-tight">{monthLabel(month)}</p>
        {arrow(addMonths(month, 1), "다음 달", "›")}
      </div>
      <div className="mt-4 grid grid-cols-7 text-center text-[13px] text-muted" aria-hidden>
        {WEEKDAYS.map((w) => <span key={w} className="py-2">{w}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <span key={i} className="min-h-12" />;
          const inner = <Day day={day} kind={kindOf(marks, day)} today={today} selected={day === selected} />;
          const cell = "flex min-h-12 items-center justify-center";
          return dayHref
            ? <Link key={day} href={dayHref(day)} scroll={false} className={cell} aria-current={day === selected ? "date" : undefined}>{inner}</Link>
            : <div key={day} className={cell}>{inner}</div>;
        })}
      </div>
      <p className="mt-4 flex items-center justify-center gap-5 text-[13px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-period" />생리</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dotted border-period" />예상</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-fertile" />가임기(추정)</span>
      </p>
    </div>
  );
}
