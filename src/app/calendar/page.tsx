import { calendarWindow } from "@/lib/calendar";
import { getDb } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { calendarMarks, estimate } from "@/lib/prediction";
import { listDayLogs } from "@/lib/services/daylogs";
import { listPeriods, usualCycle } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { AppHeader } from "../_components/AppHeader";
import { BackLink } from "../_components/BackLink";
import { HomeTop } from "../_components/HomeCards";
import { HomeCalendar } from "../_components/HomeCalendar";
import { Nav } from "../_components/Nav";
import { TodayRefresh } from "../_components/TodayRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "달력 — 우리주기" };

/** 기록자의 전체 달력. 파트너는 홈의 달력을 본다. */
export default async function CalendarPage() {
  const user = await requireUser("recorder");
  const db = await getDb();
  const today = todaySeoul();
  const [periods, usual, logs] = await Promise.all([listPeriods(db, user.id), usualCycle(db, user.id), listDayLogs(db, user.id)]);
  const prediction = estimate(periods, [], today, usual);
  const { first, last } = calendarWindow(today);
  return (
    <>
      <TodayRefresh today={today} />
      <AppHeader user={user} />
      <HomeTop>
        <div className="flex items-center gap-1">
          <div className="mt-4"><BackLink href="/" /></div>
          <h1 className="text-[17px] font-semibold tracking-tight">달력</h1>
        </div>
      </HomeTop>
      <div className="pb-4">
        <HomeCalendar
          today={today} marks={calendarMarks(periods, prediction, first, last, today)}
          recorder={{ periods: periods.map(({ id, startDate, endDate, autoEnded }) => ({ id, startDate, endDate, autoEnded })), logs }}
        />
      </div>
      <Nav role="recorder" active="home" />
    </>
  );
}
