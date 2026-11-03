import { calendarWindow } from "@/lib/calendar";
import { getDb } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { calendarMarks, estimate } from "@/lib/prediction";
import { listDayLogs } from "@/lib/services/daylogs";
import { listPeriods } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { AppHeader } from "../_components/AppHeader";
import { BackLink } from "../_components/BackLink";
import { HomeTop } from "../_components/HomeCards";
import { HomeCalendar } from "../_components/HomeCalendar";
import { Nav } from "../_components/Nav";
import { TodayRefresh } from "../_components/TodayRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "달력 — 디어데이" };

/** 기록자의 전체 달력. 파트너는 홈의 달력을 본다. ?day=YYYY-MM-DD면 그 날짜 시트를 열어 둔 채로 시작한다(홈 띠 달력). */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const user = await requireUser("recorder");
  const db = await getDb();
  const today = todaySeoul();
  const { first, last } = calendarWindow(today);
  const { day } = await searchParams;
  const open = day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= first && day <= last ? day : null;
  const usual = user.usualCycleDays; // 세션 조회에서 함께 읽었다
  const [periods, logs] = await Promise.all([listPeriods(db, user.id), listDayLogs(db, user.id)]);
  const prediction = estimate(periods, [], today, usual);
  return (
    <>
      <TodayRefresh today={today} />
      <AppHeader user={user} />
      <HomeTop>
        <div className="flex items-center gap-1">
          <div className="mt-4"><BackLink href="/" /></div>
          <h1 className="text-[17px] font-medium tracking-tight">달력</h1>
        </div>
      </HomeTop>
      <div className="pb-4">
        <HomeCalendar
          today={today} marks={calendarMarks(periods, prediction, first, last, today)} open={open}
          recorder={{ periods: periods.map(({ id, startDate, endDate, autoEnded }) => ({ id, startDate, endDate, autoEnded })), logs }}
        />
      </div>
      <Nav role="recorder" active="home" />
    </>
  );
}
