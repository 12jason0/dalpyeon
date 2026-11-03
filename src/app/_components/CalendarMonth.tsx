import { dayLabels, ovulationOn, pickable, weekBars, weeksOf, type BarKind } from "@/lib/calendar";
import { monthDay, monthGrid, monthLabel, WEEKDAYS } from "@/lib/dates";
import type { CalendarMark } from "@/lib/prediction";

const BAR_STYLE: Record<BarKind, string> = {
  period: "bg-accent",
  remaining: "border border-dashed border-period-dash",
  predicted: "bg-period text-period-ink",
  fertile: "bg-fertile-bar text-fertile-ink",
  tentative: "bg-fertile-bar/60 text-fertile-ink",
};

const SUNDAY = 0;
const SATURDAY = 6;
const WEEKEND = { [SUNDAY]: "text-period-dash", [SATURDAY]: "text-fertile-ink/60" } as Record<number, string>;

/** 달 제목과 요일 줄. 스크롤해도 그 달 안에서는 상단 영역 바로 아래에 붙어 있다. */
function MonthHead({ month }: { month: string }) {
  return (
    <div data-month-head className="sticky top-[var(--home-top,0px)] z-[5] rounded-t-xl bg-card px-1 pt-3">
      <h2 className="px-1 text-[17px] font-semibold tracking-tight">{monthLabel(month)}</h2>
      <div className="grid grid-cols-7 py-1 text-center text-[11px] text-muted" aria-hidden>
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
    </div>
  );
}

function DayCell({ day, column, marks, today, onPick }: { day: string; column: number; marks: CalendarMark[]; today: string; onPick?: (day: string) => void }) {
  const label = [monthDay(day), ...dayLabels(marks, day), ...(day === today ? ["오늘"] : [])].join(", ");
  const ovulation = ovulationOn(marks, day);
  const look = day === today ? "bg-accent font-semibold text-white" : WEEKEND[column] ?? "";
  const number = (
    <span className={`relative mt-px flex h-[26px] w-[26px] items-center justify-center rounded-full text-[15px] ${look} ${ovulation ? "border border-fertile-ink/40" : ""}`}>
      {Number(day.slice(8))}
      {ovulation && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${day === today ? "bg-white" : "bg-fertile-ink"}`} aria-hidden />}
    </span>
  );
  const cell = "flex h-[2.625rem] w-full justify-center";
  if (!onPick || !pickable(day, today)) return <div data-day={day} className={cell} aria-label={label} role="img">{number}</div>;
  return <button type="button" data-day={day} aria-label={label} className={cell} onClick={() => onPick(day)}>{number}</button>;
}

/** 한 달 카드. 날짜 아래 막대는 주마다 끊어 그린다. onPick이 없으면 읽기 전용이고, 있어도 앞날은 누를 수 없다. */
export function CalendarMonth({ month, marks, today, onPick }: { month: string; marks: CalendarMark[]; today: string; onPick?: (day: string) => void }) {
  return (
    <section data-month={month} aria-label={monthLabel(month)} className="rounded-[18px] border border-line bg-card px-1.5 pb-1.5 shadow-soft">
      <MonthHead month={month} />
      {weeksOf(monthGrid(month).cells).map((week, i) => (
        <div key={i} className="relative border-t border-line">
          <div className="grid grid-cols-7">
            {week.map((day, j) => (day ? <DayCell key={day} day={day} column={j} marks={marks} today={today} onPick={onPick} /> : <span key={j} />))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-px grid grid-cols-7 text-[10px] font-medium leading-[14px]" aria-hidden>
            {weekBars(week, marks).map((bar) => (
              <span
                key={bar.start} style={{ gridRow: 1, gridColumn: `${bar.start + 1} / span ${bar.span}` }}
                className={`h-3.5 overflow-hidden whitespace-nowrap rounded-full px-1.5 ${BAR_STYLE[bar.kind]}`}
              >
                {bar.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
