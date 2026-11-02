import Link from "next/link";
import { getDb } from "@/lib/db";
import { isMonth, todaySeoul } from "@/lib/dates";
import { partnerView } from "@/lib/services/partner";
import { requireUser } from "@/lib/session";
import { MonthCalendar } from "../_components/MonthCalendar";
import { Nav } from "../_components/Nav";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser("partner");
  const today = todaySeoul();
  const param = (await searchParams).month;
  const month = isMonth(param) ? param : today.slice(0, 7);
  const view = await partnerView(await getDb(), user, today, month);

  return (
    <>
      <h1 className="sr-only">달력</h1>
      {view && !view.paused ? (
        <MonthCalendar month={month} marks={view.calendar} today={today} basePath="/calendar" />
      ) : (
        <p className="mt-10 text-[17px] leading-relaxed text-muted">
          {view ? "지금은 공유를 잠시 멈췄어요." : <Link href="/connect" className="link">연결하면 볼 수 있어요</Link>}
        </p>
      )}
      <Nav role={user.role} active="calendar" />
    </>
  );
}
