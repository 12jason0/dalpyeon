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

/** 기록자 홈 맨 위의 이번 주. 어디를 눌러도 전체 달력으로 간다. */
export function WeekStrip({ today, marks }: { today: string; marks: CalendarMark[] }) {
  const week = weekOf(today);
  return (
    <Link href="/calendar" className="block rounded-[18px] border-[0.5px] border-line bg-card px-3 py-2 shadow-soft">
      <span className="flex items-center gap-1.5">
        <span className="shrink-0 text-[15px] font-semibold tracking-tight">{Number(today.slice(5, 7))}월</span>
        <span className="grid min-w-0 flex-1 grid-cols-7 text-center">
          {week.map((day, i) => (
            <span key={day} data-week-day={day} className="flex flex-col items-center">
              <span className="text-[11px] text-muted" aria-hidden>{WEEKDAYS[i]}</span>
              <span className={`mt-0.5 flex h-7 w-7 items-center justify-center text-[15px] ${day === today ? "rounded-full bg-accent font-semibold text-white" : ""}`}>
                {Number(day.slice(8))}
              </span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${dotStyle(marks, day)}`} aria-hidden />
              <span className="sr-only">{[...dayLabels(marks, day), ...(day === today ? ["오늘"] : [])].join(", ")}</span>
            </span>
          ))}
        </span>
        <CalendarDays size={20} className="shrink-0 text-muted" aria-hidden />
        <span className="sr-only">전체 달력 보기</span>
      </span>
    </Link>
  );
}
