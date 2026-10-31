import Link from "next/link";
import { getDb } from "@/lib/db";
import type { Board } from "@/lib/db/schema";
import { timeAgo } from "@/lib/dates";
import { BOARDS, communityAccess, listPosts, myPosts } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { Nav } from "../_components/Nav";
import { Gate, MyPosts } from "./_shared";

export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const access = await communityAccess(db, user);
  if (!access.admin && !access.member) return <Gate user={user} />;

  const board: Board = (await searchParams).board === "tip" ? "tip" : "question";
  // myPosts는 아래 MyPosts가 쓰는 결과를 미리 받아 둔다
  const [list] = await Promise.all([listPosts(db, user, board), access.member && myPosts(db, user)]);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h1 className="text-4xl font-semibold tracking-tight">이야기</h1>
        {access.member && <Link href={`/community/new?board=${board}`} className="link text-[15px]">글쓰기</Link>}
      </div>
      <div className="mt-8 flex gap-6 border-b border-line">
        {(Object.entries(BOARDS) as [Board, string][]).map(([key, label]) => (
          <Link
            key={key} href={`/community?board=${key}`} aria-current={key === board ? "page" : undefined}
            className={`-mb-px border-b-2 py-3 text-[17px] ${key === board ? "border-ink font-semibold" : "border-transparent text-muted"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {list.length === 0 && <p className="mt-10 text-[17px] text-muted">아직 글이 없어요.</p>}
      <ul>
        {list.map((p) => (
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
      {access.member && <MyPosts user={user} member />}
      <Nav role={user.role} active="community" />
    </>
  );
}
