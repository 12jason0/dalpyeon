/** 홈의 달. 주기 위치를 밝은 부분의 비율로 바꾼다. 시작일이 그믐, 예상 주기의 가운데가 보름이다. */
import { diffDays } from "./dates";
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

/** 원의 왼쪽 위를 (0,0)으로 둔 밝은 부분. 바깥 반원 + 타원 호(명암 경계)로 그린다. */
export function moonPath({ lit, waxing }: MoonShape, r: number) {
  const edge = (r * Math.abs(1 - 2 * lit)).toFixed(2);
  return `M${r} 0A${r} ${r} 0 0 ${waxing ? 1 : 0} ${r} ${2 * r}A${edge} ${r} 0 0 ${lit > 0.5 === waxing ? 1 : 0} ${r} 0Z`;
}
