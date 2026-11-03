"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { monthDay } from "@/lib/dates";
import { barWidth, PAIN_DOTS, signed, type ReportRow } from "@/lib/report";
import { savePeriodAction } from "../actions";
import { DatePick } from "./DatePick";
import { Sheet } from "./Sheet";
import { ErrorText } from "./Submit";
import { BTN } from "./ui";

const PAGE = 10;
const TOAST_MS = 2000;
// 통증 기록이 하나도 없으면 통증 칸째 숨긴다
const columns = (pain: boolean) =>
  `grid items-center gap-x-1.5 ${pain ? "grid-cols-[58px_minmax(0,1fr)_62px_34px]" : "grid-cols-[58px_minmax(0,1fr)_62px]"}`;

function Period({ row }: { row: ReportRow }) {
  if (row.days === null) return <span className="justify-self-start rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">진행 중</span>;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className={`h-1.5 rounded-full ${row.excluded ? "bg-muted/40" : "bg-accent"}`} style={{ width: barWidth(row.days) }} aria-hidden />
      {row.days}일
      {row.autoEnded && <span className="text-[11px] text-muted">자동</span>}
    </span>
  );
}

function PainDots({ row }: { row: ReportRow }) {
  if (!row.pain) return <>—</>;
  const on = row.excluded ? "bg-muted/40" : "bg-accent";
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: PAIN_DOTS }, (_, i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < row.pain!.dots ? on : "bg-line"}`} />)}
    </span>
  );
}

function rowLabel(row: ReportRow) {
  return [
    `${row.startDate.slice(0, 4)}년 ${monthDay(row.startDate)} 시작`,
    row.days === null ? "진행 중" : `기간 ${row.days}일`,
    row.autoEnded && "자동으로 끝낸 기록",
    row.cycle !== null && `주기 ${row.cycle}일`,
    row.excluded && "예측 제외",
    row.pain && `가장 심한 통증 ${row.pain.label}`,
    "수정하기",
  ].filter(Boolean).join(", ");
}

/** "+ 추가" 시트의 내용. 시트를 열 때마다 새로 그려져 빈 칸으로 시작한다. */
function AddPeriodForm({ today, onSaved }: { today: string; onSaved: () => void }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, run] = useTransition();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start) return setError("시작일을 골라 주세요");
    if (end && end < start) return setError("끝난 날이 시작일보다 빨라요");
    setError(undefined);
    run(async () => {
      const form = new FormData();
      form.set("startDate", start);
      if (end) form.set("endDate", end);
      if (excluded) form.set("excluded", "on");
      const result = await savePeriodAction(null, form).catch(() => ({ error: "저장하지 못했어요. 다시 시도해 주세요" }));
      if (result?.error) setError(result.error);
      else onSaved();
    });
  };
  return (
    <form onSubmit={save} className="space-y-5">
      <DatePick label="시작일" value={start} onChange={setStart} max={today} />
      <DatePick label="종료일 (선택)" value={end} onChange={setEnd} max={today} min={start || undefined} clearable />
      <label className="flex items-center justify-between gap-4">
        <span className="text-[15px]">
          예측에서 빼기
          <span className="mt-1 block text-[13px] text-muted">약 복용·아팠던 달처럼 평소와 다른 기록</span>
        </span>
        <input type="checkbox" className="switch" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />
      </label>
      <ErrorText message={error} />
      <div className="flex justify-center pt-1">
        <button type="submit" disabled={pending} className={BTN}>{pending ? "잠시만요…" : "저장"}</button>
      </div>
    </form>
  );
}

/** 기록 카드. 최근 기록부터 10개씩 보이고, 줄을 누르면 그 기록의 수정 시트가 열린다. "+ 추가"는 아래에서 올라오는 시트. */
export function PeriodTable({ rows, year, today }: { rows: ReportRow[]; year: string; today: string }) {
  const [shown, setShown] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasPain = rows.some((r) => r.pain);
  const cols = columns(hasPain);
  // 저장되면 시트를 닫고 2초 토스트. 표는 서버 액션의 refresh로 바로 바뀐다.
  const saved = () => {
    setAdding(false);
    setToast(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(false), TOAST_MS);
  };
  return (
    <section aria-labelledby="records-title" className="card mt-3">
      <div className="flex items-center justify-between pb-1">
        <h2 id="records-title" className="text-[13px] font-medium text-muted">기록</h2>
        <button type="button" onClick={() => setAdding(true)} className="-mr-1 inline-flex h-8 items-center gap-0.5 rounded-full border border-line px-3 text-[13px] font-medium">
          <Plus size={14} aria-hidden />추가
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-[15px] text-muted">아직 기록이 없어요. 기억나는 지난 시작일부터 넣어 보세요.</p>
      ) : (
        <>
          <div className={`${cols} pb-1.5 text-[11px] text-muted`} aria-hidden>
            <span>시작일</span><span>기간</span><span>주기</span>{hasPain && <span>통증</span>}
          </div>
          <ul>
            {rows.slice(0, shown).map((row) => (
              <li key={row.id} className="border-t border-line">
                <Link
                  href={`/report?edit=${row.id}`} scroll={false} aria-label={rowLabel(row)}
                  className={`${cols} min-h-12 py-2 text-[13px] ${row.excluded ? "opacity-50" : ""}`}
                >
                  <span className="font-medium">
                    {row.startDate.slice(0, 4) !== year && <span className="block text-[11px]">{row.startDate.slice(0, 4)}년</span>}
                    {monthDay(row.startDate)}
                  </span>
                  <Period row={row} />
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    {row.cycle === null ? "—" : `${row.cycle}일`}
                    {row.diff !== null && <span className="text-[11px] text-muted">{signed(row.diff)}</span>}
                    {row.excluded && <span className="rounded-full bg-line px-1.5 text-[11px] text-muted">제외</span>}
                  </span>
                  {hasPain && <PainDots row={row} />}
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > shown && (
            <button type="button" onClick={() => setShown(shown + PAGE)} className="link h-10 w-full border-t border-line text-[13px]">더보기</button>
          )}
        </>
      )}
      <Sheet open={adding} title="지난 기록 추가" onClose={() => setAdding(false)}>
        <AddPeriodForm today={today} onSaved={saved} />
      </Sheet>
      <p role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+82px)] z-40 flex justify-center">
        {toast && <span className="rounded-full bg-ink/85 px-4 py-2 text-[14px] text-white">저장했어요</span>}
      </p>
    </section>
  );
}

/** 주소의 edit로 열린 수정 시트. 저장하거나 지우면 서버가 /report로 돌려보내 닫힌다. */
export function EditPeriodSheet({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return <Sheet open title={title} onClose={() => router.replace("/report", { scroll: false })}>{children}</Sheet>;
}
