import { EllipsisVertical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BOARDS } from "@/lib/boards";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { communityAccess, getPost, type CommentView, type PostView } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { blockAction, deleteCommentAction, deletePostAction, reportAction } from "../../actions";
import { BackLink } from "../../_components/BackLink";
import { CommentBar, LikeButton, PostForm, TargetButton } from "../../_components/CommunityForms";
import { Confirm, Gate } from "../_shared";

export const dynamic = "force-dynamic";

const MENU_LINK = "link block text-sm leading-11";

/** ⋮ 메뉴. 안에 넣을 것이 없으면 그리지 않는다. */
function Menu({ label, children }: { label: string; children: React.ReactNode[] }) {
  if (!children.some(Boolean)) return null;
  return (
    <details className="relative shrink-0">
      <summary aria-label={label} className="-mr-2 flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-muted [&::-webkit-details-marker]:hidden">
        <EllipsisVertical size={18} aria-hidden />
      </summary>
      <div className="absolute right-0 top-9 z-10 min-w-32 rounded-2xl border-[0.5px] border-line bg-card px-4 py-1 shadow-[0_4px_20px_rgb(63_58_61/0.12)] [&_.link]:no-underline">
        {children}
      </div>
    </details>
  );
}

function Others({ kind, id }: { kind: "post" | "comment"; id: string }) {
  return (
    <>
      <TargetButton action={reportAction} kind={kind} id={id} label="신고" done="신고했어요" />
      <details>
        <summary className="link cursor-pointer list-none text-sm leading-11">차단</summary>
        <p className="text-[13px] leading-relaxed text-muted">서로의 글과 댓글이 보이지 않게 돼요.</p>
        <TargetButton action={blockAction} kind={kind} id={id} label="차단할게요" />
      </details>
    </>
  );
}

export default async function PostPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; reply?: string }>;
}) {
  const user = await requireUser();
  const db = await getDb();
  const access = await communityAccess(db, user);
  if (!access.admin && !access.member) return <Gate user={user} />;

  const { id } = await params;
  const { edit, reply } = await searchParams;
  let post: PostView;
  try {
    post = await getPost(db, user, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const here = `/community/${post.id}`;
  const canAct = access.member && !post.hidden; // 운영자가 보는 숨긴 글에는 쓰기 동작을 내주지 않는다
  const editingPost = edit === "post" && post.mine && canAct;
  const editingComment = post.comments.flatMap((c) => [c, ...c.replies]).find((c) => c.id === edit && c.mine && !c.hidden);
  const replyTo = !editingComment && access.nickname ? post.comments.find((c) => c.id === reply && !c.hidden) : undefined;
  const cancel = <Link href={here} scroll={false} className="link">취소</Link>;

  const bubble = (c: CommentView, isReply: boolean) => (
    <div className="flex items-start gap-2">
      <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-period/60 text-period-ink ${isReply ? "h-7 w-7 text-[12px]" : "h-9 w-9 text-[14px]"}`}>
        {c.nickname.slice(0, 1)}
      </span>
      <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border-[0.5px] bg-card px-4 py-2.5 ${c.id === editingComment?.id || c.id === replyTo?.id ? "border-accent" : "border-line"}`}>
        <p className="text-[13px] text-muted">{c.nickname} · {timeAgo(c.createdAt)}{c.hidden && " · 숨겨짐"}</p>
        <p className="mt-1 whitespace-pre-wrap text-[16px] leading-relaxed">{c.body}</p>
      </div>
      <Menu label="댓글 메뉴">{[
        c.mine && canAct && !c.hidden && <Link key="edit" href={`${here}?edit=${c.id}`} scroll={false} className={MENU_LINK}>수정</Link>,
        c.mine && <Confirm key="delete" label="삭제" confirm="정말 지울게요" action={deleteCommentAction} fields={{ id: c.id }} />,
        !isReply && canAct && !c.hidden && access.nickname && <Link key="reply" href={`${here}?reply=${c.id}`} scroll={false} className={MENU_LINK}>답글</Link>,
        !c.mine && canAct && !c.hidden && <Others key="others" kind="comment" id={c.id} />,
      ]}</Menu>
    </div>
  );

  return (
    <>
      <BackLink href="/community" />
      {editingPost ? (
        <div className="mt-6"><PostForm post={post} /></div>
      ) : (
        <article className="card mt-2 px-5 py-5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] leading-9 text-period-ink">{post.pinned ? "고정" : BOARDS[post.board]}</p>
            <Menu label="글 메뉴">{[
              post.mine && canAct && <Link key="edit" href={`${here}?edit=post`} className={MENU_LINK}>수정</Link>,
              post.mine && <Confirm key="delete" label="삭제" confirm="정말 지울게요" action={deletePostAction} fields={{ id: post.id }} />,
              !post.mine && canAct && !post.pinned && <Others key="others" kind="post" id={post.id} />,
            ]}</Menu>
          </div>
          <h1 className="text-2xl font-medium leading-snug tracking-tight">{post.title}</h1>
          <p className="mt-2 text-[13px] text-muted">{post.nickname}{!post.pinned && ` · ${timeAgo(post.createdAt)}`}{post.hidden && " · 숨겨짐"}</p>
          <p className="mt-6 whitespace-pre-wrap text-[17px] leading-relaxed">{post.body}</p>
          <div className="mt-6">
            {canAct
              ? <LikeButton id={post.id} liked={post.liked} count={post.likeCount} />
              : <span className="text-[13px] text-muted">공감 {post.likeCount}</span>}
          </div>
        </article>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted">댓글 {post.commentCount}</h2>
        {post.comments.length === 0 && <p className="text-[15px] text-muted">아직 댓글이 없어요.</p>}
        <ul className="space-y-4">
          {post.comments.map((c) => (
            <li key={c.id}>
              {bubble(c, false)}
              {c.replies.length > 0 && (
                <ul className="mt-3 space-y-3 pl-11">
                  {c.replies.map((r) => <li key={r.id}>{bubble(r, true)}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 하단 메뉴 대신 그 자리에 댓글 입력칸을 붙인다 */}
      {canAct && !editingPost && (access.nickname ? (
        <CommentBar
          key={editingComment?.id ?? replyTo?.id ?? "new"} postId={post.id} parentId={replyTo?.id} comment={editingComment}
          note={editingComment ? <><span>댓글 고치는 중</span>{cancel}</> : replyTo ? <><span>{replyTo.nickname}님에게 답글</span>{cancel}</> : undefined}
        />
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-line bg-card pb-[env(safe-area-inset-bottom)]">
          <Link href="/community/new" className="link mx-auto block h-14 max-w-md px-6 text-[15px] leading-14">이용 규칙에 동의하면 댓글을 달 수 있어요</Link>
        </div>
      ))}
    </>
  );
}
