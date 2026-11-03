import { ChevronRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { listBlocked } from "@/lib/services/community";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { requireUser } from "@/lib/session";
import { disconnectAction, unblockAction } from "../../actions";
import { PasswordForm } from "../../_components/AuthForm";
import { BackLink } from "../../_components/BackLink";
import { ConfirmButton } from "../../_components/ConfirmButton";
import { Nav } from "../../_components/Nav";
import { LogoutButton, WithdrawButton } from "../../_components/NotificationSettings";
import { UsualCycleForm } from "../../_components/PeriodForm";

export const dynamic = "force-dynamic";

const ROW = "border-b border-line last:border-b-0";
const ROW_BUTTON = "w-full py-3.5 text-left text-[15px]";

/** 눌러서 펼치는 줄. */
function ConfirmRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className={ROW}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[15px]">
          {label}
          <ChevronRight size={18} className="shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden />
        </summary>
        <div className="pb-4">{children}</div>
      </details>
    </li>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const db = await getDb();
  const couple = await activeCouple(db, user.id);
  const name = couple ? await otherNickname(db, couple, user) : null;
  const usual = user.role === "recorder" ? user.usualCycleDays : null;
  const blocked = await listBlocked(db, user);
  return (
    <>
      <BackLink href="/me" />
      <h1 className="sr-only">설정</h1>
      <ul className="card mt-2">
        {user.role === "recorder" && <li className={`${ROW} pb-4`}><UsualCycleForm initial={usual} /></li>}
        {user.email && (
          <ConfirmRow label="비밀번호 변경">
            <PasswordForm />
          </ConfirmRow>
        )}
        {(blocked.length > 0 || user.role === "partner") && (
          <ConfirmRow label="차단한 사람">
            {blocked.length === 0 && <p className="text-[15px] text-muted">차단한 사람이 없어요.</p>}
            <ul>
              {blocked.map((b) => (
                <li key={b.key} className="flex items-center justify-between gap-4 py-2">
                  <span className="min-w-0 text-[15px]">{b.nickname}</span>
                  <form action={unblockAction} className="shrink-0">
                    <input type="hidden" name="key" value={b.key} />
                    <button type="submit" className="link h-11 text-sm">차단 풀기</button>
                  </form>
                </li>
              ))}
            </ul>
          </ConfirmRow>
        )}
        {name && (
          <li className={ROW}>
            <ConfirmButton
              label="연결 끊기" className={ROW_BUTTON} confirmLabel="끊기" danger action={disconnectAction}
              title={user.role === "recorder" ? `연결을 끊으면 ${name}님은 더 이상 기록을 볼 수 없어요` : `연결을 끊으면 ${name}님의 기록을 더 이상 볼 수 없어요`}
              note="다시 연결하면 공유 설정은 기본값으로 돌아가요. 이미 본 내용까지 지울 수는 없어요."
            />
          </li>
        )}
        <li className={ROW}>
          <LogoutButton className="" buttonClassName={ROW_BUTTON} />
        </li>
        <li className={ROW}>
          <WithdrawButton className={ROW_BUTTON} note="남친톡에 쓴 글과 댓글은 “탈퇴한 사용자”로 남아요. 지우고 싶다면 탈퇴하기 전에 지워 주세요." />
        </li>
      </ul>
      <Nav role={user.role} active="me" />
    </>
  );
}
