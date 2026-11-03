"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { ErrorText } from "./Submit";
import { btn } from "./ui";

type Confirm = {
  label: string;
  className: string;
  title: string;
  note?: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => Promise<{ error?: string } | null | void>;
};

/** 누르면 확인 창이 뜨는 버튼. 처리하는 동안에는 닫히지 않고 두 번 눌리지 않는다. */
export function ConfirmButton({ label, className, title, note, confirmLabel, danger, action }: Confirm) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const sent = useRef(false); // 화면이 비활성으로 바뀌기 전의 두 번째 클릭까지 막는다

  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open) ref.current?.close();
  }, [open]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(undefined);
  };
  const confirm = () => {
    if (sent.current) return;
    sent.current = true;
    start(async () => {
      try {
        const result = await action();
        if (result?.error) setError(result.error);
        else setOpen(false);
      } catch {
        setError("문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      }
      sent.current = false;
    });
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      <dialog
        ref={ref} aria-label={title} onClose={close}
        onCancel={(e) => { if (pending) e.preventDefault(); }}
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[calc(100%-3rem)] max-w-sm rounded-[18px] bg-paper text-ink outline-none backdrop:bg-ink/30"
      >
        <div className="p-6">
          <h2 className="text-[17px] font-medium leading-snug tracking-tight">{title}</h2>
          {note && <p className="mt-2 text-[13px] leading-relaxed text-muted">{note}</p>}
          <ErrorText message={error} />
          <div className="mt-6 flex gap-2">
            <button type="button" disabled={pending} onClick={close} className={`${btn("line", true)} flex-1`}>취소</button>
            <button
              type="button" disabled={pending} onClick={confirm}
              className={`${btn(danger ? "danger" : "primary", true)} flex-1`}
            >
              {pending ? "잠시만요…" : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
