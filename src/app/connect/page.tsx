import Link from "next/link";
import { getDb } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { ESTIMATE_NOTE } from "@/lib/prediction";
import type { User } from "@/lib/services/auth";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { requireUser, siteOrigin } from "@/lib/session";
import { BackLink } from "../_components/BackLink";
import { ClaimForm, InviteBox, SharingForm } from "../_components/ConnectForms";
import { Nav } from "../_components/Nav";
import { Section } from "../_components/Section";

export const dynamic = "force-dynamic";

/** 연결되면 항목 구분 없이 모두 보인다. */
const SHARED = ["생리 기록", "다음 생리 예상", "가임기·배란일 (추정)", "오늘의 통증·기분", "배려 요청"];

function SharedList() {
  return (
    <ul>
      {SHARED.map((label) => <li key={label} className="border-b border-line py-3 text-[15px]">{label}</li>)}
      <li className="pt-3 text-[13px] text-muted">가임기·배란일은 {ESTIMATE_NOTE}</li>
    </ul>
  );
}

const CLAIM_NOTICES: Record<string, string> = {
  code: "코드를 다시 확인해 주세요",
  connected: "이미 연결된 상대가 있어요",
  limit: "시도가 너무 많아요. 잠시 후 다시 해 주세요",
};

type Claim = { code?: string; notice?: string };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ claim?: string; code?: string }> }) {
  const user = await requireUser();
  const { claim, code } = await searchParams;
  const notice = claim ? CLAIM_NOTICES[claim] : undefined;
  const sent: Claim = { code: typeof code === "string" ? code.slice(0, 12) : undefined, notice };
  return (
    <>
      <BackLink href="/me" />
      <h1 className="sr-only">연결</h1>
      {user.role === "recorder" ? <RecorderConnect user={user} claim={sent} /> : <PartnerConnect user={user} claim={sent} />}
      <Nav role={user.role} active="me" />
    </>
  );
}

async function RecorderConnect({ user, claim }: { user: User; claim: Claim }) {
  const db = await getDb();
  const couple = await activeCouple(db, user.id);
  if (couple) {
    const name = await otherNickname(db, couple, user);
    return (
      <>
        <p className="mt-4 text-2xl font-medium">{name}님과 연결됨</p>
        <Section title={`${name}님에게 보이는 것`}><SharedList /></Section>
        <Section title="공유 조절">
          <SharingForm today={todaySeoul()} initial={{ shareFrom: couple.shareFrom, paused: couple.paused }} />
          <p className="mt-6 text-center text-sm"><Link href="/me/settings" className="link">연결 끊기는 설정에서 할 수 있어요</Link></p>
        </Section>
      </>
    );
  }
  return (
    <>
      <Section title="내 주기를 기록하는 사람" first>
        <p className="mb-3 text-[17px] leading-relaxed text-muted">
          코드를 만들어 파트너에게 보내 주세요. 15분 동안 쓸 수 있고, 입력하면 바로 연결되니 믿는 사람에게만 보내 주세요.
        </p>
        <p className="mb-8 text-[17px] font-medium leading-relaxed">
          연결하면 생리·가임기·배란일이 상대에게 보여요
        </p>
        <InviteBox origin={await siteOrigin()} />
        <p className="mt-6 text-center text-sm">
          <Link href="/connect" className="link">파트너가 코드를 입력했다면 새로고침</Link>
        </p>
      </Section>
      <Section title="상대 편이 되어줄 사람">
        <p className="mb-8 text-[17px] leading-relaxed text-muted">
          상대에게 받은 8자리 코드를 입력해 주세요. 연결되면 파트너 화면으로 바뀌어요.
          내 기록은 지워지지 않고, 연결을 끊으면 다시 보여요.
        </p>
        <ClaimForm code={claim.code} notice={claim.notice} secondary />
      </Section>
    </>
  );
}

async function PartnerConnect({ user, claim }: { user: User; claim: Claim }) {
  const db = await getDb();
  const couple = await activeCouple(db, user.id);
  if (couple) {
    const name = await otherNickname(db, couple, user);
    return (
      <>
        <p className="mt-4 text-2xl font-medium">{name}님과 연결돼 있어요</p>
        <Section title={`${name}님과 함께 보는 것`}>
          {couple.paused ? <p className="text-[15px] text-muted">{name}님은 잠시 쉬는 중이에요.</p> : <SharedList />}
        </Section>
      </>
    );
  }
  return (
    <>
      <p className="mt-4 mb-10 text-[17px] leading-relaxed text-muted">상대에게 받은 8자리 코드를 입력해 주세요.</p>
      <ClaimForm code={claim.code} notice={claim.notice} />
    </>
  );
}
