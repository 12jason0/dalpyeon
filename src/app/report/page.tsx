import { getDb } from "@/lib/db";
import { formatDay, todaySeoul } from "@/lib/dates";
import { summarizeLogs } from "@/lib/daylog";
import { estimate } from "@/lib/prediction";
import { averageCycle, cycleCheck, reportRows, type CheckTone, type CycleCheck } from "@/lib/report";
import { listDayLogs } from "@/lib/services/daylogs";
import { listPeriods } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { deletePeriodAction } from "../actions";
import { AppHeader } from "../_components/AppHeader";
import { Nav } from "../_components/Nav";
import { PeriodForm } from "../_components/PeriodForm";
import { EditPeriodSheet, PeriodTable } from "../_components/PeriodTable";
import { TodayRefresh } from "../_components/TodayRefresh";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card min-w-0 flex-1 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-medium tracking-tight">{value}</p>
    </div>
  );
}

/** 11/23~27, 달이 바뀌면 11/30~12/4, 하루뿐이면 11/23. */
function shortRange(start: string, end: string) {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  if (start === end) return md(start);
  return `${md(start)}~${start.slice(0, 7) === end.slice(0, 7) ? Number(end.slice(8)) : md(end)}`;
}

// 보통 범위는 연한 초록, 범위 밖은 연한 주황, 기록 부족은 연회색
const TONE: Record<CheckTone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  out: "bg-orange-50 text-orange-700",
  wait: "bg-line text-muted",
};

function CheckCard({ check }: { check: CycleCheck }) {
  return (
    <section aria-labelledby="check-title" className="card mt-3">
      <div className="flex items-baseline justify-between">
        <h2 id="check-title" className="text-[13px] font-medium text-muted">주기 체크</h2>
        <p className="text-[12px] text-muted">기록 {check.basis}번 기준</p>
      </div>
      <ul className="mt-1">
        {check.lines.map((l) => (
          <li key={l.label} className="flex min-h-11 items-center justify-between gap-3 border-t border-line py-1.5 first:border-t-0">
            <span className="text-[15px]">
              {l.label}
              {l.value && <span className="ml-1.5 text-[13px] text-muted">{l.value}</span>}
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${TONE[l.tone]}`}>{l.chip}</span>
          </li>
        ))}
      </ul>
      {check.suggestVisit && <p className="mt-1 border-t border-line pt-2.5 text-[13px] leading-relaxed">계속 이러면 진료를 받아보는 것도 좋아요</p>}
    </section>
  );
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser("recorder");
  const params = await searchParams;
  const today = todaySeoul();

  const db = await getDb();
  const usual = user.usualCycleDays; // 세션 조회에서 함께 읽었다
  const [periods, logs] = await Promise.all([listPeriods(db, user.id), listDayLogs(db, user.id)]);
  const prediction = estimate(periods, [], today, usual);
  const editing = periods.find((p) => p.id === params.edit) ?? null;
  const summaries = [...periods].reverse().filter((p) => p.endDate)
    .map((p) => ({ period: p, ...summarizeLogs(p, logs) })).filter((s) => s.pain || s.mood).slice(0, 6);
  const cycle = averageCycle(prediction.intervals);
  const days = prediction.typicalPeriodDays;
  const next = prediction.period;

  return (
    <>
      <TodayRefresh today={today} />
      <AppHeader user={user} />
      <h1 className="sr-only">리포트</h1>

      <div className="flex gap-2">
        <Stat label="평균 주기" value={cycle ? `${cycle}일` : "—"} />
        <Stat label="평균 기간" value={days ? `${days}일` : "—"} />
        <Stat label="다음 생리" value={next ? shortRange(next.earliestStart, next.latestStart) : "—"} />
      </div>

      <CheckCard check={cycleCheck(periods)} />
      <PeriodTable rows={reportRows(periods, logs, cycle)} year={today.slice(0, 4)} today={today} />

      {summaries.length > 0 && (
        <section aria-labelledby="summary-title" className="card mt-3">
          <h2 id="summary-title" className="text-[13px] font-medium text-muted">지난 생리 요약</h2>
          <ul>
            {summaries.map((s) => (
              <li key={s.period.id} className="border-t border-line py-3 first:border-t-0">
                <p className="text-[13px] text-muted">{formatDay(s.period.startDate)}</p>
                {s.pain && <p className="mt-1 text-[15px]">{s.pain}</p>}
                {s.mood && <p className="mt-0.5 text-[15px] text-muted">{s.mood}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
