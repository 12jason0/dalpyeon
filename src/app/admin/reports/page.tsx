import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { communityAccess, listReports } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { decideReportAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  const db = await getDb();
  if (!(await communityAccess(db, user)).admin) notFound();
  const rows = await listReports(db, user);
  return (
    <>
      <Link href="/community" className="link text-sm">이야기로</Link>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">신고</h1>
      {rows.length === 0 && <p className="mt-10 text-[17px] text-muted">처리할 신고가 없어요.</p>}
      <ul className="mt-6">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`} className="border-b border-line py-5">
            <p className="text-[13px] text-muted">
              {r.kind === "post" ? "글" : "댓글"} · {r.nickname} · 신고 {r.total}건{r.hidden && " · 숨겨짐"}
            </p>
            <Link href={`/community/${r.postId}`} className="mt-2 block whitespace-pre-wrap text-[17px] leading-relaxed">{r.text}</Link>
            <form action={decideReportAction} className="mt-3 flex gap-6">
              <input type="hidden" name="kind" value={r.kind} />
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" name="decision" value="hidden" className="h-11 text-sm text-period-ink underline underline-offset-4">숨김</button>
              <button type="submit" name="decision" value="dismissed" className="link h-11 text-sm">기각</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
