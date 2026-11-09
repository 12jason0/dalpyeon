import { ChevronRight, Link2 } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { communityAccess, myPosts } from "@/lib/services/community";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { requireUser } from "@/lib/session";
import { ALERT_KINDS, alertSettings, PARTNER_ALERTS, reminderEnabled } from "@/lib/services/push";
import { AppHeader } from "../_components/AppHeader";
import { IconBadge } from "../_components/Chip";
import { NameEdit } from "../_components/NameEdit";
import { Nav } from "../_components/Nav";
import { NotificationSettings } from "../_components/NotificationSettings";

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
  const [access, partnerName, posts, reminder, alerts] = await Promise.all([
    communityAccess(db, user), activeCouple(db, user.id).then((c) => (c ? otherNickname(db, c, user) : null)),
    myPosts(db, user), reminderEnabled(db, user.id), user.role === "partner" ? alertSettings(db, user.id) : null,
  ]);
  return (
    <>
      <AppHeader user={user} />
      <h1 className="sr-only">마이</h1>

      <Link href="/connect" className="card flex items-center gap-3">
        <IconBadge><Link2 size={15} /></IconBadge>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">연결</span>
          <span className="mt-0.5 block text-[13px] text-muted">{partnerName ? `${partnerName}님과 연결돼 있어요` : "아직 연결 전이에요"}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
      </Link>

      <section className="card mt-3">
        <NameEdit name={user.nickname} />
        <p className="mt-1 text-[15px] text-muted">{user.email ?? "카카오 계정"}</p>
        {user.role === "partner" && (
          <p className="mt-1 text-[13px] text-muted">남친톡 닉네임 · {access.nickname ?? "아직 없어요"}</p>
        )}
      </section>

      <NotificationSettings publicKey={process.env.VAPID_PUBLIC_KEY ?? null} showReminder={user.role === "recorder"} reminder={reminder}
        alerts={alerts && ALERT_KINDS.map((kind) => ({ kind, label: PARTNER_ALERTS[kind].label, on: alerts[kind] }))}
      />

      <ul className="card mt-3">
        {access.admin && <SettingRow href="/admin/reports" label="운영자 신고 관리" />}
        {user.role === "recorder" && posts.length > 0 && <SettingRow href="/community" label="남친톡에 쓴 내 글" />}
        {user.role === "partner" && <SettingRow href="/me/rules" label="남친톡 이용 규칙" />}
        <SettingRow href="/me/privacy" label="개인정보 처리방침" />
        <SettingRow href="/me/settings" label="설정" />
      </ul>

      <Nav role={user.role} active="me" />
    </>
  );
}
