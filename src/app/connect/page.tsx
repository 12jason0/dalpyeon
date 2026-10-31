import Link from "next/link";
import { getDb } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import type { User } from "@/lib/services/auth";
import { activeCouple, otherNickname, pendingRequests, waitingClaim } from "@/lib/services/couples";
import { requireUser } from "@/lib/session";
import { approveAction, disconnectAction, logoutAction, rejectAction } from "../actions";
import { ClaimForm, InviteBox, SharingForm } from "../_components/ConnectForms";
import { Nav } from "../_components/Nav";
import { Row, Section } from "../_components/Section";

export const dynamic = "force-dynamic";

const LABELS = { periods: "생리 기록", predictions: "다음 생리 예상", fertility: "가임기 (추정)", care: "배려 요청" } as const;

export default async function ConnectPage() {
  const user = await requireUser();
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">연결</h1>
      {user.role === "recorder" ? <RecorderConnect user={user} /> : <PartnerConnect user={user} />}

      <Section title="계정">
        <Row label={user.nickname} value={<span className="text-[15px] font-normal text-muted">{user.email}</span>} />
        <form action={logoutAction} className="pt-6">
          <button type="submit" className="text-sm link">로그아웃</button>
        </form>
      </Section>
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
        <button type="submit" className="h-11 rounded-full border border-period px-6 text-[15px] text-period">끊을게요</button>
      </form>
    </details>
  );
}

async function RecorderConnect({ user }: { user: User }) {
  const db = await getDb();
  const couple = await activeCouple(db, user.id);
  if (couple) {
    const name = await otherNickname(db, couple, user);
    return (
      <>
        <p className="mt-10 text-2xl font-medium">{name}님과 연결돼 있어요</p>
        <Section title={`${name}님에게 보여줄 것`}>
          <SharingForm today={todaySeoul()} initial={{ permissions: couple.permissions, shareFrom: couple.shareFrom, paused: couple.paused }} />
        </Section>
        <Disconnect name={name} />
      </>
    );
  }
  const requests = await pendingRequests(db, user);
  return (
    <>
      <p className="mt-10 text-[17px] leading-relaxed text-muted">
        코드를 만들어 파트너에게 보내 주세요. 15분 동안 쓸 수 있어요.
        연결해도 처음엔 아무것도 보이지 않고, 보여줄 항목은 직접 고를 수 있어요.
      </p>
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
      <div className="mt-10">
        <InviteBox />
      </div>
      {requests.length === 0 && (
        <p className="mt-6 text-center text-sm">
          <Link href="/connect" className="link">파트너가 코드를 입력했다면 새로고침</Link>
        </p>
      )}
    </>
  );
}

async function PartnerConnect({ user }: { user: User }) {
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
  if (waiting) {
    return (
      <>
        <p className="mt-10 text-2xl font-medium leading-snug">{waiting.nickname}님이 승인하면 연결돼요</p>
        <p className="mt-4 text-[15px] text-muted">승인을 기다리고 있어요.</p>
        <p className="mt-8 text-sm"><Link href="/connect" className="link">새로고침</Link></p>
      </>
    );
  }
  return (
    <>
      <p className="mt-10 mb-10 text-[17px] leading-relaxed text-muted">상대에게 받은 8자리 코드를 입력해 주세요.</p>
      <ClaimForm />
    </>
  );
}
