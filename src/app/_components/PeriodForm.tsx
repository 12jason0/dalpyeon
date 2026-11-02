"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { savePeriodAction, saveUsualCycleAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

type Initial = { id: string; startDate: string; endDate: string | null; excluded: boolean; excludeReason: string | null } | null;

/** 기록이 적을 때 예측에 섞는 평소 주기. 비워 두고 저장하면 지운다. */
export function UsualCycleForm({ initial }: { initial: number | null }) {
  const [state, action] = useActionState<FormState, FormData>(saveUsualCycleAction, null);
  return (
    <form action={action} className="mt-6">
      <label className="block">
        <span className="text-sm text-muted">평소 주기 (21~45일, 비워 둬도 돼요)</span>
        <input type="number" name="usualCycle" className="field" min={21} max={45} inputMode="numeric" defaultValue={initial ?? ""} />
      </label>
      <ErrorText message={state?.error} />
      {state?.ok && <p className="mt-3 text-sm text-muted">저장했어요.</p>}
      <div className="mt-4"><Submit>평소 주기 저장</Submit></div>
    </form>
  );
}

export function PeriodForm({ initial, today }: { initial: Initial; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(savePeriodAction, null);
  const [excluded, setExcluded] = useState(initial?.excluded ?? false);
  return (
    <form action={action} className="space-y-6" key={initial?.id ?? "new"}>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-2 gap-6">
        <label className="block">
          <span className="text-sm text-muted">시작일</span>
          <input type="date" name="startDate" className="field" max={today} required defaultValue={state?.values?.startDate ?? initial?.startDate ?? ""} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">종료일 (선택)</span>
          <input type="date" name="endDate" className="field" max={today} defaultValue={state?.values?.endDate ?? initial?.endDate ?? ""} />
        </label>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span className="text-[15px]">
          예측에서 빼기
          <span className="mt-1 block text-[13px] text-muted">약 복용·아팠던 달처럼 평소와 다른 기록</span>
        </span>
        <input type="checkbox" name="excluded" className="switch" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />
      </label>
      {excluded && (
        <input name="excludeReason" className="field" maxLength={200} placeholder="이유 (나만 보여요)" defaultValue={state?.values?.excludeReason ?? initial?.excludeReason ?? ""} required />
      )}
      <ErrorText message={state?.error} />
      {state?.ok && !initial && <p className="text-sm text-muted">저장했어요.</p>}
      <div className="flex items-center gap-4 pt-2">
        <Submit>{initial ? "수정하기" : "기록하기"}</Submit>
        {initial && <Link href="/records" className="shrink-0 px-2 text-sm link">취소</Link>}
      </div>
    </form>
  );
}
