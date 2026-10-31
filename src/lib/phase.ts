/** 오늘이 주기의 어느 시기인지. 예측이 불확실하면 지어내지 않고 null을 돌려준다. */
import { estimate, type PeriodInput } from "./prediction";
import { currentPeriod } from "./services/periods";

export type Phase = "menstrual" | "follicular" | "fertile" | "luteal";

export function phaseOn(periods: (PeriodInput & { id: string; endDate: string | null })[], today: string): Phase | null {
  if (currentPeriod(periods, today)) return "menstrual";
  // 가임기를 숨긴 경우(주기 들쭉날쭉, 예상일 지남)에는 난포기·황체기도 나눌 근거가 없다.
  const { fertileWindow } = estimate(periods, [], today);
  if (!fertileWindow) return null;
  if (today < fertileWindow.startDate) return "follicular";
  return today <= fertileWindow.endDate ? "fertile" : "luteal";
}
