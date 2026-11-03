"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { monthDay } from "@/lib/dates";
import { barWidth, PAIN_DOTS, signed, type ReportRow } from "@/lib/report";
import { Sheet } from "./Sheet";

const PAGE = 10;
const COLUMNS = "grid grid-cols-[58px_minmax(0,1fr)_62px_34px] items-center gap-x-1.5";

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

/** 지난 기록 표. 최근 기록부터 10개씩 보이고, 줄을 누르면 그 기록의 수정 시트가 열린다. */
export function PeriodTable({ rows, year }: { rows: ReportRow[]; year: string }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <section aria-label="지난 기록" className="card mt-3">
      <div className={`${COLUMNS} pb-1.5 text-[11px] text-muted`} aria-hidden>
        <span>시작일</span><span>기간</span><span>주기</span><span>통증</span>
      </div>
      <ul>
        {rows.slice(0, shown).map((row) => (
          <li key={row.id} className="border-t border-line">
            <Link
              href={`/report?edit=${row.id}`} scroll={false} aria-label={rowLabel(row)}
              className={`${COLUMNS} min-h-12 py-2 text-[13px] ${row.excluded ? "text-muted/70" : ""}`}
            >
              <span className="font-medium">
                {row.startDate.slice(0, 4) !== year && <span className="block text-[11px]">{row.startDate.slice(0, 4)}년</span>}
                {monthDay(row.startDate)}
              </span>
              <Period row={row} />
              <span className="whitespace-nowrap">
                {row.cycle === null ? "—" : `${row.cycle}일`}
                {row.diff !== null && <span className="ml-1 text-[11px] text-muted">{signed(row.diff)}</span>}
                {row.excluded && <span className="ml-1 text-[11px]">제외</span>}
              </span>
              <PainDots row={row} />
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="link h-10 w-full border-t border-line text-[13px]">더보기</button>
      )}
    </section>
  );
}

/** 주소의 edit로 열린 수정 시트. 저장하거나 지우면 서버가 /report로 돌려보내 닫힌다. */
export function EditPeriodSheet({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return <Sheet open title={title} onClose={() => router.replace("/report", { scroll: false })}>{children}</Sheet>;
}
