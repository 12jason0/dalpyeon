import { describe, expect, it } from "vitest";
import { barOn, calendarWindow, dayLabels, ovulationOn, weekBars, weeksOf } from "@/lib/calendar";
import { monthGrid } from "@/lib/dates";
import { nextLine } from "@/lib/moon";
import { calendarMarks, estimate, type CalendarMark } from "@/lib/prediction";

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

describe("막대", () => {
  it("이어진 날은 하나의 막대이고 글자는 시작 칸에만 쓴다", () => {
    expect(weekBars(week, marks("predicted_period", "2026-11-02", "2026-11-03", "2026-11-04"))).toEqual([
      { kind: "predicted", start: 1, span: 3, label: "생리 예상" },
    ]);
  });

  it("주가 바뀌면 끊어서 다시 그리고 다음 주 시작 칸에 글자를 다시 쓴다", () => {
    const span = marks("estimated_fertile_window", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09");
    const [first, second] = weeksOf(monthGrid("2026-11").cells);
    expect(weekBars(first, span)).toEqual([{ kind: "fertile", start: 5, span: 2, label: "가임기" }]);
    expect(weekBars(second, span)).toEqual([{ kind: "fertile", start: 0, span: 2, label: "가임기" }]);
  });

  it("생리 막대에는 글자가 없고, 진행 중 남은 날은 따로 그린다", () => {
    const all = [...marks("period", "2026-11-01", "2026-11-02"), ...marks("remaining_period", "2026-11-03", "2026-11-04")];
    expect(weekBars(week, all)).toEqual([
      { kind: "period", start: 0, span: 2, label: null },
      { kind: "remaining", start: 2, span: 2, label: null },
    ]);
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

describe("배란일 칩", () => {
  const fertile = marks("estimated_fertile_window", "2026-11-02", "2026-11-03", "2026-11-04");

  it("가임기 막대를 끊지 않고 위에 얹힌다", () => {
    const all = [...fertile, ...marks("estimated_ovulation", "2026-11-03")];
    expect(weekBars(week, all)).toEqual([{ kind: "fertile", start: 1, span: 3, label: "가임기" }]);
    expect(ovulationOn(all, "2026-11-03")).toBe(true);
    expect(dayLabels(all, "2026-11-03")).toEqual(["가임기", "배란일"]);
  });

  it("칩이 시작 칸을 차지하면 막대 글자를 뺀다", () => {
    expect(weekBars(week, [...fertile, ...marks("estimated_ovulation", "2026-11-02")])[0].label).toBeNull();
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
