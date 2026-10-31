import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Nav } from "../../_components/Nav";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await requireUser();
  return (
    <>
      <Link href="/me" className="link text-sm">마이</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">개인정보 처리방침</h1>
      <p className="mt-6 text-[15px] leading-relaxed text-muted">준비 중이에요.</p>
      <Nav role={user.role} active="me" />
    </>
  );
}
