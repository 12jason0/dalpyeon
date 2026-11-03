import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import SPLASH_SIZES from "@/lib/content/splash-sizes.json";
import { exampleHome, EXAMPLE_DAYS_UNTIL } from "@/lib/content/example";
import { PHASES, tipFor } from "@/lib/content/phases";
import { diffDays, monthGrid } from "@/lib/dates";
import { phaseOn, type Phase } from "@/lib/phase";
import { calendarMarks, estimate } from "@/lib/prediction";

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

  it("가임기가 추정뿐이면 시기를 나누지 않는다", () => {
    const few = [{ id: "1", startDate: "2026-10-01", endDate: "2026-10-05" }];
    expect(estimate(few, [], "2026-10-12").fertileWindow?.tentative).toBe(true);
    expect(phaseOn(few, "2026-10-12")).toBeNull();
  });

  it("예측이 없으면 생리 중일 때만 menstrual", () => {
    const few = [{ id: "1", startDate: "2026-10-01", endDate: "2026-10-05" }];
    expect(phaseOn(few, "2026-10-03")).toBe("menstrual");
    expect(phaseOn(few, "2026-10-10")).toBeNull();
    expect(phaseOn([], "2026-10-10")).toBeNull();
  });

  it("종료일 없는 기록은 끝날 때까지 생리 중으로 본다", () => {
    const open = [{ id: "1", startDate: "2026-10-01", endDate: null }];
    expect(phaseOn(open, "2026-10-11")).toBe("menstrual");
  });

  it("예상 범위가 지나거나 주기가 들쭉날쭉하면 시기를 단정하지 않는다", () => {
    expect(phaseOn(regular, "2026-10-31")).toBeNull(); // 범위는 10.26~10.30
    const uneven = ["2026-05-01", "2026-05-26", "2026-07-05", "2026-08-02"].map((startDate, i) => ({ id: String(i), startDate, endDate: startDate }));
    expect(phaseOn(uneven, "2026-08-20")).toBeNull();
  });
});

describe("랜딩 예시 기록", () => {
  it.each(["2026-10-31", "2026-12-30", "2027-01-01", "2028-02-29", "2026-03-01"])("%s 기준으로 항상 예정일 5일 전", (today) => {
    const { periods, care, month } = exampleHome(today);
    const prediction = estimate(periods, [], today);
    const { first, last } = monthGrid(month);
    expect(calendarMarks(periods, prediction, first, last, today).some((m) => m.type === "predicted_period")).toBe(true); // 월말에도 점선이 보인다
    expect(prediction.status).toBe("estimated");
    expect(diffDays(prediction.period!.startDate, today)).toBe(EXAMPLE_DAYS_UNTIL);
    expect(phaseOn(periods, today)).toBe("luteal");
    expect(periods.every((p) => p.endDate < today)).toBe(true);
    expect(care.day).toBe(today);
  });
});

describe("시기 문구", () => {
  it("모든 시기에 증상 3개·팁 3개가 있고 단정하지 않는다", () => {
    for (const { symptoms, tips } of Object.values(PHASES)) {
      expect(symptoms).toHaveLength(3);
      expect(tips).toHaveLength(3);
      for (const text of [...symptoms, ...tips.map((t) => t.text)]) expect(text).toContain("수 있어요");
    }
  });
});

describe("오늘 챙기면 좋은 것", () => {
  it("그 시기의 팁을 고르고, 날이 바뀌면 다음 팁으로 넘어간다", () => {
    const shown = ["2026-11-02", "2026-11-03", "2026-11-04"].map((day) => tipFor("menstrual", day)?.text);
    expect(new Set(shown)).toEqual(new Set(PHASES.menstrual.tips.map((t) => t.text)));
    expect(tipFor("menstrual", "2026-11-02")).toBe(tipFor("menstrual", "2026-11-02"));
  });

  it("시기를 모르면 없다", () => {
    expect(tipFor(null, "2026-11-02")).toBeNull();
  });
});

describe("시작 화면", () => {
  it("manifest 색이 바탕색과 같다", () => {
    expect(manifest()).toMatchObject({ background_color: "#FBF4F1", theme_color: "#FBF4F1" });
    expect(readFileSync("src/app/globals.css", "utf8")).toContain("--color-paper: #FBF4F1");
  });

  it("시작 화면 로고와 아이콘이 있고, 크기마다 시작 화면 PNG가 있다", () => {
    for (const f of ["public/brand/logo.png", "public/brand/logo-dd.png", "public/brand/icon-master.png", "public/icons/apple-icon-180.png", "public/icons/maskable-512.png"]) expect(existsSync(f)).toBe(true);
    for (const { width, height, ratio } of SPLASH_SIZES) expect(existsSync(`public/brand/splash/${width * ratio}x${height * ratio}.png`)).toBe(true);
  });
});
