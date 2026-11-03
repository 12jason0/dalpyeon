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
