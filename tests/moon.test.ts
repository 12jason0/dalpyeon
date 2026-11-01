import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { CRESCENT, moonPath, moonShape } from "@/lib/moon";

const LENGTH = 28;
const start = "2026-10-01";
const prediction = { typicalCycleDays: LENGTH, period: { startDate: addDays(start, LENGTH), endDate: null, earliestStart: "", latestStart: "" } };
const onDay = (day: number) => moonShape(prediction, addDays(start, day - 1));

describe("달 모양", () => {
  it("1일째는 차오르기 시작하는 아주 가는 달", () => {
    expect(onDay(1)).toEqual({ lit: 0.03, waxing: true });
  });

  it("주기 중간은 보름달", () => {
    expect(onDay(LENGTH / 2 + 1).lit).toBe(1);
  });

  it("마지막 날은 다시 기운 가는 달", () => {
    expect(onDay(LENGTH)).toEqual({ lit: 0.03, waxing: false });
  });

  it("보름까지 커지고 그 뒤로 줄어든다", () => {
    const lit = Array.from({ length: LENGTH }, (_, i) => onDay(i + 1).lit);
    expect(lit.slice(0, 15)).toEqual([...lit.slice(0, 15)].sort((a, b) => a - b));
    expect(lit.slice(14)).toEqual([...lit.slice(14)].sort((a, b) => b - a));
    expect(onDay(24).waxing).toBe(false);
  });

  it("예상일이 지나도 다음 주기로 넘어가지 않고 마지막 날 모양에 머문다", () => {
    expect(onDay(LENGTH + 5)).toEqual(onDay(LENGTH));
  });

  it("예측이 없으면 날짜와 상관없이 초승달 고정", () => {
    expect(moonShape({ period: null }, start)).toEqual(CRESCENT);
    expect(moonShape({ period: null }, addDays(start, 15))).toEqual(CRESCENT);
  });

  it("차오를 때는 오른쪽, 기울 때는 왼쪽이 밝고, 반달을 넘으면 경계가 반대로 휜다", () => {
    expect(moonPath({ lit: 0.25, waxing: true }, 80)).toBe("M80 0A80 80 0 0 1 80 160A40.00 80 0 0 0 80 0Z");
    expect(moonPath({ lit: 0.75, waxing: true }, 80)).toBe("M80 0A80 80 0 0 1 80 160A40.00 80 0 0 1 80 0Z");
    expect(moonPath({ lit: 0.25, waxing: false }, 80)).toBe("M80 0A80 80 0 0 0 80 160A40.00 80 0 0 1 80 0Z");
    expect(moonPath({ lit: 0.75, waxing: false }, 80)).toBe("M80 0A80 80 0 0 0 80 160A40.00 80 0 0 0 80 0Z");
  });
});
