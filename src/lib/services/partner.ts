import { monthGrid, todaySeoul } from "../dates";
import type { DayLog } from "../daylog";
import { CRESCENT, moonShape, type MoonShape } from "../moon";
import { phaseFrom, type Phase } from "../phase";
import { calendarMarks, estimate, type CalendarMark } from "../prediction";
import type { User } from "./auth";
import { sharedCare, type CareView } from "./care";
import { activeCouple, otherNickname, requireRole } from "./couples";
import { dayLogOn } from "./daylogs";
import { currentPeriod, listPeriods, usualCycle } from "./periods";
import type { DB } from "../db";

export type PartnerView = {
  recorderNickname: string;
  paused: boolean;
  current: { day: number } | null;
  nextPeriod: { startDate: string; earliestStart: string; latestStart: string } | null;
  fertileWindow: { startDate: string; endDate: string } | null;
  /** 배란 추정일. */
  ovulation: string | null;
  recentPeriods: { startDate: string; endDate: string | null }[];
  care: CareView[];
  /** 해당 달의 달력 표시. */
  calendar: CalendarMark[];
  moon: MoonShape;
  /** 오늘의 통증·기분. 지난 날의 것은 보내지 않는다. */
  todayBody: Pick<DayLog, "pain" | "moods"> | null;
  /** 오늘 시기. 알아두면 좋은 글을 고르는 데 쓴다. */
  phase: Phase | null;
};

/**
 * 파트너 화면에 내려줄 데이터. 공유 조건(활성 연결 · 일시정지 아님 · 공유 시작일 이후)을 여기서 한 번에 거른다.
 * 계산에 쓴 원본 간격·제외 사유·평소 주기는 절대 내보내지 않는다.
 */
export async function partnerView(db: DB, user: User, today = todaySeoul(), month = today.slice(0, 7)): Promise<PartnerView | null> {
  requireRole(user, "partner");
  const couple = await activeCouple(db, user.id);
  if (!couple) return null;
  const [recorderNickname, all, usual, care] = await Promise.all([
    otherNickname(db, couple, user), couple.paused ? [] : listPeriods(db, couple.recorderId), usualCycle(db, couple.recorderId), sharedCare(db, couple, today),
  ]);
  const base: PartnerView = {
    recorderNickname, paused: couple.paused,
    current: null, nextPeriod: null, fertileWindow: null, ovulation: null, recentPeriods: [], care: [], calendar: [], moon: CRESCENT,
    todayBody: null, phase: null,
  };
  if (couple.paused) return base;

  // 원본 기록: 공유 시작일 이후에 시작한 것만
  const visible = all.filter((x) => x.startDate >= couple.shareFrom);
  const cur = currentPeriod(visible, today);
  base.current = cur ? { day: cur.day } : null;
  base.recentPeriods = visible.slice(-6).reverse().map((x) => ({ startDate: x.startDate, endDate: x.endDate }));
  // 예측: 비공개 과거 기록까지 써서 계산하되, 결과 날짜만 보여준다
  const full = estimate(all, [], today, usual);
  if (full.period) {
    base.moon = moonShape(full, today);
    base.nextPeriod = { startDate: full.period.startDate, earliestStart: full.period.earliestStart, latestStart: full.period.latestStart };
  }
  base.fertileWindow = full.fertileWindow;
  base.ovulation = full.ovulation?.estimatedDate ?? null;
  const { first, last } = monthGrid(month);
  base.calendar = calendarMarks(
    visible,
    // 남은 예상 기간은 진행 중이라는 사실이기도 해서, 그 기록이 보일 때만 내려준다.
    { period: full.period, ongoing: cur?.open ? full.ongoing : null, fertileWindow: full.fertileWindow, ovulation: full.ovulation },
    first, last, today,
  );
  // 공유 시작일 이전 생리의 통증·기분은 그 기록처럼 숨긴다.
  const log = cur ? await dayLogOn(db, couple.recorderId, today) : null;
  base.todayBody = log && { pain: log.pain, moods: log.moods };
  base.phase = phaseFrom(Boolean(cur), full.fertileWindow, today);
  base.care = care;
  return base;
}
