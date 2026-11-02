import { dayLabels, ovulationOn, weekBars, weeksOf, type BarKind } from "@/lib/calendar";
import { monthDay, monthGrid, monthLabel, WEEKDAYS } from "@/lib/dates";
import type { CalendarMark } from "@/lib/prediction";

const BAR_STYLE: Record<BarKind, string> = {
  period: "bg-accent",
  remaining: "border border-dashed border-period-dash",
  predicted: "bg-period text-period-ink",
  fertile: "bg-fertile text-fertile-ink",
};

export function WeekdayRow() {
  return (
    <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-muted" aria-hidden>
      {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
    </div>
  );
}

function DayCell({ day, marks, today, onPick }: { day: string; marks: CalendarMark[]; today: string; onPick?: (day: string) => void }) {
  const label = [monthDay(day), ...dayLabels(marks, day), ...(day === today ? ["오늘"] : [])].join(", ");
  const number = (
    <span className={`mt-1 flex h-7 w-7 items-center justify-center text-[15px] ${day === today ? "rounded-full bg-accent font-semibold text-white" : ""}`}>
      {Number(day.slice(8))}
    </span>
  );
  const cell = "flex h-[3.75rem] w-full justify-center";
  if (!onPick) return <div className={cell} aria-label={label} role="img">{number}</div>;
  return <button type="button" data-day={day} aria-label={label} className={cell} onClick={() => onPick(day)}>{number}</button>;
}

/** 한 달. 날짜 아래 막대는 주마다 끊어 그린다. onPick이 없으면 읽기 전용이다. */
export function CalendarMonth({ month, marks, today, onPick }: { month: string; marks: CalendarMark[]; today: string; onPick?: (day: string) => void }) {
  return (
    <section data-month={month} aria-label={monthLabel(month)}>
      <h2 className="px-1 pb-2 pt-5 text-[17px] font-semibold tracking-tight">{monthLabel(month)}</h2>
      {weeksOf(monthGrid(month).cells).map((week, i) => (
        <div key={i} className="relative border-t border-line">
          <div className="grid grid-cols-7">
            {week.map((day, j) => (day ? <DayCell key={day} day={day} marks={marks} today={today} onPick={onPick} /> : <span key={j} />))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 grid grid-cols-7 text-[10px] font-medium leading-4" aria-hidden>
            {weekBars(week, marks).map((bar) => (
              <span
                key={bar.start} style={{ gridRow: 1, gridColumn: `${bar.start + 1} / span ${bar.span}` }}
                className={`h-4 overflow-hidden whitespace-nowrap rounded-sm px-1 ${BAR_STYLE[bar.kind]}`}
              >
                {bar.label}
              </span>
            ))}
            {week.map((day, j) => day && ovulationOn(marks, day) && (
              <span key={day} style={{ gridRow: 1, gridColumn: j + 1 }} className="mx-0.5 h-4 rounded-sm bg-fertile-ink text-center text-paper">배란일</span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
