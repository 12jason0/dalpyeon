import { ChevronRight, Heart, MessageCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { BOARDS, isBoard } from "@/lib/boards";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/dates";
import { communityAccess, listPosts, myPosts } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { AppHeader } from "../_components/AppHeader";
import { Nav } from "../_components/Nav";
import { chip } from "../_components/ui";
import { Gate, MyPosts } from "./_shared";

export const dynamic = "force-dynamic";

const TABS = [["", "전체"], ...Object.entries(BOARDS)];

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string; board?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const access = await communityAccess(db, user);
  if (!access.admin && !access.member) return <Gate user={user} />;

  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const board = isBoard(params.board) ? params.board : "";
  // myPosts는 아래 MyPosts가 쓰는 결과를 미리 받아 둔다
  const [{ posts, hasMore }] = await Promise.all([listPosts(db, user, page, board || undefined), access.member && myPosts(db, user)]);
  const pinned = posts.filter((p) => p.pinned);
  const rest = posts.filter((p) => !p.pinned);
  const more = new URLSearchParams({ ...(board && { board }), page: String(page + 1) });
  return (
    <>
      <AppHeader user={user} />
      <h1 className="sr-only">남친톡</h1>
      <nav aria-label="말머리" className="flex gap-2">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key ? `/community?board=${key}` : "/community"} aria-current={board === key ? "page" : undefined} className={chip(board === key)}>
            {label}
          </Link>
        ))}
      </nav>

      {/* 공지: 고정 글을 항상 펼쳐 둔다. 말머리를 골라도 listPosts가 고정 글을 함께 돌려준다 */}
      {pinned.length > 0 && (
        <ul aria-label="공지" className="mt-4 divide-y-[0.5px] divide-period-dash/40 rounded-[18px] bg-period/40 px-4">
          {pinned.map((p) => (
            <li key={p.id}>
              <Link href={`/community/${p.id}`} className="flex h-11 items-center gap-2 text-[15px]">
                <span className="shrink-0 rounded-full bg-period px-2 py-0.5 text-[12px] font-medium text-period-ink">공지</span>
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rest.length === 0 && <p className="mt-10 text-[17px] text-muted">아직 글이 없어요.</p>}
      <ul className="mt-8 space-y-3">
        {rest.map((p) => (
          <li key={p.id}>
            <Link href={`/community/${p.id}`} className="card block px-4 py-3.5">
              <span className="text-[13px] text-period-ink">{BOARDS[p.board]}</span>
              <span className="mt-0.5 block text-[17px] leading-snug">{p.title}</span>
              <span className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-muted">{p.preview}</span>
              <span className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted">
                <span className="min-w-0 truncate">{p.nickname} · {timeAgo(p.createdAt)}{p.hidden && " · 숨겨짐"}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="flex items-center gap-1"><Heart size={14} aria-hidden /><span className="sr-only">공감</span>{p.likeCount}</span>
                  <span className="flex items-center gap-1"><MessageCircle size={14} aria-hidden /><span className="sr-only">댓글</span>{p.commentCount}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && <Link href={`/community?${more}`} scroll={false} className="link mt-6 block text-center text-[15px]">더보기</Link>}
      {access.member && <MyPosts user={user} member />}
      {/* 하단 메뉴 위에 뜨는 글쓰기 버튼. 높이는 Nav.tsx의 74px 기준, 가로는 본문 칸(max-w-md)의 오른쪽 여백에 맞춘다 */}
      {access.member && (
        <Link
          href="/community/new" aria-label="글쓰기" data-floating
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+74px)] right-[max(1.5rem,calc(50%-12.5rem))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-opacity active:opacity-80"
        >
          <Pencil size={18} aria-hidden />
        </Link>
      )}
      <Nav role={user.role} active="community" />
    </>
  );
}
