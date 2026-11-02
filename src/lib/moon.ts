/** 홈의 달. 주기 위치를 밝은 부분의 비율로 바꾼다. 시작일이 그믐, 예상 주기의 가운데가 보름이다. */
import { dayRange, diffDays } from "./dates";
import type { Prediction } from "./prediction";

export type MoonShape = { lit: number; waxing: boolean };

/** 예측이 없거나 볼 수 없을 때의 고정 초승달. */
export const CRESCENT: MoonShape = { lit: 0.12, waxing: true };
const THINNEST = 0.03; // 완전히 사라지면 달이 없는 것처럼 보인다

export function moonShape(prediction: Pick<Prediction, "period" | "typicalCycleDays">, today: string): MoonShape {
  const { period, typicalCycleDays: length } = prediction;
  if (!period || !length) return CRESCENT;
  // 예상일에서 주기 길이를 빼면 마지막 시작일이다. 예상일이 지나면 다음 기록까지 마지막 날 모양에 머문다.
  const day = Math.min(diffDays(today, period.startDate) + length + 1, length);
  const position = (Math.max(day, 1) - 1) / length;
  return { lit: Math.max(THINNEST, (1 - Math.cos(2 * Math.PI * position)) / 2), waxing: position < 0.5 };
}

export const MOON_WAITING = "기록이 쌓이면 달이 차올라요";

/** 달 아래 한 줄. 기록자·파트너 공용이라, 허락되지 않은 값은 null로 넘긴다. 말할 사실이 없으면 null. */
export function cycleLine(
  current: { day: number } | null,
  nextStart: string | null,
  fertile: { startDate: string; endDate: string } | null,
  today: string,
) {
  if (current) return `생리 ${current.day}일째`;
  const fertileNow = fertile && fertile.startDate <= today && today <= fertile.endDate;
  if (!nextStart) return fertileNow ? "가임기 예상" : null;
  const days = diffDays(nextStart, today);
  if (days < 0) return `예정일이 ${-days}일 지났어요`;
  const until = days ? `다음 생리까지 ${days}일` : "오늘이 생리 예정일이에요";
  return fertileNow ? `가임기 예상 · ${until}` : until;
}

/** 다음 생리 예상 범위. 생리 중이거나 범위가 지났으면 말하지 않는다. */
export function nextRange(current: unknown, next: { earliestStart: string; latestStart: string } | null, today: string) {
  return !current && next && today <= next.latestStart ? `${dayRange(next.earliestStart, next.latestStart)} 사이` : undefined;
}

/** 원의 왼쪽 위를 (0,0)으로 둔 밝은 부분. 바깥 반원 + 타원 호(명암 경계)로 그린다. */
export function moonPath({ lit, waxing }: MoonShape, r: number) {
  const edge = (r * Math.abs(1 - 2 * lit)).toFixed(2);
  return `M${r} 0A${r} ${r} 0 0 ${waxing ? 1 : 0} ${r} ${2 * r}A${edge} ${r} 0 0 ${lit > 0.5 === waxing ? 1 : 0} ${r} 0Z`;
}
