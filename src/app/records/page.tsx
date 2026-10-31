import Link from "next/link";
import { getDb } from "@/lib/db";
import { diffDays, formatDay, shortDay, todaySeoul } from "@/lib/dates";
import { estimate } from "@/lib/prediction";
import { listPeriods } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { deletePeriodAction } from "../actions";
import { Nav } from "../_components/Nav";
import { PeriodForm } from "../_components/PeriodForm";
import { Row, Section } from "../_components/Section";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser("recorder");
  const { edit } = await searchParams;
  const today = todaySeoul();
  const periods = await listPeriods(await getDb(), user.id);
  const prediction = estimate(periods, [], today);
  const editing = periods.find((p) => p.id === edit) ?? null;

  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">기록</h1>

      <section className="mt-10">
        <h2 className="mb-5 text-sm font-medium text-muted">{editing ? `${formatDay(editing.startDate)} 기록 수정` : "생리 기록 추가"}</h2>
        <PeriodForm initial={editing} today={today} />
        {editing && (
          <form action={deletePeriodAction} className="mt-6 text-center">
            <input type="hidden" name="id" value={editing.id} />
            <button type="submit" className="text-sm text-period underline underline-offset-4">이 기록 삭제</button>
          </form>
        )}
      </section>

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

      <Section title={`지난 기록 ${periods.length}번`}>
        {periods.length === 0 && <p className="text-[17px] text-muted">아직 기록이 없어요. 기억나는 지난 시작일부터 넣어 보세요.</p>}
        <ul>
          {[...periods].reverse().map((p) => (
            <li key={p.id}>
              <Link href={`/records?edit=${p.id}`} className="flex items-baseline justify-between border-b border-line py-4">
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
      <Nav role="recorder" active="records" />
    </>
  );
}
