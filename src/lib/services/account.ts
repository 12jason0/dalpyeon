import { and, eq, or } from "drizzle-orm";
import type { DB } from "../db";
import { blocks, careRequests, couples, dayLogs, invitations, periods, pushSubscriptions, sessions, users } from "../db/schema";
import type { User } from "./auth";
import { WITHDRAWN_NAME } from "./community";
import { endCouple, lockUsers } from "./couples";
import { unlinkKakao } from "./kakao";

/**
 * 회원 탈퇴. 글·댓글과 신고가 가리킬 수 있게 users 행은 남기되, 개인정보를 모두 비워 다시 로그인할 수 없게 한다.
 * 나를 차단한 기록은 상대의 것이라 남긴다. 지우면 그 사람에게 내 글이 다시 보인다.
 */
export async function withdraw(db: DB, user: User, fetcher?: typeof fetch) {
  const mine = or(eq(couples.recorderId, user.id), eq(couples.partnerId, user.id));
  const kakaoId = await db.transaction(async (tx) => {
    // claimInvite처럼 두 사람을 먼저 잠가, 탈퇴하는 사이 새 연결이 생기거나 상대의 탈퇴·끊기와 교착되지 않게 한다.
    const active = await tx.select().from(couples).where(and(mine, eq(couples.status, "active")));
    await lockUsers(tx, [user.id, ...active.flatMap((c) => [c.recorderId, c.partnerId])]);
    const [me] = await tx.select({ kakaoId: users.kakaoId }).from(users).where(eq(users.id, user.id));
    const connected = await tx.select().from(couples).where(mine);
    for (const couple of connected) await endCouple(tx, couple);
    // 받은 답장은 요청과 함께, 보낸 답장은 연결과 함께 지워진다 (on delete cascade).
    await tx.delete(careRequests).where(eq(careRequests.ownerId, user.id));
    await tx.delete(couples).where(mine);
    await tx.delete(periods).where(eq(periods.ownerId, user.id));
    await tx.delete(dayLogs).where(eq(dayLogs.ownerId, user.id));
    await tx.delete(invitations).where(or(eq(invitations.recorderId, user.id), eq(invitations.claimantId, user.id)));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
    await tx.delete(blocks).where(eq(blocks.blockerId, user.id));
    await tx.update(users).set({
      email: null, passwordHash: null, kakaoId: null, role: "recorder", nickname: WITHDRAWN_NAME, isAdmin: false, communityNickname: null,
      healthConsentAt: null, ageConfirmedAt: null, transferConsentAt: null, reminderEnabled: false, reminderSentFor: null, newsSeenAt: null, usualCycleDays: null,
    }).where(eq(users.id, user.id));
    return me?.kakaoId ?? null;
  });
  // 외부 호출이 잠금을 쥐거나 탈퇴를 되돌리면 안 되므로 커밋한 뒤에 부른다.
  if (kakaoId) await unlinkKakao(kakaoId, fetcher);
}
