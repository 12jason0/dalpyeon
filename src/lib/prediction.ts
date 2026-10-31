/**
 * 주기 예측 v1 — 기록 기반의 설명 가능한 참고용 추정. 검증된 의료 알고리즘이 아니다.
 * 규칙: 최근 최대 6개 간격의 중앙값, 최소 3개 간격 필요, 들쭉날쭉하면 가임기 숨김,
 * 비정상 간격은 숨기지 않고 "기록 확인 필요"로 보류, 제외한 기록은 양옆 간격을 같이 뺀다.
 */
import { addDays, diffDays } from "./dates";

export const DISCLAIMER = "월경 기록 기반의 참고용 추정이며, 실제 배란 확인·피임·진단에 사용할 수 없습니다.";

export type PeriodInput = { id?: string; startDate: string; endDate?: string | null; excluded?: boolean };
export type FactorInput = { startDate: string; endDate?: string | null };
export type Interval = { from: string; to: string; days: number };
export type PredictionStatus =
  | "insufficient_data" | "estimated" | "variable_cycles"
  | "needs_record_review" | "paused_for_cycle_factor" | "awaiting_new_record";

export type Prediction = {
  status: PredictionStatus;
  disclaimer: string;
  intervals: Interval[];
  excludedIntervals: Interval[];
  sampleSize: number;
  typicalCycleDays?: number;
  observedMinDays?: number;
  observedMaxDays?: number;
  typicalPeriodDays?: number | null;
  variabilityDays?: number;
  period: { startDate: string; endDate: string | null; earliestStart: string; latestStart: string } | null;
  ovulation: { estimatedDate: string; confirmed: false } | null;
  fertileWindow: { startDate: string; endDate: string } | null;
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const roundHalfUp = (x: number) => Math.floor(x + 0.5);

export function estimate(periods: PeriodInput[], factors: FactorInput[], asOf: string): Prediction {
  const result: Prediction = {
    status: "insufficient_data", disclaimer: DISCLAIMER, intervals: [], excludedIntervals: [],
    sampleSize: 0, period: null, ovulation: null, fertileWindow: null,
  };

  // 임신·수유·호르몬 피임처럼 주기에 영향을 주는 기간이 진행 중이면 예측을 멈춘다.
  if (factors.some((f) => f.startDate <= asOf && (!f.endDate || f.endDate >= asOf))) {
    result.status = "paused_for_cycle_factor";
    return result;
  }
  // 그런 기간이 끝났다면, 끝난 이후 기록만으로 다시 모은다.
  const cutoff = factors.reduce((max, f) => (f.endDate && f.endDate > max ? f.endDate : max), "1900-01-01");
  const ordered = periods
    .filter((p) => cutoff < p.startDate && p.startDate <= asOf)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  let intervals: Interval[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i];
    const pair = { from: prev.startDate, to: cur.startDate, days: diffDays(cur.startDate, prev.startDate) };
    if (prev.excluded || cur.excluded) result.excludedIntervals.push(pair);
    else intervals.push(pair);
  }
  intervals = intervals.slice(-6);
  result.intervals = intervals;
  result.sampleSize = intervals.length;

  if (!ordered.length || ordered[ordered.length - 1].excluded) return result;
  if (intervals.some((x) => x.days < 15 || x.days > 90)) {
    result.status = "needs_record_review";
    return result;
  }
  if (intervals.length < 3) return result;

  const lengths = intervals.map((x) => x.days);
  const cycleLength = roundHalfUp(median(lengths));
  const lastStart = ordered[ordered.length - 1].startDate;
  const expected = addDays(lastStart, cycleLength);

  // 종료일을 기록한 최근 월경의 지속일 중앙값. 종료일이 하나도 없으면 임의로 채우지 않는다.
  const durations = ordered.slice(-6)
    .filter((p) => p.endDate && !p.excluded)
    .map((p) => diffDays(p.endDate as string, p.startDate) + 1);
  const duration = durations.length ? roundHalfUp(median(durations)) : null;
  if (duration && duration > 31) {
    result.status = "needs_record_review";
    return result;
  }

  const minDays = Math.min(...lengths), maxDays = Math.max(...lengths);
  const variability = maxDays - minDays;
  Object.assign(result, {
    status: "estimated", typicalCycleDays: cycleLength, observedMinDays: minDays,
    observedMaxDays: maxDays, typicalPeriodDays: duration, variabilityDays: variability,
  });
  result.period = {
    startDate: expected,
    endDate: duration ? addDays(expected, duration - 1) : null,
    earliestStart: addDays(lastStart, minDays),
    latestStart: addDays(lastStart, maxDays),
  };

  if (variability > 10) {
    result.status = "variable_cycles";
  } else {
    const ovulation = addDays(expected, -14);
    result.ovulation = { estimatedDate: ovulation, confirmed: false };
    result.fertileWindow = { startDate: addDays(ovulation, -5), endDate: addDays(ovulation, 1) };
  }
  // 예상 범위가 지났는데 새 기록이 없으면 다음 주기로 넘기지 않고 기다린다.
  if (asOf > result.period.latestStart) {
    result.status = "awaiting_new_record";
    result.ovulation = null;
    result.fertileWindow = null;
  }
  return result;
}

export type CalendarEvent = {
  date: string;
  type: "period" | "predicted_period" | "estimated_fertile_window" | "estimated_ovulation";
  estimated: boolean;
  recordId: string | null;
};

export function calendarEvents(
  periods: PeriodInput[],
  prediction: Pick<Prediction, "period" | "fertileWindow" | "ovulation">,
  start: string,
  end: string,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const span = (first: string, last: string | null | undefined, type: CalendarEvent["type"], estimated: boolean, recordId: string | null = null) => {
    let cursor = first > start ? first : start;
    const lastDay = last || first;
    const stop = lastDay < end ? lastDay : end;
    while (cursor <= stop) {
      events.push({ date: cursor, type, estimated, recordId });
      cursor = addDays(cursor, 1);
    }
  };
  // 종료일이 없는 기록은 기록되지 않은 미래 날짜까지 월경이라고 주장하지 않는다.
  for (const p of periods) span(p.startDate, p.endDate, "period", false, p.id ?? null);
  if (prediction.period) span(prediction.period.startDate, prediction.period.endDate, "predicted_period", true);
  if (prediction.fertileWindow) span(prediction.fertileWindow.startDate, prediction.fertileWindow.endDate, "estimated_fertile_window", true);
  if (prediction.ovulation) span(prediction.ovulation.estimatedDate, prediction.ovulation.estimatedDate, "estimated_ovulation", true);
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}
