import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { communityAccess, myPosts } from "@/lib/services/community";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { requireUser } from "@/lib/session";
import { reminderEnabled } from "@/lib/services/push";
import { Nav } from "../_components/Nav";
import { LogoutButton, NotificationSettings } from "../_components/NotificationSettings";

export const dynamic = "force-dynamic";

function SettingRow({ href, label }: { href: string; label: string }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex items-center justify-between gap-3 py-3.5 text-[15px]">
        {label}
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

export default async function MePage() {
  const user = await requireUser();
  const db = await getDb();
  const [access, couple, posts, reminder] = await Promise.all([
    communityAccess(db, user), activeCouple(db, user.id), myPosts(db, user), reminderEnabled(db, user.id),
  ]);
  const partnerName = couple ? await otherNickname(db, couple, user) : null;
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">마이</h1>

      <section className="card mt-8">
        <p className="text-xl font-semibold tracking-tight">{user.nickname}</p>
        <p className="mt-1 text-[15px] text-muted">{user.email ?? "카카오 계정"}</p>
        {user.role === "partner" && (
          <p className="mt-1 text-[13px] text-muted">커뮤니티 닉네임 · {access.nickname ?? "아직 없어요"}</p>
        )}
      </section>

      <Link href="/connect" className="card mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">{partnerName ?? "연결"}</span>
          <span className="mt-0.5 block text-[13px] text-muted">{partnerName ? "연결돼 있어요" : "아직 연결 전이에요"}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </Link>

      <NotificationSettings publicKey={process.env.VAPID_PUBLIC_KEY ?? null} showReminder={user.role === "recorder"} reminder={reminder} />

      <ul className="card mt-3">
        {user.role === "recorder" && <SettingRow href="/connect" label="공유 설정" />}
        {access.admin && <SettingRow href="/admin/reports" label="운영자 신고 관리" />}
        {user.role === "recorder" && posts.length > 0 && <SettingRow href="/community" label="이야기에 쓴 내 글" />}
        <SettingRow href="/me/rules" label="이용 규칙" />
        <SettingRow href="/me/privacy" label="개인정보 처리방침" />
      </ul>

      <LogoutButton />
      <Nav role={user.role} active="me" />
    </>
  );
}
