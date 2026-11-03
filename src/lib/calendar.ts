/** 세로 달력과 이번 주 띠. 달 범위와 주 단위 막대를 계산한다. 화면과 서버가 함께 쓴다. */
import { addDays, addMonths, monthGrid } from "./dates";
import type { CalendarMark } from "./prediction";

export const MONTHS_AROUND = 6;
/** 스크롤해도 맨 위에 남는 영역. 달 제목이 이 높이만큼 아래에 붙는다. */
export const HOME_TOP_ID = "home-top";
export const HEADER_ID = "app-header";

export type BarKind = "period" | "remaining" | "predicted" | "fertile" | "tentative";
export type Bar = { kind: BarKind; start: number; span: number; label: string | null };

const BAR_LABELS: Partial<Record<BarKind, string>> = { predicted: "생리 예상", fertile: "가임기", tentative: "가임기" };
const DAY_LABELS: Record<BarKind, string> = { period: "생리", remaining: "생리 예상", predicted: "생리 예상", fertile: "가임기", tentative: "가임기 추정" };
const OVULATION_TENTATIVE = "배란 추정";

/** 이번 달을 가운데 두고 앞뒤 6개월. */
export function calendarWindow(today: string) {
  const month = today.slice(0, 7);
  const months = Array.from({ length: MONTHS_AROUND * 2 + 1 }, (_, i) => addMonths(month, i - MONTHS_AROUND));
  return { month, months, first: `${months[0]}-01`, last: monthGrid(months[months.length - 1]).last };
}

/** 하루에 막대는 하나다. 실제 기록 > 남은 예상 > 다음 생리 예상 > 가임기 순. */
export function barOn(marks: CalendarMark[], day: string): BarKind | null {
  const types = marks.filter((m) => m.date === day).map((m) => m.type);
  if (types.includes("period")) return "period";
  if (types.includes("remaining_period")) return "remaining";
  if (types.includes("predicted_period")) return "predicted";
  const fertile = marks.find((m) => m.date === day && m.type === "estimated_fertile_window");
  if (fertile) return fertile.tentative ? "tentative" : "fertile";
  return null;
}

/** 배란일 표시. 실제 기록이나 생리 예상이 있는 날에는 그리지 않는다. */
export function ovulationOn(marks: CalendarMark[], day: string) {
  const bar = barOn(marks, day);
  return (bar === null || bar === "fertile" || bar === "tentative") && marks.some((m) => m.date === day && m.type === "estimated_ovulation");
}

/** 이 날의 배란일이 추정 표시인지. */
export const ovulationTentative = (marks: CalendarMark[], day: string) =>
  marks.some((m) => m.date === day && m.type === "estimated_ovulation" && m.tentative);

export function dayLabels(marks: CalendarMark[], day: string) {
  const bar = barOn(marks, day);
  return [...(bar ? [DAY_LABELS[bar]] : []), ...(ovulationOn(marks, day) ? [ovulationTentative(marks, day) ? OVULATION_TENTATIVE : "배란일"] : [])];
}

/** 오늘이 든 주. 일요일부터 7일. */
export function weekOf(today: string) {
  const sunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export function weeksOf<T>(cells: T[]): T[][] {
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export type TodayDirection = "up" | "down";

/** 오늘 칸이 보이는 영역 밖이면 어느 쪽에 있는지. 보이면 null. */
export function todayDirection(cell: { top: number; bottom: number }, view: { top: number; bottom: number }): TodayDirection | null {
  if (cell.bottom <= view.top) return "up";
  return cell.top >= view.bottom ? "down" : null;
}

/** 한 주의 막대. 주가 바뀌면 끊어서 다시 그리고, 글자는 기간의 첫 칸에만 쓴다. */
export function weekBars(week: (string | null)[], marks: CalendarMark[]): Bar[] {
  const bars: Bar[] = [];
  week.forEach((day, i) => {
    const kind = day && barOn(marks, day);
    if (!kind) return;
    const last = bars[bars.length - 1];
    if (last?.kind === kind && last.start + last.span === i) last.span++;
    else bars.push({ kind, start: i, span: 1, label: day && barOn(marks, addDays(day, -1)) !== kind ? BAR_LABELS[kind] ?? null : null });
  });
  return bars;
}

/** 달력에서 누를 수 있는 날. 앞날은 아직 기록할 수 없다. */
export const pickable = (day: string, today: string) => day <= today;
