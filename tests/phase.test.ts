import { describe, expect, it } from "vitest";
import { PHASES } from "@/lib/content/phases";
import { phaseOn, type Phase } from "@/lib/phase";

// 28일 간격 → 다음 예정 10.28, 가임기(추정) 10.09~10.15
const regular = ["2026-07-08", "2026-08-05", "2026-09-02", "2026-09-30"].map((startDate, i) => ({
  id: String(i), startDate, endDate: `${startDate.slice(0, 8)}${String(Number(startDate.slice(8)) + 4).padStart(2, "0")}`,
}));
regular[3].endDate = "2026-10-04";

describe("주기 시기", () => {
  it.each<[string, Phase]>([
    ["2026-10-02", "menstrual"],
    ["2026-10-04", "menstrual"],
    ["2026-10-05", "follicular"],
    ["2026-10-08", "follicular"],
    ["2026-10-09", "fertile"],
    ["2026-10-15", "fertile"],
    ["2026-10-16", "luteal"],
    ["2026-10-28", "luteal"],
  ])("%s → %s", (today, phase) => {
    expect(phaseOn(regular, today)).toBe(phase);
  });

  it("예측이 없으면 생리 중일 때만 menstrual", () => {
    const few = [{ id: "1", startDate: "2026-10-01", endDate: "2026-10-05" }];
    expect(phaseOn(few, "2026-10-03")).toBe("menstrual");
    expect(phaseOn(few, "2026-10-10")).toBeNull();
    expect(phaseOn([], "2026-10-10")).toBeNull();
  });

  it("종료일 없는 기록은 10일까지만 생리 중으로 본다", () => {
    const open = [{ id: "1", startDate: "2026-10-01", endDate: null }];
    expect(phaseOn(open, "2026-10-10")).toBe("menstrual");
    expect(phaseOn(open, "2026-10-11")).toBeNull();
  });

  it("예상 범위가 지나거나 주기가 들쭉날쭉하면 시기를 단정하지 않는다", () => {
    expect(phaseOn(regular, "2026-10-29")).toBeNull();
    const uneven = ["2026-05-01", "2026-05-26", "2026-07-05", "2026-08-02"].map((startDate, i) => ({ id: String(i), startDate, endDate: null }));
    expect(phaseOn(uneven, "2026-08-20")).toBeNull();
  });
});

describe("시기 문구", () => {
  it("모든 시기에 증상 3개·팁 3개가 있고 단정하지 않는다", () => {
    for (const { line, symptoms, tips } of Object.values(PHASES)) {
      expect(symptoms).toHaveLength(3);
      expect(tips).toHaveLength(3);
      for (const text of [line, ...tips.map((t) => t.text)]) expect(text).toContain("수 있어요");
    }
  });
});
