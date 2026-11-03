"use client";
import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { saveNicknameAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";
import { BTN, BTN_LINE } from "./ui";

function NameForm({ name, onDone }: { name: string; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await saveNicknameAction(prev, form);
    if (result?.ok) onDone();
    return result;
  }, null);
  return (
    <form action={action}>
      <input name="nickname" aria-label="이름" className="field" defaultValue={name} maxLength={20} required autoFocus />
      <ErrorText message={state?.error} />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDone} className={BTN_LINE}>취소</button>
        <Submit className={BTN}>저장</Submit>
      </div>
    </form>
  );
}

/** 마이의 내 이름. 연필을 누르면 그 자리에서 고친다. */
export function NameEdit({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <NameForm name={name} onDone={() => setEditing(false)} />;
  return (
    <div className="flex items-center gap-1">
      <p className="min-w-0 text-xl font-medium tracking-tight">{name}</p>
      <button type="button" aria-label="이름 수정" onClick={() => setEditing(true)} className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted">
        <Pencil size={16} aria-hidden />
      </button>
    </div>
  );
}
