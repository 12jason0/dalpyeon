/**
 * 주기 예측 v1 — 기록 기반의 설명 가능한 참고용 추정. 검증된 의료 알고리즘이 아니다.
 * 규칙: 최근 최대 6개 간격의 가중 평균(최근일수록 크게). 튀는 간격은 빼고 화면에 알린다.
 * 간격 0개는 평소 주기나 28일, 1~2개는 평소 주기와 섞고, 3개부터 실제 간격만 쓴다.
 * 가임기·배란은 간격 3개부터 계산한다. 들쭉날쭉하면 가임기 숨김, 제외한 기록은 양옆 간격을 같이 뺀다.
 */
import { addDays, diffDays, todaySeoul } from "./dates";

export const DISCLAIMER = "월경 기록 기반의 참고용 추정이며, 실제 배란 확인·피임·진단에 사용할 수 없습니다.";
/** 가임기·배란일을 보여주는 곳마다 함께 쓴다. */
export const ESTIMATE_NOTE = "추정이에요. 피임 목적으로 쓰지 마세요";

/** 간격 기록이 없을 때 가정하는 주기, 종료일 기록이 없을 때 가정하는 생리 기간. */
const DEFAULT_CYCLE_DAYS = 28;
const DEFAULT_PERIOD_DAYS = 5;
/** 이 범위를 벗어나거나 중앙값과 이만큼 넘게 다르면 계산에서 뺀다. */
const MIN_CYCLE_DAYS = 18;
const MAX_CYCLE_DAYS = 50;
const MAX_FROM_MEDIAN = 10;
const MIN_MARGIN_DAYS = 2;
/** 시작 후 이만큼 지나도 종료일이 없으면 자동으로 끝낸다. */
const AUTO_END_AFTER_DAYS = 10;

export type PeriodInput = {
  id?: string; startDate: string; endDate?: string | null; excluded?: boolean; autoEnded?: boolean; askEndAgainOn?: string | null;
};
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
  /** 튀어서 계산에서 뺀 간격. */
  outlierIntervals: Interval[];
  sampleSize: number;
  typicalCycleDays?: number;
  observedMinDays?: number;
  observedMaxDays?: number;
  typicalPeriodDays?: number | null;
  variabilityDays?: number;
  period: { startDate: string; endDate: string | null; earliestStart: string; latestStart: string } | null;
  /** 진행 중인 생리의 남은 예상 기간(내일~예상 종료일). 예상 종료일이 지났으면 null. */
  ongoing: { startDate: string; endDate: string } | null;
  ovulation: { estimatedDate: string; confirmed: false } | null;
  fertileWindow: { startDate: string; endDate: string } | null;
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const roundHalfUp = (x: number) => Math.floor(x + 0.5);

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** 오래된 것부터 받아, 가장 최근 값에 6, 그 앞에 5 … 의 가중치를 준다. */
function weightedMean(values: number[]) {
  const weights = values.map((_, i) => 6 - (values.length - 1 - i));
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
}

const isCycle = (days: number) => days >= MIN_CYCLE_DAYS && days <= MAX_CYCLE_DAYS;

function withoutOutliers(recent: Interval[]) {
  const plausible = recent.filter((x) => isCycle(x.days));
  const mid = plausible.length ? median(plausible.map((x) => x.days)) : 0;
  const used = plausible.filter((x) => Math.abs(x.days - mid) <= MAX_FROM_MEDIAN);
  return { used, outliers: recent.filter((x) => !used.includes(x)) };
}

/** 간격이 쌓일수록 실제 쪽 비중이 커진다: 1개 1/2, 2개 2/3, 3개부터 실제 간격만. 평소 주기를 안 적었으면 실제 간격만 쓴다. */
function cycleDays(lengths: number[], usual: number | null) {
  if (!lengths.length) return usual ?? DEFAULT_CYCLE_DAYS;
  const actual = weightedMean(lengths), n = lengths.length;
  return roundHalfUp(usual && n < 3 ? (usual + actual * n) / (n + 1) : actual);
}

/** 간격들의 표준편차를 올림한 예상 범위(±일). 최소 ±2일. */
function marginDays(lengths: number[]) {
  if (!lengths.length) return MIN_MARGIN_DAYS;
  const m = mean(lengths);
  return Math.max(MIN_MARGIN_DAYS, Math.ceil(Math.sqrt(mean(lengths.map((x) => (x - m) ** 2)))));
}

/** 최근 기록 6개 중 사람이 끝낸 기록의 평균 기간. 자동 종료는 앱이 정한 날짜라 뺀다. */
function averagePeriodDays(periods: PeriodInput[]) {
  const durations = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(-6)
    .filter((p) => p.endDate && !p.excluded && !p.autoEnded)
    .map((p) => diffDays(p.endDate as string, p.startDate) + 1);
  return durations.length ? roundHalfUp(mean(durations)) : null;
}

const expectedPeriodDays = (periods: PeriodInput[]) => averagePeriodDays(periods) ?? DEFAULT_PERIOD_DAYS;

/** 종료일 없이 시작 후 10일이 지난 기록인지. */
export const isOverdue = (p: Pick<PeriodInput, "startDate" | "endDate">, today: string) =>
  !p.endDate && diffDays(today, p.startDate) >= AUTO_END_AFTER_DAYS;

/** 자동 종료일: 시작일 + 평균 기간 - 1. 오늘이나 다음 기록을 넘지 않는다. */
export function autoEndDate(periods: PeriodInput[], startDate: string, today: string) {
  const next = periods.map((p) => p.startDate).filter((d) => d > startDate).sort()[0];
  return [addDays(startDate, expectedPeriodDays(periods) - 1), today, ...(next ? [addDays(next, -1)] : [])].sort()[0];
}

/**
 * 끝났는지 물어볼 때 돌려주는 값. 진행 중인 기록의 예상 종료일 다음 날부터 묻는다.
 * "아직 하고 있어요" 뒤로는 이미 지난 날을 다시 묻지 않고 다시 묻는 날의 전날을 묻는다.
 */
export function endQuestion<T extends PeriodInput>(periods: T[], today: string) {
  const current = currentPeriod(periods, today);
  if (!current?.open) return null;
  const again = periods.find((p) => p.startDate === current.startDate)?.askEndAgainOn;
  const expected = addDays(current.startDate, expectedPeriodDays(periods) - 1);
  if (today <= expected || (again && today < again)) return null;
  const date = again && addDays(again, -1) > expected ? addDays(again, -1) : expected;
  return { id: current.id, startDate: current.startDate, date, day: diffDays(date, current.startDate) + 1 };
}

/** 오늘 생리 중이면 며칠째인지. */
export function currentPeriod<T extends PeriodInput>(list: T[], today = todaySeoul()) {
  const last = [...list].filter((p) => p.startDate <= today).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!last) return null;
  if (last.endDate && last.endDate < today) return null;
  return { id: last.id as T["id"], startDate: last.startDate, day: diffDays(today, last.startDate) + 1, open: !last.endDate };
}

export function estimate(periods: PeriodInput[], factors: FactorInput[], asOf: string, usualCycle: number | null = null): Prediction {
  const result: Prediction = {
    status: "insufficient_data", disclaimer: DISCLAIMER, intervals: [], excludedIntervals: [], outlierIntervals: [],
    sampleSize: 0, period: null, ongoing: null, ovulation: null, fertileWindow: null,
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

  // 없으면 실제 기록인 척하지 않고 null로 두고, 날짜 계산에만 5일을 쓴다.
  const duration = averagePeriodDays(ordered);
  const periodDays = duration ?? DEFAULT_PERIOD_DAYS;

  const current = currentPeriod(ordered, asOf);
  if (current?.open) {
    const end = addDays(current.startDate, periodDays - 1);
    if (end > asOf) result.ongoing = { startDate: addDays(asOf, 1), endDate: end };
  }

  let intervals: Interval[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i];
    const pair = { from: prev.startDate, to: cur.startDate, days: diffDays(cur.startDate, prev.startDate) };
    if (prev.excluded || cur.excluded) result.excludedIntervals.push(pair);
    else intervals.push(pair);
  }
  const { used, outliers } = withoutOutliers(intervals.slice(-6));
  intervals = used;
  result.intervals = used;
  result.outlierIntervals = outliers;
  result.sampleSize = used.length;

  if (!ordered.length || ordered[ordered.length - 1].excluded) return result;
  const lastStart = ordered[ordered.length - 1].startDate;
  const lengths = intervals.map((x) => x.days);
  const cycleLength = cycleDays(lengths, usualCycle);
  const expected = addDays(lastStart, cycleLength);
  const margin = marginDays(lengths);
  // 가정한 주기만으로 "예정일이 며칠 지났어요"라고 말하지 않는다. 오래된 기록 하나만 넣은 경우다.
  if (!lengths.length && asOf > addDays(expected, margin)) return result;
  if (duration && duration > 31) {
    result.status = "needs_record_review";
    return result;
  }

  const minDays = lengths.length ? Math.min(...lengths) : cycleLength;
  const maxDays = lengths.length ? Math.max(...lengths) : cycleLength;
  const variability = maxDays - minDays;
  Object.assign(result, {
    typicalCycleDays: cycleLength, observedMinDays: minDays,
    observedMaxDays: maxDays, typicalPeriodDays: duration, variabilityDays: variability,
  });
  result.period = {
    startDate: expected,
    endDate: addDays(expected, periodDays - 1),
    earliestStart: addDays(expected, -margin),
    latestStart: addDays(expected, margin),
  };
  // 간격이 3개 되기 전엔 다음 생리 날짜만 알려 준다. 가임기·배란은 지어내지 않는다.
  if (intervals.length < 3) return result;
  result.status = "estimated";

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

/**
 * 예측 정확도. 지난 기록마다 그 전 기록만으로 예측했다면 며칠 틀렸을지 계산해 최근 6번을 평균한다. 저장하지 않는다.
 * 제외한 기록과 주기로 볼 수 없는 간격(기록을 빠뜨린 달 등)은 뺀다.
 */
export function predictionError(periods: PeriodInput[], usualCycle: number | null = null) {
  const ordered = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const errors: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const cur = ordered[i], prev = ordered[i - 1];
    if (cur.excluded || prev.excluded || !isCycle(diffDays(cur.startDate, prev.startDate))) continue;
    const guess = estimate(ordered.slice(0, i), [], addDays(cur.startDate, -1), usualCycle).period?.startDate;
    if (guess) errors.push(Math.abs(diffDays(cur.startDate, guess)));
  }
  const recent = errors.slice(-6);
  return recent.length ? { days: Math.round(mean(recent) * 10) / 10, samples: recent.length } : null;
}

export type CalendarEvent = {
  date: string;
  type: "period" | "remaining_period" | "predicted_period" | "estimated_fertile_window" | "estimated_ovulation";
  estimated: boolean;
  recordId: string | null;
};

type CalendarPrediction = Pick<Prediction, "period" | "fertileWindow" | "ovulation"> & Partial<Pick<Prediction, "ongoing">>;

export function calendarEvents(
  periods: PeriodInput[],
  prediction: CalendarPrediction,
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
  for (const p of periods) span(p.startDate, p.endDate, "period", false, p.id ?? null);
  if (prediction.ongoing) span(prediction.ongoing.startDate, prediction.ongoing.endDate, "remaining_period", true);
  if (prediction.period) span(prediction.period.startDate, prediction.period.endDate, "predicted_period", true);
  if (prediction.fertileWindow) span(prediction.fertileWindow.startDate, prediction.fertileWindow.endDate, "estimated_fertile_window", true);
  if (prediction.ovulation) span(prediction.ovulation.estimatedDate, prediction.ovulation.estimatedDate, "estimated_ovulation", true);
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

export type CalendarMark = Pick<CalendarEvent, "date" | "type">;

/**
 * 달력에 그릴 표시. 지나간 예측은 빼고, 날짜와 종류만 남긴다.
 * 진행 중인 기록은 오늘까지 실제 생리로 칠한다. 내일부터는 prediction.ongoing이 예상으로 그린다.
 */
export function calendarMarks(
  periods: PeriodInput[],
  prediction: CalendarPrediction,
  start: string,
  end: string,
  today: string,
): CalendarMark[] {
  const open = currentPeriod(periods, today);
  const filled = open?.open ? periods.map((p) => (p.startDate === open.startDate ? { ...p, endDate: today } : p)) : periods;
  return calendarEvents(filled, prediction, start, end)
    .filter((e) => !e.estimated || e.date >= today)
    .map(({ date, type }) => ({ date, type }));
}
