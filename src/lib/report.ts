/** 리포트 그래프에 쓰는 값. 단위는 일이고, 오래된 것부터 최근 것 순이다. */
import { diffDays } from "./dates";
import { painRank, PAINS, type DayLog } from "./daylog";

type PeriodRow = { startDate: string; endDate?: string | null; excluded?: boolean; autoEnded?: boolean };

export type Bar = { day: string; days: number };
export type PainPoint = { day: string; level: number; label: string };

const RECENT = 6;

const ordered = (periods: PeriodRow[]) => [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));

/** 시작일 사이의 간격. 예측에서 뺀 기록이 낀 간격은 그리지 않는다. */
export function cycleBars(periods: PeriodRow[]): Bar[] {
  const rows = ordered(periods);
  return rows.slice(1).flatMap((cur, i) => {
    const prev = rows[i];
    return prev.excluded || cur.excluded ? [] : [{ day: prev.startDate, days: diffDays(cur.startDate, prev.startDate) }];
  }).slice(-RECENT);
}

/** 생리 기간. 끝난 기록만 쓰고, 자동으로 끝낸 기록은 실제 길이를 몰라 뺀다. */
export function periodBars(periods: PeriodRow[]): Bar[] {
  return ordered(periods).flatMap((p) => (
    p.endDate && !p.excluded && !p.autoEnded ? [{ day: p.startDate, days: diffDays(p.endDate, p.startDate) + 1 }] : []
  )).slice(-RECENT);
}

/** 끝난 생리마다 가장 심했던 통증. 통증을 하나도 남기지 않은 생리는 뺀다. */
export function painTrend(periods: PeriodRow[], logs: DayLog[]): PainPoint[] {
  return ordered(periods).flatMap((p) => {
    const pains = logs.filter((l) => p.endDate && l.pain && l.day >= p.startDate && l.day <= p.endDate).map((l) => l.pain!);
    if (!pains.length) return [];
    const worst = pains.reduce((a, b) => (painRank(b) > painRank(a) ? b : a));
    return [{ day: p.startDate, level: painRank(worst), label: PAINS[worst] }];
  }).slice(-RECENT);
}
