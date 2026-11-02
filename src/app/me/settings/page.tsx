import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { listBlocked } from "@/lib/services/community";
import { activeCouple, otherNickname } from "@/lib/services/couples";
import { usualCycle } from "@/lib/services/periods";
import { requireUser } from "@/lib/session";
import { disconnectAction, unblockAction } from "../../actions";
import { PasswordForm } from "../../_components/AuthForm";
import { Nav } from "../../_components/Nav";
import { LogoutButton, WithdrawForm } from "../../_components/NotificationSettings";
import { UsualCycleForm } from "../../_components/PeriodForm";

export const dynamic = "force-dynamic";

const ROW = "border-b border-line last:border-b-0";
const CONFIRM_BUTTON = "h-11 rounded-full border border-period-ink px-6 text-[15px] text-period-ink";

/** 되돌리기 어려운 동작은 펼쳐서 안내를 읽고 한 번 더 눌러야 실행된다. */
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
  const usual = user.role === "recorder" ? await usualCycle(db, user.id) : null;
  const blocked = await listBlocked(db, user);
  return (
    <>
      <Link href="/me" className="link text-sm">마이</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">설정</h1>
      <ul className="card mt-6">
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
          <ConfirmRow label="연결 끊기">
            <p className="text-[15px] leading-relaxed text-muted">
              끊으면 {name}님은 바로 아무것도 볼 수 없어요. 다시 연결하면 공유 설정은 기본값으로 돌아가요.
              이미 본 내용까지 지울 수는 없어요.
            </p>
            <form action={disconnectAction} className="mt-4">
              <button type="submit" className={CONFIRM_BUTTON}>끊을게요</button>
            </form>
          </ConfirmRow>
        )}
        <li className={ROW}>
          <LogoutButton className="" buttonClassName="w-full py-3.5 text-left text-[15px]" />
        </li>
        <ConfirmRow label="회원 탈퇴">
          <p className="text-[15px] leading-relaxed text-muted">탈퇴하면 기록이 모두 지워지고 되돌릴 수 없어요.</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            이야기에 쓴 글과 댓글은 &ldquo;탈퇴한 사용자&rdquo;로 남아요. 지우고 싶다면 탈퇴하기 전에 지워 주세요.
          </p>
          <WithdrawForm buttonClassName={CONFIRM_BUTTON} />
        </ConfirmRow>
      </ul>
      <Nav role={user.role} active="me" />
    </>
  );
}
