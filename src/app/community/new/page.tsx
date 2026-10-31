import Link from "next/link";
import { RULES } from "@/lib/content/rules";
import { getDb } from "@/lib/db";
import { BOARDS, communityAccess } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { ConsentForm, PostForm } from "../../_components/CommunityForms";
import { Nav } from "../../_components/Nav";
import { Gate } from "../_shared";

export const dynamic = "force-dynamic";

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  const user = await requireUser();
  const access = await communityAccess(await getDb(), user);
  if (!access.member) return <Gate user={user} />;
  const board = (await searchParams).board === "tip" ? "tip" : "question";
  return (
    <>
      <Link href={`/community?board=${board}`} className="link text-sm">이야기로</Link>
      {access.nickname ? (
        <>
          <h1 className="mt-6 mb-8 text-3xl font-semibold tracking-tight">{BOARDS[board]} 쓰기</h1>
          <PostForm board={board} />
        </>
      ) : (
        <>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">이용 규칙</h1>
          <p className="mt-6 text-[17px] leading-relaxed text-muted">처음 쓰기 전에 한 번만 확인해 주세요. 이런 글은 올릴 수 없어요.</p>
          <ul className="mt-4 mb-10">
            {RULES.map((rule) => <li key={rule} className="border-b border-line py-3 text-[17px]">{rule}</li>)}
          </ul>
          <ConsentForm board={board} />
        </>
      )}
      <Nav role={user.role} active="community" />
    </>
  );
}
