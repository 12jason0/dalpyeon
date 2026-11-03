/** 오늘이 주기의 어느 시기인지. 예측이 불확실하면 지어내지 않고 null을 돌려준다. */
import { diffDays } from "./dates";
import { currentPeriod, estimate, type PeriodInput } from "./prediction";

export type Phase = "menstrual" | "follicular" | "fertile" | "luteal";

export function phaseFrom(inPeriod: boolean, fertileWindow: { startDate: string; endDate: string; tentative: boolean } | null, today: string): Phase | null {
  if (inPeriod) return "menstrual";
  // 가임기가 없거나(예상일 지남) 추정뿐이면(기록 적음, 주기 들쭉날쭉) 난포기·황체기를 나눌 근거가 없다.
  if (!fertileWindow || fertileWindow.tentative) return null;
  if (today < fertileWindow.startDate) return "follicular";
  return today <= fertileWindow.endDate ? "fertile" : "luteal";
}

export function phaseOn(periods: (PeriodInput & { id: string; endDate: string | null })[], today: string): Phase | null {
  return phaseFrom(Boolean(currentPeriod(periods, today)), estimate(periods, [], today).fertileWindow, today);
}

const BEFORE_PERIOD_DAYS = 7;

/** 파트너 홈 상태 카드 아래의 이해 한 줄. 정해진 문장 중 하나를 고른다. */
export function understandingLine(
  current: { day: number } | null, nextStart: string | null,
  fertileWindow: { startDate: string; endDate: string; tentative: boolean } | null, today: string,
) {
  if (current) {
    if (current.day <= 2) return "몸이 제일 힘든 때예요";
    if (current.day <= 4) return "조금씩 나아지는 때예요";
    return "거의 끝나가요. 피로가 남아 있을 수 있어요";
  }
  const until = nextStart ? diffDays(nextStart, today) : null;
  if (until !== null && until >= 0 && until <= BEFORE_PERIOD_DAYS) return "예민해지기 쉬운 때예요";
  if (phaseFrom(false, fertileWindow, today) === "follicular") return "몸이 가벼워지는 때예요";
  return "평소처럼 편하게 지내는 때예요";
}
