/** 오늘이 주기의 어느 시기인지. 예측이 불확실하면 지어내지 않고 null을 돌려준다. */
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
