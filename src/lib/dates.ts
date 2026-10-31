/** 날짜는 모두 'YYYY-MM-DD' 문자열로 다룬다. 시간대 계산은 UTC 자정 기준으로 해서 어긋나지 않게 한다. */

export function todaySeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 월은 'YYYY-MM' 문자열로 다룬다. */
export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && value >= "1900-01" && value <= "2999-12" && isDay(`${value}-01`);
}

export function addMonths(month: string, months: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 7);
}

/** 2026년 10월 */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}년 ${Number(m)}월`;
}

/** 일요일부터 시작하는 달력 칸. 앞뒤 빈칸은 null이고, 칸 수는 항상 7의 배수다. */
export function monthGrid(month: string): { first: string; last: string; cells: (string | null)[] } {
  const first = `${month}-01`;
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const days = Array.from({ length: diffDays(last, first) + 1 }, (_, i) => addDays(first, i));
  const leading = new Date(`${first}T00:00:00Z`).getUTCDay();
  const trailing = (7 - ((leading + days.length) % 7)) % 7;
  return { first, last, cells: [...Array<null>(leading).fill(null), ...days, ...Array<null>(trailing).fill(null)] };
}

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 10월 30일 (금) */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/** 10월 7일 */
export function monthDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 10월 7일 ~ 11일, 달이 바뀌면 10월 30일 ~ 11월 2일 */
export function dayRange(start: string, end: string): string {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${monthDay(start)} ~ ${sameMonth ? `${new Date(`${end}T00:00:00Z`).getUTCDate()}일` : monthDay(end)}`;
}

/** 방금 전 · 3분 전 · 2시간 전 · 5일 전, 그보다 오래되면 10월 7일 (서울 기준) */
export function timeAgo(at: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}일 전`;
  return monthDay(todaySeoul(at));
}

/** 10.30 */
export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}
