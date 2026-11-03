/** 리포트 표에 쓰는 값. 단위는 일이고, 최근 기록부터 놓인다. */
import { diffDays } from "./dates";
import { painRank, PAINS, type DayLog, type Pain } from "./daylog";

type PeriodRow = { id: string; startDate: string; endDate: string | null; excluded: boolean; autoEnded: boolean };

export type ReportRow = PeriodRow & {
  /** 진행 중이면 null. */
  days: number | null;
  /** 다음 기록 시작일까지. 가장 최근 기록은 null. */
  cycle: number | null;
  /** 평균 주기와의 차이. 평균이 없거나 예측에서 뺀 기록이면 null. */
  diff: number | null;
  /** 가장 심했던 통증. 없음 0부터 심함 3까지 점 개수다. 남기지 않았으면 null. */
  pain: { dots: number; label: string } | null;
};

export const PAIN_DOTS = 3;
const MAX_BAR_PX = 70;

/** 기간 막대 길이. 1일에 10px이고 70px에서 멈춘다. */
export const barWidth = (days: number) => Math.min(days * 10, MAX_BAR_PX);

/** 차이 글자. 0도 +0으로 적는다. */
export const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** 예측 오차 글자. 반올림하고, 1일 미만이면 "이내"로 적는다. */
export const errorLabel = (days: number) => (days < 1 ? "±1일 이내" : `±${Math.round(days)}일`);

/** 평균 주기. 예측이 쓰는 간격(최근 6번, 튀는 값 제외)의 평균이다. */
export function averageCycle(intervals: { days: number }[]) {
  return intervals.length ? Math.round(intervals.reduce((sum, i) => sum + i.days, 0) / intervals.length) : null;
}

function worstPain(period: PeriodRow, logs: DayLog[]) {
  const pains = logs.filter((l) => l.pain && l.day >= period.startDate && (!period.endDate || l.day <= period.endDate)).map((l) => l.pain as Pain);
  if (!pains.length) return null;
  const worst = pains.reduce((a, b) => (painRank(b) > painRank(a) ? b : a));
  return { dots: painRank(worst), label: PAINS[worst] };
}

export function reportRows(periods: PeriodRow[], logs: DayLog[], average: number | null): ReportRow[] {
  const rows = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return rows.map((p, i) => {
    const cycle = i > 0 ? diffDays(rows[i - 1].startDate, p.startDate) : null;
    return {
      ...p,
      days: p.endDate ? diffDays(p.endDate, p.startDate) + 1 : null,
      cycle,
      diff: cycle !== null && average !== null && !p.excluded ? cycle - average : null,
      pain: worstPain(p, logs),
    };
  });
}

// ── 주기 체크 ── 진단이 아니라 흔히 쓰는 범위와 견주어 보여주기만 한다.
export const CYCLE_RANGE = { min: 24, max: 38 };
export const MAX_PERIOD_DAYS = 8;
export const REGULAR_SPREAD_DAYS = 9;
const REGULARITY_MIN_CYCLES = 3;
const RECENT = 6;

/** ok: 보통 범위(연초록), out: 범위 밖(연주황), wait: 기록 부족(연회색) */
export type CheckTone = "ok" | "out" | "wait";
export type CheckLine = { label: string; value: string | null; chip: string; tone: CheckTone };
export type CycleCheck = { basis: number; lines: CheckLine[]; suggestVisit: boolean };

const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const more = (n: number) => `${n}번 더 기록하면 보여요`;

/**
 * 주기 체크. "예측에서 빼기" 기록은 계산에서 빼고, 주기는 둘 다 뺀 적 없는 이웃 기록 사이만 센다(최근 6개).
 * 기간은 끝난 날이 있는 기록만(자동으로 끝낸 기록은 실제 끝난 날이 아니라서 뺀다).
 * 범위 밖이 최근 2번 이어지면(주기 또는 기간) 진료 안내를 붙인다.
 */
export function cycleCheck(periods: PeriodRow[]): CycleCheck {
  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const kept = sorted.filter((p) => !p.excluded);
  const cycles = sorted.slice(1)
    .map((p, i) => (p.excluded || sorted[i].excluded ? null : diffDays(p.startDate, sorted[i].startDate)))
    .filter((d): d is number => d !== null).slice(-RECENT);
  const lengths = kept.filter((p) => p.endDate && !p.autoEnded).map((p) => diffDays(p.endDate!, p.startDate) + 1).slice(-RECENT);

  const cycleOut = (d: number) => d < CYCLE_RANGE.min || d > CYCLE_RANGE.max;
  const lengthOut = (d: number) => d > MAX_PERIOD_DAYS;
  const lines: CheckLine[] = [];

  if (cycles.length) {
    const avg = mean(cycles);
    const chip = avg > CYCLE_RANGE.max ? "보통보다 길어요" : avg < CYCLE_RANGE.min ? "보통보다 짧아요" : "보통 범위";
    lines.push({ label: "주기 길이", value: `평균 ${avg}일`, chip, tone: cycleOut(avg) ? "out" : "ok" });
  } else lines.push({ label: "주기 길이", value: null, chip: more(Math.max(1, 2 - kept.length)), tone: "wait" });

  if (lengths.length) {
    const avg = mean(lengths);
    lines.push({ label: "생리 기간", value: `평균 ${avg}일`, chip: lengthOut(avg) ? "보통보다 길어요" : "보통 범위", tone: lengthOut(avg) ? "out" : "ok" });
  } else lines.push({ label: "생리 기간", value: null, chip: more(1), tone: "wait" });

  if (cycles.length >= REGULARITY_MIN_CYCLES) {
    const spread = Math.max(...cycles) - Math.min(...cycles);
    const regular = spread <= REGULAR_SPREAD_DAYS;
    lines.push({ label: "주기 규칙성", value: `차이 ${spread}일`, chip: regular ? "규칙적이에요" : "주기 차이가 커요", tone: regular ? "ok" : "out" });
  } else lines.push({ label: "주기 규칙성", value: null, chip: more(REGULARITY_MIN_CYCLES - cycles.length), tone: "wait" });

  const lastTwo = (xs: number[], out: (d: number) => boolean) => xs.length >= 2 && xs.slice(-2).every(out);
  return { basis: kept.length, lines, suggestVisit: lastTwo(cycles, cycleOut) || lastTwo(lengths, lengthOut) };
}
