import Link from "next/link";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/dates";
import { communityAccess, listPosts, myPosts } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { Nav } from "../_components/Nav";
import { Gate, MyPosts } from "./_shared";

export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const access = await communityAccess(db, user);
  if (!access.admin && !access.member) return <Gate user={user} />;

  const page = Math.max(1, Math.floor(Number((await searchParams).page)) || 1);
  // myPosts는 아래 MyPosts가 쓰는 결과를 미리 받아 둔다
  const [{ posts, hasMore }] = await Promise.all([listPosts(db, user, page), access.member && myPosts(db, user)]);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="text-4xl font-semibold tracking-tight">이야기</h1>
        {access.member && <Link href="/community/new" className="link text-[15px]">글쓰기</Link>}
      </div>
      {posts.length === 0 && <p className="mt-10 text-[17px] text-muted">아직 글이 없어요.</p>}
      <ul className="mt-6 border-t border-line">
        {posts.map((p) => (
          <li key={p.id} className="border-b border-line">
            <Link href={`/community/${p.id}`} className="block py-4">
              <span className="block text-[17px] leading-snug">{p.title}</span>
              <span className="mt-1 block text-[13px] text-muted">
                {p.nickname} · 댓글 {p.commentCount} · {timeAgo(p.createdAt)}{p.hidden && " · 숨겨짐"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && <Link href={`/community?page=${page + 1}`} scroll={false} className="link mt-6 block text-center text-[15px]">더보기</Link>}
      {access.member && <MyPosts user={user} member />}
      <Nav role={user.role} active="community" />
    </>
  );
}
