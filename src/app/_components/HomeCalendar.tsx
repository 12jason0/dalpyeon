"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { calendarWindow, dayLabels } from "@/lib/calendar";
import { dayRange, diffDays, formatDay, monthDay } from "@/lib/dates";
import type { DayLog } from "@/lib/daylog";
import { currentPeriod, ESTIMATE_NOTE, type CalendarMark } from "@/lib/prediction";
import { deletePeriodAction } from "../actions";
import { CalendarMonth } from "./CalendarMonth";
import { DayLogForm } from "./DayLogForm";
import { EndTodayButton, StartTodayButton } from "./PeriodButtons";
import { Sheet } from "./Sheet";

export const HOME_TOP_ID = "home-top";

type PeriodRow = { id: string; startDate: string; endDate: string | null; autoEnded: boolean };
export type RecorderData = { periods: PeriodRow[]; logs: DayLog[] };

function Labels({ marks, day }: { marks: CalendarMark[]; day: string }) {
  const labels = dayLabels(marks, day);
  if (!labels.length) return null;
  const estimated = labels.includes("가임기") || labels.includes("배란일");
  return (
    <>
      <p className="text-[17px] text-muted">{labels.join(" · ")}</p>
      {estimated && <p className="mt-1 text-[13px] text-muted">{ESTIMATE_NOTE}</p>}
    </>
  );
}

/** 기록자의 날짜 시트. 지난 날은 시작을, 생리 중인 날은 끝·수정·통증과 기분을 남긴다. */
function RecorderDay({ day, today, marks, data }: { day: string; today: string; marks: CalendarMark[]; data: RecorderData }) {
  if (day > today) {
    return dayLabels(marks, day).length ? <Labels marks={marks} day={day} /> : <p className="text-[17px] text-muted">아직 오지 않은 날이에요</p>;
  }
  const inPeriod = currentPeriod(data.periods, day);
  const record = inPeriod && data.periods.find((p) => p.id === inPeriod.id);
  if (!record) {
    return (
      <>
        <Labels marks={marks} day={day} />
        <div className="mt-4"><StartTodayButton day={day === today ? undefined : day} /></div>
        <p className="mt-4 text-center text-sm"><Link href="/report#direct" className="link">기간을 한 번에 입력하기</Link></p>
      </>
    );
  }
  const edit = `/report?edit=${record.id}#direct`;
  return (
    <>
      <p className="text-[17px]">
        {record.endDate ? `${dayRange(record.startDate, record.endDate)} · ${diffDays(record.endDate, record.startDate) + 1}일` : `${monthDay(record.startDate)}부터 진행 중`}
      </p>
      {record.autoEnded && <p className="mt-2 text-[15px]"><Link href={edit} className="link">자동으로 끝낸 기록 · 날짜 확인하기</Link></p>}
      <div className="mt-4"><EndTodayButton id={record.id} day={day === today ? undefined : day} /></div>
      <DayLogForm key={day} day={day} initial={data.logs.find((l) => l.day === day) ?? null} />
      <div className="mt-4 flex items-start justify-center gap-8 text-sm">
        <Link href={edit} className="link leading-11">수정</Link>
        <details>
          <summary className="link cursor-pointer list-none leading-11">삭제</summary>
          <form action={deletePeriodAction}>
            <input type="hidden" name="id" value={record.id} />
            <input type="hidden" name="stay" value="on" />
            <button type="submit" className="h-11 text-period-ink underline underline-offset-4">정말 지울게요</button>
          </form>
        </details>
      </div>
    </>
  );
}

/** 파트너의 날짜 시트. 그날 표시와, 오늘이면 통증·기분을 보여준다. */
function PartnerDay({ day, today, marks, body }: { day: string; today: string; marks: CalendarMark[]; body: string | null }) {
  const shownBody = day === today ? body : null;
  if (!dayLabels(marks, day).length && !shownBody) return <p className="text-[17px] text-muted">표시된 내용이 없어요</p>;
  return (
    <>
      <Labels marks={marks} day={day} />
      {shownBody && <p className="mt-2 text-[17px]">{shownBody}</p>}
    </>
  );
}

/** 이번 달에서 시작하는 세로 달력. 위로 지난 6개월, 아래로 앞으로 6개월이다. children은 이번 달 바로 아래에 둔다. */
export function HomeCalendar({ today, marks, recorder, partnerBody, children }: {
  today: string;
  marks: CalendarMark[];
  recorder?: RecorderData;
  partnerBody?: string | null;
  children?: React.ReactNode;
}) {
  const { month, months } = calendarWindow(today);
  const [picked, setPicked] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const thisMonth = useRef<HTMLDivElement>(null);

  // 첫 칸이 6개월 전이라, 자리를 잡을 때까지 숨겨서 지난달이 먼저 보이지 않게 한다.
  useLayoutEffect(() => {
    const top = thisMonth.current?.getBoundingClientRect().top ?? 0;
    const header = document.getElementById(HOME_TOP_ID)?.offsetHeight ?? 0;
    window.scrollTo(0, top + window.scrollY - header);
    setPlaced(true);
  }, []);

  return (
    <div className={placed ? "" : "invisible"}>
      {months.map((m) => (
        <div key={m} ref={m === month ? thisMonth : undefined}>
          <CalendarMonth month={m} marks={marks} today={today} onPick={setPicked} />
          {m === month && children}
        </div>
      ))}
      <Sheet open={picked !== null} title={picked ? formatDay(picked) : ""} onClose={() => setPicked(null)}>
        {picked && (recorder
          ? <RecorderDay day={picked} today={today} marks={marks} data={recorder} />
          : <PartnerDay day={picked} today={today} marks={marks} body={partnerBody ?? null} />)}
      </Sheet>
    </div>
  );
}
