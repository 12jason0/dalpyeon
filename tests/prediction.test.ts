// 원본 Python 테스트(tests/test_prediction.py)를 그대로 옮긴 것 + 경계 케이스 몇 개
import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { calendarEvents, estimate, type PeriodInput } from "@/lib/prediction";

function periods(lengths: number[], first = "2026-01-01"): PeriodInput[] {
  const result: PeriodInput[] = [];
  for (let i = 0; i <= lengths.length; i++) {
    result.push({ id: String(i), startDate: first, endDate: addDays(first, 4) });
    if (i < lengths.length) first = addDays(first, lengths[i]);
  }
  return result;
}
const lastStart = (records: PeriodInput[]) => records[records.length - 1].startDate;

describe("주기 예측 v1", () => {
  it("개인별 중앙값과 관측 범위", () => {
    const records = periods([31, 33, 32, 31]);
    const last = lastStart(records);
    const result = estimate(records, [], last);
    expect(result.typicalCycleDays).toBe(32);
    expect(result.period?.earliestStart).toBe(addDays(last, 31));
    expect(result.period?.latestStart).toBe(addDays(last, 33));
    expect(result.sampleSize).toBe(4);
    expect(result.ovulation?.confirmed).toBe(false);
    expect(result.typicalPeriodDays).toBe(5);
    expect(result.period?.endDate).toBe(addDays(result.period!.startDate, 4));
  });

  it("기록 부족이면 예측 없음, 이상한 간격은 몰래 빼지 않고 보류", () => {
    expect(estimate(periods([28, 28]), [], "2026-03-01").period).toBeNull();
    const result = estimate(periods([28, 28, 120]), [], "2026-08-01");
    expect(result.status).toBe("needs_record_review");
    expect(result.intervals[result.intervals.length - 1].days).toBe(120);
  });

  it("제외한 기록은 양옆 간격을 합쳐 가짜 긴 주기를 만들지 않는다", () => {
    const records = periods([28, 28, 28, 28, 28]);
    records[2].excluded = true;
    const result = estimate(records, [], lastStart(records));
    expect(result.sampleSize).toBe(3);
    expect(result.excludedIntervals).toHaveLength(2);
    expect(result.intervals.every((x) => x.days === 28)).toBe(true);
  });

  it("들쭉날쭉하거나 예상일이 지나면 가임기를 숨긴다", () => {
    const records = periods([25, 40, 28]);
    const result = estimate(records, [], lastStart(records));
    expect(result.status).toBe("variable_cycles");
    expect(result.ovulation).toBeNull();
    const overdue = estimate(periods([28, 28, 28]), [], "2026-12-01");
    expect(overdue.status).toBe("awaiting_new_record");
    expect(overdue.fertileWindow).toBeNull();
  });

  it("주기 영향 요인이 진행 중이면 멈추고, 끝나면 그 뒤 기록만 모은다", () => {
    const records = periods([28, 28, 28, 28, 28]);
    expect(estimate(records, [{ startDate: "2026-02-01", endDate: null }], "2026-06-01").status).toBe("paused_for_cycle_factor");
    expect(estimate(records, [{ startDate: "2026-02-01", endDate: "2026-05-01" }], "2026-06-01").status).toBe("insufficient_data");
  });

  it("달력에서 실제 기록과 예상을 구분한다", () => {
    const records = periods([28, 28, 28]);
    const result = estimate(records, [], "2026-04-01");
    const events = calendarEvents(records, result, "2026-01-01", "2026-05-01");
    expect(events.some((e) => e.type === "period" && !e.estimated)).toBe(true);
    expect(events.some((e) => e.type === "predicted_period" && e.estimated)).toBe(true);
    expect(records).toHaveLength(4);
  });

  it("짝수 개 중앙값은 반올림, 배란은 예상일 14일 전, 가임기는 -5~+1일", () => {
    const records = periods([28, 29, 28, 29]); // 중앙값 28.5 → 29
    const result = estimate(records, [], lastStart(records));
    expect(result.typicalCycleDays).toBe(29);
    const expected = addDays(lastStart(records), 29);
    expect(result.period?.startDate).toBe(expected);
    expect(result.ovulation?.estimatedDate).toBe(addDays(expected, -14));
    expect(result.fertileWindow).toEqual({ startDate: addDays(expected, -19), endDate: addDays(expected, -13) });
  });

  it("종료일 기록이 없으면 지속일을 지어내지 않는다", () => {
    const records = periods([28, 28, 28]).map((p) => ({ ...p, endDate: null }));
    const result = estimate(records, [], lastStart(records));
    expect(result.typicalPeriodDays).toBeNull();
    expect(result.period?.endDate).toBeNull();
  });

  it("최근 6개 간격만 쓴다", () => {
    const records = periods([40, 40, 28, 28, 28, 28, 28, 28]);
    const result = estimate(records, [], lastStart(records));
    expect(result.sampleSize).toBe(6);
    expect(result.typicalCycleDays).toBe(28);
    expect(result.status).toBe("estimated");
  });
});
