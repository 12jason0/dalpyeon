import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { communityAccess, getPost, type CommentView, type PostView } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { blockAction, deleteCommentAction, deletePostAction, reportAction } from "../../actions";
import { CommentForm, PostForm, TargetButton } from "../../_components/CommunityForms";
import { Nav } from "../../_components/Nav";
import { Confirm, Gate } from "../_shared";

export const dynamic = "force-dynamic";

function Others({ kind, id }: { kind: "post" | "comment"; id: string }) {
  return (
    <div className="flex items-start gap-6">
      <TargetButton action={reportAction} kind={kind} id={id} label="신고" done="신고했어요" />
      <details>
        <summary className="link cursor-pointer list-none text-sm leading-11">차단</summary>
        <p className="text-[13px] leading-relaxed text-muted">서로의 글과 댓글이 보이지 않게 돼요.</p>
        <TargetButton action={blockAction} kind={kind} id={id} label="차단할게요" />
      </details>
    </div>
  );
}

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const access = await communityAccess(db, user);
  if (!access.admin && !access.member) return <Gate user={user} />;

  const { id } = await params;
  const { edit } = await searchParams;
  let post: PostView;
  try {
    post = await getPost(db, user, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const canAct = access.member && !post.hidden; // 운영자가 보는 숨긴 글에는 쓰기 동작을 내주지 않는다
  const editingComment = post.comments.flatMap((c) => [c, ...c.replies]).find((c) => c.id === edit && c.mine && !c.hidden);

  const item = (c: CommentView, reply: boolean) => editingComment?.id === c.id ? <CommentForm postId={post.id} comment={c} /> : (
    <>
      <p className="text-[13px] text-muted">{c.nickname} · {timeAgo(c.createdAt)}{c.hidden && " · 숨겨짐"}</p>
      <p className="mt-2 whitespace-pre-wrap text-[17px] leading-relaxed">{c.body}</p>
      <div className="mt-1 flex items-start gap-6">
        {c.mine ? (
          <>
            {canAct && !c.hidden && <Link href={`/community/${post.id}?edit=${c.id}`} className="link text-sm leading-11">수정</Link>}
            <Confirm label="삭제" confirm="정말 지울게요" action={deleteCommentAction} fields={{ id: c.id }} />
          </>
        ) : canAct && !c.hidden && <Others kind="comment" id={c.id} />}
      </div>
      {!reply && canAct && !c.hidden && access.nickname && (
        <details>
          <summary className="link cursor-pointer list-none text-sm leading-11">답글</summary>
          <div className="mt-2"><CommentForm postId={post.id} parentId={c.id} /></div>
        </details>
      )}
    </>
  );

  return (
    <>
      <Link href="/community" className="link text-sm">이야기로</Link>
      {edit === "post" && post.mine && canAct ? (
        <div className="mt-6"><PostForm post={post} /></div>
      ) : (
        <article className="mt-6">
          <h1 className="text-3xl font-semibold leading-snug tracking-tight">{post.title}</h1>
          <p className="mt-2 text-[13px] text-muted">{post.nickname} · {timeAgo(post.createdAt)}{post.hidden && " · 숨겨짐"}</p>
          <p className="mt-8 whitespace-pre-wrap text-[17px] leading-relaxed">{post.body}</p>
          <div className="mt-6 border-b border-line pb-2">
            {post.mine ? (
              <div className="flex items-start gap-6">
                {canAct && <Link href={`/community/${post.id}?edit=post`} className="link text-sm leading-11">수정</Link>}
                <Confirm label="삭제" confirm="정말 지울게요" action={deletePostAction} fields={{ id: post.id }} />
              </div>
            ) : canAct && <Others kind="post" id={post.id} />}
          </div>
        </article>
      )}

      <section className="mt-12">
        <h2 className="mb-2 text-sm font-medium text-muted">댓글 {post.commentCount}</h2>
        <ul>
          {post.comments.map((c) => (
            <li key={c.id} className="border-b border-line py-4">
              {item(c, false)}
              {c.replies.length > 0 && (
                <ul className="mt-3 border-l-2 border-line pl-4">
                  {c.replies.map((r) => <li key={r.id} className="py-3">{item(r, true)}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {canAct && !editingComment && (
          <div className="mt-8">
            {access.nickname
              ? <CommentForm postId={post.id} />
              : <Link href="/community/new" className="link text-[15px]">이용 규칙에 동의하면 댓글을 달 수 있어요</Link>}
          </div>
        )}
      </section>
      <Nav role={user.role} active="community" />
    </>
  );
}
