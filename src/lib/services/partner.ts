import { monthGrid, todaySeoul } from "../dates";
import { calendarMarks, estimate, type CalendarMark } from "../prediction";
import type { User } from "./auth";
import { sharedCare, type CareView } from "./care";
import { activeCouple, otherNickname, requireRole } from "./couples";
import { currentPeriod, listPeriods } from "./periods";
import type { DB } from "../db";
import type { Permissions } from "../db/schema";

export type PartnerView = {
  recorderNickname: string;
  paused: boolean;
  permissions: Permissions;
  current: { day: number } | null;
  nextPeriod: { startDate: string; earliestStart: string; latestStart: string } | null;
  fertileWindow: { startDate: string; endDate: string } | null;
  recentPeriods: { startDate: string; endDate: string | null }[];
  care: CareView[];
  /** 해당 달의 달력 표시. 켜진 항목만 들어 있다. */
  calendar: CalendarMark[];
};

/**
 * 파트너 화면에 내려줄 데이터. 공유 조건(활성 연결 · 일시정지 아님 · 항목 허용 · 공유 시작일 이후)을
 * 여기서 한 번에 거른다. 계산에 쓴 원본 간격·제외 사유는 절대 내보내지 않는다.
 */
export async function partnerView(db: DB, user: User, today = todaySeoul(), month = today.slice(0, 7)): Promise<PartnerView | null> {
  requireRole(user, "partner");
  const couple = await activeCouple(db, user.id);
  if (!couple) return null;
  const base: PartnerView = {
    recorderNickname: await otherNickname(db, couple, user),
    paused: couple.paused, permissions: couple.permissions,
    current: null, nextPeriod: null, fertileWindow: null, recentPeriods: [], care: [], calendar: [],
  };
  if (couple.paused) return base;

  const p = couple.permissions;
  const all = await listPeriods(db, couple.recorderId);
  // 원본 기록: 공유 시작일 이후에 시작한 것만
  const visible = all.filter((x) => x.startDate >= couple.shareFrom);
  if (p.periods) {
    const cur = currentPeriod(visible, today);
    base.current = cur ? { day: cur.day } : null;
    base.recentPeriods = visible.slice(-6).reverse().map((x) => ({ startDate: x.startDate, endDate: x.endDate }));
  }
  // 예측: 비공개 과거 기록까지 써서 계산하되, 결과 날짜만 보여준다
  const full = p.predictions || p.fertility ? estimate(all, [], today) : null;
  if (p.predictions && full?.period) {
    base.nextPeriod = { startDate: full.period.startDate, earliestStart: full.period.earliestStart, latestStart: full.period.latestStart };
  }
  if (p.fertility && full?.fertileWindow) base.fertileWindow = full.fertileWindow;
  // 달력도 같은 조건으로 거른다. 배란 추정일은 파트너에게 내보내지 않는다.
  const { first, last } = monthGrid(month);
  base.calendar = calendarMarks(
    p.periods ? visible : [],
    { period: p.predictions ? full?.period ?? null : null, fertileWindow: p.fertility ? full?.fertileWindow ?? null : null, ovulation: null },
    first, last, today,
  );
  base.care = await sharedCare(db, couple, today);
  return base;
}
