import { headers } from "next/headers";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import type { User } from "@/lib/services/auth";
import { activeCouple, otherNickname, pendingRequests, waitingClaim } from "@/lib/services/couples";
import { requireUser } from "@/lib/session";
import { approveAction, disconnectAction, rejectAction } from "../actions";
import { ClaimForm, InviteBox, SharingForm } from "../_components/ConnectForms";
import { Nav } from "../_components/Nav";
import { Row, Section } from "../_components/Section";

export const dynamic = "force-dynamic";

const LABELS = { periods: "생리 기록", predictions: "다음 생리 예상", fertility: "가임기 (추정)", care: "배려 요청" } as const;

const CLAIM_NOTICES: Record<string, string> = {
  code: "코드를 다시 확인해 주세요",
  connected: "이미 연결된 상대가 있어요",
  limit: "시도가 너무 많아요. 잠시 후 다시 해 주세요",
};

type Claim = { code?: string; notice?: string };

/** 링크를 보낼 주소. 요청 헤더에서 읽는다. */
async function siteOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ claim?: string; code?: string; sharing?: string }> }) {
  const user = await requireUser();
  const { claim, code, sharing } = await searchParams;
  const notice = claim ? CLAIM_NOTICES[claim] : undefined;
  const sent: Claim = { code: typeof code === "string" ? code.slice(0, 12) : undefined, notice };
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">연결</h1>
      {user.role === "recorder" ? <RecorderConnect user={user} claim={sent} justConnected={sharing === "new"} /> : <PartnerConnect user={user} claim={sent} />}
      <Nav role={user.role} active="connect" />
    </>
  );
}

function Disconnect({ name }: { name: string }) {
  return (
    <details className="mt-12">
      <summary className="cursor-pointer list-none text-sm text-muted underline underline-offset-4">연결 끊기</summary>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        끊으면 {name}님은 바로 아무것도 볼 수 없어요. 다시 연결하면 공유 설정은 처음부터 다시 정해요.
        이미 본 내용까지 지울 수는 없어요.
      </p>
      <form action={disconnectAction} className="mt-4">
        <button type="submit" className="h-11 rounded-full border border-period-ink px-6 text-[15px] text-period-ink">끊을게요</button>
      </form>
    </details>
  );
}

async function RecorderConnect({ user, claim, justConnected }: { user: User; claim: Claim; justConnected: boolean }) {
  const db = await getDb();
  const couple = await activeCouple(db, user.id);
  if (couple) {
    const name = await otherNickname(db, couple, user);
    const nothingShared = Object.values(couple.permissions).every((on) => !on);
    return (
      <>
        {justConnected && nothingShared && (
          <p role="status" className="mt-6 rounded-[18px] bg-period px-4 py-3 text-[15px] leading-relaxed text-period-ink">
            {name}님에게 보여줄 것을 골라 주세요. 지금은 아무것도 안 보여요
          </p>
        )}
        <p className="mt-10 text-2xl font-medium">{name}님과 연결돼 있어요</p>
        <Section title={`${name}님에게 보여줄 것`}>
          <SharingForm today={todaySeoul()} initial={{ permissions: couple.permissions, shareFrom: couple.shareFrom, paused: couple.paused }} />
        </Section>
        <Disconnect name={name} />
      </>
    );
  }
  const [requests, waiting] = await Promise.all([pendingRequests(db, user), waitingClaim(db, user)]);
  return (
    <>
      {waiting && <Waiting name={waiting.nickname} />}
      {requests.length > 0 && (
        <Section title="연결 요청">
          {requests.map((r) => (
            <div key={r.id} className="border-b border-line py-5">
              <p className="text-xl font-medium">{r.nickname}</p>
              <p className="mt-1 text-[15px] text-muted">{r.email}</p>
              <div className="mt-4 flex gap-3">
                <form action={approveAction} className="flex-1">
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn">연결할게요</button>
                </form>
                <form action={rejectAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="h-[3.25rem] px-5 text-[15px] text-muted">거절</button>
                </form>
              </div>
            </div>
          ))}
        </Section>
      )}
      {!waiting && (
        <>
          <Section title="내 주기를 기록하는 사람">
            <p className="mb-8 text-[17px] leading-relaxed text-muted">
              코드를 만들어 파트너에게 보내 주세요. 15분 동안 쓸 수 있어요.
              연결해도 처음엔 아무것도 보이지 않고, 보여줄 항목은 직접 고를 수 있어요.
            </p>
            <InviteBox origin={await siteOrigin()} />
            {requests.length === 0 && (
              <p className="mt-6 text-center text-sm">
                <Link href="/connect" className="link">파트너가 코드를 입력했다면 새로고침</Link>
              </p>
            )}
          </Section>
          <Section title="상대 편이 되어줄 사람">
            <p className="mb-8 text-[17px] leading-relaxed text-muted">
              상대에게 받은 8자리 코드를 입력해 주세요. 상대가 승인하면 파트너 화면으로 바뀌어요.
              내 기록은 지워지지 않고, 연결을 끊으면 다시 보여요.
            </p>
            <ClaimForm code={claim.code} notice={claim.notice} />
          </Section>
        </>
      )}
    </>
  );
}

function Waiting({ name }: { name: string }) {
  return (
    <>
      <p className="mt-10 text-2xl font-medium leading-snug">{name}님이 승인하면 연결돼요</p>
      <p className="mt-4 text-[15px] text-muted">승인을 기다리고 있어요.</p>
      <p className="mt-8 text-sm"><Link href="/connect" className="link">새로고침</Link></p>
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
        <p className="mt-10 text-2xl font-medium">{name}님과 연결돼 있어요</p>
        <Section title={`${name}님이 보여주는 것`}>
          {Object.entries(LABELS).map(([key, label]) => (
            <Row key={key} label={label} value={couple.permissions[key as keyof typeof LABELS] && !couple.paused ? "보여요" : "—"} />
          ))}
          <p className="pt-4 text-[13px] text-muted">보여줄 항목은 {name}님이 정해요.</p>
        </Section>
        <Disconnect name={name} />
      </>
    );
  }
  const waiting = await waitingClaim(db, user);
  if (waiting) return <Waiting name={waiting.nickname} />;
  return (
    <>
      <p className="mt-10 mb-10 text-[17px] leading-relaxed text-muted">상대에게 받은 8자리 코드를 입력해 주세요.</p>
      <ClaimForm code={claim.code} notice={claim.notice} />
    </>
  );
}
