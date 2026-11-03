"use client";
import { Heart, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { BOARDS, POST_BODY_MAX } from "@/lib/boards";
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

// 라디오를 칩 모양으로. 글쓰기 화면에서는 고른 칩을 진한 분홍으로 채우고 글자는 흰색.
const BOARD_CHIP = `${chip(false)} has-checked:border-accent has-checked:bg-accent has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-accent`;
const BODY_PLACEHOLDER = "여자친구에 대해 고민되는 점이나, 해보니 좋았던 걸 나눠주세요.\n\n상대 이름·사진·연락처는 쓰지 않아요.";

/**
 * 글쓰기·글 고치기. 맨 위 한 줄에 닫기(X)·제목·올리기. 제목과 본문은 흰 카드 하나에 플레이스홀더로.
 * 제목이나 본문이 비어 있으면 서버로 보내지 않고 바로 알려준다. close는 X를 눌렀을 때 갈 곳.
 */
export function PostForm({ post, close }: { post?: { id: string; board: Board; title: string; body: string }; close: string }) {
  const [body, setBody] = useState(post?.body ?? "");
  const [state, action] = useActionState<FormState, FormData>((prev, form) => {
    const values = { board: String(form.get("board") ?? ""), title: String(form.get("title") ?? ""), body: String(form.get("body") ?? "") };
    if (!values.title.trim()) return { error: "제목을 적어 주세요", values };
    if (!values.body.trim()) return { error: "본문을 적어 주세요", values };
    return savePostAction(prev, form);
  }, null);
  const board = state?.values?.board || post?.board || "question";
  return (
    <form action={action} className="space-y-4" noValidate>
      {post && <input type="hidden" name="id" value={post.id} />}
      <div className="-mt-4 grid grid-cols-[44px_1fr_auto] items-center">
        <Link href={close} aria-label="닫기" className="-ml-3 flex h-11 w-11 items-center justify-center text-muted"><X size={22} aria-hidden /></Link>
        <h1 className="text-center text-[17px] font-medium">{post ? "글 고치기" : "글쓰기"}</h1>
        <Submit className="inline-flex h-8 min-w-11 items-center justify-center rounded-full bg-accent px-3.5 text-[14px] font-medium text-white disabled:opacity-40" pendingText="…">
          {post ? "고치기" : "올리기"}
        </Submit>
      </div>
      <fieldset>
        <legend className="sr-only">말머리</legend>
        <div className="flex gap-2">
          {Object.entries(BOARDS).map(([value, label]) => (
            <label key={value} className={BOARD_CHIP}>
              <input type="radio" name="board" value={value} defaultChecked={value === board} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="card px-4 py-0">
        <input
          name="title" aria-label="제목" placeholder="제목" maxLength={60} defaultValue={state?.values?.title ?? post?.title}
          className="w-full bg-transparent py-3.5 text-[17px] outline-none placeholder:text-muted"
        />
        <div className="relative border-t-[0.5px] border-line">
          <textarea
            name="body" aria-label="본문" placeholder={BODY_PLACEHOLDER} maxLength={POST_BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)}
            className="block min-h-72 w-full resize-none bg-transparent pb-8 pt-3.5 text-[16px] leading-relaxed outline-none placeholder:text-muted"
          />
          <span aria-hidden className="absolute bottom-2.5 right-0 text-[12px] text-muted">{body.length}/{POST_BODY_MAX}</span>
        </div>
      </div>
      <ErrorText message={state?.error} />
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
