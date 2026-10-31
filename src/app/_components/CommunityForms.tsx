"use client";
import { useActionState } from "react";
import { agreeAction, saveCommentAction, savePostAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

export function ConsentForm({ board }: { board: string }) {
  const [state, action] = useActionState<FormState, FormData>(agreeAction, null);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="board" value={board} />
      <label className="block">
        <span className="text-sm text-muted">이야기에서 쓸 닉네임 (비워 두면 무작위로 정해져요)</span>
        <input name="nickname" className="field" maxLength={12} placeholder="예: 편-1234" defaultValue={state?.values?.nickname} />
      </label>
      <ErrorText message={state?.error} />
      <Submit>동의하고 시작하기</Submit>
    </form>
  );
}

export function PostForm({ board, post }: { board: string; post?: { id: string; title: string; body: string } }) {
  const [state, action] = useActionState<FormState, FormData>(savePostAction, null);
  return (
    <form action={action} className="space-y-6">
      {post ? <input type="hidden" name="id" value={post.id} /> : <input type="hidden" name="board" value={board} />}
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

export function CommentForm({ postId, comment }: { postId: string; comment?: { id: string; body: string } }) {
  const [state, action] = useActionState<FormState, FormData>(saveCommentAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="postId" value={postId} />
      {comment && <input type="hidden" name="id" value={comment.id} />}
      <textarea
        name="body" className="field min-h-20 resize-y" maxLength={500} required aria-label="댓글"
        placeholder="댓글을 남겨 주세요" defaultValue={state?.values?.body ?? comment?.body}
      />
      <ErrorText message={state?.error} />
      <Submit>{comment ? "고치기" : "댓글 달기"}</Submit>
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
      {state?.error && <p className="text-[13px] text-period">{state.error}</p>}
    </form>
  );
}
