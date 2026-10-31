import Link from "next/link";
import { RULES } from "@/lib/content/rules";
import { requireUser } from "@/lib/session";
import { Nav } from "../../_components/Nav";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const user = await requireUser();
  return (
    <>
      <Link href="/me" className="link text-sm">마이</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">이용 규칙</h1>
      <p className="mt-6 text-[15px] leading-relaxed text-muted">이야기에는 이런 글을 올릴 수 없어요.</p>
      <ul className="mt-4">
        {RULES.map((rule) => <li key={rule} className="border-b border-line py-3 text-[17px]">{rule}</li>)}
      </ul>
      <Nav role={user.role} active="me" />
    </>
  );
}
