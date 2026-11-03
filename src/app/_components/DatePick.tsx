"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { addMonths, monthGrid, monthLabel, WEEKDAYS } from "@/lib/dates";

const long = (day: string) => `${day.slice(0, 4)}년 ${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`;

/** 날짜 칸. 누르면 바로 아래에 작은 달력이 펼쳐지고, 날짜를 누르면 접힌다. 고르기 전엔 "날짜 고르기". */
export function DatePick({ label, value, onChange, max, min, clearable }: {
  label: string; value: string; onChange: (day: string) => void; max: string; min?: string; clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || max).slice(0, 7));
  const { cells } = monthGrid(month);
  const pick = (day: string) => {
    onChange(day);
    setOpen(false);
  };
  return (
    <div>
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button" aria-expanded={open} onClick={() => setOpen(!open)}
          className={`field flex-1 text-left ${value ? "" : "text-muted"}`}
        >
          {value ? long(value) : "날짜 고르기"}
        </button>
        {clearable && value && <button type="button" className="link h-9 shrink-0 text-[13px]" onClick={() => onChange("")}>지우기</button>}
      </div>
      {open && (
        <div className="mt-2 rounded-2xl border-[0.5px] border-line bg-card p-2">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="이전 달" className="flex h-9 w-9 items-center justify-center text-muted" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="text-[15px]">{monthLabel(month)}</span>
            <button
              type="button" aria-label="다음 달" disabled={addMonths(month, 1) > max.slice(0, 7)}
              className="flex h-9 w-9 items-center justify-center text-muted disabled:opacity-30" onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-muted" aria-hidden>
            {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 place-items-center">
            {cells.map((day, i) => day ? (
              <button
                key={day} type="button" disabled={day > max || (min ? day < min : false)} aria-pressed={day === value}
                aria-label={long(day)} onClick={() => pick(day)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-[14px] disabled:opacity-30 ${day === value ? "bg-period font-medium text-period-ink" : ""}`}
              >
                {Number(day.slice(8))}
              </button>
            ) : <span key={`blank-${i}`} />)}
          </div>
        </div>
      )}
    </div>
  );
}
