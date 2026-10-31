import Link from "next/link";
import { getDb } from "@/lib/db";
import { dayRange, diffDays, formatDay, isDay, isMonth, monthDay, monthGrid, shortDay, todaySeoul } from "@/lib/dates";
import { calendarMarks, estimate, type CalendarMark } from "@/lib/prediction";
import { currentPeriod, listPeriods, type Period } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { deletePeriodAction } from "../actions";
import { kindOf } from "../_components/MonthCalendar";
import { Nav } from "../_components/Nav";
import { EndTodayButton } from "../_components/PeriodButtons";
import { PeriodForm } from "../_components/PeriodForm";
import { RecordsCalendar } from "../_components/RecordsCalendar";
import { Row, Section } from "../_components/Section";

export const dynamic = "force-dynamic";

function DayPanel({ day, month, today, periods, marks }: { day: string; month: string; today: string; periods: Period[]; marks: CalendarMark[] }) {
  if (day > today) {
    const kind = kindOf(marks, day);
    return (
      <p className="mt-2 text-[17px] text-muted">
        {kind === "predicted" ? "예상일이에요" : kind === "fertile" ? "가임기(추정)" : "아직 오지 않은 날이에요"}
      </p>
    );
  }
  const record = periods.find((p) => p.startDate <= day && day <= (p.endDate ?? p.startDate));
  if (!record) {
    // 종료일 없는 기록이 아직 진행 중이면 새 시작 대신 끝난 날만 정할 수 있다
    const ongoing = currentPeriod(periods, day);
    return ongoing?.open ? <div className="mt-5"><EndTodayButton id={ongoing.id} day={day} /></div> : null;
  }
  return (
    <>
      <p className="mt-2 text-[17px]">
        {record.endDate
          ? `${dayRange(record.startDate, record.endDate)} · ${diffDays(record.endDate, record.startDate) + 1}일`
          : `${monthDay(record.startDate)} · 종료일 없음`}
      </p>
      <div className="mt-5"><EndTodayButton id={record.id} day={day} /></div>
      <div className="mt-4 flex items-start justify-center gap-8 text-sm">
        <Link href={`/records?month=${month}&day=${day}&edit=${record.id}#direct`} className="link leading-11">수정</Link>
        <details>
          <summary className="link cursor-pointer list-none leading-11">삭제</summary>
          <form action={deletePeriodAction}>
            <input type="hidden" name="id" value={record.id} />
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="h-11 text-period-ink underline underline-offset-4">정말 지울게요</button>
          </form>
        </details>
      </div>
    </>
  );
}

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ edit?: string; month?: string; day?: string }> }) {
  const user = await requireUser("recorder");
  const params = await searchParams;
  const today = todaySeoul();
  const pickedDay = isDay(params.day) ? params.day : null;
  const month = isMonth(params.month) ? params.month : (pickedDay ?? today).slice(0, 7);
  const day = pickedDay?.startsWith(month) ? pickedDay : null;

  const periods = await listPeriods(await getDb(), user.id);
  const prediction = estimate(periods, [], today);
  const { first, last, cells } = monthGrid(month);
  const marks = calendarMarks(periods, prediction, first, last, today);
  const editing = periods.find((p) => p.id === params.edit) ?? null;

  return (
    <>
      <h1 className="sr-only">기록</h1>
      <RecordsCalendar
        month={month} marks={marks} today={today} selected={day}
        periods={periods.map(({ id, startDate, endDate }) => ({ id, startDate, endDate }))}
        ongoing={cells.filter((d): d is string => Boolean(d && d <= today && currentPeriod(periods, d)?.open))}
      >
        {day ? (
          <div key={day}>
            <h2 className="text-xl font-medium">{formatDay(day)}</h2>
            <DayPanel day={day} month={month} today={today} periods={periods} marks={marks} />
          </div>
        ) : (
          <p className="text-[17px] text-muted">날짜를 누르면 기록할 수 있어요.</p>
        )}
      </RecordsCalendar>

      {prediction.typicalCycleDays && (
        <Section title="내 주기">
          <Row label="보통 주기" value={`${prediction.typicalCycleDays}일`} />
          {prediction.observedMinDays !== prediction.observedMaxDays && (
            <Row label="최근 범위" value={`${prediction.observedMinDays}–${prediction.observedMaxDays}일`} />
          )}
          {prediction.typicalPeriodDays && <Row label="보통 기간" value={`${prediction.typicalPeriodDays}일`} />}
          <p className="pt-4 text-[13px] leading-relaxed text-muted">
            최근 {prediction.sampleSize}번의 간격({prediction.intervals.map((i) => i.days).join(" · ")}일)으로 계산했어요.
          </p>
        </Section>
      )}

      <details id="direct" className="mt-16" open={Boolean(editing)}>
        <summary className="cursor-pointer list-none text-sm text-muted underline underline-offset-4">직접 입력·전체 기록</summary>
        <section className="mt-8">
          <h2 className="mb-5 text-sm font-medium text-muted">{editing ? `${formatDay(editing.startDate)} 기록 수정` : "생리 기록 추가"}</h2>
          <PeriodForm initial={editing} today={today} />
          {editing && (
            <form action={deletePeriodAction} className="mt-6 text-center">
              <input type="hidden" name="id" value={editing.id} />
              <button type="submit" className="text-sm text-period-ink underline underline-offset-4">이 기록 삭제</button>
            </form>
          )}
        </section>

        <Section title={`지난 기록 ${periods.length}번`}>
          {periods.length === 0 && <p className="text-[17px] text-muted">아직 기록이 없어요. 기억나는 지난 시작일부터 넣어 보세요.</p>}
          <ul>
            {[...periods].reverse().map((p) => (
              <li key={p.id}>
                <Link href={`/records?edit=${p.id}#direct`} className="flex items-baseline justify-between border-b border-line py-4">
                  <span className="text-[17px]">
                    {formatDay(p.startDate)}
                    {p.excluded && <span className="ml-2 text-[13px] text-muted">예측 제외</span>}
                  </span>
                  <span className="text-[15px] text-muted">
                    {p.endDate ? `~ ${shortDay(p.endDate)} · ${diffDays(p.endDate, p.startDate) + 1}일` : "종료일 없음"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </details>
      <Nav role="recorder" active="records" />
    </>
  );
}
