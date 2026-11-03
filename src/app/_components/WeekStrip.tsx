import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { barOn, dayLabels, ovulationOn, ovulationTentative, weekOf, type BarKind } from "@/lib/calendar";
import { WEEKDAYS } from "@/lib/dates";
import type { CalendarMark } from "@/lib/prediction";

const DOT_STYLE: Record<BarKind, string> = {
  period: "bg-accent",
  remaining: "bg-period-dash",
  predicted: "bg-period-dash",
  fertile: "bg-fertile-ink/45",
  tentative: "bg-fertile-ink/25",
};

function dotStyle(marks: CalendarMark[], day: string) {
  if (ovulationOn(marks, day)) return ovulationTentative(marks, day) ? "bg-fertile-ink/60" : "bg-fertile-ink";
  const bar = barOn(marks, day);
  return bar ? DOT_STYLE[bar] : "";
}

/** 기록자 홈 맨 위의 이번 주. 날짜를 누르면 전체 달력에서 그 날짜 시트가 열리고, 월·달력 아이콘은 전체 달력으로 간다. */
export function WeekStrip({ today, marks }: { today: string; marks: CalendarMark[] }) {
  const week = weekOf(today);
  return (
    <div className="flex items-center gap-1.5 rounded-[18px] border-[0.5px] border-line bg-card px-3 py-1.5 shadow-soft">
      <Link href="/calendar" className="flex h-11 shrink-0 items-center text-[15px] font-semibold tracking-tight" aria-label={`${Number(today.slice(5, 7))}월 전체 달력 보기`}>
        {Number(today.slice(5, 7))}월
      </Link>
      <span className="grid min-w-0 flex-1 grid-cols-7 text-center">
        {week.map((day, i) => (
          <Link
            key={day} href={`/calendar?day=${day}`} data-week-day={day}
            className="flex h-14 flex-col items-center justify-center rounded-xl transition-colors duration-150 active:bg-ink/[0.06] active:duration-0"
          >
            <span className="text-[11px] leading-[14px] text-muted" aria-hidden>{WEEKDAYS[i]}</span>
            <span className={`flex h-[30px] w-[30px] items-center justify-center text-[18px] leading-none ${day === today ? "rounded-full bg-accent font-semibold text-white" : ""}`}>
              {Number(day.slice(8))}
            </span>
            <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotStyle(marks, day)}`} aria-hidden />
            <span className="sr-only">{[...dayLabels(marks, day), ...(day === today ? ["오늘"] : [])].join(", ")}</span>
          </Link>
        ))}
      </span>
      <Link href="/calendar" className="-mr-1.5 flex h-11 w-9 shrink-0 items-center justify-center text-muted" aria-label="전체 달력 보기">
        <CalendarDays size={20} aria-hidden />
      </Link>
    </div>
  );
}
