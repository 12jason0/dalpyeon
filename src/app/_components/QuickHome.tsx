"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { MOODS, PAINS, type DayLog, type Mood, type Pain } from "@/lib/daylog";
import { clearCareAction, respondAction, saveCareAction, saveDayLogAction } from "../actions";
import { ErrorText } from "./Submit";

const PILL = "flex h-10 items-center justify-center rounded-full border border-line text-[15px] text-muted transition";
const PICKED = "border-accent bg-accent font-semibold text-white";
const FAILED = "저장하지 못했어요. 다시 시도해 주세요";
const FIRST_CHIPS = 6;

/** 생리 중인 오늘의 통증·기분. 누르면 바로 저장한다. 실패하면 마지막으로 저장된 값으로 돌아간다. */
export function QuickLog({ day, initial }: { day: string; initial: DayLog | null }) {
  const [pain, setPain] = useState<Pain | null>(initial?.pain ?? null);
  const [moods, setMoods] = useState<Mood[]>(initial?.moods ?? []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const last = useRef({ pain, moods });

  const save = (nextPain: Pain | null, nextMoods: Mood[]) => {
    setPain(nextPain);
    setMoods(nextMoods);
    setSaved(false);
    setError(undefined);
    start(async () => {
      const form = new FormData();
      form.set("day", day);
      if (nextPain) form.set("pain", nextPain);
      nextMoods.forEach((m) => form.append("moods", m));
      const result = await saveDayLogAction(null, form).catch(() => ({ error: FAILED }));
      if (result?.error) {
        setPain(last.current.pain);
        setMoods(last.current.moods);
        setError(result.error);
        return;
      }
      last.current = { pain: nextPain, moods: nextMoods };
      setSaved(true);
    });
  };

  return (
    <section className="card">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-muted">오늘 통증</h2>
        <p role="status" className="text-[12px] text-muted">{saved && "저장됐어요"}</p>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {(Object.entries(PAINS) as [Pain, string][]).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={pain === key} className={`${PILL} ${pain === key ? PICKED : ""}`} onClick={() => save(pain === key ? null : key, moods)}>
            {label}
          </button>
        ))}
      </div>
      <h2 className="mt-3 text-[13px] font-medium text-muted">오늘 기분</h2>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
        {(Object.entries(MOODS) as [Mood, string][]).map(([key, label]) => {
          const on = moods.includes(key);
          return (
            <button
              key={key} type="button" aria-pressed={on} className={`${PILL} ${on ? PICKED : ""}`}
              onClick={() => save(pain, on ? moods.filter((m) => m !== key) : [...moods, key])}
            >
              {label}
            </button>
          );
        })}
      </div>
      <ErrorText message={error} />
    </section>
  );
}

type Care = { presets: string[]; message: string | null; shareWithPartner: boolean };

/** 오늘 필요한 배려. 항목을 누르면 바로 보내고, 다시 누르면 뺀다. 나만 보게 둔 요청은 그대로 나만 본다. 처음엔 6개와 고른 칩만 보인다. */
export function QuickCare({ presets, current, canShare, status, more }: {
  presets: Record<string, string>; current: Care | null; canShare: boolean; status: React.ReactNode; more: React.ReactNode;
}) {
  const [picked, setPicked] = useState(current?.presets ?? []);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(current?.message ?? "");
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const known = Object.entries(presets);
  const unknown = (current?.presets ?? []).filter((key) => !(key in presets)).map((key) => [key, key]);
  const chips = [...known, ...unknown];
  const shown = chips.filter(([key], i) => expanded || i < FIRST_CHIPS || picked.includes(key));

  const send = (nextPicked: string[], nextMessage: string) => {
    setPicked(nextPicked);
    setError(undefined);
    start(async () => {
      if (!nextPicked.length && !nextMessage.trim()) {
        await clearCareAction().catch(() => setError(FAILED));
        return;
      }
      const form = new FormData();
      nextPicked.forEach((p) => form.append("presets", p));
      form.set("message", nextMessage);
      if (canShare && (current ? current.shareWithPartner : true)) form.set("share", "on");
      const result = await saveCareAction(null, form).catch(() => ({ error: FAILED }));
      if (result?.error) {
        setPicked(current?.presets ?? []);
        setError(result.error);
      }
    });
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-muted">오늘 필요한 배려</h2>
        {status}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map(([key, label]) => {
          const on = picked.includes(key);
          return (
            <button
              key={key} type="button" aria-pressed={on} className={`${PILL} px-3 font-hand text-[16px] ${on ? PICKED : ""}`}
              onClick={() => send(on ? picked.filter((p) => p !== key) : [...picked, key], message)}
            >
              {label}
            </button>
          );
        })}
        {shown.length < chips.length && <button type="button" className="link h-10 px-1 text-[13px]" onClick={() => setExpanded(true)}>더보기</button>}
      </div>
      {current?.message && !adding && <p className="mt-2 text-[15px] leading-relaxed">“{current.message}”</p>}
      {adding && (
        <form className="mt-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(picked, message); }}>
          <input aria-label="한마디" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="한마디 적기" className="field min-w-0 flex-1" autoFocus />
          <button type="submit" disabled={pending} className="h-10 shrink-0 rounded-full bg-accent px-4 text-[15px] font-semibold text-white disabled:opacity-40">보내기</button>
        </form>
      )}
      <ErrorText message={error} />
      <div className="mt-1 flex items-center gap-5 text-[13px]">
        {!adding && <button type="button" className="link h-9" onClick={() => setAdding(true)}>{current?.message ? "한마디 고치기" : "한마디 추가"}</button>}
        {more}
      </div>
    </section>
  );
}

/** 파트너의 답장. 누르면 바로 저장되고, 실패하면 화면이 원래대로 돌아간다. */
export function CareReplies({ careId, current, responses, readOnly }: { careId: string; current: string | null; responses: Record<string, string>; readOnly?: boolean }) {
  const [shown, show] = useOptimistic(current);
  const [, start] = useTransition();
  const reply = (key: string) => start(async () => {
    show(key);
    const form = new FormData();
    form.set("careId", careId);
    form.set("response", key);
    await respondAction(form);
  });
  return (
    <div className="mt-3 flex gap-2">
      {Object.entries(responses).map(([key, label]) => (
        <button
          key={key} type="button" aria-pressed={shown === key} onClick={readOnly ? undefined : () => reply(key)}
          className={`h-11 flex-1 rounded-full border text-[15px] transition ${shown === key ? "border-accent bg-accent font-semibold text-white" : "border-line text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
