"use client";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const LINE_CARD = "card flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-[15px]";

const SWIPE_CLOSE_PX = 80;

/**
 * 시트. dialog라서 포커스, Esc, 뒤 화면 막기를 브라우저가 맡는다.
 * from="bottom"(기본)은 아래에서 올라온다.
 * from="top"은 anchor(헤더의 종) 아래에 떠 있는 카드다: 헤더(52px) 아래 8px·양옆 12px, 네 모서리 16px, 위쪽에 anchor를 가리키는 꼬리.
 *   어두운 배경은 헤더 아래부터만 깐다.
 *   anchor 위치를 축으로 접힌 종이처럼 펼쳐지고(.sheet-drop), 헤더는 어둡게 덮지 않는다. 열린 동안 헤더(종 포함)를 누르면 닫힌다.
 * maxHeight로 높이를 정하고(기본 80dvh, 넘치면 안에서 스크롤), swipeToClose면 나온 쪽으로 쓸어 닫는다
 * (아래 시트는 맨 위까지 스크롤된 상태에서 아래로, 위 카드는 맨 아래까지 스크롤된 상태에서 위로).
 */
export function Sheet({ open, title, onClose, children, maxHeight = "80dvh", swipeToClose, from = "bottom", anchor }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; maxHeight?: string; swipeToClose?: boolean;
  from?: "bottom" | "top"; anchor?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null); // 위 카드는 꼬리가 밖으로 나와야 해서 안쪽 상자가 스크롤된다
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const top = from === "top";
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.focus(); // 첫 버튼이 아니라 시트 자체에 포커스를 둔다
    }
    if (!open) dialog.close();
    if (!open || !top) return;
    // 꼬리와 펼침 축을 종 가운데에 맞춘다. offsetLeft는 펼침 애니메이션(transform)의 영향을 받지 않는다.
    const aim = () => {
      const a = anchor?.current?.getBoundingClientRect();
      if (!a) return;
      const x = Math.min(Math.max(a.left + a.width / 2 - dialog.offsetLeft, 20), dialog.offsetWidth - 20);
      dialog.style.setProperty("--tail-x", `${x}px`);
    };
    aim();
    // 헤더는 어둡게 덮지 않으니, 헤더를 누르면(모달이라 헤더 자체는 눌리지 않는다) 닫는다.
    const outside = (e: PointerEvent) => {
      if (!dialog.contains(e.target as Node) && e.clientY < dialog.getBoundingClientRect().top) closeRef.current();
    };
    window.addEventListener("resize", aim);
    window.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("resize", aim);
      window.removeEventListener("pointerdown", outside, true);
    };
  }, [open, top, anchor]);

  // 나온 쪽으로 끄는 동작만 시트를 끌어간다. 반대 방향이나 스크롤 중간에서는 평소처럼 스크롤된다.
  const scrollBox = () => (top ? scroller.current : ref.current);
  const atEdge = (d: HTMLElement) => (top ? d.scrollTop + d.clientHeight >= d.scrollHeight - 1 : d.scrollTop <= 0);
  const swipe = swipeToClose ? {
    onTouchStart: (e: React.TouchEvent) => {
      const box = scrollBox();
      drag.current = box && atEdge(box) ? { startY: e.touches[0].clientY, dy: 0 } : null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!drag.current || !ref.current) return;
      const dy = e.touches[0].clientY - drag.current.startY;
      drag.current.dy = top ? Math.min(0, dy) : Math.max(0, dy);
      // transform은 펼치기 애니메이션이 쥐고 있어서, 끌기는 따로 노는 translate로 움직인다
      ref.current.style.translate = drag.current.dy ? `0 ${drag.current.dy}px` : "";
    },
    onTouchEnd: () => {
      const moved = Math.abs(drag.current?.dy ?? 0);
      drag.current = null;
      if (ref.current) ref.current.style.translate = "";
      if (moved > SWIPE_CLOSE_PX) onClose();
    },
  } : {};

  const body = (
    <div className={`px-6 ${top ? "pb-4 pt-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-xl font-medium">{title}</h2>
        <button type="button" aria-label="닫기" onClick={onClose} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted"><X size={20} aria-hidden /></button>
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );

  if (top) {
    return (
      <dialog
        ref={ref} aria-label={title} onClose={onClose} tabIndex={-1} {...swipe}
        onClick={(e) => { if (e.target === ref.current) onClose(); }}
        className="sheet-drop fixed inset-x-3 top-[calc(52px+env(safe-area-inset-top)+8px)] bottom-auto m-0 mx-auto w-auto max-w-md overflow-visible rounded-2xl bg-paper text-ink shadow-[0_12px_30px_rgb(63_58_61/0.18)] outline-none backdrop:top-[calc(52px+env(safe-area-inset-top))] backdrop:bg-ink/30"
      >
        {/* 종을 가리키는 꼬리. 카드와 같은 색의 작은 삼각형(돌린 네모의 위쪽 반). */}
        <span aria-hidden className="pointer-events-none absolute -top-[6px] left-[var(--tail-x,calc(100%-2.25rem))] h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-tl-[3px] bg-paper" />
        <div ref={scroller} className="relative overflow-y-auto overscroll-contain rounded-2xl" style={{ maxHeight }}>{body}</div>
      </dialog>
    );
  }
  return (
    <dialog
      ref={ref} aria-label={title} onClose={onClose} tabIndex={-1} style={{ maxHeight }} {...swipe}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[18px] bg-paper text-ink outline-none backdrop:bg-ink/30"
    >
      {body}
    </dialog>
  );
}

/** 상단의 한 줄 카드. 누르면 시트가 열린다. */
export function LineSheet({ title, summary, icon, chip, children }: { title: string; summary: string; icon?: React.ReactNode; chip?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={LINE_CARD} onClick={() => setOpen(true)}>
        {icon}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {chip}
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </button>
      <Sheet open={open} title={title} onClose={() => setOpen(false)}>{children}</Sheet>
    </>
  );
}
