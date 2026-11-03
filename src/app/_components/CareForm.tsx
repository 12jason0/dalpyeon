"use client";
import { useActionState } from "react";
import { clearCareAction, saveCareAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

type Props = {
  presets: Record<string, string>;
  current: { presets: string[]; message: string | null; shareWithPartner: boolean } | null;
  canShare: boolean;
};

export function CareForm({ presets, current, canShare }: Props) {
  const [state, action] = useActionState<FormState, FormData>(saveCareAction, null);
  return (
    <form action={action}>
      <ul>
        {Object.entries(presets).map(([key, label]) => (
          <li key={key}>
            <label className="flex cursor-pointer items-center justify-between border-b border-line py-4 text-[17px] text-muted has-[:checked]:text-ink has-[:checked]:font-medium">
              {label}
              <input type="checkbox" name="presets" value={key} defaultChecked={current?.presets.includes(key)} className="peer sr-only" />
              <span aria-hidden className="text-lg text-transparent peer-checked:text-ink">✓</span>
            </label>
          </li>
        ))}
      </ul>
      <input
        name="message"
        maxLength={300}
        defaultValue={state?.values?.message ?? current?.message ?? ""}
        placeholder="직접 한마디 (선택)"
        className="field mt-2"
      />
      {canShare && (
        <label className="mt-6 flex items-center justify-between gap-4">
          <span className="text-[15px]">파트너에게 보내기</span>
          <input type="checkbox" name="share" className="switch" defaultChecked={current ? current.shareWithPartner : true} />
        </label>
      )}
      <ErrorText message={state?.error} />
      <div className="mt-8 flex items-center gap-4">
        <Submit>{current ? "바꾸기" : "남기기"}</Submit>
        {current && (
          <button formAction={clearCareAction} className="shrink-0 px-2 text-sm link" type="submit">
            지우기
          </button>
        )}
      </div>
    </form>
  );
}
