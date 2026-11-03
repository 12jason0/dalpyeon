import { getDb } from "@/lib/db";
import { formatDay, todaySeoul } from "@/lib/dates";
import { careLabel, recentReplies, RESPONSES } from "@/lib/services/care";
import { activeCouple, otherNickname, type Couple } from "@/lib/services/couples";
import { partnerView } from "@/lib/services/partner";
import { requireUser } from "@/lib/session";
import { BackLink } from "../_components/BackLink";
import { CareCard } from "../_components/HomeCards";
import { MarkNewsSeen } from "../_components/MarkNewsSeen";
import { Nav } from "../_components/Nav";

export const metadata = { title: "새 소식 — 우리주기" };
export const dynamic = "force-dynamic";

const EMPTY = <p className="mt-10 text-center text-[15px] text-muted">아직 새 소식이 없어요.</p>;

async function Replies({ couple, name }: { couple: Couple; name: string }) {
  const replies = await recentReplies(await getDb(), couple);
  if (!replies.length) return EMPTY;
  return (
    <ul className="space-y-2">
      {replies.map((r) => (
        <li key={r.id} className="card">
          <p className="text-[13px] text-muted">{formatDay(r.day)}</p>
          {r.presets.map((key) => <p key={key} className="mt-1 text-[15px]">{careLabel(key)}</p>)}
          {r.message && <p className="mt-1 text-[15px]">“{r.message}”</p>}
          <p className="mt-2 text-[15px] font-medium text-accent">{name}님: {RESPONSES[r.response]}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function NewsPage() {
  const user = await requireUser();
  const db = await getDb();
  const today = todaySeoul();
  const couple = await activeCouple(db, user.id);
  const care = user.role === "partner" ? (await partnerView(db, user, today))?.care ?? [] : [];
  return (
    <>
      <div className="flex items-center gap-1">
        <div className="mt-4"><BackLink href="/" /></div>
        <h1 className="text-[17px] font-semibold tracking-tight">새 소식</h1>
      </div>
      <div className="mt-3">
        {user.role === "recorder"
          ? (couple ? <Replies couple={couple} name={await otherNickname(db, couple, user)} /> : EMPTY)
          : (care.length ? <div className="space-y-2">{care.map((c) => <CareCard key={c.id} care={c} today={today} />)}</div> : EMPTY)}
      </div>
      <MarkNewsSeen />
      <Nav role={user.role} active="home" />
    </>
  );
}
