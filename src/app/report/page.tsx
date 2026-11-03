import { getDb } from "@/lib/db";
import { dayRange, formatDay, todaySeoul } from "@/lib/dates";
import { nextRange } from "@/lib/moon";
import { summarizeLogs } from "@/lib/daylog";
import { estimate, predictionError } from "@/lib/prediction";
import { averageCycle, errorLabel, reportRows } from "@/lib/report";
import { listDayLogs } from "@/lib/services/daylogs";
import { listPeriods, usualCycle } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { deletePeriodAction } from "../actions";
import { AppHeader } from "../_components/AppHeader";
import { PredictionNote } from "../_components/HomeCards";
import { Nav } from "../_components/Nav";
import { PeriodForm, UsualCycleForm } from "../_components/PeriodForm";
import { EditPeriodSheet, PeriodTable } from "../_components/PeriodTable";
import { Row, Section } from "../_components/Section";
import { TodayRefresh } from "../_components/TodayRefresh";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card min-w-0 flex-1 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-[17px] font-medium tracking-tight">{value}</p>
    </div>
  );
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser("recorder");
  const params = await searchParams;
  const today = todaySeoul();

  const db = await getDb();
  const [periods, usual, logs] = await Promise.all([listPeriods(db, user.id), usualCycle(db, user.id), listDayLogs(db, user.id)]);
  const prediction = estimate(periods, [], today, usual);
  const accuracy = prediction.sampleSize >= 3 ? predictionError(periods, usual) : null;
  const range = nextRange(null, prediction.period, today);
  const editing = periods.find((p) => p.id === params.edit) ?? null;
  const summaries = [...periods].reverse().filter((p) => p.endDate)
    .map((p) => ({ period: p, ...summarizeLogs(p, logs) })).filter((s) => s.pain || s.mood).slice(0, 6);
  const cycle = averageCycle(prediction.intervals);
  const days = prediction.typicalPeriodDays;

  return (
    <>
      <TodayRefresh today={today} />
      <AppHeader user={user} />
      <h1 className="sr-only">리포트</h1>

      <div className="flex gap-2">
        <Stat label="평균 주기" value={cycle ? `${cycle}일` : "—"} />
        <Stat label="평균 기간" value={days ? `${days}일` : "—"} />
        <Stat label="예측 오차" value={accuracy ? errorLabel(accuracy.days) : "—"} />
      </div>

      {periods.length === 0
        ? <p className="mt-6 text-[17px] text-muted">아직 기록이 없어요. 기억나는 지난 시작일부터 넣어 보세요.</p>
        : <PeriodTable rows={reportRows(periods, logs, cycle)} year={today.slice(0, 4)} />}

      <Section title="내 주기">
        {prediction.sampleSize > 0 && prediction.observedMinDays !== prediction.observedMaxDays && (
          <Row label="최근 범위" value={`${prediction.observedMinDays}–${prediction.observedMaxDays}일`} />
        )}
        {range && <Row label="다음 생리 예상" value={range} />}
        {prediction.sampleSize > 0 && (
          <p className="pt-4 text-[13px] leading-relaxed text-muted">
            최근 {prediction.sampleSize}번의 간격({prediction.intervals.map((i) => i.days).join(" · ")}일)으로 계산했어요. 최근 주기일수록 크게 반영해요.
          </p>
        )}
        <PredictionNote error={accuracy} />
        {prediction.outlierIntervals.length > 0 && (
          <div className="pt-6">
            <h3 className="text-[13px] font-medium text-muted">계산에서 뺀 주기</h3>
            {prediction.outlierIntervals.map((i) => <Row key={i.from} label={dayRange(i.from, i.to)} value={`${i.days}일`} />)}
          </div>
        )}
        <UsualCycleForm initial={usual} />
      </Section>

      {summaries.length > 0 && (
        <Section title="지난 생리 요약">
          <ul>
            {summaries.map((s) => (
              <li key={s.period.id} className="border-b border-line py-4">
                <p className="text-[13px] text-muted">{formatDay(s.period.startDate)}</p>
                {s.pain && <p className="mt-1 text-[17px]">{s.pain}</p>}
                {s.mood && <p className="mt-1 text-[15px] text-muted">{s.mood}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <details id="direct" className="mt-16">
        <summary className="cursor-pointer list-none text-sm text-muted underline underline-offset-4">직접 입력</summary>
        <section className="mt-8">
          <h2 className="mb-5 text-sm font-medium text-muted">생리 기록 추가</h2>
          <PeriodForm initial={null} today={today} />
        </section>
      </details>

      {editing && (
        <EditPeriodSheet key={editing.id} title={`${formatDay(editing.startDate)} 기록 수정`}>
          {editing.autoEnded && <p className="mb-3 text-[13px] text-muted">자동으로 끝낸 기록이에요. 날짜를 확인해 주세요.</p>}
          <PeriodForm initial={editing} today={today} />
          <form action={deletePeriodAction} className="mt-4 text-center">
            <input type="hidden" name="id" value={editing.id} />
            <button type="submit" className="h-11 text-sm text-period-ink underline underline-offset-4">이 기록 삭제</button>
          </form>
        </EditPeriodSheet>
      )}
      <Nav role="recorder" active="report" />
    </>
  );
}
