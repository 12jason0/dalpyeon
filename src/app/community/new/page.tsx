import { RULES } from "@/lib/content/rules";
import { getDb } from "@/lib/db";
import { communityAccess } from "@/lib/services/community";
import { requireUser } from "@/lib/session";
import { BackLink } from "../../_components/BackLink";
import { ConsentForm, PostForm } from "../../_components/CommunityForms";
import { Nav } from "../../_components/Nav";
import { Gate } from "../_shared";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await requireUser();
  const access = await communityAccess(await getDb(), user);
  if (!access.member) return <Gate user={user} />;
  return (
    <>
      {access.nickname ? (
        <PostForm close="/community" />
      ) : (
        <>
          <BackLink href="/community" />
          <h1 className="sr-only">이용 규칙</h1>
          <p className="mt-2 text-[17px] leading-relaxed text-muted">처음 쓰기 전에 한 번만 확인해 주세요. 이것만은 지켜 주세요.</p>
          <ul className="mt-4 mb-10">
            {RULES.map((rule) => <li key={rule} className="border-b border-line py-3 text-[17px]">{rule}</li>)}
          </ul>
          <ConsentForm />
        </>
      )}
      <Nav role={user.role} active="community" />
    </>
  );
}
