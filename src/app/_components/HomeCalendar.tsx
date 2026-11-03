"use client";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { calendarWindow, dayLabels, HEADER_ID, HOME_TOP_ID, pickable, todayDirection, type TodayDirection } from "@/lib/calendar";
import { dayRange, diffDays, formatDay, monthDay } from "@/lib/dates";
import type { DayLog } from "@/lib/daylog";
import { currentPeriod, type CalendarMark } from "@/lib/prediction";
import { endTodayAction } from "../actions";
import { CalendarMonth } from "./CalendarMonth";
import { StartTodayButton } from "./PeriodButtons";
import { RecordDayForm } from "./RecordDayForm";
import { Sheet } from "./Sheet";
import { ErrorText } from "./Submit";
import { TEXT_BTN } from "./ui";

type PeriodRow = { id: string; startDate: string; endDate: string | null; autoEnded: boolean };
export type RecorderData = { periods: PeriodRow[]; logs: DayLog[] };

function Labels({ marks, day }: { marks: CalendarMark[]; day: string }) {
  const labels = dayLabels(marks, day);
  if (!labels.length) return null;
  return <p className="text-[17px] text-muted">{labels.join(" · ")}</p>;
}

/** 기록 없이 그날 표시만 보여주는 시트. 앞날(기록자·파트너)과 파트너의 지난 날짜에 쓴다. 기록 버튼은 없다. */
function DayInfo({ marks, day, today }: { marks: CalendarMark[]; day: string; today: string }) {
  if (dayLabels(marks, day).length) return <Labels marks={marks} day={day} />;
  return <p className="text-[17px] text-muted">{day > today ? "예정된 일정이 없어요" : "표시된 기록이 없어요"}</p>;
}

/**
 * 기록자의 날짜 시트. 빈 날은 "이날 시작"(저장되면 시트를 닫고 끝난 날을 고르게 한다),
 * 기록이 있는 날은 시작일·끝난 날·통증·기분을 한 번에 고치는 폼(RecordDayForm). 저장·삭제하면 시트를 닫는다.
 */
function RecorderDay({ day, today, marks, data, onStarted, onDone }: {
  day: string; today: string; marks: CalendarMark[]; data: RecorderData; onStarted: () => void; onDone: () => void;
}) {
  const inPeriod = currentPeriod(data.periods, day);
  const record = inPeriod && data.periods.find((p) => p.id === inPeriod.id);
  if (!record) {
    return (
      <>
        <Labels marks={marks} day={day} />
        <div className="mt-4 text-center"><StartTodayButton day={day} onStarted={onStarted} compact /></div>
        <p className="mt-1 text-center"><Link href="/report#direct" className={TEXT_BTN}>기간을 한 번에 입력하기</Link></p>
      </>
    );
  }
  return (
    <>
      <p className="text-[15px] text-muted">
        {record.endDate ? `${dayRange(record.startDate, record.endDate)} · ${diffDays(record.endDate, record.startDate) + 1}일` : `${monthDay(record.startDate)}부터 진행 중`}
      </p>
      <div className="mt-4">
        <RecordDayForm
          key={`${record.id}|${record.startDate}|${record.endDate}|${day}`}
          day={day} today={today} period={record} log={data.logs.find((l) => l.day === day) ?? null} onDone={onDone}
        />
      </div>
    </>
  );
}

/** 헤더와 상단 고정 영역을 합친 높이. */
const topHeight = () => [HEADER_ID, HOME_TOP_ID].reduce((sum, id) => sum + (document.getElementById(id)?.offsetHeight ?? 0), 0);

/** 상단 고정 영역·달 제목과 떠 있는 메뉴·버튼을 뺀, 달력이 실제로 보이는 영역. */
function visibleArea() {
  const floating = [...document.querySelectorAll("[data-floating]")].map((el) => el.getBoundingClientRect().top);
  const head = document.querySelector<HTMLElement>("[data-month-head]")?.offsetHeight ?? 0;
  return { top: topHeight() + head, bottom: Math.min(window.innerHeight, ...floating) };
}

const todayCell = (today: string) => document.querySelector(`[data-day="${today}"]`);

/** 오늘이 화면 밖으로 나가면 고정된 달 제목 바로 아래 가운데에 나타나고, 누르면 오늘로 돌아가는 칩. 화살표는 오늘이 있는 쪽을 가리킨다. */
function TodayChip({ today }: { today: string }) {
  const [direction, setDirection] = useState<TodayDirection | null>(null);
  const [top, setTop] = useState(0);

  useEffect(() => {
    const update = () => {
      const cell = todayCell(today);
      if (!cell) return;
      const area = visibleArea();
      setDirection(todayDirection(cell.getBoundingClientRect(), area));
      setTop(area.top);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [today]);

  if (!direction) return null;
  const goToday = () => {
    const rect = todayCell(today)?.getBoundingClientRect();
    if (!rect) return;
    const view = visibleArea();
    window.scrollTo({
      top: window.scrollY + rect.top - view.top - (view.bottom - view.top - rect.height) / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  const Arrow = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button" onClick={goToday} style={{ top: top + 8 }}
      className="fixed left-1/2 z-20 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full border-[0.5px] border-line bg-card px-3 text-[13px] font-medium text-accent shadow-[0_2px_10px_rgb(63_58_61/0.14)]"
    >
      <Arrow size={14} aria-hidden />
      오늘
    </button>
  );
}

/** 시작일을 저장한 뒤 끝난 날을 기다리는 안내. 메뉴 바로 위에 떠 있다. */
function EndPrompt({ start, error, onCancel }: { start: string; error?: string; onCancel: () => void }) {
  return (
    <div data-floating className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-20 mx-auto max-w-md px-6">
      <div role="status" className="rounded-[18px] border-[0.5px] border-line bg-card px-3.5 py-2.5 shadow-lg">
        <p className="flex items-center justify-between gap-3 text-[15px]">
          <span className="min-w-0"><b className="font-medium text-accent">{monthDay(start)} 시작</b> · 끝난 날을 눌러 주세요</span>
          <button type="button" onClick={onCancel} className="link h-8 shrink-0 text-[13px]">아직이에요</button>
        </p>
        <ErrorText message={error} />
      </div>
    </div>
  );
}

/**
 * 이번 달에서 시작하는 세로 달력. 위로 지난 6개월, 아래로 앞으로 6개월이다. quick은 이번 달 바로 위에 둔다.
 * 모든 날짜를 누를 수 있다. 기록자의 오늘·지난 날짜는 기록 시트, 그 밖(앞날, 파트너)은 그날 표시만 보여준다.
 * open을 주면 그 날짜 시트를 열어 둔 채로 시작한다(홈 띠 달력에서 날짜를 눌렀을 때).
 */
export function HomeCalendar({ today, marks, recorder, quick, open }: {
  today: string;
  marks: CalendarMark[];
  recorder?: RecorderData;
  quick?: React.ReactNode;
  open?: string | null;
}) {
  const { month, months } = calendarWindow(today);
  const [picked, setPicked] = useState<string | null>(open ?? null);
  const [placed, setPlaced] = useState(false);
  // 시작을 저장한 뒤 다음 탭을 끝난 날로 받는다. 앱을 닫아도 시작일은 남아 진행 중인 기록이 된다.
  const [startedOn, setStartedOn] = useState<string | null>(null);
  const [endError, setEndError] = useState<string>();
  const [, startEnding] = useTransition();
  const thisMonth = useRef<HTMLDivElement>(null);

  // 첫 칸이 6개월 전이라, 자리를 잡을 때까지 숨겨서 지난달이 먼저 보이지 않게 한다.
  // 이번 달 맨 위(quick 포함)에 맞추고, 그래도 오늘 줄이 안 보이면 오늘 줄을 가운데로. 애니메이션 없이 바로 옮긴다.
  useLayoutEffect(() => {
    const top = thisMonth.current?.getBoundingClientRect().top ?? 0;
    window.scrollTo({ top: top + window.scrollY - topHeight(), behavior: "instant" });
    const cell = todayCell(today)?.getBoundingClientRect();
    const view = visibleArea();
    if (cell && todayDirection(cell, view)) {
      window.scrollTo({ top: window.scrollY + cell.top - view.top - (view.bottom - view.top - cell.height) / 2, behavior: "instant" });
    }
    setPlaced(true);
  }, [today]);

  // 띠 달력에서 연 시트를 닫으면 주소의 ?day도 지워서, 새로 고쳐도 다시 열리지 않게 한다.
  const close = () => {
    setPicked(null);
    if (open) window.history.replaceState(window.history.state, "", window.location.pathname);
  };

  const pick = (day: string) => {
    if (!startedOn) return setPicked(day);
    if (!pickable(day, today)) return setEndError("끝난 날은 오늘까지 고를 수 있어요");
    const id = recorder?.periods.find((p) => p.startDate === startedOn)?.id;
    if (!id) return; // 저장한 기록이 아직 화면에 도착하지 않았다
    const form = new FormData();
    form.set("id", id);
    form.set("day", day);
    setEndError(undefined);
    startEnding(async () => {
      const result = await endTodayAction(null, form).catch(() => ({ error: "저장하지 못했어요. 다시 시도해 주세요" }));
      if (result?.error) setEndError(result.error);
      else setStartedOn(null);
    });
  };

  // 달마다 있는 제목과 요일 줄이 상단 영역 바로 아래에 붙게 한다
  useLayoutEffect(() => {
    const top = document.getElementById(HOME_TOP_ID);
    if (!top) return;
    const update = () => document.documentElement.style.setProperty("--home-top", `${topHeight()}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(top);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`space-y-4 ${placed ? "" : "invisible"}`}>
      {placed && <TodayChip key={startedOn} today={today} />}
      {startedOn && <EndPrompt start={startedOn} error={endError} onCancel={() => { setStartedOn(null); setEndError(undefined); }} />}
      {months.map((m) => (
        <div key={m} ref={m === month ? thisMonth : undefined} className="space-y-4">
          {m === month && quick}
          {/* 기록자 전체 달력은 칸·폭을 키운다(숫자 크기는 같다) */}
          <CalendarMonth month={m} marks={marks} today={today} onPick={pick} size={recorder ? "large" : "normal"} />
        </div>
      ))}
      <Sheet open={picked !== null} title={picked ? formatDay(picked) : ""} onClose={close}>
        {picked && (recorder && pickable(picked, today)
          ? (
            <RecorderDay
              day={picked} today={today} marks={marks} data={recorder} onDone={close}
              onStarted={() => { setStartedOn(picked); close(); }}
            />
          )
          : <DayInfo marks={marks} day={picked} today={today} />)}
      </Sheet>
    </div>
  );
}
