import { dayLabels, ovulationOn, weekBars, weeksOf, type BarKind } from "@/lib/calendar";
import { monthDay, monthGrid, monthLabel, WEEKDAYS } from "@/lib/dates";
import type { CalendarMark } from "@/lib/prediction";

const BAR_STYLE: Record<BarKind, string> = {
  period: "bg-accent text-white",
  remaining: "border border-dashed border-period-dash text-period-ink",
  predicted: "bg-period text-period-ink",
  fertile: "bg-fertile-bar text-fertile-ink",
  tentative: "bg-fertile-bar/60 text-fertile-ink",
};

const SUNDAY = 0;
const SATURDAY = 6;
const WEEKEND = { [SUNDAY]: "text-period-dash", [SATURDAY]: "text-fertile-ink/60" } as Record<number, string>;

/** 달 카드의 테두리(1px)와 안쪽 여백. 요일 줄이 날짜 칸과 같은 자리에 오도록 제목 덩어리에도 같은 값을 쓴다. */
const CARD_INSET = "border-x border-transparent px-1";

/**
 * 달 제목과 요일 줄 한 덩어리. 스크롤해도 그 달 안에서는 상단 영역 바로 아래에 붙어 있다.
 * 화면 양 끝까지 바탕색으로 꽉 채우고 달력의 어떤 표시보다 위에 그려서, 아래로 지나가는 날짜·막대가 비치지 않는다.
 */
function MonthHead({ month }: { month: string }) {
  return (
    <div data-month-head className="sticky top-[var(--home-top,0px)] z-[6] -mx-6 bg-paper px-6 pt-2">
      <div className={CARD_INSET}>
        <h2 className="px-1 text-[17px] font-semibold tracking-tight">{monthLabel(month)}</h2>
        <div className="grid grid-cols-7 pb-1.5 pt-1 text-center text-[11px] text-muted" aria-hidden>
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
      </div>
    </div>
  );
}

function DayCell({ day, column, marks, today, onPick }: { day: string; column: number; marks: CalendarMark[]; today: string; onPick?: (day: string) => void }) {
  const label = [monthDay(day), ...dayLabels(marks, day), ...(day === today ? ["오늘"] : [])].join(", ");
  const ovulation = ovulationOn(marks, day);
  const look = day === today ? "bg-accent font-semibold text-white" : WEEKEND[column] ?? "";
  const number = (
    <>
      <span className={`pointer-events-none flex h-[26px] w-[26px] items-center justify-center rounded-full text-[15px] ${look} ${ovulation ? "border border-fertile-ink/40" : ""}`}>
        {Number(day.slice(8))}
      </span>
      {/* 막대 줄과 같은 높이에, 막대보다 위에 그려서 가임기 막대와 겹쳐도 읽힌다. */}
      {ovulation && (
        <span className="pointer-events-none absolute inset-x-0 bottom-1 z-[1] text-center text-[10.5px] font-semibold leading-[14px] text-[#5E5A8C]" aria-hidden>
          배란일
        </span>
      )}
    </>
  );
  // 줄 52px = 위 4 + 숫자 26 + 여유 4 + 막대 14 + 아래 4. 칸 전체(숫자와 막대 자리)가 버튼이고, 가로도 44px 이상이다.
  const cell = "relative flex h-[52px] min-w-11 w-full justify-center pt-1";
  if (!onPick) return <div data-day={day} className={cell} aria-label={label} role="img">{number}</div>;
  return (
    <button type="button" data-day={day} aria-label={label} className={`${cell} rounded-xl transition-colors duration-150 active:bg-ink/[0.06] active:duration-0`} onClick={() => onPick(day)}>
      {number}
    </button>
  );
}

/** 한 달 카드. 날짜 아래 막대는 주마다 끊어 그린다. onPick이 없으면 읽기 전용이고, 있으면 앞날까지 모든 날짜를 누를 수 있다. */
export function CalendarMonth({ month, marks, today, onPick }: { month: string; marks: CalendarMark[]; today: string; onPick?: (day: string) => void }) {
  return (
    <section data-month={month} aria-label={monthLabel(month)}>
      <MonthHead month={month} />
      <div className="rounded-[18px] border border-line bg-card px-1 pb-1 shadow-soft">
        {weeksOf(monthGrid(month).cells).map((week, i) => (
          <div key={i} className={`relative ${i ? "border-t border-line" : ""}`}>
            <div className="grid grid-cols-7">
              {week.map((day, j) => (day ? <DayCell key={day} day={day} column={j} marks={marks} today={today} onPick={onPick} /> : <span key={j} />))}
            </div>
            {/* 막대는 터치를 가로채지 않는다. 양 끝을 조금씩 들여서 이웃한 막대 사이에 틈이 보인다. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-1 grid grid-cols-7 text-[10px] font-medium leading-[14px]" aria-hidden>
              {weekBars(week, marks).map((bar) => {
                // 첫 칸에 배란일 글자가 있으면 막대 글자는 다음 칸부터 쓴다. 한 칸짜리면 생략한다.
                const first = week[bar.start];
                const clash = bar.label !== null && first !== null && ovulationOn(marks, first);
                return (
                  <span
                    key={bar.start}
                    style={{ gridRow: 1, gridColumn: `${bar.start + 1} / span ${bar.span}`, ...(clash ? { paddingLeft: `calc(100% / ${bar.span} + 0.25rem)` } : {}) }}
                    className={`mx-0.5 h-3.5 overflow-hidden whitespace-nowrap rounded-full px-1.5 ${BAR_STYLE[bar.kind]}`}
                  >
                    {clash && bar.span === 1 ? null : bar.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
