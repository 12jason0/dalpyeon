"use client";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const LINE_CARD = "card flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-[15px]";

/** 아래에서 올라오는 시트. dialog라서 포커스, Esc, 뒤 화면 막기를 브라우저가 맡는다. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) {
      ref.current?.showModal();
      ref.current?.focus(); // 첫 버튼이 아니라 시트 자체에 포커스를 둔다
    }
    if (!open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref} aria-label={title} onClose={onClose} tabIndex={-1}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-[18px] bg-paper text-ink outline-none backdrop:bg-ink/30"
    >
      <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-xl font-medium">{title}</h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted"><X size={20} aria-hidden /></button>
        </div>
        {open && <div className="mt-3">{children}</div>}
      </div>
    </dialog>
  );
}

/** 상단의 한 줄 카드. 누르면 시트가 열린다. */
export function LineSheet({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={LINE_CARD} onClick={() => setOpen(true)}>
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </button>
      <Sheet open={open} title={title} onClose={() => setOpen(false)}>{children}</Sheet>
    </>
  );
}
