import { RULES } from "@/lib/content/rules";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { BackLink } from "../../_components/BackLink";
import { Nav } from "../../_components/Nav";

export const dynamic = "force-dynamic";

/** 남친톡 이용 규칙. 남친톡은 파트너만 쓰므로 기록자가 주소로 들어오면 마이로 돌려보낸다. */
export default async function RulesPage() {
  const user = await requireUser();
  if (user.role !== "partner") redirect("/me");
  return (
    <>
      <BackLink href="/me" />
      <h1 className="sr-only">남친톡 이용 규칙</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">남친톡에서는 이것만은 지켜 주세요.</p>
      <ul className="mt-4">
        {RULES.map((rule) => <li key={rule} className="border-b border-line py-3 text-[17px]">{rule}</li>)}
      </ul>
      <Nav role={user.role} active="me" />
    </>
  );
}
