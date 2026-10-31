import { addDays } from "../dates";
import type { CareView } from "../services/care";

export const EXAMPLE_DAYS_UNTIL = 5;
const CYCLE_DAYS = 28;

/** 랜딩 미리보기용 예시. 언제 봐도 다음 생리까지 5일이 되도록 오늘 기준으로 만든다. */
export function exampleHome(today: string) {
  const expected = addDays(today, EXAMPLE_DAYS_UNTIL);
  const periods = [4, 3, 2, 1].map((cyclesAgo) => {
    const startDate = addDays(expected, -CYCLE_DAYS * cyclesAgo);
    return { id: String(cyclesAgo), startDate, endDate: addDays(startDate, 4) };
  });
  const care: CareView = {
    id: "example", day: today, presets: ["warm_food", "empathy"], message: "오늘 배가 좀 아파", shareWithPartner: true, response: "will_help",
  };
  return { periods, care, month: expected.slice(0, 7) }; // 달력은 예상일이 있는 달을 보여준다
}
