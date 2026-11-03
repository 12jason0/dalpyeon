"use client";
import { useRef, useState, useTransition } from "react";
import { MOODS, PAINS, type DayLog, type Mood, type Pain } from "@/lib/daylog";
import type { TodayNotes } from "@/lib/services/notes";
import { clearCareAction, saveCareAction, saveDayLogAction, sendNoteAction } from "../actions";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorText } from "./Submit";
import { btn, chip } from "./ui";

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
          <button key={key} type="button" aria-pressed={pain === key} className={chip(pain === key, false)} onClick={() => save(pain === key ? null : key, moods)}>
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
              key={key} type="button" aria-pressed={on} className={chip(on, false)}
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

/**
 * 오늘 필요한 배려. 항목을 누르면 바로 보내고, 다시 누르면 뺀다. 처음엔 6개와 고른 칩만 보인다.
 * 연결돼 있을 때만(canShare) "나만 보기" 스위치와 "지우기"가 있다. 스위치를 켜면 파트너에게 보내지 않고 나만 저장한다.
 * 연결 전·잠시 멈추기 중에는 어차피 파트너에게 가지 않으므로 둘 다 숨긴다.
 */
export function QuickCare({ presets, current, canShare, status, seenBy }: {
  presets: Record<string, string>; current: Care | null; canShare: boolean; status: React.ReactNode; seenBy?: string | null;
}) {
  const [picked, setPicked] = useState(current?.presets ?? []);
  const [privateOnly, setPrivateOnly] = useState(current ? !current.shareWithPartner : false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(current?.message ?? "");
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const known = Object.entries(presets);
  const unknown = (current?.presets ?? []).filter((key) => !(key in presets)).map((key) => [key, key]);
  const chips = [...known, ...unknown];
  const shown = chips.filter(([key], i) => expanded || i < FIRST_CHIPS || picked.includes(key));

  const send = (nextPicked: string[], nextMessage: string, share = canShare && !privateOnly) => {
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
      if (share) form.set("share", "on");
      const result = await saveCareAction(null, form).catch(() => ({ error: FAILED }));
      if (result?.error) {
        setPicked(current?.presets ?? []);
        setError(result.error);
      }
    });
  };

  // 이미 저장된 요청이 있으면 스위치를 바꾸는 즉시 공유 여부만 바꿔 저장한다. 없으면 다음에 고를 때 적용된다.
  const togglePrivate = (on: boolean) => {
    setPrivateOnly(on);
    if (current) send(picked, current.message ?? "", !on);
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-muted">오늘 필요한 배려{seenBy && ` · ${seenBy}님이 봤어요`}</h2>
        {status}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map(([key, label]) => {
          const on = picked.includes(key);
          return (
            <button
              key={key} type="button" aria-pressed={on} className={chip(on)}
              onClick={() => send(on ? picked.filter((p) => p !== key) : [...picked, key], message)}
            >
              {label}
            </button>
          );
        })}
        {shown.length < chips.length && <button type="button" className="link h-9 px-1 text-[13px]" onClick={() => setExpanded(true)}>더보기</button>}
      </div>
      {current?.message && !adding && <p className="mt-2 text-[15px] leading-relaxed">“{current.message}”</p>}
      {adding && (
        <form className="mt-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(picked, message); }}>
          <input aria-label="한마디" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="한마디 적기" className="field min-w-0 flex-1" autoFocus />
          <button type="submit" disabled={pending} className={`${btn("line", true)} shrink-0 px-4`}>보내기</button>
        </form>
      )}
      <ErrorText message={error} />
      <div className="mt-1 flex items-center gap-4 text-[13px]">
        {!adding && <button type="button" className="link h-9" onClick={() => setAdding(true)}>{current?.message ? "한마디 고치기" : "한마디 추가"}</button>}
        {canShare && (
          <label className="flex h-9 cursor-pointer items-center gap-1.5 text-muted">
            나만 보기
            <input
              type="checkbox" role="switch" className="switch origin-left scale-75" checked={privateOnly} disabled={pending}
              onChange={(e) => togglePrivate(e.target.checked)}
            />
          </label>
        )}
        {canShare && current && (
          <span className="ml-auto">
            <ConfirmButton
              label="지우기" className="link h-9" title="오늘 배려 요청을 지울까요?" confirmLabel="지우기" danger
              action={clearCareAction}
            />
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * 오늘의 쪽지. 예시를 누르면 바로 보내지 않고 입력칸에 채운다.
 * 쪽지가 없으면 안내 한 줄과 예시 3개, 있으면 말풍선(상대 왼쪽 회색, 나 오른쪽 연분홍). 상대 쪽지를 받았으면 입력칸 위에 답장 예시 2개.
 */
export function NoteCard({ today, hint, examples, max }: { today: TodayNotes; hint: string; examples: string[]; max: number }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const { notes, left, received } = today;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const form = new FormData();
      form.set("body", text);
      const result = await sendNoteAction(null, form).catch(() => ({ error: FAILED }));
      if (result?.error) setError(result.error);
      else setText("");
    });
  };
  const example = (t: string, small = false) => (
    <button
      key={t} type="button" onClick={() => setText(t)}
      className={small ? "h-8 rounded-full bg-period/30 px-3 text-[13px]" : "w-full rounded-xl bg-period/30 px-3 py-2 text-left text-[15px] leading-snug"}
    >
      {t}
    </button>
  );

  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-medium text-muted">오늘의 쪽지</h2>
        <p className="text-[12px] text-muted">남은 쪽지 {left}장</p>
      </div>
      {notes.length === 0 ? (
        <>
          <p className="mt-1.5 text-[15px] leading-snug">{hint}</p>
          <div className="mt-2 space-y-1.5">{examples.map((t) => example(t))}</div>
        </>
      ) : (
        <ul className="mt-2 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={`flex flex-col ${n.mine ? "items-end" : "items-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${n.mine ? "rounded-br-md bg-period/60" : "rounded-bl-md bg-line"}`}>{n.body}</p>
              <p className="mt-0.5 px-1 text-[12px] text-muted">{n.name} · {n.time}</p>
            </li>
          ))}
        </ul>
      )}
      {left > 0 ? (
        <>
          {notes.length > 0 && received && <div className="mt-3 flex flex-wrap gap-1.5">{examples.slice(0, 2).map((t) => example(t, true))}</div>}
          <form onSubmit={send} className="mt-2 flex items-end gap-2">
            <label className="relative min-w-0 flex-1">
              <input
                aria-label="쪽지" value={text} maxLength={max} onChange={(e) => setText(e.target.value)}
                className="field pr-12"
              />
              <span aria-hidden className="absolute bottom-3 right-0 text-[12px] text-muted">{text.length}/{max}</span>
            </label>
            <button type="submit" disabled={pending || !text.trim()} className={`${btn("primary", true)} shrink-0 px-4`}>보내기</button>
          </form>
          <ErrorText message={error} />
        </>
      ) : (
        <p className="mt-3 text-[15px] text-muted">오늘 쪽지를 다 썼어요</p>
      )}
    </section>
  );
}
