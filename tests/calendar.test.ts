import { describe, expect, it } from "vitest";
import { barOn, calendarWindow, dayLabels, ovulationOn, ovulationTentative, pickable, todayDirection, weekBars, weekOf, weeksOf } from "@/lib/calendar";
import { addDays, monthGrid } from "@/lib/dates";
import { nextLine } from "@/lib/moon";
import { bodyChips, type DayLog } from "@/lib/daylog";
import { navFor } from "@/lib/nav";
import { calendarMarks, estimate, type CalendarMark } from "@/lib/prediction";
import { averageCycle, barWidth, errorLabel, reportRows, signed } from "@/lib/report";

const marks = (type: CalendarMark["type"], ...dates: string[]) => dates.map((date) => ({ date, type }));
// 2026년 11월 1일이 일요일이라 첫째 주가 1~7일이다.
const week = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];

describe("달력 범위", () => {
  it("이번 달 앞뒤 6개월, 해가 바뀌어도 이어진다", () => {
    const { month, months, first, last } = calendarWindow("2026-11-02");
    expect(month).toBe("2026-11");
    expect(months).toHaveLength(13);
    expect(months[6]).toBe("2026-11");
    expect(first).toBe("2026-05-01");
    expect(last).toBe("2027-05-31");
  });

  it("달력은 일요일부터 7칸씩 끊긴다", () => {
    expect(weeksOf(monthGrid("2026-11").cells)[0]).toEqual(week);
    expect(weeksOf(monthGrid("2026-11").cells).every((w) => w.length === 7)).toBe(true);
  });
});

describe("이번 주 띠", () => {
  it("오늘이 든 주를 일요일부터 7일 돌려주고, 달이 바뀌어도 이어진다", () => {
    expect(weekOf("2026-11-03")).toEqual(week);
    expect(weekOf("2026-11-01")[0]).toBe("2026-11-01");
    expect(weekOf("2026-11-07")[6]).toBe("2026-11-07");
    expect(weekOf("2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
  });
});

describe("막대", () => {
  it("이어진 날은 하나의 막대이고 글자는 시작 칸에만 쓴다", () => {
    expect(weekBars(week, marks("predicted_period", "2026-11-02", "2026-11-03", "2026-11-04"))).toEqual([
      { kind: "predicted", start: 1, span: 3, label: "생리 예상" },
    ]);
  });

  it("주가 바뀌면 끊어서 다시 그리고 글자는 기간의 첫 칸에만 쓴다", () => {
    const span = marks("estimated_fertile_window", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09");
    const [first, second] = weeksOf(monthGrid("2026-11").cells);
    expect(weekBars(first, span)).toEqual([{ kind: "fertile", start: 5, span: 2, label: "가임기" }]);
    expect(weekBars(second, span)).toEqual([{ kind: "fertile", start: 0, span: 2, label: null }]);
  });

  it("생리 막대에는 글자가 없고, 진행 중 남은 날은 따로 그린다", () => {
    const all = [...marks("period", "2026-11-01", "2026-11-02"), ...marks("remaining_period", "2026-11-03", "2026-11-04")];
    expect(weekBars(week, all)).toEqual([
      { kind: "period", start: 0, span: 2, label: null },
      { kind: "remaining", start: 2, span: 2, label: null },
    ]);
  });

  it("전달에서 이어진 기간은 새 달 첫 칸에 글자를 쓴다. 생리 막대도 이때는 쓴다", () => {
    const [dec] = weeksOf(monthGrid("2026-12").cells);
    const cont = (type: CalendarMark["type"]) => marks(type, "2026-11-30", "2026-12-01", "2026-12-02");
    expect(weekBars(dec, cont("period"))).toEqual([{ kind: "period", start: 2, span: 2, label: "생리" }]);
    expect(weekBars(dec, cont("remaining_period"))[0].label).toBe("생리 예상");
    expect(weekBars(dec, cont("predicted_period"))[0].label).toBe("생리 예상");
    expect(weekBars(dec, cont("estimated_fertile_window"))[0].label).toBe("가임기");
  });

  it("빈칸에서 끊기고, 띄엄띄엄한 날은 다른 막대다", () => {
    const row = [null, "2026-11-02", null, "2026-11-04", null, null, null];
    expect(weekBars(row, marks("period", "2026-11-02", "2026-11-04")).map((b) => b.start)).toEqual([1, 3]);
  });

  it("겹치면 실제 기록 > 남은 예상 > 생리 예상 > 가임기 순이다", () => {
    const day = "2026-11-02";
    const all = [...marks("estimated_fertile_window", day), ...marks("predicted_period", day)];
    expect(barOn(all, day)).toBe("predicted");
    expect(barOn([...all, ...marks("remaining_period", day)], day)).toBe("remaining");
    expect(barOn([...all, ...marks("period", day)], day)).toBe("period");
    expect(barOn([], day)).toBeNull();
  });
});

describe("배란일 표시", () => {
  const fertile = marks("estimated_fertile_window", "2026-11-02", "2026-11-03", "2026-11-04");

  it("가임기 막대를 끊지 않는다", () => {
    const all = [...fertile, ...marks("estimated_ovulation", "2026-11-03")];
    expect(weekBars(week, all)).toEqual([{ kind: "fertile", start: 1, span: 3, label: "가임기" }]);
    expect(ovulationOn(all, "2026-11-03")).toBe(true);
    expect(dayLabels(all, "2026-11-03")).toEqual(["가임기", "배란일"]);
  });

  it("배란일이 시작 칸이어도 막대 글자는 남는다", () => {
    expect(weekBars(week, [...fertile, ...marks("estimated_ovulation", "2026-11-02")])[0].label).toBe("가임기");
  });

  it("추정이면 연한 막대이고 막대 글자에는 추정을 붙이지 않는다. 시트 글자에는 남는다", () => {
    const soft = ["2026-11-02", "2026-11-03"].map((date) => ({ date, type: "estimated_fertile_window" as const, tentative: true }));
    const all = [...soft, { date: "2026-11-03", type: "estimated_ovulation" as const, tentative: true }];
    expect(weekBars(week, soft)).toEqual([{ kind: "tentative", start: 1, span: 2, label: "가임기" }]);
    expect(ovulationOn(all, "2026-11-03")).toBe(true);
    expect(ovulationTentative(all, "2026-11-03")).toBe(true);
    expect(dayLabels(all, "2026-11-03")).toEqual(["가임기 추정", "배란 추정"]);
  });

  it("실제 생리나 생리 예상이 있는 날에는 그리지 않는다", () => {
    const day = "2026-11-02";
    expect(ovulationOn([...marks("estimated_ovulation", day), ...marks("period", day)], day)).toBe(false);
    expect(ovulationOn([...marks("estimated_ovulation", day), ...marks("predicted_period", day)], day)).toBe(false);
  });
});

describe("예측과 달력", () => {
  const periods = [
    { id: "1", startDate: "2026-08-08", endDate: "2026-08-12" }, { id: "2", startDate: "2026-09-05", endDate: "2026-09-09" },
    { id: "3", startDate: "2026-10-03", endDate: "2026-10-07" }, { id: "4", startDate: "2026-10-31", endDate: null },
  ];
  const today = "2026-11-02";

  it("진행 중인 생리의 남은 날은 다음 생리 예상과 구분되고, 다음 한 주기만 예측한다", () => {
    const { first, last } = calendarWindow(today);
    const all = calendarMarks(periods, estimate(periods, [], today), first, last, today);
    const dates = (type: CalendarMark["type"]) => all.filter((m) => m.type === type).map((m) => m.date);
    expect(dates("remaining_period")).toEqual(["2026-11-03", "2026-11-04"]);
    expect(dates("predicted_period")[0]).toBe("2026-11-28");
    expect(dates("predicted_period").every((d) => d < "2026-12-10")).toBe(true);
    expect(dates("estimated_ovulation")).toEqual(["2026-11-14"]);
  });

  it("맨 위의 다음 생리 줄: 생리 중에도 보이고, 예측이 없거나 지나면 생략한다", () => {
    const next = { earliestStart: "2026-11-25", latestStart: "2026-11-29" };
    expect(nextLine(next, today)).toBe("다음 생리 11월 25일 ~ 29일");
    expect(nextLine(next, "2026-11-30")).toBeUndefined();
    expect(nextLine(null, today)).toBeUndefined();
  });
});

describe("오늘 칩", () => {
  const view = { top: 200, bottom: 760 };

  it("오늘이 보이면 칩이 없다", () => {
    expect(todayDirection({ top: 300, bottom: 360 }, view)).toBeNull();
  });

  it("조금이라도 걸쳐 있으면 보이는 것으로 본다", () => {
    expect(todayDirection({ top: 170, bottom: 230 }, view)).toBeNull();
    expect(todayDirection({ top: 730, bottom: 790 }, view)).toBeNull();
  });

  it("아래로 스크롤해 오늘이 위로 사라지면 위쪽, 위로 스크롤해 아래로 사라지면 아래쪽이다", () => {
    expect(todayDirection({ top: 100, bottom: 160 }, view)).toBe("up");
    expect(todayDirection({ top: 140, bottom: 200 }, view)).toBe("up"); // 상단 고정 영역에 딱 가려진 경우
    expect(todayDirection({ top: 800, bottom: 860 }, view)).toBe("down");
    expect(todayDirection({ top: 760, bottom: 820 }, view)).toBe("down"); // 떠 있는 메뉴에 딱 가려진 경우
  });
});

describe("하단 메뉴", () => {
  it("연결은 메뉴에 없고 마이 안에 있다", () => {
    expect(navFor("recorder").map((n) => n.label)).toEqual(["홈", "리포트", "마이"]);
    expect(navFor("partner").map((n) => n.label)).toEqual(["홈", "남친톡", "상식", "마이"]);
  });

  it("남친톡의 주소는 그대로다", () => {
    expect(navFor("partner")[1].href).toBe("/community");
  });

  it("상식 탭은 파트너에게만 있고 글 목록으로 간다", () => {
    expect(navFor("partner")[2].href).toBe("/learn");
    expect(navFor("recorder").map((n) => n.key)).not.toContain("learn");
  });
});

describe("리포트 표", () => {
  const row = (id: string, startDate: string, days: number | null, extra = {}) => ({
    id, startDate, endDate: days ? addDays(startDate, days - 1) : null, excluded: false, autoEnded: false, ...extra,
  });
  const log = (day: string, pain: DayLog["pain"]): DayLog => ({ day, pain, moods: [] });
  const rows = [row("a", "2026-08-01", 5), row("b", "2026-08-29", 5), row("c", "2026-09-30", 4), row("d", "2026-10-28", null)];

  it("최근 기록부터 놓이고, 주기는 다음 기록까지이며 가장 최근 기록은 없다", () => {
    const result = reportRows(rows, [], 29);
    expect(result.map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
    expect(result.map((r) => r.cycle)).toEqual([null, 28, 32, 28]);
    expect(result.map((r) => r.diff)).toEqual([null, -1, 3, -1]);
  });

  it("기간은 시작일을 1일째로 세고, 진행 중이면 없다", () => {
    expect(reportRows(rows, [], 29).map((r) => r.days)).toEqual([null, 4, 5, 5]);
  });

  it("평균을 못 구하거나 예측에서 뺀 기록은 차이가 없다", () => {
    expect(reportRows(rows, [], null).every((r) => r.diff === null)).toBe(true);
    const excluded = reportRows([rows[0], { ...rows[1], excluded: true }, rows[2]], [], 29);
    expect(excluded.map((r) => r.diff)).toEqual([null, null, -1]);
    expect(excluded[1].cycle).toBe(32);
  });

  it("통증은 가장 심했던 단계만큼 점이고, 진행 중인 기록도 세며, 없으면 null", () => {
    const logs = [log("2026-08-01", "mild"), log("2026-08-02", "severe"), log("2026-08-29", "none"), log("2026-09-30", null), log("2026-10-29", "moderate")];
    const pain = Object.fromEntries(reportRows(rows, logs, 29).map((r) => [r.id, r.pain]));
    expect(pain).toEqual({
      a: { dots: 3, label: "심함" }, b: { dots: 0, label: "없음" }, c: null, d: { dots: 2, label: "보통" },
    });
  });

  it("막대는 1일 10px, 최대 70px", () => {
    expect([1, 5, 7, 12].map(barWidth)).toEqual([10, 50, 70, 70]);
  });

  it("예측 오차는 반올림하고 1일 미만이면 이내로 적는다", () => {
    expect([0, 0.8, 1, 1.2, 1.6].map(errorLabel)).toEqual(["±1일 이내", "±1일 이내", "±1일", "±1일", "±2일"]);
  });

  it("차이 글자와 평균 주기", () => {
    expect([0, -1, 3].map(signed)).toEqual(["+0", "−1", "+3"]);
    expect(averageCycle([{ days: 28 }, { days: 31 }])).toBe(30);
    expect(averageCycle([])).toBeNull();
  });
});

describe("오늘 칩", () => {
  it("남긴 것만 글자가 있다", () => {
    expect(bodyChips({ pain: "severe", moods: ["tired", "sensitive"] })).toEqual({ pain: "통증 심함", mood: "피곤, 예민" });
    expect(bodyChips({ pain: null, moods: [] })).toEqual({ pain: null, mood: null });
  });
});

describe("날짜 시트", () => {
  it("오늘과 지난 날만 열리고 앞날은 열리지 않는다", () => {
    expect(pickable("2026-11-01", "2026-11-02")).toBe(true);
    expect(pickable("2026-11-02", "2026-11-02")).toBe(true);
    expect(pickable("2026-11-03", "2026-11-02")).toBe(false);
  });
});
