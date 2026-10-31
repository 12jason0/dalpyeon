"use client";
import { useActionState, useState } from "react";
import { createInviteAction, sharingAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

export function InviteBox({ origin }: { origin: string }) {
  const [state, action] = useActionState<FormState, FormData>(createInviteAction, null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const sendLink = async () => {
    const text = `우리주기에서 연결해 줘 💗 ${origin}/join?code=${state?.code}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setLinkCopied(true);
      }
    } catch {
      setLinkCopied(false); // 공유 창을 닫은 경우 포함
    }
  };
  const until = state?.expiresAt
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(state.expiresAt))
    : null;
  return (
    <form action={action}>
      {state?.code && (
        <div className="mb-8">
          <p className="font-mono text-5xl font-semibold tracking-wider">{state.code}</p>
          <p className="mt-3 text-[15px] text-muted">{until}까지 쓸 수 있어요. 파트너에게 보내 주세요.</p>
          <button
            type="button"
            className="mt-4 text-sm link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.code!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "복사했어요" : "코드 복사"}
          </button>
          <button type="button" className="mt-4 ml-5 text-sm link" onClick={sendLink}>
            {linkCopied ? "링크를 복사했어요" : "링크로 보내기"}
          </button>
        </div>
      )}
      <Submit>{state?.code ? "새 코드 만들기" : "연결 코드 만들기"}</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}

/** 코드를 넣으면 확인 화면(/join)으로 간다. 연결은 거기서 [연결하기]를 눌러야 된다. */
export function ClaimForm({ code, notice }: { code?: string; notice?: string }) {
  return (
    <form action="/join" className="space-y-6">
      <input
        name="code"
        className="field font-mono text-3xl tracking-wider uppercase"
        placeholder="ABCD-EFGH"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={12}
        required
        defaultValue={code}
      />
      <ErrorText message={notice} />
      <button type="submit" className="btn">다음</button>
    </form>
  );
}

const ITEMS = [
  { key: "periods", label: "생리 기록", hint: "시작일·기간. 공유 시작일 이후 기록만" },
  { key: "predictions", label: "다음 생리 예상", hint: "예상 날짜만. 계산에 쓴 과거 기록은 안 보여요" },
  { key: "fertility", label: "가임기 (추정)", hint: "참고용 추정 날짜" },
  { key: "care", label: "배려 요청", hint: "'파트너에게 보내기'를 켠 요청만" },
] as const;

type Sharing = { permissions: Record<string, boolean>; shareFrom: string; paused: boolean };

export function SharingForm({ initial, today }: { initial: Sharing; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(sharingAction, null);
  return (
    <form action={action}>
      <ul>
        {ITEMS.map((item) => (
          <li key={item.key}>
            <label className="flex items-center justify-between gap-4 border-b border-line py-4">
              <span className="text-[17px]">
                {item.label}
                <span className="mt-1 block text-[13px] text-muted">{item.hint}</span>
              </span>
              <input type="checkbox" name={item.key} className="switch" defaultChecked={initial.permissions[item.key]} />
            </label>
          </li>
        ))}
      </ul>
      <label className="mt-6 block">
        <span className="text-sm text-muted">공유 시작일 — 이 날짜 이전 기록은 보이지 않아요</span>
        <input type="date" name="shareFrom" className="field" max={today} defaultValue={initial.shareFrom} required />
      </label>
      <label className="mt-6 flex items-center justify-between gap-4">
        <span className="text-[17px]">
          잠시 멈추기
          <span className="mt-1 block text-[13px] text-muted">켜두면 아무것도 보이지 않아요</span>
        </span>
        <input type="checkbox" name="paused" className="switch" defaultChecked={initial.paused} />
      </label>
      <ErrorText message={state?.error} />
      {state?.ok && <p className="mt-3 text-sm text-muted">저장했어요.</p>}
      <div className="mt-8">
        <Submit>저장</Submit>
      </div>
    </form>
  );
}
