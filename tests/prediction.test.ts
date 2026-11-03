// 원본 Python 테스트(tests/test_prediction.py)를 그대로 옮긴 것 + 경계 케이스 몇 개
import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayRange, isMonth, monthGrid, monthLabel } from "@/lib/dates";
import { autoEndDate, calendarEvents, calendarMarks, endQuestion, estimate, isOverdue, predictionError, type PeriodInput } from "@/lib/prediction";

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
  it("최근일수록 크게 반영한 평균과 ±범위", () => {
    const records = periods([31, 33, 32, 31]);
    const last = lastStart(records);
    const result = estimate(records, [], last);
    expect(result.typicalCycleDays).toBe(32);
    expect(result.period?.earliestStart).toBe(addDays(last, 30)); // 흩어짐이 작아 최소 ±2일
    expect(result.period?.latestStart).toBe(addDays(last, 34));
    expect(result.observedMinDays).toBe(31);
    expect(result.sampleSize).toBe(4);
    expect(result.ovulation?.confirmed).toBe(false);
    expect(result.typicalPeriodDays).toBe(5);
    expect(result.period?.endDate).toBe(addDays(result.period!.startDate, 4));
  });

  it("간격이 3개 되기 전에도 다음 예상일로 가임기·배란일을 계산하고 추정으로 표시한다", () => {
    const records = periods([30, 32]); // 1.1, 1.31, 3.4 (기간 5일)
    const result = estimate(records, [], "2026-03-10");
    expect(result.status).toBe("insufficient_data");
    expect(result.typicalCycleDays).toBe(31);
    expect(result.period).toMatchObject({ startDate: "2026-04-04", endDate: "2026-04-08" });
    expect(result.ovulation?.estimatedDate).toBe("2026-03-21"); // 4.4 - 14
    expect(result.fertileWindow).toEqual({ startDate: "2026-03-16", endDate: "2026-03-22", tentative: true });
  });

  it("기록 1번이면 28일 주기로 가정하고, 그 예정일도 지난 옛 기록이면 말을 아낀다", () => {
    const one = [{ id: "1", startDate: "2026-10-31", endDate: null }];
    expect(estimate(one, [], "2026-11-02").period).toMatchObject({ startDate: "2026-11-28", endDate: "2026-12-02" });
    expect(estimate(one, [], "2026-11-02").sampleSize).toBe(0);
    expect(estimate(one, [], "2026-11-30").period?.startDate).toBe("2026-11-28"); // 범위 끝까지는 기다린다
    expect(estimate(one, [], "2026-12-01").period).toBeNull();
    expect(estimate(one, [], "2026-12-01").ovulation).toBeNull();
    expect(estimate(one, [], "2026-11-02").ovulation?.estimatedDate).toBe("2026-11-14");
  });

  it("간격이 3개 미만이어도 예상 범위가 지나면 가임기를 숨긴다", () => {
    const records = periods([30]); // 1.1, 1.31 → 3.2 ±2
    expect(estimate(records, [], "2026-03-04").fertileWindow).not.toBeNull();
    expect(estimate(records, [], "2026-03-05").period).not.toBeNull();
    expect(estimate(records, [], "2026-03-05").fertileWindow).toBeNull();
    expect(estimate(records, [], "2026-03-05").ovulation).toBeNull();
  });

  it("기간이 너무 긴 기록은 예측을 보류한다", () => {
    const records = periods([28, 28, 28]);
    for (const r of records) r.endDate = addDays(r.startDate, 40); // 기간 평균 41일
    expect(estimate(records, [], "2026-03-30").status).toBe("needs_record_review");
  });

  it("튀는 간격은 계산에서 빼고 알려 준다", () => {
    const records = periods([28, 28, 120, 28, 17, 28, 28]);
    const result = estimate(records, [], lastStart(records));
    expect(result.outlierIntervals.map((x) => x.days)).toEqual([120, 17]); // 50일 초과, 18일 미만
    expect(result.intervals.map((x) => x.days)).toEqual([28, 28, 28, 28]);
    expect(result.typicalCycleDays).toBe(28);
    expect(result.status).toBe("estimated");

    const far = estimate(periods([28, 28, 39, 28]), [], "2026-05-01"); // 범위 안이지만 중앙값과 11일 차이
    expect(far.outlierIntervals.map((x) => x.days)).toEqual([39]);
    const near = estimate(periods([28, 28, 38, 28]), [], "2026-05-01"); // 10일 차이까지는 쓴다
    expect(near.outlierIntervals).toEqual([]);
  });

  it("제외한 기록은 양옆 간격을 합쳐 가짜 긴 주기를 만들지 않는다", () => {
    const records = periods([28, 28, 28, 28, 28]);
    records[2].excluded = true;
    const result = estimate(records, [], lastStart(records));
    expect(result.sampleSize).toBe(3);
    expect(result.excludedIntervals).toHaveLength(2);
    expect(result.intervals.every((x) => x.days === 28)).toBe(true);
  });

  it("들쭉날쭉하면 추정으로 표시하고, 예상일이 지나면 숨긴다", () => {
    const records = periods([22, 30, 34, 26]);
    const result = estimate(records, [], lastStart(records));
    expect(result.status).toBe("variable_cycles");
    expect(result.ovulation).not.toBeNull();
    expect(result.fertileWindow?.tentative).toBe(true);
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

  it("평균은 반올림, 배란은 예상일 14일 전, 가임기는 -5~+1일", () => {
    const records = periods([28, 29, 28, 29]); // 가중 평균 28.56 → 29
    const result = estimate(records, [], lastStart(records));
    expect(result.typicalCycleDays).toBe(29);
    const expected = addDays(lastStart(records), 29);
    expect(result.period?.startDate).toBe(expected);
    expect(result.ovulation?.estimatedDate).toBe(addDays(expected, -14));
    expect(result.fertileWindow).toEqual({ startDate: addDays(expected, -19), endDate: addDays(expected, -13), tentative: false });
  });

  it("종료일 기록이 없으면 보통 기간은 비워 두고, 달력용 예상 종료는 5일로 잡는다", () => {
    const records = periods([28, 28, 28]).map((p) => ({ ...p, endDate: null }));
    const result = estimate(records, [], lastStart(records));
    expect(result.typicalPeriodDays).toBeNull();
    expect(result.period?.endDate).toBe(addDays(result.period!.startDate, 4));
  });

  it("최근 6개 간격만 쓴다", () => {
    const records = periods([40, 40, 28, 28, 28, 28, 28, 28]);
    const result = estimate(records, [], lastStart(records));
    expect(result.sampleSize).toBe(6);
    expect(result.typicalCycleDays).toBe(28);
    expect(result.status).toBe("estimated");
  });

  it("달력 표시: 지나간 예측은 빼고 실제 기록은 남긴다", () => {
    const records = periods([28, 28, 28]);
    const last = lastStart(records);
    const result = estimate(records, [], last);
    const predicted = result.period!.startDate;
    const start = addDays(last, -40), end = addDays(predicted, 10);
    const beforeExpected = calendarMarks(records, result, start, end, addDays(predicted, 2));
    expect(beforeExpected.some((m) => m.type === "predicted_period" && m.date < addDays(predicted, 2))).toBe(false);
    expect(beforeExpected.some((m) => m.type === "predicted_period" && m.date === addDays(predicted, 2))).toBe(true); // 오늘은 남긴다
    expect(beforeExpected.some((m) => m.type === "estimated_fertile_window")).toBe(false);
    expect(beforeExpected.some((m) => m.type === "period" && m.date === last)).toBe(true);
    expect(beforeExpected[0]).toEqual({ date: expect.any(String), type: expect.any(String) }); // 기록 id는 내보내지 않는다
  });
});

describe("기록 수별 예측", () => {
  const counted = (n: number) => periods(Array(n - 1).fill(30));
  const at = (records: PeriodInput[]) => addDays(lastStart(records), 1);

  it("기록 1번: 평소 주기, 없으면 28일", () => {
    const records = counted(1);
    expect(estimate(records, [], at(records)).typicalCycleDays).toBe(28);
    expect(estimate(records, [], at(records), 35).typicalCycleDays).toBe(35);
    expect(estimate(records, [], at(records), 35).fertileWindow?.tentative).toBe(true);
  });

  it("기록 2번: 평소 주기와 반반, 없으면 실제 간격", () => {
    const records = counted(2);
    expect(estimate(records, [], at(records)).typicalCycleDays).toBe(30);
    expect(estimate(records, [], at(records), 40).typicalCycleDays).toBe(35);
    expect(estimate(records, [], at(records), 40).fertileWindow?.tentative).toBe(true);
  });

  it("기록 3번: 실제 간격 비중이 2/3로 커진다", () => {
    const records = counted(3);
    expect(estimate(records, [], at(records), 39).typicalCycleDays).toBe(33);
    expect(estimate(records, [], at(records), 39).fertileWindow?.tentative).toBe(true);
  });

  it("기록 4번: 평소 주기를 적어도 실제 간격만 쓰고 가임기가 추정 없이 나온다", () => {
    const records = counted(4);
    const result = estimate(records, [], at(records), 40);
    expect(result.typicalCycleDays).toBe(30);
    expect(result.status).toBe("estimated");
    expect(result.fertileWindow?.tentative).toBe(false);
  });

  it("기록 8번: 최근 6개에 6~1 가중치", () => {
    const records = periods([40, 40, 26, 26, 26, 30, 30, 30]);
    const result = estimate(records, [], at(records));
    expect(result.sampleSize).toBe(6);
    expect(result.intervals[0].days).toBe(26);
    expect(result.typicalCycleDays).toBe(29); // (26×(1+2+3) + 30×(4+5+6)) / 21 = 28.86
    expect(result.period?.startDate).toBe(addDays(lastStart(records), 29));
  });

  it("흩어진 만큼 예상 범위가 넓어진다", () => {
    const records = periods([24, 32, 24, 32]); // 표준편차 4
    const result = estimate(records, [], at(records));
    expect(result.period?.earliestStart).toBe(addDays(result.period!.startDate, -4));
    expect(result.period?.latestStart).toBe(addDays(result.period!.startDate, 4));
  });

  it("평소 주기로 잡은 예상도 범위가 지나면 말을 아낀다", () => {
    const one = [{ id: "1", startDate: "2026-10-01", endDate: null }];
    expect(estimate(one, [], "2026-11-06", 35).period?.startDate).toBe("2026-11-05");
    expect(estimate(one, [], "2026-11-08", 35).period).toBeNull();
  });

  it("생리 기간은 지난 기록 평균, 없으면 5일", () => {
    const records = periods([28, 28, 28]);
    records[0].endDate = addDays(records[0].startDate, 2); // 3일
    records[1].endDate = addDays(records[1].startDate, 5); // 6일
    records[2].endDate = null;
    records[3].endDate = null;
    const result = estimate(records, [], lastStart(records));
    expect(result.typicalPeriodDays).toBe(5); // 4.5 → 5
    expect(result.period?.endDate).toBe(addDays(result.period!.startDate, 4));
  });
});

describe("추정 표시", () => {
  it("달력 표시에 추정 여부가 실린다", () => {
    const one = [{ id: "1", startDate: "2026-10-30", endDate: null }];
    const tentative = calendarMarks(one, estimate(one, [], "2026-11-03"), "2026-11-01", "2026-12-31", "2026-11-03");
    expect(tentative.find((m) => m.type === "estimated_ovulation")).toEqual({ date: "2026-11-13", type: "estimated_ovulation", tentative: true });
    expect(tentative.find((m) => m.type === "estimated_fertile_window")?.tentative).toBe(true);
    expect(tentative.find((m) => m.type === "predicted_period")?.tentative).toBeUndefined();
    const sure = periods([28, 28, 28]);
    const last = lastStart(sure);
    const marks = calendarMarks(sure, estimate(sure, [], last), last, addDays(last, 40), last);
    expect(marks.find((m) => m.type === "estimated_ovulation")?.tentative).toBe(false);
  });
});

describe("예측 정확도", () => {
  it("규칙적이면 0일, 그 전 기록만으로 예측한 오차를 평균한다", () => {
    expect(predictionError(periods([28, 28, 28, 28]))).toEqual({ days: 0, samples: 4 });
    // 28일 가정 → 실제 30(2일 차이), 30일 예측 → 실제 34(4일 차이)
    expect(predictionError(periods([30, 34]))).toEqual({ days: 3, samples: 2 });
    expect(predictionError(periods([]))).toBeNull();
  });

  it("평소 주기도 예측에 쓰인다", () => {
    expect(predictionError(periods([30]), 30)).toEqual({ days: 0, samples: 1 });
    expect(predictionError(periods([30]))).toEqual({ days: 2, samples: 1 });
  });

  it("제외한 기록과 주기로 볼 수 없는 간격은 세지 않고, 최근 6번만 본다", () => {
    const records = periods([28, 28, 28]);
    records[2].excluded = true;
    expect(predictionError(records)?.samples).toBe(1);
    expect(predictionError(periods([28, 90, 28]))?.samples).toBe(2);
    expect(predictionError(periods(Array(9).fill(28)))?.samples).toBe(6);
  });
});

describe("진행 중인 생리", () => {
  const open = { id: "o", startDate: "2026-10-31", endDate: null };
  const marks = (list: PeriodInput[], today: string, month = ["2026-10-01", "2026-12-31"]) =>
    calendarMarks(list, estimate(list, [], today), month[0], month[1], today);
  const dates = (all: ReturnType<typeof marks>, type: string) => all.filter((m) => m.type === type).map((m) => m.date);

  it("시작일~오늘은 생리, 내일~예상 종료일은 예상, 달이 바뀌어도 이어진다", () => {
    const all = marks([open], "2026-11-02");
    expect(dates(all, "period")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dates(all, "remaining_period")).toEqual(["2026-11-03", "2026-11-04"]); // 기본 5일: 10.31~11.4
    expect(dates(all, "predicted_period")[0]).toBe("2026-11-28"); // 다음은 28일 뒤
    expect(dates(marks([open], "2026-11-02", ["2026-11-01", "2026-11-30"]), "period")).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("예상 기간은 지난 기록의 평균이다", () => {
    const past = [
      { id: "a", startDate: "2026-08-01", endDate: "2026-08-03" }, // 3일
      { id: "b", startDate: "2026-09-01", endDate: "2026-09-08" }, // 8일. 중앙값이 아니라 평균(5.5 → 6일)
    ];
    expect(estimate([...past, open], [], "2026-11-02").ongoing).toEqual({ startDate: "2026-11-03", endDate: "2026-11-05" });
  });

  it("예상 종료일이 지나면 오늘까지 칠하고 예상은 없다, 10일이 넘어도 시작일만 남기지 않는다", () => {
    expect(estimate([open], [], "2026-11-04").ongoing).toBeNull();
    expect(dates(marks([open], "2026-11-06"), "period")).toHaveLength(7);
    expect(dates(marks([open], "2026-11-10"), "period")).toHaveLength(11);
  });

  it("끝난 기록에는 남은 예상이 없다", () => {
    const ended = [{ ...open, endDate: "2026-11-02" }];
    expect(estimate(ended, [], "2026-11-02").ongoing).toBeNull();
    const all = marks(ended, "2026-11-02");
    expect(dates(all, "period")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dates(all, "predicted_period")[0]).toBe("2026-11-28");
  });
});

describe("끝났는지 묻기", () => {
  const open = { id: "o", startDate: "2026-10-01", endDate: null };
  const past = { id: "p", startDate: "2026-09-01", endDate: "2026-09-07" }; // 7일

  it("예상 종료일 다음 날부터, 평균 기간이 없으면 5일 기준으로 묻는다", () => {
    expect(endQuestion([open], "2026-10-05")).toBeNull();
    expect(endQuestion([open], "2026-10-06")).toEqual({ id: "o", startDate: "2026-10-01", date: "2026-10-05", day: 5 });
    expect(endQuestion([open], "2026-10-09")?.date).toBe("2026-10-05");
  });

  it("평균 기간을 쓰고, 자동 종료 기록은 평균에서 뺀다", () => {
    expect(endQuestion([past, open], "2026-10-07")).toBeNull();
    expect(endQuestion([past, open], "2026-10-08")?.day).toBe(7);
    const auto = { id: "a", startDate: "2026-08-01", endDate: "2026-08-20", autoEnded: true };
    expect(endQuestion([auto, past, open], "2026-10-08")?.day).toBe(7);
    expect(endQuestion([auto, open], "2026-10-06")?.day).toBe(5);
  });

  it("아직 하고 있어요를 누르면 2일 숨기고, 이미 지난 날을 다시 묻지 않는다", () => {
    const snoozed = { ...open, askEndAgainOn: "2026-10-08" }; // 10.6에 누름
    expect(endQuestion([snoozed], "2026-10-06")).toBeNull();
    expect(endQuestion([snoozed], "2026-10-07")).toBeNull();
    expect(endQuestion([snoozed], "2026-10-08")).toMatchObject({ date: "2026-10-07", day: 7 });
  });

  it("끝난 기록은 묻지 않는다", () => {
    expect(endQuestion([{ ...open, endDate: "2026-10-06" }], "2026-10-06")).toBeNull();
  });
});

describe("자동 종료 날짜", () => {
  it("시작 후 10일이 지나면 대상이고, 종료일은 시작일 + 평균 기간 - 1", () => {
    const open = { startDate: "2026-10-01", endDate: null };
    expect(isOverdue(open, "2026-10-10")).toBe(false);
    expect(isOverdue(open, "2026-10-11")).toBe(true);
    expect(autoEndDate([open], open.startDate, "2026-10-11")).toBe("2026-10-05");
    const past = { startDate: "2026-09-01", endDate: "2026-09-07" };
    expect(autoEndDate([past, open], open.startDate, "2026-10-11")).toBe("2026-10-07");
  });

  it("오늘이나 다음 기록을 넘지 않는다", () => {
    const long = { startDate: "2026-09-01", endDate: "2026-09-20" }; // 20일
    const open = { startDate: "2026-10-01", endDate: null };
    expect(autoEndDate([long, open], open.startDate, "2026-10-11")).toBe("2026-10-11");
    const next = { startDate: "2026-10-03", endDate: null };
    expect(autoEndDate([open, next], open.startDate, "2026-10-20")).toBe("2026-10-02");
  });

  it("자동 종료 기록은 기간 평균에서 빠지고 주기 간격에는 쓰인다", () => {
    const records = periods([28, 28, 28]);
    records[3] = { ...records[3], endDate: addDays(records[3].startDate, 19), autoEnded: true };
    const result = estimate(records, [], lastStart(records));
    expect(result.typicalPeriodDays).toBe(5);
    expect(result.sampleSize).toBe(3);
    expect(result.period?.startDate).toBe(addDays(lastStart(records), 28));
  });
});

describe("월 달력", () => {
  it("2026년 10월: 목요일 시작, 31일", () => {
    const { first, last, cells } = monthGrid("2026-10");
    expect(first).toBe("2026-10-01");
    expect(last).toBe("2026-10-31");
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, "2026-10-01"]);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.length % 7).toBe(0);
  });

  it("윤년 2월은 29일, 평년 2월은 28일", () => {
    expect(monthGrid("2024-02").last).toBe("2024-02-29");
    expect(monthGrid("2026-02").last).toBe("2026-02-28");
    expect(monthGrid("2100-02").last).toBe("2100-02-28"); // 100으로 나눠지는 해는 평년
  });

  it("일요일에 시작하고 딱 떨어지는 달은 빈칸이 없다", () => {
    expect(monthGrid("2026-02").cells).toHaveLength(28);
  });

  it("월 이동·검증·표기", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -1)).toBe("2026-02");
    expect(monthLabel("2026-10")).toBe("2026년 10월");
    for (const bad of ["2026-13", "2026-00", "2026-1", "x", undefined, ["2026-10"], "1899-12"]) expect(isMonth(bad)).toBe(false);
    expect(isMonth("2026-10")).toBe(true);
    expect(dayRange("2026-10-07", "2026-10-11")).toBe("10월 7일 ~ 11일");
    expect(dayRange("2026-10-30", "2026-11-02")).toBe("10월 30일 ~ 11월 2일");
  });
});
