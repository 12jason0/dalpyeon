"use client";
import { Heart } from "lucide-react";
import { useActionState } from "react";
import { BOARDS } from "@/lib/boards";
import type { Board } from "@/lib/db/schema";
import { agreeAction, likeAction, saveCommentAction, savePostAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";
import { btn, chip } from "./ui";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

export function ConsentForm() {
  const [state, action] = useActionState<FormState, FormData>(agreeAction, null);
  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className="text-sm text-muted">남친톡에서 쓸 닉네임 (비워 두면 무작위로 정해져요)</span>
        <input name="nickname" className="field" maxLength={12} placeholder="예: 편-1234" defaultValue={state?.values?.nickname} />
      </label>
      <ErrorText message={state?.error} />
      <Submit>동의하고 시작하기</Submit>
    </form>
  );
}

// 라디오를 칩 모양으로. 고른 칩은 연분홍 배경 + 진한 분홍 글자(ui.ts chip(true)와 같은 색).
const BOARD_CHIP = `${chip(false)} has-checked:border-accent has-checked:bg-period has-checked:text-period-ink has-focus-visible:outline-2 has-focus-visible:outline-accent`;

export function PostForm({ post }: { post?: { id: string; board: Board; title: string; body: string } }) {
  const [state, action] = useActionState<FormState, FormData>(savePostAction, null);
  const board = state?.values?.board || post?.board || "question";
  return (
    <form action={action} className="space-y-6">
      {post && <input type="hidden" name="id" value={post.id} />}
      <fieldset>
        <legend className="text-sm text-muted">말머리</legend>
        <div className="mt-3 flex gap-2">
          {Object.entries(BOARDS).map(([value, label]) => (
            <label key={value} className={BOARD_CHIP}>
              <input type="radio" name="board" value={value} defaultChecked={value === board} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-sm text-muted">제목</span>
        <input name="title" className="field" maxLength={60} required defaultValue={state?.values?.title ?? post?.title} />
      </label>
      <label className="block">
        <span className="text-sm text-muted">본문</span>
        <textarea name="body" className="field min-h-48 resize-y" maxLength={2000} required defaultValue={state?.values?.body ?? post?.body} />
      </label>
      <ErrorText message={state?.error} />
      <Submit>{post ? "고치기" : "올리기"}</Submit>
    </form>
  );
}

/**
 * 상세 화면 맨 아래에 붙는 댓글 입력칸. 이 화면에는 하단 메뉴가 없고 그 자리를 이 칸이 차지한다.
 * parentId를 주면 답글, comment를 주면 고치기. note는 입력칸 위 한 줄(답글 다는 중 · 취소 등).
 */
export function CommentBar({ postId, parentId, comment, note }: {
  postId: string; parentId?: string; comment?: { id: string; body: string }; note?: React.ReactNode;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveCommentAction, null);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-line bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md px-4 py-2">
        {note && <div className="flex items-center justify-between px-2 pb-1 text-[13px] text-muted">{note}</div>}
        <form action={action} className="flex items-end gap-2">
          <input type="hidden" name="postId" value={postId} />
          {comment && <input type="hidden" name="id" value={comment.id} />}
          {parentId && <input type="hidden" name="parentId" value={parentId} />}
          <textarea
            name="body" rows={1} maxLength={500} required aria-label={parentId ? "답글" : "댓글"}
            placeholder={parentId ? "답글을 남겨 주세요" : "댓글을 남겨 주세요"} defaultValue={state?.values?.body ?? comment?.body}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border border-line bg-paper px-4 py-2.5 text-[17px] leading-snug outline-none [field-sizing:content] placeholder:text-muted focus:border-ink"
          />
          <Submit className={`${btn("primary", true)} shrink-0 px-4`} pendingText="…">{comment ? "고치기" : "등록"}</Submit>
        </form>
        <ErrorText message={state?.error} />
      </div>
    </div>
  );
}

/** 공감. 한 번 더 누르면 취소된다. */
export function LikeButton({ id, liked, count }: { id: string; liked: boolean; count: number }) {
  const [state, run, pending] = useActionState<FormState, FormData>(likeAction, null);
  return (
    <form action={run}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} aria-pressed={liked} className={`${chip(liked)} gap-1.5`}>
        <Heart size={16} fill={liked ? "currentColor" : "none"} aria-hidden />
        공감 {count}
      </button>
      <ErrorText message={state?.error} />
    </form>
  );
}

/** 신고처럼 결과를 그 자리에 보여주는 글자 버튼. */
export function TargetButton({ action, kind, id, label, done }: { action: Action; kind: "post" | "comment"; id: string; label: string; done?: string }) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  if (state?.ok && done) return <span className="text-sm leading-11 text-muted">{done}</span>;
  return (
    <form action={run}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="link h-11 text-sm">{label}</button>
      {state?.error && <p className="text-[13px] text-period-ink">{state.error}</p>}
    </form>
  );
}
