import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDb, type DB } from "@/lib/db";
import {
  blocks, careRequests, careResponses, comments, couples, dayLogs, invitations, periods, posts, pushSubscriptions, rateLimits, reports, sessions, users,
} from "@/lib/db/schema";
import { barOn, calendarWindow } from "@/lib/calendar";
import { ARTICLES, findArticle } from "@/lib/content/articles";
import EXAMPLE_POSTS from "@/lib/content/example-posts.json";
import PINNED_POSTS from "@/lib/content/pinned-posts.json";
import { RULES } from "@/lib/content/rules";
import { addDays, monthDay, timeSeoul } from "@/lib/dates";
import { summarizeLogs } from "@/lib/daylog";
import { CRESCENT, moonShape, nextLine } from "@/lib/moon";
import { calendarMarks, endQuestion, estimate, predictionError } from "@/lib/prediction";
import { AppError, errorKind } from "@/lib/errors";
import { withdraw } from "@/lib/services/account";
import {
  changePassword, consentDone, createSession, deleteSession, hashPassword, limit, login, purgeExpired, recordConsents, sha256, signup, updateNickname, userFromToken, type User,
} from "@/lib/services/auth";
import { CARE_PRESETS, careChip, careGroup, careLabel, clearCare, getCare, orderPresets, recentPresets, recentReplies, replySentence, respondToCare, saveCare } from "@/lib/services/care";
import {
  activeCouple, claimInvite, claimWithLimit, clearSharingNotice, createInvite, disconnect, otherNickname, setPaused, tryClaim, updateSharing,
} from "@/lib/services/couples";
import {
  agreeToRules, blockAuthor, communityAccess, createComment, createPost, decideReport, deleteComment, deletePost, getPost, listPosts,
  listBlocked, listReports, myPosts, report, TEAM_NAME, toggleLike, unblock, updateComment, updatePost,
} from "@/lib/services/community";
import { dayLogOn, listDayLogs, saveDayLog } from "@/lib/services/daylogs";
import { kakaoAuthorizeUrl, kakaoEnabled, kakaoLanding, signInWithKakao } from "@/lib/services/kakao";
import {
  autoEndPeriods, currentPeriod, deletePeriod, listPeriods, predictionFor, savePeriod, setUsualCycle, snoozeEndQuestion, usualCycle,
} from "@/lib/services/periods";
import { partnerView } from "@/lib/services/partner";
import {
  cronAuthorized, markNewsSeen, newsFor, newsItems, notifyCare, notifyConnected, notifyReply, reminderEnabled, removeSubscription, saveSubscription,
  sendPush, sendReminders, setReminder, type Sender,
} from "@/lib/services/push";

const TODAY = "2026-10-30";
const inMonth = <T extends { date: string }>(marks: T[], month: string) => marks.filter((m) => m.date.startsWith(month));
const AGREED = { healthConsent: true, ageConfirmed: true, transferConsent: true };
let db: DB;

async function expectFail(promise: Promise<unknown>, status?: number) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  if (status) expect((err as AppError).status).toBe(status);
}

async function pair(): Promise<{ me: User; you: User }> {
  const me = await signup(db, { email: "me@example.com", password: "password-1", nickname: "나", ...AGREED });
  const you = await signup(db, { email: "you@example.com", password: "password-2", nickname: "너", ...AGREED });
  return { me, you };
}

/** 역할은 연결 상태에 따라 바뀌므로, 실제 앱처럼 DB에서 다시 읽는다. */
async function reload(user: User): Promise<User> {
  const [row] = await db.select({ id: users.id, email: users.email, role: users.role, nickname: users.nickname })
    .from(users).where(eq(users.id, user.id));
  return row;
}

async function connect(me: User, you: User) {
  const { code } = await createInvite(db, me);
  return claimInvite(db, you, code.toLowerCase(), TODAY); // 소문자·하이픈 입력도 받는다
}

describe("이름 수정", () => {
  it("앞뒤 공백을 지우고, 연결된 상대에게 바뀐 이름이 보이며, 남친톡 닉네임은 그대로다", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await claimInvite(db, you, code);
    await db.update(users).set({ communityNickname: "편-1234" }).where(eq(users.id, me.id));
    await updateNickname(db, me, "  새이름  ");
    const couple = (await activeCouple(db, you.id))!;
    expect(await otherNickname(db, couple, await reload(you))).toBe("새이름");
    const [row] = await db.select().from(users).where(eq(users.id, me.id));
    expect(row.communityNickname).toBe("편-1234");
  });

  it("1~20자만 받고, 틀리면 그대로 둔다", async () => {
    const { me } = await pair();
    for (const value of ["", "   ", "가".repeat(21), null]) await expectFail(updateNickname(db, me, value));
    await updateNickname(db, me, "가".repeat(20));
    expect((await reload(me)).nickname).toBe("가".repeat(20));
  });
});

describe("배려 칩", () => {
  it("상태마다 글자가 다르고, 공유가 멈추면 보낸 것으로 보이지 않는다", () => {
    expect(careChip(null, true)).toBeNull();
    expect(careChip(null, false)).toBeNull();
    expect(careChip({ shareWithPartner: false }, true)).toEqual({ label: "나만 봐요", sent: false });
    expect(careChip({ shareWithPartner: true }, false)).toEqual({ label: "나만 봐요", sent: false });
    expect(careChip({ shareWithPartner: true }, true)).toEqual({ label: "답장 기다리는 중", sent: true });
    expect(careChip({ shareWithPartner: true, response: "will_help" }, true)).toBeNull(); // 답장은 칩 대신 문장으로 보인다
  });

  it("답장 문장과 시간은 홈과 새 소식이 같은 함수로 만든다", () => {
    expect(replySentence("도윤", "seen")).toBe("도윤님이 '봤어요'라고 답했어요");
    expect(replySentence("도윤", "will_help")).toBe("도윤님이 '도와줄게요'라고 답했어요");
    expect(replySentence("도윤", "done")).toBe("도윤님이 '했어요'라고 답했어요");
    expect(timeSeoul(new Date("2026-11-03T06:20:00Z"))).toBe("오후 3:20"); // UTC 06:20 = 서울 15:20
    expect(timeSeoul(new Date("2026-11-02T15:05:00Z"))).toBe("오전 12:05"); // 서울은 이미 다음 날 자정 넘김
  });
});

async function fourPeriods(user: User) {
  // 28일 간격 4번 → 예측 가능
  for (const start of ["2026-07-10", "2026-08-07", "2026-09-04", "2026-10-02"]) {
    await savePeriod(db, user.id, { startDate: start, endDate: addDays(start, 4) }, TODAY);
  }
}

/** 테스트가 끝나면 afterEach에서 닫을 DB를 만든다. */
const opened: DB[] = [];
async function openDb() {
  const opening = await createLocalDb();
  opened.push(opening);
  return opening;
}

beforeEach(async () => {
  db = await openDb();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((d) => (d as unknown as { $client: { close(): Promise<void> } }).$client.close()));
});

describe("계정", () => {
  it("가입 → 로그인 → 세션 → 로그아웃", async () => {
    const user = await signup(db, { email: " Me@Example.com ", password: "password-1", nickname: "나", ...AGREED });
    expect(user.email).toBe("me@example.com");
    await expectFail(signup(db, { email: "me@example.com", password: "password-1", nickname: "다른", ...AGREED }), 409);
    await expectFail(login(db, { email: "me@example.com", password: "wrong-pass" }), 401);
    await expectFail(login(db, { email: "nobody@example.com", password: "password-1" }), 401);
    const logged = await login(db, { email: "ME@example.com", password: "password-1" });
    expect(consentDone(logged)).toBe(true); // 초대 링크 로그인이 동의 화면을 거칠지 이 값으로 정한다
    const { token } = await createSession(db, logged.id);
    expect((await userFromToken(db, token))?.id).toBe(user.id);
    expect(await userFromToken(db, "fake-token")).toBeNull();
    await deleteSession(db, token);
    expect(await userFromToken(db, token)).toBeNull();
  });

  it("가입하면 누구나 기록자", async () => {
    const user = await signup(db, { email: "a@b.co", password: "password-1", nickname: "a", ...AGREED });
    expect(user.role).toBe("recorder");
    expect((await reload(user)).role).toBe("recorder");
  });

  it("세 가지 필수 동의가 없으면 가입할 수 없고, 동의 시각을 저장한다", async () => {
    const input = { email: "a@b.co", password: "password-1", nickname: "a" };
    for (const key of ["healthConsent", "ageConfirmed", "transferConsent"]) {
      for (const value of [false, undefined, "on", 1]) await expectFail(signup(db, { ...input, ...AGREED, [key]: value }));
    }
    expect(await db.select().from(users)).toEqual([]);
    const before = Date.now();
    const user = await signup(db, { ...input, ...AGREED });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    for (const at of [row.healthConsentAt, row.ageConfirmedAt, row.transferConsentAt]) expect(at?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("기존 가입자: 건강 정보 동의는 다시 받지 않고 나이 확인과 국외 이전만 받는다. 첫 동의 시각은 바뀌지 않는다", async () => {
    const user = await signup(db, { email: "old@b.co", password: "password-1", nickname: "옛", ...AGREED });
    await db.update(users).set({ ageConfirmedAt: null, transferConsentAt: null }).where(eq(users.id, user.id));
    const { token } = await createSession(db, user.id);
    const before = (await userFromToken(db, token))!;
    expect(consentDone(before)).toBe(false);

    await expectFail(recordConsents(db, before, { healthConsent: false, ageConfirmed: true, transferConsent: false }));
    await expectFail(recordConsents(db, before, { healthConsent: false, ageConfirmed: false, transferConsent: true }));
    await recordConsents(db, before, { healthConsent: false, ageConfirmed: true, transferConsent: true });
    const after = (await userFromToken(db, token))!;
    expect(consentDone(after)).toBe(true);
    expect(after.healthConsentAt).toEqual(before.healthConsentAt);

    await new Promise((r) => setTimeout(r, 5));
    await recordConsents(db, after, AGREED);
    expect((await userFromToken(db, token))?.transferConsentAt).toEqual(after.transferConsentAt);
  });

  it("건강 정보 동의가 없던 계정은 셋 다 받아야 한다", async () => {
    const user = await signup(db, { email: "older@b.co", password: "password-1", nickname: "옛", ...AGREED });
    await db.update(users).set({ healthConsentAt: null, ageConfirmedAt: null, transferConsentAt: null }).where(eq(users.id, user.id));
    const { token } = await createSession(db, user.id);
    const before = (await userFromToken(db, token))!;
    await expectFail(recordConsents(db, before, { healthConsent: false, ageConfirmed: true, transferConsent: true }));
    await recordConsents(db, before, AGREED);
    expect(consentDone((await userFromToken(db, token))!)).toBe(true);
  });

  it("비밀번호는 8~20자만 받고, 이미 더 긴 비밀번호는 로그인과 변경에 그대로 쓴다", async () => {
    const input = { email: "len@b.co", nickname: "a", ...AGREED };
    await expectFail(signup(db, { ...input, password: "x".repeat(7) }));
    await expectFail(signup(db, { ...input, password: "x".repeat(21) }));
    const user = await signup(db, { ...input, password: "x".repeat(20) });

    const long = "긴비밀번호-".repeat(5);
    await db.update(users).set({ passwordHash: await hashPassword(long) }).where(eq(users.id, user.id));
    expect((await login(db, { email: "len@b.co", password: long })).id).toBe(user.id);
    await expectFail(changePassword(db, user, { current: long, next: "y".repeat(21), confirm: "y".repeat(21) }, "t"));
    await changePassword(db, user, { current: long, next: "y".repeat(20), confirm: "y".repeat(20) }, "t");
    expect((await login(db, { email: "len@b.co", password: "y".repeat(20) })).id).toBe(user.id);
  });

  it("입력 검증: 짧은 비밀번호 거부", async () => {
    await expectFail(signup(db, { email: "a@b.co", password: "short", nickname: "a", ...AGREED }));
  });

  it("크론 정리: 만료된 세션과 지난 요청 제한만 지운다", async () => {
    const user = await signup(db, { email: "purge@b.co", password: "password-1", nickname: "a", ...AGREED });
    const live = await createSession(db, user.id);
    const old = await createSession(db, user.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, sha256(old.token)));
    await limit(db, "login", "1.1.1.1", 3, -1);
    await limit(db, "login", "2.2.2.2", 3, 60);

    expect(await purgeExpired(db)).toEqual({ sessions: 1, rateLimits: 1 });
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await db.select().from(rateLimits)).toHaveLength(1);
    expect((await userFromToken(db, live.token))?.id).toBe(user.id);
  });

  it("로그에는 오류 종류만 남고 쿼리 입력값은 남지 않는다", () => {
    const cause = Object.assign(new Error("db"), { code: "23505" });
    const e = Object.assign(new Error("Failed query: insert\nparams: secret@example.com"), { name: "DrizzleQueryError", cause });
    expect(errorKind(e)).toBe("DrizzleQueryError 23505");
    expect(errorKind("secret")).toBe("unknown");
  });

  it("요청 제한: 최대치를 넘으면 429", async () => {
    for (let i = 0; i < 3; i++) await limit(db, "login", "1.2.3.4", 3, 60);
    await expectFail(limit(db, "login", "1.2.3.4", 3, 60), 429);
    await limit(db, "login", "5.6.7.8", 3, 60); // 다른 IP는 영향 없음
  });
});

describe("생리 기록", () => {
  it("저장·수정·겹침·미래 날짜·남의 기록", async () => {
    const { me, you } = await pair();
    const p = await savePeriod(db, me.id, { startDate: "2026-10-02", endDate: "2026-10-06" }, TODAY);
    await expectFail(savePeriod(db, me.id, { startDate: "2026-10-05" }, TODAY), 409);
    await expectFail(savePeriod(db, me.id, { startDate: "2026-11-01" }, TODAY));
    await expectFail(savePeriod(db, me.id, { startDate: "2026-10-10", endDate: "2026-10-09" }, TODAY));
    await expectFail(savePeriod(db, me.id, { startDate: "2026-09-01", excluded: true }, TODAY)); // 사유 필요
    const edited = await savePeriod(db, me.id, { id: p.id, startDate: "2026-10-02", endDate: "2026-10-07" }, TODAY);
    expect(edited.endDate).toBe("2026-10-07");
    await expectFail(savePeriod(db, you.id, { id: p.id, startDate: "2026-10-02" }, TODAY), 404);
    await expectFail(deletePeriod(db, you.id, p.id), 404);
    await deletePeriod(db, me.id, p.id);
    expect(await listPeriods(db, me.id)).toHaveLength(0);
  });

  it("예측과 오늘 며칠째", async () => {
    const { me } = await pair();
    await fourPeriods(me);
    const prediction = await predictionFor(db, me.id, TODAY);
    expect(prediction.status).toBe("estimated");
    expect(prediction.period?.startDate).toBe("2026-10-30");
    await savePeriod(db, me.id, { startDate: "2026-10-28" }, TODAY);
    expect(currentPeriod(await listPeriods(db, me.id), TODAY)).toMatchObject({ day: 3, open: true });
    expect(currentPeriod(await listPeriods(db, me.id), "2026-11-10")).toMatchObject({ day: 14, open: true }); // 끝낼 때까지 진행 중
  });
});

describe("커플 연결", () => {
  it("코드 입력 → 바로 연결. 1:1", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await expectFail(claimInvite(db, you, "AAAA-AAAA"), 404);
    const couple = await claimInvite(db, you, code, TODAY);
    expect(couple).toMatchObject({ recorderId: me.id, partnerId: you.id, status: "active" });
    expect(couple.permissions).toEqual({ periods: true, predictions: true, fertility: false, care: true });
    expect(couple.sharingNotice).toBe(true);
    expect(couple.shareFrom).toBe(TODAY);
    expect((await reload(you)).role).toBe("partner");
    expect((await reload(me)).role).toBe("recorder");
    await expectFail(createInvite(db, me), 409);
    await expectFail(createInvite(db, await reload(you)), 403); // 파트너는 코드를 만들 수 없다
  });

  it("자기 코드는 입력할 수 없고, 코드는 그대로 남는다", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await expectFail(claimInvite(db, me, code), 400);
    expect((await reload(me)).role).toBe("recorder");
    await claimInvite(db, you, code);
  });

  it("한 번 쓴 코드는 재사용할 수 없다. 끊은 뒤에도 마찬가지", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", ...AGREED });
    const { code } = await createInvite(db, me);
    await claimInvite(db, you, code);
    await expectFail(claimInvite(db, third, code), 404);
    await expectFail(claimInvite(db, await reload(you), code), 409);
    await disconnect(db, me);
    await expectFail(claimInvite(db, await reload(you), code), 404);
    await expectFail(claimInvite(db, third, code), 404);
    expect((await reload(third)).role).toBe("recorder");
  });

  it("만료된 코드는 막히고 아무것도 바뀌지 않는다", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    await expectFail(claimInvite(db, you, code), 404);
    expect((await reload(you)).role).toBe("recorder");
    expect(await activeCouple(db, me.id)).toBeNull();
  });

  it("같은 코드를 동시에 입력해도 한 명만 연결된다", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", ...AGREED });
    const { code } = await createInvite(db, me);
    const results = await Promise.allSettled([claimInvite(db, you, code), claimInvite(db, third, code)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const roles = [(await reload(you)).role, (await reload(third)).role];
    expect(roles.filter((r) => r === "partner")).toHaveLength(1);
  });

  it("기록자는 모르는 사람과 연결돼도 바로 끊을 수 있다", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    await disconnect(db, me);
    expect(await activeCouple(db, me.id)).toBeNull();
    expect(await activeCouple(db, you.id)).toBeNull();
    expect((await reload(you)).role).toBe("recorder");
    await expectFail(partnerView(db, await reload(you), TODAY));
  });

  it("DB에 남은 대기 요청은 무시된다: 코드는 못 쓰고, 다시 연결하는 데 방해되지 않는다", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", ...AGREED });
    const old = await createInvite(db, me);
    await db.update(invitations).set({ status: "pending", claimantId: you.id });
    await expectFail(claimInvite(db, third, old.code), 404);
    expect(await newsFor(db, me, TODAY)).toEqual({ replies: 0, care: 0 });
    expect(await activeCouple(db, you.id)).toBeNull();
    await connect(me, third); // 기록자는 새 코드로 다른 사람과 연결할 수 있다
    const [row] = await db.select().from(invitations).where(eq(invitations.claimantId, you.id));
    expect(row.status).toBe("revoked");
  });

  it("끊으면 누가 끊든 파트너가 기록자로 돌아오고, 예전 기록이 다시 보인다", async () => {
    const { me, you } = await pair();
    await savePeriod(db, you.id, { startDate: "2026-10-02", endDate: "2026-10-06" }, TODAY);
    await saveCare(db, you, { presets: ["rest"], message: "", share: false }, TODAY);
    await connect(me, you);

    const partner = await reload(you);
    await expectFail(saveCare(db, partner, { presets: ["rest"], message: "", share: false }, TODAY), 403); // 파트너 동안은 기록자 기능 불가
    await disconnect(db, me); // 기록자 쪽에서 끊어도 파트너의 역할이 되돌아간다

    const back = await reload(you);
    expect(back.role).toBe("recorder");
    expect(await partnerView(db, back, TODAY).catch((e) => e)).toBeInstanceOf(AppError);
    expect((await listPeriods(db, back.id)).map((p) => p.startDate)).toEqual(["2026-10-02"]);
    expect((await getCare(db, back, TODAY))?.presets).toEqual(["rest"]);

    await connect(me, back); // 다시 연결
    await disconnect(db, await reload(you)); // 파트너 쪽에서 끊어도 마찬가지
    expect((await reload(you)).role).toBe("recorder");
    await createInvite(db, await reload(you)); // 다시 코드를 만들 수 있다
  });

  it("입력한 사람이 만들어 둔 코드는 연결되면 무효", async () => {
    const { me, you } = await pair();
    const late = await signup(db, { email: "y@example.com", password: "password-4", nickname: "넷", ...AGREED });
    const yours = await createInvite(db, you);
    const mine = await createInvite(db, me);
    await claimInvite(db, you, mine.code);
    await expectFail(claimInvite(db, late, yours.code), 404);
  });

  it("서로의 코드를 입력해도 먼저 입력한 쪽만 연결된다", async () => {
    const { me, you } = await pair();
    const mine = await createInvite(db, me);
    const yours = await createInvite(db, you);
    await claimInvite(db, you, mine.code);
    await expectFail(claimInvite(db, me, yours.code), 409);
    expect((await reload(me)).role).toBe("recorder");
  });

  it("이미 다른 연결의 기록자인 사람은 파트너가 될 수 없다", async () => {
    const { me, you } = await pair();
    const fourth = await signup(db, { email: "y@example.com", password: "password-4", nickname: "넷", ...AGREED });
    const mine = await createInvite(db, me);
    const yours = await createInvite(db, you);
    await claimInvite(db, fourth, yours.code);
    await expectFail(claimInvite(db, you, mine.code), 409);
    expect((await reload(you)).role).toBe("recorder");
  });

  it("이미 파트너가 있는 기록자의 코드로는 연결되지 않는다", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", ...AGREED });
    const mine = await createInvite(db, me);
    await claimInvite(db, you, mine.code);
    // 연결될 때 지워지지 않고 남은 코드가 있더라도 busy 검사가 막는다
    await db.update(invitations).set({ status: "open", claimantId: null });
    await expectFail(claimInvite(db, third, mine.code), 409);
    expect((await reload(third)).role).toBe("recorder");
  });

  it("새 코드를 만들면 이전 코드는 무효", async () => {
    const { me, you } = await pair();
    const first = await createInvite(db, me);
    await createInvite(db, me);
    await expectFail(claimInvite(db, you, first.code), 404);
    expect(await activeCouple(db, me.id)).toBeNull();
  });
});

describe("잠시 멈추기", () => {
  it("기록자만 바꿀 수 있고, 켜면 파트너에게 쉬는 중만 보인다", async () => {
    const { me, you } = await pair();
    await expectFail(setPaused(db, me, true), 404); // 연결 전
    await fourPeriods(me);
    await connect(me, you);
    const partner = await reload(you);
    await expectFail(setPaused(db, partner, true), 403);
    await setPaused(db, me, true);
    const view = await partnerView(db, partner, TODAY);
    expect(view).toMatchObject({
      paused: true, current: null, nextPeriod: null, fertileWindow: null, ovulation: null, recentPeriods: [], care: [], calendar: [],
      moon: CRESCENT, todayBody: null,
    });
    await setPaused(db, me, false);
    expect((await partnerView(db, partner, TODAY))?.paused).toBe(false);
  });
});

describe("카카오 로그인", () => {
  const REDIRECT = "http://localhost:3000/api/auth/kakao/callback";

  /** 카카오 서버 대신 답하는 가짜 fetch. 요청은 calls에 남긴다. */
  function kakao(id: number, nickname?: string) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return String(url).includes("/oauth/token") ? Response.json({ access_token: "token-1" }) : Response.json({ id, properties: { nickname } });
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  }

  beforeEach(() => {
    vi.stubEnv("KAKAO_REST_API_KEY", "rest-key");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "secret");
  });

  it("키가 하나라도 없으면 꺼진다", () => {
    expect(kakaoEnabled()).toBe(true);
    vi.stubEnv("KAKAO_CLIENT_SECRET", "");
    expect(kakaoEnabled()).toBe(false);
  });

  it("인증 주소에 state와 요청 주소 기준 redirect_uri가 들어간다", () => {
    const url = new URL(kakaoAuthorizeUrl("state-1", REDIRECT));
    expect(url.origin).toBe("https://kauth.kakao.com");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "rest-key", redirect_uri: REDIRECT, response_type: "code", state: "state-1" });
  });

  it("처음이면 이메일 없이 기록자로 가입하고 동의 화면으로 간다", async () => {
    const { calls, fetcher } = kakao(1001, "지민");
    const user = await signInWithKakao(db, "auth-code", REDIRECT, fetcher);
    expect(user).toMatchObject({ email: null, role: "recorder", nickname: "지민", healthConsentAt: null, ageConfirmedAt: null, transferConsentAt: null });
    expect(kakaoLanding(user)).toBe("/consent"); // 초대 코드가 있어도 동의가 먼저

    const body = calls[0].init?.body as URLSearchParams;
    expect(Object.fromEntries(body)).toMatchObject({ code: "auth-code", client_id: "rest-key", client_secret: "secret", redirect_uri: REDIRECT });
    expect(calls[1].init?.headers).toEqual({ Authorization: "Bearer token-1" });
  });

  it("다시 로그인하면 같은 계정이고, 이메일 없는 계정이 여럿이어도 된다", async () => {
    const first = await signInWithKakao(db, "a", REDIRECT, kakao(1001, "지민").fetcher);
    await recordConsents(db, first, AGREED);
    const again = await signInWithKakao(db, "b", REDIRECT, kakao(1001, "바뀐이름").fetcher);
    expect(again.id).toBe(first.id);
    expect(again.nickname).toBe("지민");
    expect(kakaoLanding(again)).toBe("/"); // 초대 코드가 있으면 콜백이 바로 연결한다

    const other = await signInWithKakao(db, "c", REDIRECT, kakao(1002, "도윤").fetcher);
    expect(other.id).not.toBe(first.id);
    expect(await db.select({ id: users.id }).from(users)).toHaveLength(2);
  });

  it("닉네임이 없거나 길어도 가입된다", async () => {
    expect((await signInWithKakao(db, "a", REDIRECT, kakao(1001).fetcher)).nickname).toBe("디어데이 사용자");
    expect((await signInWithKakao(db, "b", REDIRECT, kakao(1002, "가".repeat(30)).fetcher)).nickname).toHaveLength(20);
  });

  it("코드로 들어와 가입하면 동의 뒤 그 코드로 바로 연결된다", async () => {
    const { me } = await pair();
    const { code } = await createInvite(db, me);
    const user = await signInWithKakao(db, "a", REDIRECT, kakao(1001, "도윤").fetcher);
    await recordConsents(db, user, AGREED); // healthConsentAction과 같은 순서
    expect(await tryClaim(db, user, code, "1.1.1.1")).toBeNull();
    expect((await reload(user)).role).toBe("partner");
    expect(await activeCouple(db, me.id)).toMatchObject({ partnerId: user.id });
  });

  it("카카오가 실패하면 계정을 만들지 않는다", async () => {
    const denied = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(signInWithKakao(db, "bad", REDIRECT, denied)).rejects.toThrow("kakao token 401");
    expect(await db.select({ id: users.id }).from(users)).toEqual([]);
  });

  it("비밀번호가 없는 계정은 비밀번호로 로그인할 수 없다", async () => {
    const { me } = await pair();
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, me.id));
    await expectFail(login(db, { email: "me@example.com", password: "timing-dummy-password" }), 401);
  });
});

describe("코드로 시작하기", () => {
  const newcomer = () => signup(db, { email: "new@example.com", password: "password-9", nickname: "새", ...AGREED });
  const count = async () => (await db.select({ id: users.id }).from(users)).length;

  it("맞는 코드: 가입하면 바로 파트너로 연결", async () => {
    const { me } = await pair();
    const { code } = await createInvite(db, me);
    const user = await newcomer();
    expect(await tryClaim(db, user, code, "1.1.1.1")).toBeNull();
    expect((await reload(user)).role).toBe("partner");
    expect(await activeCouple(db, me.id)).toMatchObject({ partnerId: user.id });
  });

  it("틀린 코드·만료된 코드: 가입은 유지되고 연결되지 않는다", async () => {
    const { me } = await pair();
    const before = await count();
    const user = await newcomer();
    expect(await tryClaim(db, user, "AAAA-AAAA", "1.1.1.1")).toBe("code");
    expect(await tryClaim(db, user, "", "1.1.1.1")).toBe("code");

    const { code } = await createInvite(db, me);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await tryClaim(db, user, code, "1.1.1.1")).toBe("code");

    expect(await count()).toBe(before + 1);
    expect(await activeCouple(db, me.id)).toBeNull();
  });

  it("로그인 상태에서 [연결하기]: 자기 코드는 거부, 연결 안 됨이면 연결, 연결 중이면 안내", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    expect(await tryClaim(db, me, code, "1.1.1.1")).toBe("code");
    expect(await tryClaim(db, you, code.toLowerCase(), "1.1.1.1")).toBeNull();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", ...AGREED });
    const other = await createInvite(db, third);
    expect(await tryClaim(db, await reload(you), other.code, "1.1.1.1")).toBe("connected");
  });

  it("기존 claim 제한을 그대로 쓴다: 계정당 15분에 10번", async () => {
    await pair();
    const user = await newcomer();
    for (let i = 0; i < 10; i++) expect(await tryClaim(db, user, "AAAA-AAAA", "1.1.1.1")).toBe("code");
    expect(await tryClaim(db, user, "AAAA-AAAA", "1.1.1.1")).toBe("limit");
    await expectFail(claimWithLimit(db, user, "AAAA-AAAA", "1.1.1.1"), 429);
  });
});

describe("공유", () => {
  it("기록이 1번뿐이어도 파트너 달력에 배란일이 추정으로 보인다", async () => {
    const { me, you } = await pair();
    await savePeriod(db, me.id, { startDate: "2026-10-30" }, "2026-11-03");
    await connect(me, you);
    const view = (await partnerView(db, await reload(you), "2026-11-03"))!;
    expect(view.ovulation).toBe("2026-11-13");
    expect(view.fertileWindow?.tentative).toBe(true);
    expect(view.calendar).toContainEqual({ date: "2026-11-13", type: "estimated_ovulation", tentative: true });
  });

  it("연결되면 모두 보이고, 계산 근거는 보내지 않는다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await setUsualCycle(db, me, 31);
    await savePeriod(db, me.id, { startDate: "2026-06-01", endDate: "2026-06-05", excluded: true, excludeReason: "비밀 사유" }, TODAY);
    await connect(me, you);
    const partner = await reload(you);
    const asOf = "2026-10-12"; // 예상 가임기(10.11~17)가 아직 지나지 않은 날
    await updateSharing(db, me, { shareFrom: "2026-09-01" }, asOf);

    const view = (await partnerView(db, partner, asOf))!;
    expect(view.nextPeriod?.startDate).toBe("2026-10-30");
    expect(view.fertileWindow).toEqual({ startDate: "2026-10-11", endDate: "2026-10-17", tentative: false });
    expect(view.ovulation).toBe("2026-10-16");
    expect(view.recentPeriods.map((p) => p.startDate)).toEqual(["2026-10-02", "2026-09-04"]);
    expect(new Set(view.calendar.map((m) => m.type))).toEqual(new Set(["period", "predicted_period", "estimated_fertile_window", "estimated_ovulation"]));
    expect(view.calendar.some((m) => m.date < calendarWindow(asOf).first || m.date > calendarWindow(asOf).last)).toBe(false);
    const sent = JSON.stringify(view);
    for (const secret of ["intervals", "비밀 사유", "excluded", "usual", "permissions"]) expect(sent).not.toContain(secret);
  });

  it("파트너: 맨 위 줄의 다음 생리 날짜는 언제나 달력 '생리 예상' 막대의 시작일과 같다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await savePeriod(db, me.id, { startDate: TODAY, endDate: addDays(TODAY, 4) }, addDays(TODAY, 4));
    await connect(me, you);
    const partner = await reload(you);
    // 생리 중 → 다음 예상 전 → 예상일 → 예상일이 지난 뒤까지 하루씩
    for (let day = TODAY; day <= "2027-01-15"; day = addDays(day, 1)) {
      const view = (await partnerView(db, partner, day))!;
      const line = nextLine(view.nextPeriod, day);
      const start = view.calendar.find((m) => barOn(view.calendar, m.date) === "predicted")?.date;
      if (line) expect(line, day).toBe(`다음 생리 ${monthDay(start!)} 예상`);
      else expect(!start || (view.nextPeriod !== null && view.nextPeriod.startDate < day), day).toBe(true);
    }
  });

  it("예전에 꺼 둔 항목 값이 남아 있어도 더는 보지 않는다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    const couple = await connect(me, you);
    await db.update(couples).set({ permissions: { periods: false, predictions: false, fertility: false, care: false } }).where(eq(couples.id, couple.id));
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    const view = (await partnerView(db, await reload(you), TODAY))!;
    expect(view.nextPeriod?.startDate).toBe("2026-10-30");
    expect(view.care).toHaveLength(1);
  });

  it("공유 시작일 이전 기록은 숨기고, 날짜를 바꿀 수 있다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    const partner = await reload(you);
    const asOf = "2026-10-12";
    expect((await partnerView(db, partner, asOf))?.recentPeriods).toEqual([]);
    await updateSharing(db, me, { shareFrom: "2026-09-01" }, asOf);
    expect(inMonth((await partnerView(db, partner, asOf))!.calendar, "2026-08")).toEqual([]);
    expect(inMonth((await partnerView(db, partner, asOf))!.calendar, "2026-09").map((m) => m.date))
      .toEqual(["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"]);
    await updateSharing(db, me, { shareFrom: "2026-09-05" }, asOf);
    expect(inMonth((await partnerView(db, partner, asOf))!.calendar, "2026-09")).toEqual([]); // 9.4 시작 기록 전체가 숨겨짐

    await expectFail(updateSharing(db, partner, { shareFrom: TODAY }, TODAY), 403);
    await expectFail(updateSharing(db, me, { shareFrom: "2026-12-01" }, TODAY));
  });

  it("지나간 예측은 안 보이고, 달력에 기록 id도 내려가지 않는다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    const late = await partnerView(db, await reload(you), "2026-10-31");
    expect(late!.calendar.some((m) => m.type === "predicted_period" && m.date < "2026-10-31")).toBe(false);
    expect(JSON.stringify(late!.calendar)).not.toContain("recordId");
  });

  it("연결 해제하면 볼 수 없고, 다시 연결하면 공유 시작일은 처음부터", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    await updateSharing(db, me, { shareFrom: "2026-01-01" }, TODAY);
    const partner = await reload(you);
    await disconnect(db, partner);
    expect(await partnerView(db, partner, TODAY)).toBeNull(); // 끊기 전에 연 화면에서도 아무것도 안 보인다
    const again = await connect(me, await reload(you));
    expect(again.shareFrom).toBe(TODAY);
  });
});

describe("고정 글", () => {
  const pinnedPost = (id = "pinned-guide", title = "남친톡 이용 방법") => db.insert(posts).values({ id, authorId: null, title, body: "본문", pinned: true });

  async function member(email: string) {
    const recorder = await signup(db, { email: `r-${email}`, password: "password-1", nickname: "기록", ...AGREED });
    const partner = await signup(db, { email, password: "password-2", nickname: "파트너", ...AGREED });
    const { code } = await createInvite(db, recorder);
    await claimInvite(db, partner, code);
    const user = await reload(partner);
    await agreeToRules(db, user, "");
    return user;
  }

  it("글감 3개는 글자 수 제한 안이고 주소가 겹치지 않는다", () => {
    expect(PINNED_POSTS.map((p) => p.id)).toEqual(["pinned-guide", "pinned-topics", "pinned-promises"]);
    for (const p of PINNED_POSTS) {
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.body.join("\n\n").length).toBeLessThanOrEqual(2000);
    }
  });

  it("예시 글은 고민·꿀팁·후기 하나씩이고 제한 안이다", () => {
    expect(EXAMPLE_POSTS.map((p) => p.board)).toEqual(["question", "tip", "review"]);
    for (const p of EXAMPLE_POSTS) {
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.body.length).toBeLessThanOrEqual(2000);
      expect(p.nickname.length).toBeGreaterThanOrEqual(2);
      expect(p.nickname.length).toBeLessThanOrEqual(12);
    }
  });

  it("이용 규칙은 고정 글 \"서로 지켜줄 것\"의 항목과 같다", () => {
    const promises = PINNED_POSTS.find((p) => p.id === "pinned-promises")!;
    expect(promises.body.join("\n").split("\n").filter((l) => l.startsWith("• ")).map((l) => l.slice(2))).toEqual(RULES);
  });

  it("최신 글보다 위에 놓이고 작성자는 운영팀이다", async () => {
    await pinnedPost();
    const user = await member("a@b.co");
    await createPost(db, user, { title: "새 글", body: "본문" });
    const { posts: list } = await listPosts(db, user);
    expect(list.map((p) => [p.title, p.pinned, p.nickname, p.mine])).toEqual([
      ["남친톡 이용 방법", true, TEAM_NAME, false],
      ["새 글", false, expect.stringMatching(/^편-/), true],
    ]);
    expect((await getPost(db, user, "pinned-guide")).nickname).toBe(TEAM_NAME);
  });

  it("차단 관계가 있어도 보이고, 댓글은 달 수 있다", async () => {
    await pinnedPost();
    const user = await member("a@b.co");
    const other = await member("c@d.co");
    const id = await createPost(db, other, { title: "다른 사람 글", body: "본문" });
    await blockAuthor(db, user, { kind: "post", id });
    expect((await listPosts(db, user)).posts.map((p) => p.id)).toEqual(["pinned-guide"]);
    await createComment(db, user, "pinned-guide", "고마워요");
    expect((await getPost(db, user, "pinned-guide")).commentCount).toBe(1);
  });

  it("신고와 차단은 할 수 없고, 사용자도 지울 수 없다", async () => {
    await pinnedPost();
    const user = await member("a@b.co");
    const target = { kind: "post" as const, id: "pinned-guide" };
    await expectFail(report(db, user, target));
    await expectFail(blockAuthor(db, user, target));
    await expectFail(deletePost(db, user, "pinned-guide"), 404);
    await expectFail(updatePost(db, user, "pinned-guide", { title: "바꿈", body: "바꿈" }), 403);
  });
});

describe("커뮤니티", () => {
  let seq = 0;

  /** 기록자와 연결된 파트너 한 명. agree면 이용 규칙에도 동의한다. */
  async function member(agree = true) {
    const n = ++seq;
    const recorder = await signup(db, { email: `r${n}@example.com`, password: "password-1", nickname: `기록${n}`, ...AGREED });
    const joined = await signup(db, { email: `p${n}@example.com`, password: "password-1", nickname: `본명${n}`, ...AGREED });
    await connect(recorder, joined);
    const partner = await reload(joined);
    if (agree) await agreeToRules(db, partner, "");
    return { partner, recorder };
  }
  const post = (user: User, title = "제목") => createPost(db, user, { title, body: "본문" });

  it("기록자·연결 없는 사람은 읽기도 쓰기도 못 한다", async () => {
    const { partner, recorder } = await member();
    const stranger = await signup(db, { email: "s@example.com", password: "password-1", nickname: "남", ...AGREED });
    const id = await post(partner);
    for (const user of [recorder, stranger]) {
      await expectFail(listPosts(db, user), 403);
      await expectFail(getPost(db, user, id), 403);
      await expectFail(post(user), 403);
      await expectFail(createComment(db, user, id, "댓글"), 403);
      await expectFail(report(db, user, { kind: "post", id }), 403);
      await expectFail(blockAuthor(db, user, { kind: "post", id }), 403);
      await expectFail(agreeToRules(db, user, ""), 403);
      await expectFail(listReports(db, user), 403);
    }
  });

  it("이용 규칙에 동의해야 글·댓글을 쓸 수 있고, 닉네임이 없으면 무작위", async () => {
    const { partner } = await member(false);
    const other = (await member()).partner;
    const id = await post(other);
    expect((await listPosts(db, partner)).posts).toHaveLength(1); // 읽기는 가능
    await expectFail(post(partner), 403);
    await expectFail(createComment(db, partner, id, "댓글"), 403);

    expect(await agreeToRules(db, partner, "")).toMatch(/^편-\d{4}$/);
    expect(await agreeToRules(db, partner, "다른이름")).toMatch(/^편-\d{4}$/); // 두 번째는 그대로
    await post(partner);

    const third = (await member(false)).partner;
    await expectFail(agreeToRules(db, third, (await communityAccess(db, partner)).nickname), 409);
    await expectFail(agreeToRules(db, third, "운영자님"));
    await expectFail(agreeToRules(db, third, "디어데이 운영팀"));
    await expectFail(agreeToRules(db, third, "가"));
    expect(await agreeToRules(db, third, " 든든한편 ")).toBe("든든한편");
  });

  it("글·댓글 길이 검증, 내 글만 수정·삭제, 익명 유지", async () => {
    const { partner } = await member();
    const other = (await member()).partner;
    await expectFail(createPost(db, partner, { title: " ", body: "본문" }));
    await expectFail(createPost(db, partner, { title: "가".repeat(61), body: "본문" }));
    await expectFail(createPost(db, partner, { title: "제목", body: "가".repeat(2001) }));

    const id = await post(partner, "<script>alert(1)</script>");
    expect((await getPost(db, partner, id)).title).toBe("<script>alert(1)</script>"); // 그대로 보관, 화면에서 글자로 출력
    const cid = await createComment(db, other, id, "댓글");
    await expectFail(createComment(db, other, id, "가".repeat(501)));

    await expectFail(updatePost(db, other, id, { title: "남의 글", body: "본문" }), 403);
    await expectFail(deletePost(db, other, id), 404);
    await expectFail(updateComment(db, partner, cid, "남의 댓글"), 403);
    await expectFail(deleteComment(db, partner, cid), 404);
    await updatePost(db, partner, id, { title: "고친 제목", body: "고친 본문" });
    await updateComment(db, other, cid, "고친 댓글");

    const view = await getPost(db, other, id);
    expect(view).toMatchObject({ title: "고친 제목", commentCount: 1, mine: false });
    expect(view.comments[0]).toMatchObject({ body: "고친 댓글", mine: true });
    const json = JSON.stringify([view, (await listPosts(db, other)).posts]);
    for (const secret of [partner.id, other.id, partner.email, partner.nickname]) expect(json).not.toContain(secret);

    await deleteComment(db, other, cid);
    await deletePost(db, partner, id);
    await expectFail(getPost(db, partner, id), 404);
  });

  it("같은 사람은 같은 대상을 한 번만 신고, 자기 글은 신고 불가", async () => {
    const { partner } = await member();
    const other = (await member()).partner;
    const id = await post(partner);
    const cid = await createComment(db, partner, id, "댓글");
    await report(db, other, { kind: "post", id });
    await expectFail(report(db, other, { kind: "post", id }), 409);
    await report(db, other, { kind: "comment", id: cid }); // 댓글은 다른 대상
    await expectFail(report(db, other, { kind: "comment", id: cid }), 409);
    await expectFail(report(db, partner, { kind: "post", id }));
    expect(await db.select().from(reports)).toHaveLength(2);
  });

  it("신고 3건이면 자동 숨김, 기각하면 복구되고 기각분은 세지 않는다", async () => {
    const { partner } = await member();
    const a = (await member()).partner, b = (await member()).partner, c = (await member()).partner, d = (await member()).partner;
    const id = await post(partner);
    await report(db, a, { kind: "post", id });
    await report(db, b, { kind: "post", id });
    expect((await listPosts(db, c)).posts).toHaveLength(1);
    await report(db, c, { kind: "post", id });
    expect((await listPosts(db, d)).posts).toEqual([]);
    await expectFail(getPost(db, d, id), 404);

    await db.update(users).set({ isAdmin: true }).where(eq(users.id, a.id));
    const admin = await reload(a);
    expect((await listPosts(db, admin)).posts).toMatchObject([{ id, hidden: true }]); // 운영자는 숨긴 글도 읽는다
    expect(await listReports(db, admin)).toMatchObject([{ kind: "post", id, total: 3, hidden: true }]);
    await expectFail(listReports(db, d), 403);
    await expectFail(decideReport(db, d, { kind: "post", id }, "dismissed"), 403);

    await decideReport(db, admin, { kind: "post", id }, "dismissed");
    expect(await listReports(db, admin)).toEqual([]);
    expect((await listPosts(db, d)).posts).toHaveLength(1);
    await report(db, d, { kind: "post", id }); // 기각 뒤 새 신고 1건으로 다시 숨겨지지 않는다
    expect((await listPosts(db, c)).posts).toHaveLength(1);

    await decideReport(db, admin, { kind: "post", id }, "hidden");
    expect((await listPosts(db, c)).posts).toEqual([]);
    await expectFail(decideReport(db, admin, { kind: "post", id }, "hidden"), 404); // 처리할 신고가 없음
  });

  it("댓글도 신고 3건이면 숨겨지고 목록의 댓글 수에서 빠진다", async () => {
    const { partner } = await member();
    const author = (await member()).partner;
    const reporters = [(await member()).partner, (await member()).partner, (await member()).partner];
    const id = await post(partner);
    const cid = await createComment(db, author, id, "댓글");
    for (const r of reporters) await report(db, r, { kind: "comment", id: cid });
    expect((await getPost(db, partner, id)).comments).toEqual([]);
    expect((await listPosts(db, partner)).posts[0].commentCount).toBe(0);
    await expectFail(updateComment(db, author, cid, "고침"), 404);
    await deleteComment(db, author, cid); // 숨겨져도 지울 수는 있다
  });

  it("차단은 양방향: 서로 안 보이고 댓글도 못 단다", async () => {
    const { partner: me } = await member();
    const { partner: you } = await member();
    const { partner: third } = await member();
    const mine = await post(me, "내 글");
    const yours = await post(you, "네 글");
    const open = await post(third, "셋째 글");
    const yourComment = await createComment(db, you, open, "네 댓글");
    await createComment(db, me, open, "내 댓글");

    await blockAuthor(db, me, { kind: "comment", id: yourComment });
    await expectFail(blockAuthor(db, me, { kind: "post", id: yours }), 404); // 이미 안 보이는 사람의 글

    for (const [viewer, otherPost, ownTitle] of [[me, yours, "내 글"], [you, mine, "네 글"]] as const) {
      const titles = (await listPosts(db, viewer)).posts.map((p) => p.title);
      expect(titles).toContain(ownTitle);
      expect(titles).toHaveLength(2);
      await expectFail(getPost(db, viewer, otherPost), 404);
      await expectFail(createComment(db, viewer, otherPost, "댓글"), 404);
      await expectFail(report(db, viewer, { kind: "post", id: otherPost }), 404);
      const shared = (await listPosts(db, viewer)).posts.find((p) => p.id === open);
      expect(shared?.commentCount).toBe(1); // 상대 댓글은 수에서도 빠진다
      expect((await getPost(db, viewer, open)).comments).toHaveLength(1);
    }
    expect((await getPost(db, third, open)).comments).toHaveLength(2); // 제삼자는 그대로
    await expectFail(blockAuthor(db, me, { kind: "post", id: mine }));
  });

  it("숨긴 글의 댓글은 읽기·쓰기·수정·신고 모두 막힌다", async () => {
    const { partner } = await member();
    const commenter = (await member()).partner;
    const reader = (await member()).partner;
    const reporters = [(await member()).partner, (await member()).partner, (await member()).partner];
    const id = await post(partner);
    const cid = await createComment(db, commenter, id, "댓글");
    for (const r of reporters) await report(db, r, { kind: "post", id });

    await expectFail(getPost(db, reader, id), 404);
    await expectFail(getPost(db, commenter, id), 404);
    await expectFail(createComment(db, reader, id, "댓글"), 404);
    await expectFail(updateComment(db, commenter, cid, "고침"), 404);
    await expectFail(report(db, reader, { kind: "comment", id: cid }), 404);
    await expectFail(blockAuthor(db, reader, { kind: "comment", id: cid }), 404);
    await expectFail(updatePost(db, partner, id, { title: "되살리기", body: "본문" }), 404);
    expect((await myPosts(db, partner))[0]).toMatchObject({ id, hidden: true }); // 작성자는 목록에서 보고 지울 수 있다
    await deletePost(db, partner, id);
  });

  it("말머리: 기본은 고민, 고르면 그 말머리 글과 고정 글만, 이상한 값은 거절", async () => {
    const { partner } = await member();
    await db.insert(posts).values({ id: "pin", authorId: null, title: "고정", body: "본문", pinned: true });
    const q = await post(partner, "고민 글");
    const tip = await createPost(db, partner, { board: "tip", title: "꿀팁 글", body: "본문" });
    await expectFail(createPost(db, partner, { board: "free", title: "제목", body: "본문" }));
    expect((await getPost(db, partner, q)).board).toBe("question");
    expect((await listPosts(db, partner, 1, "tip")).posts.map((p) => p.id)).toEqual(["pin", tip]);
    expect((await listPosts(db, partner, 1, "nope")).posts).toHaveLength(3); // 모르는 값이면 전체
    await updatePost(db, partner, tip, { title: "고침", body: "본문" }); // 말머리를 안 보내면 그대로
    expect((await getPost(db, partner, tip)).board).toBe("tip");
    await updatePost(db, partner, tip, { board: "review", title: "고침", body: "본문" });
    expect((await getPost(db, partner, tip)).board).toBe("review");
  });

  it("공감은 한 사람당 한 번, 다시 누르면 취소된다", async () => {
    const { partner } = await member();
    const other = (await member(false)).partner; // 동의 전에도 공감은 된다
    const id = await post(partner);
    expect(await toggleLike(db, other, id)).toBe(true);
    expect(await toggleLike(db, partner, id)).toBe(true);
    expect(await getPost(db, other, id)).toMatchObject({ likeCount: 2, liked: true });
    expect(await toggleLike(db, other, id)).toBe(false);
    expect(await getPost(db, other, id)).toMatchObject({ likeCount: 1, liked: false });
    expect((await listPosts(db, other)).posts[0]).toMatchObject({ likeCount: 1, preview: "본문" });
    const { recorder } = await member();
    await expectFail(toggleLike(db, recorder, id), 403);
  });

  it("글쓰기 요청 제한: 10분에 5개, 다른 계정은 영향 없음", async () => {
    const { partner } = await member();
    const other = (await member()).partner;
    for (let i = 0; i < 5; i++) await post(partner);
    await expectFail(post(partner), 429);
    expect((await listPosts(db, other)).posts).toHaveLength(5);
    const id = await post(other);
    await expectFail(createPost(db, partner, { title: "제목", body: "가".repeat(2001) })); // 검증 실패가 먼저
    for (let i = 0; i < 5; i++) await createComment(db, partner, id, "댓글");
    await expectFail(createComment(db, partner, id, "댓글"), 429);
  });

  it("연결을 끊어도 내 글은 지울 수 있지만 볼 수는 없다", async () => {
    const { partner, recorder } = await member();
    const id = await post(partner);
    const cid = await createComment(db, partner, id, "댓글");
    await disconnect(db, recorder);
    const left = await reload(partner);
    expect(left.role).toBe("recorder");
    await expectFail(listPosts(db, left), 403);
    await expectFail(getPost(db, left, id), 403);
    await expectFail(updatePost(db, left, id, { title: "고침", body: "본문" }), 403);
    expect((await myPosts(db, left)).map((p) => p.id)).toEqual([id]);
    await deleteComment(db, left, cid);
    await deletePost(db, left, id);
    expect(await myPosts(db, left)).toEqual([]);
  });

  it("탈퇴하면 글·댓글·관련 신고가 함께 지워진다", async () => {
    const { partner: gone } = await member();
    const { partner: stay } = await member();
    const own = await post(gone);
    const kept = await post(stay);
    await createComment(db, stay, own, "남의 글에 단 댓글");
    const goneComment = await createComment(db, gone, kept, "떠나는 사람 댓글");
    const stayComment = await createComment(db, stay, kept, "남는 사람 댓글");
    await report(db, stay, { kind: "post", id: own });
    await report(db, stay, { kind: "comment", id: goneComment });
    await report(db, gone, { kind: "comment", id: stayComment });

    await db.delete(users).where(eq(users.id, gone.id));

    expect((await db.select().from(posts)).map((p) => p.id)).toEqual([kept]);
    expect((await db.select().from(comments)).map((c) => c.id)).toEqual([stayComment]);
    expect(await db.select().from(reports)).toEqual([]);
  });
});

describe("알림", () => {
  const FCM = "https://fcm.googleapis.com/fcm/send/";
  const sub = (name: string) => ({ endpoint: FCM + name, p256dh: "key", auth: "auth" });
  const subs = () => db.select().from(pushSubscriptions);

  /** 실제로 보내지 않고 누구에게 무엇이 갔는지만 모은다. */
  function outbox() {
    const sent: { endpoint: string; title: string; body: string; url: string }[] = [];
    const sender: Sender = async (target, payload) => {
      sent.push({ endpoint: target.endpoint, ...JSON.parse(payload) });
    };
    return { sent, sender };
  }

  async function shared(paused = false) {
    const { me, you } = await pair();
    await connect(me, you);
    await setPaused(db, me, paused);
    await saveSubscription(db, me, sub("me"));
    await saveSubscription(db, you, sub("you"));
    return { me, partner: await reload(you) };
  }

  it("구독 저장·갱신·삭제. 같은 기기는 새 계정으로 옮겨지고, 남의 구독은 못 지운다", async () => {
    const { me, you } = await pair();
    await saveSubscription(db, me, sub("a"));
    await saveSubscription(db, me, { ...sub("a"), p256dh: "new" });
    expect(await subs()).toMatchObject([{ userId: me.id, p256dh: "new" }]);
    await saveSubscription(db, you, sub("a"));
    expect(await subs()).toMatchObject([{ userId: you.id }]);
    await removeSubscription(db, me, sub("a").endpoint);
    expect(await subs()).toHaveLength(1);
    await removeSubscription(db, you, sub("a").endpoint);
    expect(await subs()).toEqual([]);
  });

  it("공식 푸시 서비스가 아닌 주소는 저장하지 않는다", async () => {
    const { me } = await pair();
    for (const endpoint of ["http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://localhost/x", "https://fcm.googleapis.com.evil.io/x", "nope", ""]) {
      await expectFail(saveSubscription(db, me, { ...sub("x"), endpoint }));
    }
    await expectFail(saveSubscription(db, me, { ...sub("x"), auth: "" }));
    expect(await subs()).toEqual([]);
  });

  it("404·410이 오면 그 구독만 지우고, 다른 실패는 구독을 남긴다", async () => {
    const { me } = await pair();
    for (const name of ["gone", "missing", "busy", "ok"]) await saveSubscription(db, me, sub(name));
    const status: Record<string, number> = { gone: 410, missing: 404, busy: 500 };
    const sender: Sender = async (target) => {
      const code = status[target.endpoint.replace(FCM, "")];
      if (code) throw Object.assign(new Error("x"), { statusCode: code });
    };
    await sendPush(db, me.id, { body: "안녕", url: "/" }, sender);
    expect((await subs()).map((s) => s.endpoint).sort()).toEqual([sub("busy").endpoint, sub("ok").endpoint]);
  });

  it("연결되면 알림을 켠 기록자에게만 알린다", async () => {
    const { me, you } = await pair();
    await saveSubscription(db, me, sub("me"));
    await saveSubscription(db, you, sub("you"));
    const { sent, sender } = outbox();
    await notifyConnected(db, you, sender); // 연결 없음
    expect(sent).toEqual([]);
    await connect(me, you);
    await notifyConnected(db, await reload(you), sender);
    expect(sent).toMatchObject([{ endpoint: sub("me").endpoint, title: "너", body: "연결됐어요", url: "/connect" }]);

    await disconnect(db, me);
    await removeSubscription(db, me, sub("me").endpoint); // 알림을 끈 기록자
    await connect(me, await reload(you));
    await notifyConnected(db, await reload(you), sender);
    expect(sent).toHaveLength(1);
  });

  it("배려 요청: 공유 켜진 요청만 파트너에게, 처음 공유될 때만", async () => {
    const { me, partner } = await shared();
    const { sent, sender } = outbox();
    expect(await saveCare(db, me, { presets: ["rest"], message: "", share: false }, TODAY)).toBe(false);
    await notifyCare(db, me, TODAY, sender); // 요청별 공유가 꺼짐
    expect(sent).toEqual([]);
    expect(await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY)).toBe(true);
    await notifyCare(db, me, TODAY, sender);
    expect(sent).toMatchObject([{ endpoint: sub("you").endpoint, title: "나", body: "배려 요청을 보냈어요", url: "/news" }]);
    expect(await saveCare(db, me, { presets: ["company"], message: "", share: true }, TODAY)).toBe(false); // 수정은 다시 안 보냄
    expect(JSON.stringify(sent)).not.toContain("조용히");
    expect(partner.role).toBe("partner");
  });

  it("알림 제목은 보낸 사람이 지금 쓰는 이름, 비어 있으면 '파트너'. 요청 내용은 알림에 넣지 않는다", async () => {
    const { me, partner } = await shared();
    const { sent, sender } = outbox();
    await db.update(users).set({ nickname: "지수" }).where(eq(users.id, me.id));
    await saveCare(db, me, { presets: ["rest"], message: "배가 너무 아파", share: true }, TODAY);
    await notifyCare(db, me, TODAY, sender);
    const care = (await getCare(db, me, TODAY))!;
    await db.update(users).set({ nickname: "" }).where(eq(users.id, partner.id));
    await respondToCare(db, partner, care.id, "seen", TODAY);
    await notifyReply(db, partner, care.id, "seen", TODAY, sender);
    expect(sent.map((m) => [m.title, m.body])).toEqual([["지수", "배려 요청을 보냈어요"], ["파트너", "봤어요"]]);
    const text = JSON.stringify(sent);
    expect(text).not.toContain("배가 너무 아파");
    expect(text).not.toContain(careLabel("rest"));
  });

  it("권한이 없으면 보내지 않는다: 일시정지·연결 없음", async () => {
    const paused = await shared(true);
    const box = outbox();
    await saveCare(db, paused.me, { presets: ["rest"], message: "", share: true }, TODAY);
    await notifyCare(db, paused.me, TODAY, box.sender);
    expect(box.sent).toEqual([]);

    db = await openDb();
    const { me, partner } = await shared();
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    await disconnect(db, me);
    const { sent, sender } = outbox();
    await notifyCare(db, me, TODAY, sender);
    await notifyReply(db, await reload(partner), "any", "seen", TODAY, sender);
    expect(sent).toEqual([]);
  });

  it("답장은 바뀔 때마다 기록자에게 파트너 이름과 답장 그대로. 같은 답장을 다시 누르면 보내지 않는다", async () => {
    const { me, partner } = await shared();
    const { sent, sender } = outbox();
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    const care = (await getCare(db, me, TODAY))!;
    // respondAction과 같은 순서: 바뀌었을 때만 알린다
    const reply = async (response: "seen" | "will_help" | "done") => {
      const changed = await respondToCare(db, partner, care.id, response, TODAY);
      if (changed) await notifyReply(db, partner, care.id, response, TODAY, sender);
      return changed;
    };
    expect(await reply("seen")).toBe(true);
    expect(await reply("seen")).toBe(false); // 같은 답장
    expect(await reply("will_help")).toBe(true);
    expect(await reply("done")).toBe(true);
    expect(sent).toMatchObject([
      { endpoint: sub("me").endpoint, title: "너", body: "봤어요", url: "/news" },
      { title: "너", body: "도와줄게요" },
      { title: "너", body: "했어요" },
    ]);
    expect((await getCare(db, me, TODAY))?.response).toBe("done");

    await setPaused(db, me, true);
    await notifyReply(db, partner, care.id, "seen", TODAY, sender); // 잠시 멈추면 보내지 않는다
    expect(sent).toHaveLength(3);
  });

  it("같은 요청의 답장 알림은 1분 안에 3번까지만, 1분이 지나면 다시 보낸다", async () => {
    const { me, partner } = await shared();
    const { sent, sender } = outbox();
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    const care = (await getCare(db, me, TODAY))!;
    for (const response of ["seen", "will_help", "done", "seen", "will_help"] as const) {
      if (await respondToCare(db, partner, care.id, response, TODAY)) await notifyReply(db, partner, care.id, response, TODAY, sender);
    }
    expect(sent.map((m) => m.body)).toEqual(["봤어요", "도와줄게요", "했어요"]);
    expect((await getCare(db, me, TODAY))?.response).toBe("will_help"); // 답장 저장은 막지 않는다

    await db.update(rateLimits).set({ resetAt: new Date(Date.now() - 1000) }); // 1분이 지남
    await respondToCare(db, partner, care.id, "done", TODAY);
    await notifyReply(db, partner, care.id, "done", TODAY, sender);
    expect(sent.map((m) => m.body)).toEqual(["봤어요", "도와줄게요", "했어요", "했어요"]);
  });

  it("발송이 실패해도 저장된 내용은 그대로이고 오류가 밖으로 나오지 않는다", async () => {
    const { me, partner } = await shared();
    const sender: Sender = async () => { throw new Error("boom"); };
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    await expect(notifyCare(db, me, TODAY, sender)).resolves.toBeUndefined();
    expect((await partnerView(db, partner, TODAY))?.care).toHaveLength(1);
    const broken = db;
    db = await openDb();
    await expect(notifyCare(db, me, TODAY, sender)).resolves.toBeUndefined(); // 없는 계정이어도 조용히
    db = broken;
  });

  it("예정일 3일 전 알림: 본인에게만, 하루 한 번, 끄면 보내지 않는다", async () => {
    const { me, partner } = await shared();
    await fourPeriods(me); // 다음 예정일 2026-10-30
    const { sent, sender } = outbox();
    expect(await sendReminders(db, "2026-10-26", sender)).toBe(0); // 4일 전
    expect(await sendReminders(db, "2026-10-27", sender)).toBe(1);
    expect(sent).toMatchObject([{ endpoint: sub("me").endpoint, title: "디어데이", body: "오늘 확인할 소식이 있어요" }]);
    expect(JSON.stringify(sent)).not.toContain("생리"); // 예정일 알림은 잠금 화면에 건강 정보를 쓰지 않는다
    expect(await sendReminders(db, "2026-10-27", sender)).toBe(0); // 크론이 두 번 돌아도 한 번
    expect(sent).toHaveLength(1);
    expect(partner.role).toBe("partner");

    await db.update(users).set({ reminderSentFor: null });
    await setReminder(db, me, false);
    expect(await reminderEnabled(db, me.id)).toBe(false);
    expect(await sendReminders(db, "2026-10-27", sender)).toBe(0);
  });

  it("크론은 비밀값이 맞을 때만 통과한다", () => {
    expect(cronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(cronAuthorized("Bearer wrong!", "s3cret")).toBe(false);
    expect(cronAuthorized(null, "s3cret")).toBe(false);
    expect(cronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(cronAuthorized("Bearer ", "")).toBe(false);
  });

  it("새 소식: 안 읽은 답장, 답 안 한 요청", async () => {
    const { me, you } = await pair();
    expect(await newsFor(db, me, TODAY)).toEqual({ replies: 0, care: 0 });

    await connect(me, you);
    const partner = await reload(you);
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    expect(await newsFor(db, partner, TODAY)).toMatchObject({ care: 1 });
    await markNewsSeen(db, partner);
    expect(await newsFor(db, partner, TODAY)).toMatchObject({ care: 0 });

    await respondToCare(db, partner, (await getCare(db, me, TODAY))!.id, "seen", TODAY);
    expect(await newsFor(db, me, TODAY)).toMatchObject({ replies: 1 });
    expect(await recentReplies(db, (await activeCouple(db, me.id))!)).toMatchObject([{ day: TODAY, presets: ["rest"], response: "seen" }]);
    await markNewsSeen(db, me);
    expect(await newsFor(db, me, TODAY)).toMatchObject({ replies: 0 });

    await setPaused(db, me, true);
    await saveCare(db, me, { presets: ["company"], message: "", share: true }, TODAY);
    expect(await newsFor(db, partner, TODAY)).toMatchObject({ care: 0 }); // 잠시 멈추면 파트너에게 소식도 없다
  });

  it("새 소식 시트 목록: 기록자는 파트너 답장, 파트너는 보이는 배려 요청. 연결 전·잠시 멈추면 비어 있다", async () => {
    const { me, you } = await pair();
    expect(await newsItems(db, me, TODAY)).toEqual([]);

    await connect(me, you);
    const partner = await reload(you);
    await saveCare(db, me, { presets: ["rest"], message: "배 아파", share: true }, TODAY);
    expect(await newsItems(db, partner, TODAY)).toEqual([{
      id: expect.stringMatching(/^care-/), title: "나님의 배려 요청", body: `${careLabel("rest")} · “배 아파”`,
      detail: "아직 답장하지 않았어요", when: "오늘", href: "/",
    }]);
    expect(await newsItems(db, me, TODAY)).toEqual([]); // 아직 답장 없음

    await respondToCare(db, partner, (await getCare(db, me, TODAY))!.id, "will_help", TODAY);
    const [reply] = await newsItems(db, me, TODAY);
    const { respondedAt } = (await getCare(db, me, TODAY))!;
    expect(reply).toMatchObject({ title: "오늘 배려 요청", body: "너님이 '도와줄게요'라고 답했어요", when: timeSeoul(respondedAt!), href: "/" });
    expect((await newsItems(db, partner, TODAY))[0].detail).toBe("내 답장: 도와줄게요");

    await setPaused(db, me, true);
    expect(await newsItems(db, partner, TODAY)).toEqual([]);
  });
});

describe("배려 칩", () => {
  const keys = (used: string[], group: "body" | "mind" | null) => Object.keys(orderPresets(used, group));

  it("시기별 순서: 생리 중이면 몸, 생리 전 7일이면 마음, 그 외는 섞는다", () => {
    expect(keys([], "body").slice(0, 5)).toEqual(["heat_pack", "warm_food", "sweet", "medicine", "listen"]);
    expect(keys([], "mind").slice(0, 5)).toEqual(["listen", "company", "rest", "understand", "heat_pack"]);
    expect(keys([], null).slice(0, 4)).toEqual(["heat_pack", "listen", "stay_home", "warm_food"]);
    for (const group of ["body", "mind", null] as const) expect(keys([], group).sort()).toEqual(Object.keys(CARE_PRESETS).sort());
  });

  it("최근에 자주 고른 칩이 시기보다 앞선다", () => {
    expect(keys(["sleep_early", "rest", "rest", "bogus"], "body").slice(0, 3)).toEqual(["rest", "sleep_early", "heat_pack"]);
  });

  it("어떤 묶음을 먼저 보여줄지", () => {
    expect(careGroup(true, "2026-11-05", "2026-11-03")).toBe("body");
    expect(careGroup(false, "2026-11-10", "2026-11-03")).toBe("mind");
    expect(careGroup(false, "2026-11-11", "2026-11-03")).toBeNull();
    expect(careGroup(false, "2026-11-01", "2026-11-03")).toBeNull();
    expect(careGroup(false, null, "2026-11-03")).toBeNull();
  });

  it("옛 칩은 비슷한 새 칩으로, 모르는 값은 글자 그대로", async () => {
    expect(careLabel("rest")).toBe("혼자 쉬고 싶어");
    expect(careLabel("옛날 칩")).toBe("옛날 칩");
    expect(careLabel("constructor")).toBe("constructor");

    const { me, you } = await pair();
    await connect(me, you);
    const partner = await reload(you);
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    const care = (await getCare(db, me, TODAY))!;
    await db.update(careRequests).set({ presets: ["empathy", "easy_plans", "옛날 칩"] }).where(eq(careRequests.id, care.id));
    expect((await getCare(db, me, TODAY))?.presets).toEqual(["listen", "postpone", "옛날 칩"]);
    expect((await partnerView(db, partner, TODAY))?.care[0].presets).toEqual(["listen", "postpone", "옛날 칩"]);

    await respondToCare(db, partner, care.id, "seen", TODAY);
    await db.update(careRequests).set({ presets: ["empathy"] }).where(eq(careRequests.id, care.id));
    await saveCare(db, me, { presets: ["empathy"], message: "", share: true }, TODAY); // 같은 칩이면 답장이 남는다
    expect(await getCare(db, me, TODAY)).toMatchObject({ presets: ["listen"], response: "seen" });
  });

  it("최근 30일 집계는 오늘과 30일보다 오래된 날을 뺀다", async () => {
    const { me } = await pair();
    await saveCare(db, me, { presets: ["rest"], message: "", share: false }, TODAY);
    await saveCare(db, me, { presets: ["empathy"], message: "", share: false }, addDays(TODAY, -30));
    await saveCare(db, me, { presets: ["sweet"], message: "", share: false }, addDays(TODAY, -31));
    expect(await recentPresets(db, me, TODAY)).toEqual(["listen"]);
  });
});

describe("오늘 필요한 배려", () => {
  it("요청별 공유 + 답장 + 수정하면 답장 초기화", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    const partner = await reload(you);

    await expectFail(saveCare(db, me, { presets: [], message: "  ", share: true }, TODAY));
    await saveCare(db, me, { presets: ["rest", "warm_food", "bogus"], message: "", share: false }, TODAY);
    expect((await getCare(db, me, TODAY))?.presets).toEqual(["rest", "warm_food"]);
    expect((await partnerView(db, partner, TODAY))?.care).toEqual([]); // 요청 자체를 공유 안 함

    await saveCare(db, me, { presets: ["rest", "warm_food"], message: "", share: true }, TODAY);
    const [care] = (await partnerView(db, partner, TODAY))!.care;
    await respondToCare(db, partner, care.id, "will_help", TODAY);
    expect((await getCare(db, me, TODAY))?.response).toBe("will_help");
    await expectFail(respondToCare(db, partner, care.id, "whatever", TODAY));
    await expectFail(respondToCare(db, me, care.id, "seen", TODAY), 403);

    // 공유 여부만 바꾸면 답장 유지, 내용을 바꾸면 초기화
    await saveCare(db, me, { presets: ["rest", "warm_food"], message: "", share: true }, TODAY);
    expect((await getCare(db, me, TODAY))?.response).toBe("will_help");
    await saveCare(db, me, { presets: ["company"], message: "일찍 와줘", share: true }, TODAY);
    expect((await getCare(db, me, TODAY))?.response).toBeNull();

    // 잠시 멈추면 답장도 못 한다
    await setPaused(db, me, true);
    await expectFail(respondToCare(db, partner, care.id, "seen", TODAY), 404);

    await clearCare(db, me, TODAY);
    expect(await getCare(db, me, TODAY)).toBeNull();
  });
});

describe("회원 탈퇴", () => {
  const kakaoUser = (id: number) => signInWithKakao(db, "code", "http://x", (async (url: string) =>
    new Response(JSON.stringify(String(url).includes("token") ? { access_token: "t" } : { id, properties: { nickname: "카카오" } }))) as unknown as typeof fetch);

  /** 기록자 me와 파트너가 연결되어, 기록·배려·답장·초대·구독이 모두 있는 상태 */
  async function fullPair() {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    const partner = await reload(you);
    await updateSharing(db, me, { shareFrom: "2026-01-01" }, TODAY);
    await saveCare(db, me, { presets: ["rest"], message: null, share: true }, TODAY);
    const [care] = await db.select().from(careRequests);
    await respondToCare(db, partner, care.id, "seen", TODAY);
    await saveSubscription(db, me, { endpoint: "https://fcm.googleapis.com/fcm/send/me", p256dh: "p", auth: "a" });
    return { me, partner };
  }

  it("연결 상대가 기록자로 돌아가고, 내 데이터가 모두 지워진다", async () => {
    const { me, partner } = await fullPair();
    const { token } = await createSession(db, me.id);
    await withdraw(db, me);

    expect((await reload(partner)).role).toBe("recorder");
    expect(await activeCouple(db, partner.id)).toBeNull();
    for (const table of [periods, careRequests, careResponses, couples, invitations, pushSubscriptions]) {
      expect(await db.select().from(table)).toEqual([]);
    }
    expect(await db.select().from(sessions).where(eq(sessions.userId, me.id))).toEqual([]);
    expect(await userFromToken(db, token)).toBeNull();
    await expectFail(login(db, { email: "me@example.com", password: "password-1" }), 401);
  });

  it("파트너가 탈퇴해도 상대의 기록은 남고, 내가 남긴 답장만 지워진다", async () => {
    const { me, partner } = await fullPair();
    await withdraw(db, partner);
    expect(await db.select().from(careResponses)).toEqual([]);
    expect(await listPeriods(db, me.id)).toHaveLength(4);
    expect(await db.select().from(careRequests)).toHaveLength(1);
    expect((await reload(me)).role).toBe("recorder");
    expect(await activeCouple(db, me.id)).toBeNull();
  });

  it("개인정보를 비우고, 같은 이메일로 다시 가입할 수 있다", async () => {
    const { me } = await pair();
    await withdraw(db, me);
    const [row] = await db.select().from(users).where(eq(users.id, me.id));
    expect(row).toMatchObject({
      email: null, passwordHash: null, kakaoId: null, nickname: "탈퇴한 사용자", communityNickname: null, isAdmin: false, healthConsentAt: null,
    });
    await signup(db, { email: "me@example.com", password: "password-1", nickname: "새로", ...AGREED });
  });

  it("글·댓글과 신고는 남고 작성자만 탈퇴한 사용자로 바뀐다", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    const writer = await reload(you);
    await agreeToRules(db, writer, "쓰는사람");
    const postId = await createPost(db, writer, { title: "제목", body: "본문" });
    await createComment(db, writer, postId, "댓글");

    const other = await signup(db, { email: "o@b.co", password: "password-1", nickname: "다른", ...AGREED });
    const reader = await signup(db, { email: "r@b.co", password: "password-1", nickname: "읽는", ...AGREED });
    await connect(other, reader);
    const member = await reload(reader);
    await report(db, member, { kind: "post", id: postId });
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, me.id));

    await withdraw(db, writer);

    const post = await getPost(db, member, postId);
    expect(post).toMatchObject({ nickname: "탈퇴한 사용자", body: "본문", mine: false });
    expect(post.comments).toMatchObject([{ nickname: "탈퇴한 사용자", body: "댓글" }]);
    expect((await listPosts(db, member)).posts[0].nickname).toBe("탈퇴한 사용자");
    expect(await listReports(db, await reload(me))).toMatchObject([{ id: postId, nickname: "탈퇴한 사용자", total: 1 }]);

    // 신고한 사람이 탈퇴해도 신고 내역은 남는다
    await withdraw(db, member);
    expect(await db.select().from(reports)).toHaveLength(1);
  });

  it("내가 건 차단은 지우고, 다른 사람이 나를 차단한 기록은 남긴다", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "t@b.co", password: "password-1", nickname: "셋", ...AGREED });
    await db.insert(blocks).values([{ blockerId: me.id, blockedId: you.id }, { blockerId: third.id, blockedId: me.id }]);
    await withdraw(db, me);
    expect(await db.select().from(blocks)).toMatchObject([{ blockerId: third.id, blockedId: me.id }]);
  });

  it("탈퇴한 사용자라는 닉네임은 쓸 수 없다", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    await expectFail(agreeToRules(db, await reload(you), "탈퇴한 사용자"));
  });

  it("카카오 계정은 어드민 키가 있을 때만 연결을 끊는다", async () => {
    const calls: [string, RequestInit][] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response("{}");
    }) as unknown as typeof fetch;

    vi.stubEnv("KAKAO_ADMIN_KEY", "");
    await withdraw(db, await kakaoUser(123), fetcher);
    expect(calls).toEqual([]);

    vi.stubEnv("KAKAO_ADMIN_KEY", "admin-key");
    await withdraw(db, await kakaoUser(456), fetcher);
    vi.unstubAllEnvs();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("https://kapi.kakao.com/v1/user/unlink");
    expect(calls[0][1].headers).toMatchObject({ Authorization: "KakaoAK admin-key" });
    expect(String(calls[0][1].body)).toBe("target_id_type=user_id&target_id=456");
  });

  it("이메일 계정은 카카오를 부르지 않고, 카카오 호출이 실패해도 탈퇴는 끝나 있다", async () => {
    vi.stubEnv("KAKAO_ADMIN_KEY", "admin-key");
    const down = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { me } = await pair();
    await withdraw(db, me, down);
    expect(down).not.toHaveBeenCalled();

    const user = await kakaoUser(123);
    await withdraw(db, user, down);
    vi.unstubAllEnvs();
    log.mockRestore();
    expect(down).toHaveBeenCalledOnce();
    expect((await db.select().from(users).where(eq(users.id, user.id)))[0].kakaoId).toBeNull();
  });
});

describe("기록 → 화면 시나리오", () => {
  const NOW = "2026-11-02";
  const NOVEMBER = ["2026-11-01", "2026-11-30"] as const;
  const days = (marks: { date: string; type: string }[], type: string) => marks.filter((m) => m.type === type).map((m) => m.date);
  // 기록자 홈·기록 탭과 같은 계산
  const recorderMarks = async (id: string) => {
    const list = await listPeriods(db, id);
    return calendarMarks(list, estimate(list, [], NOW), ...NOVEMBER, NOW);
  };

  it("가입 → 진행 중 저장 → 연결 → 기록자·파트너 표시 → 끝났어요 → 다시 확인", async () => {
    const { me, you } = await pair();
    const record = await savePeriod(db, me.id, { startDate: "2026-10-31" }, NOW);

    // 기록자: 지난달에 시작해도 이번 달에 이어서 칠해지고, 남은 날과 다음 생리는 예상
    let mine = await recorderMarks(me.id);
    expect(days(mine, "period")).toEqual(["2026-11-01", "2026-11-02"]);
    expect(days(mine, "remaining_period")).toEqual(["2026-11-03", "2026-11-04"]);
    expect(days(mine, "predicted_period")).toContain("2026-11-28");

    // 연결 전에 시작한 생리도 공유 시작일에 포함된다
    const { code } = await createInvite(db, me);
    const couple = await claimInvite(db, you, code, NOW);
    expect(couple.shareFrom).toBe("2026-10-31");
    const partner = await reload(you);

    let view = (await partnerView(db, partner, NOW))!;
    expect(view.current).toEqual({ day: 3 });
    expect(view.recentPeriods).toEqual([{ startDate: "2026-10-31", endDate: null }]);
    expect(inMonth(view.calendar, "2026-11")).toEqual(mine);
    expect(view.nextPeriod?.startDate).toBe("2026-11-28");
    expect(view.moon).not.toEqual(CRESCENT);

    // 달력은 지난달도 함께 내려준다
    expect(days((await partnerView(db, partner, NOW))!.calendar, "period")).toContain("2026-10-31");

    // 일시정지 동안은 아무것도 없다
    await setPaused(db, me, true);
    expect(await partnerView(db, partner, NOW)).toMatchObject({ current: null, calendar: [], recentPeriods: [] });
    await setPaused(db, me, false);

    // 오늘 끝났어요: 종료일이 저장되고 남은 예상이 사라진다. 다음 생리 예상은 남는다.
    await savePeriod(db, me.id, { ...record, endDate: NOW }, NOW);
    mine = await recorderMarks(me.id);
    expect(days(mine, "period")).toEqual(["2026-11-01", "2026-11-02"]);
    expect(days(mine, "remaining_period")).toEqual([]);
    expect(days(mine, "predicted_period").slice(0, 3)).toEqual(["2026-11-28", "2026-11-29", "2026-11-30"]); // 3일 기간

    view = (await partnerView(db, partner, NOW))!;
    expect(inMonth(view.calendar, "2026-11")).toEqual(mine);
    expect(view.current).toEqual({ day: 3 });
    expect(view.recentPeriods).toEqual([{ startDate: "2026-10-31", endDate: NOW }]);
  });

  it("공유 시작일 뒤로 숨긴 진행 중 기록은 예상으로도 새지 않는다", async () => {
    const { me, you } = await pair();
    await savePeriod(db, me.id, { startDate: "2026-10-31" }, NOW);
    const { code } = await createInvite(db, me);
    await claimInvite(db, you, code, NOW);
    const partner = await reload(you);

    await updateSharing(db, me, { shareFrom: NOW }, NOW);
    const view = (await partnerView(db, partner, NOW))!;
    expect(view.current).toBeNull();
    expect(days(view.calendar, "period")).toEqual([]);
    expect(days(view.calendar, "remaining_period")).toEqual([]);
  });

  it("생리 중이 아닐 때 연결하면 공유 시작일은 오늘, 진행 중 기록 안에 새 기록은 못 넣는다", async () => {
    const { me, you } = await pair();
    await savePeriod(db, me.id, { startDate: "2026-10-01", endDate: "2026-10-05" }, NOW);
    const open = await savePeriod(db, me.id, { startDate: "2026-10-31" }, NOW);
    await expectFail(savePeriod(db, me.id, { startDate: "2026-11-01", endDate: "2026-11-02" }, NOW), 409);
    await deletePeriod(db, me.id, open.id);
    const { code } = await createInvite(db, me);
    expect((await claimInvite(db, you, code, NOW)).shareFrom).toBe(NOW);
  });
});

describe("끝나지 않은 생리", () => {
  const START = "2026-10-20";
  const recorded = async () => {
    const { me, you } = await pair();
    const record = await savePeriod(db, me.id, { startDate: START }, START);
    return { me, you, record };
  };

  it("네, 그날 끝났어요: 물어본 날짜로 저장한다", async () => {
    const { me, record } = await recorded();
    const asOf = "2026-10-25";
    const question = endQuestion(await listPeriods(db, me.id), asOf);
    expect(question).toMatchObject({ id: record.id, date: "2026-10-24", day: 5 });
    await savePeriod(db, me.id, { ...record, endDate: question!.date }, asOf);
    expect((await listPeriods(db, me.id))[0]).toMatchObject({ endDate: "2026-10-24", autoEnded: false });
    expect(endQuestion(await listPeriods(db, me.id), asOf)).toBeNull();
  });

  it("아직 하고 있어요: 2일 숨겼다가 다시 묻고, 남의 기록이나 끝난 기록은 못 건드린다", async () => {
    const { me, you, record } = await recorded();
    await snoozeEndQuestion(db, me.id, record.id, "2026-10-25");
    const list = await listPeriods(db, me.id);
    expect(endQuestion(list, "2026-10-25")).toBeNull();
    expect(endQuestion(list, "2026-10-26")).toBeNull();
    expect(endQuestion(list, "2026-10-27")).toMatchObject({ date: "2026-10-26", day: 7 });
    await expectFail(snoozeEndQuestion(db, you.id, record.id, "2026-10-25"), 404);
    await savePeriod(db, me.id, { ...record, endDate: "2026-10-25" }, "2026-10-25");
    await expectFail(snoozeEndQuestion(db, me.id, record.id, "2026-10-25"), 404);
  });

  it("다른 날 끝났어요: 시작일~오늘 사이만 저장한다", async () => {
    const { me, record } = await recorded();
    const asOf = "2026-10-26";
    await expectFail(savePeriod(db, me.id, { ...record, endDate: "2026-10-19" }, asOf));
    await expectFail(savePeriod(db, me.id, { ...record, endDate: "2026-10-27" }, asOf));
    await savePeriod(db, me.id, { ...record, endDate: "2026-10-22" }, asOf);
    expect((await listPeriods(db, me.id))[0].endDate).toBe("2026-10-22");
  });

  it("10일이 지나면 크론이 끝내고, 파트너에게는 일반 종료처럼 보이며, 수정하면 표시가 풀린다", async () => {
    const { me, you, record } = await recorded();
    await connect(me, you);
    expect(await autoEndPeriods(db, "2026-10-29")).toBe(0); // 10일째까지는 그대로
    expect((await listPeriods(db, me.id))[0].endDate).toBeNull();

    const asOf = "2026-10-30";
    expect(await autoEndPeriods(db, asOf)).toBe(1);
    expect(await autoEndPeriods(db, asOf)).toBe(0); // 두 번 돌아도 한 번
    const [ended] = await listPeriods(db, me.id);
    expect(ended).toMatchObject({ startDate: START, endDate: "2026-10-24", autoEnded: true });

    await updateSharing(db, me, { shareFrom: START }, asOf);
    const view = (await partnerView(db, await reload(you), asOf))!;
    expect(view.recentPeriods).toEqual([{ startDate: START, endDate: "2026-10-24" }]);
    expect(inMonth(view.calendar, "2026-10").filter((m) => m.type === "period").map((m) => m.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(JSON.stringify(view)).not.toContain("autoEnded");

    await savePeriod(db, me.id, { ...ended, id: record.id, endDate: "2026-10-23" }, asOf);
    expect((await listPeriods(db, me.id))[0]).toMatchObject({ endDate: "2026-10-23", autoEnded: false });
  });

  it("자동 종료일은 사람이 끝낸 기록의 평균을 쓰고, 자동 종료 기록은 평균에서 빠진다", async () => {
    const { me } = await pair();
    await savePeriod(db, me.id, { startDate: "2026-08-01", endDate: "2026-08-07" }, TODAY); // 7일
    await savePeriod(db, me.id, { startDate: "2026-09-01" }, "2026-09-01");
    await autoEndPeriods(db, "2026-09-11");
    expect((await listPeriods(db, me.id))[1]).toMatchObject({ endDate: "2026-09-07", autoEnded: true });
    await db.update(periods).set({ endDate: "2026-09-20" }).where(eq(periods.startDate, "2026-09-01"));
    expect((await predictionFor(db, me.id, "2026-09-25")).typicalPeriodDays).toBe(7);
  });

  it("오래전 날짜를 종료일 없이 넣으면 바로 자동 종료하고, 오래된 진행 중 기록이 새 기록을 막지 않는다", async () => {
    const { me } = await pair();
    const saved = await savePeriod(db, me.id, { startDate: "2026-07-01" }, TODAY);
    expect(saved).toMatchObject({ endDate: "2026-07-05", autoEnded: true });
    await db.update(periods).set({ endDate: null, autoEnded: false }).where(eq(periods.id, saved.id));
    await savePeriod(db, me.id, { startDate: "2026-10-28" }, TODAY);
    expect(await listPeriods(db, me.id)).toHaveLength(2);
  });

  it("끝났는지 묻는 푸시는 예상 종료일 다음 날 기록마다 한 번만, 알림을 끈 사람에게는 가지 않는다", async () => {
    const { me, record } = await recorded();
    const sent: string[] = [];
    const sender: Sender = async (_, payload) => { sent.push(JSON.parse(payload).body); };
    await saveSubscription(db, me, { endpoint: "https://fcm.googleapis.com/fcm/send/end", p256dh: "k", auth: "a" });

    expect(await sendReminders(db, "2026-10-24", sender)).toBe(0);
    expect(await sendReminders(db, "2026-10-25", sender)).toBe(1);
    expect(sent).toEqual(["오늘 기록을 확인해 주세요"]);
    expect(await sendReminders(db, "2026-10-25", sender)).toBe(0);
    expect(await sendReminders(db, "2026-10-26", sender)).toBe(0);

    await db.update(periods).set({ endAskSent: false }).where(eq(periods.id, record.id));
    await setReminder(db, me, false);
    expect(await sendReminders(db, "2026-10-26", sender)).toBe(0);
    expect(sent).toHaveLength(1);
  });
});

describe("비밀번호 변경", () => {
  const OLD = "password-1", NEXT = "new-password-1";
  const account = () => signup(db, { email: "pw@example.com", password: OLD, nickname: "나", ...AGREED });

  it("지금 기기는 유지하고 다른 기기는 로그아웃하며, 다른 사람의 세션은 건드리지 않는다", async () => {
    const user = await account();
    const other = await signup(db, { email: "other@example.com", password: OLD, nickname: "남", ...AGREED });
    const here = await createSession(db, user.id);
    const there = await createSession(db, user.id);
    const theirs = await createSession(db, other.id);

    await changePassword(db, user, { current: OLD, next: NEXT, confirm: NEXT }, here.token);

    expect((await userFromToken(db, here.token))?.id).toBe(user.id);
    expect(await userFromToken(db, there.token)).toBeNull();
    expect((await userFromToken(db, theirs.token))?.id).toBe(other.id);
    await expectFail(login(db, { email: "pw@example.com", password: OLD }), 401);
    expect((await login(db, { email: "pw@example.com", password: NEXT })).id).toBe(user.id);
  });

  it("틀린 입력이면 바뀌지 않는다", async () => {
    const user = await account();
    const here = await createSession(db, user.id);
    const there = await createSession(db, user.id);
    await expectFail(changePassword(db, user, { current: "wrong-pass", next: NEXT, confirm: NEXT }, here.token), 401);
    await expectFail(changePassword(db, user, { current: OLD, next: NEXT, confirm: "different-1" }, here.token));
    await expectFail(changePassword(db, user, { current: OLD, next: "short", confirm: "short" }, here.token));
    await expectFail(changePassword(db, user, { current: OLD, next: OLD, confirm: OLD }, here.token));
    expect((await login(db, { email: "pw@example.com", password: OLD })).id).toBe(user.id);
    expect(await userFromToken(db, there.token)).not.toBeNull();
  });

  it("현재 비밀번호를 계속 틀리면 막힌다", async () => {
    const user = await account();
    for (let i = 0; i < 5; i++) await expectFail(changePassword(db, user, { current: "wrong-pass", next: NEXT, confirm: NEXT }, "t"), 401);
    await expectFail(changePassword(db, user, { current: OLD, next: NEXT, confirm: NEXT }, "t"), 429);
  });

  it("카카오 가입자는 바꿀 수 없다", async () => {
    await db.insert(users).values({ id: "k1", kakaoId: "1", role: "recorder", nickname: "카카오" });
    const kakao: User = { id: "k1", email: null, role: "recorder", nickname: "카카오" };
    await expectFail(changePassword(db, kakao, { current: OLD, next: NEXT, confirm: NEXT }, "t"), 403);
  });
});

describe("차단 풀기", () => {
  let seq = 0;
  async function member() {
    const n = ++seq;
    const recorder = await signup(db, { email: `ur${n}@example.com`, password: "password-1", nickname: `기록${n}`, ...AGREED });
    const joined = await signup(db, { email: `up${n}@example.com`, password: "password-1", nickname: `본명${n}`, ...AGREED });
    await connect(recorder, joined);
    const partner = await reload(joined);
    await agreeToRules(db, partner, `이웃${n}`);
    return { partner, recorder };
  }

  it("내가 차단한 닉네임만 보이고, 풀면 서로 글과 댓글이 다시 보인다", async () => {
    const { partner: me } = await member();
    const { partner: you } = await member();
    const { partner: third } = await member();
    const yours = await createPost(db, you, { title: "네 글", body: "본문" });
    const mine = await createPost(db, me, { title: "내 글", body: "본문" });
    const open = await createPost(db, third, { title: "셋째 글", body: "본문" });
    await createComment(db, you, open, "네 댓글");
    await blockAuthor(db, me, { kind: "post", id: yours });
    await expectFail(getPost(db, me, yours), 404);
    await expectFail(getPost(db, you, mine), 404);

    const list = await listBlocked(db, me);
    expect(list.map((b) => b.nickname)).toEqual([`이웃${seq - 1}`]);
    expect(await listBlocked(db, you)).toEqual([]); // 상대에게는 내가 차단했다는 사실이 보이지 않는다
    const json = JSON.stringify(list);
    for (const secret of [you.id, you.email, you.nickname]) expect(json).not.toContain(secret);

    await expectFail(unblock(db, you, list[0].key), 404); // 남의 차단은 못 푼다
    await expectFail(unblock(db, me, "wrong"), 404);
    expect(await listBlocked(db, me)).toHaveLength(1);

    await unblock(db, me, list[0].key);
    expect(await listBlocked(db, me)).toEqual([]);
    expect((await getPost(db, me, yours)).title).toBe("네 글");
    expect((await getPost(db, you, mine)).title).toBe("내 글");
    expect((await getPost(db, me, open)).commentCount).toBe(1);
    await createComment(db, me, yours, "다시 댓글");
  });

  it("서로 차단했으면 내 차단을 풀어도 상대 차단이 남고, 연결을 끊어도 풀 수 있으며, 탈퇴한 사람도 풀 수 있다", async () => {
    const { partner: me, recorder } = await member();
    const { partner: you } = await member();
    const { partner: gone } = await member();
    const yours = await createPost(db, you, { title: "네 글", body: "본문" });
    const mine = await createPost(db, me, { title: "내 글", body: "본문" });
    const goneMade = await createPost(db, gone, { title: "떠날 글", body: "본문" });
    await db.insert(blocks).values({ blockerId: you.id, blockedId: me.id });
    await db.insert(blocks).values({ blockerId: me.id, blockedId: you.id });
    await blockAuthor(db, me, { kind: "post", id: goneMade });
    await withdraw(db, gone);
    expect((await listBlocked(db, me)).map((b) => b.nickname)).toContain("탈퇴한 사용자");

    await disconnect(db, recorder);
    const left = await reload(me);
    for (const b of await listBlocked(db, left)) await unblock(db, left, b.key);
    expect(await listBlocked(db, left)).toEqual([]);

    expect(await listBlocked(db, you)).toHaveLength(1);
    await expectFail(getPost(db, you, mine), 404);
    expect(yours).toBeTruthy();
  });
});

describe("평소 주기", () => {
  it("저장·지우기·범위 검증, 예측과 파트너 화면에 쓰이고 탈퇴하면 지워진다", async () => {
    const { me, you } = await pair();
    await savePeriod(db, me.id, { startDate: "2026-10-20", endDate: "2026-10-24" }, TODAY);
    expect((await predictionFor(db, me.id, TODAY)).period?.startDate).toBe("2026-11-17"); // 28일

    for (const bad of ["20", "46", "30.5", "abc"]) await expectFail(setUsualCycle(db, me, bad));
    await setUsualCycle(db, me, "35");
    expect(await usualCycle(db, me.id)).toBe(35);
    expect((await predictionFor(db, me.id, TODAY)).period?.startDate).toBe("2026-11-24");

    await connect(me, you);
    const partner = await reload(you);
    expect((await partnerView(db, partner, TODAY))?.nextPeriod?.startDate).toBe("2026-11-24");
    await expectFail(setUsualCycle(db, partner, "30"), 403);
    expect(JSON.stringify(await partnerView(db, partner, TODAY))).not.toContain("usual");

    await setUsualCycle(db, me, "");
    expect(await usualCycle(db, me.id)).toBeNull();
    await setUsualCycle(db, me, "30");
    await withdraw(db, me);
    expect(await usualCycle(db, me.id)).toBeNull();
  });

  it("예측 정확도도 저장된 기록만으로 계산한다", async () => {
    const { me } = await pair();
    await fourPeriods(me);
    expect(predictionError(await listPeriods(db, me.id))).toEqual({ days: 0, samples: 3 });
  });
});

describe("공유 확인 안내", () => {
  it("연결하면 보이고, 누르면 사라진다", async () => {
    const { me, you } = await pair();
    const couple = await connect(me, you);
    expect((await activeCouple(db, me.id))?.sharingNotice).toBe(true);
    await clearSharingNotice(db, me);
    const [row] = await db.select().from(couples).where(eq(couples.id, couple.id));
    expect(row.sharingNotice).toBe(false);
  });
});

describe("남친톡 게시판", () => {
  let seq = 0;
  async function member() {
    const n = ++seq;
    const recorder = await signup(db, { email: `br${n}@example.com`, password: "password-1", nickname: `기록${n}`, ...AGREED });
    const joined = await signup(db, { email: `bp${n}@example.com`, password: "password-1", nickname: `본명${n}`, ...AGREED });
    await connect(recorder, joined);
    const partner = await reload(joined);
    await agreeToRules(db, partner, `닉네임${n}`);
    return { partner, recorder };
  }
  const write = async (user: User) => createPost(db, user, { title: "제목", body: "본문" });

  it("글쓰기 → 다른 커플의 파트너가 댓글 → 답글 → 신고 → 차단 → 삭제", async () => {
    const { partner: a, recorder } = await member();
    const { partner: b } = await member();
    const { partner: c } = await member();

    const id = await write(a);
    expect((await listPosts(db, b)).posts).toMatchObject([{ id, title: "제목", nickname: "닉네임" + (seq - 2), commentCount: 0 }]);
    await expectFail(listPosts(db, recorder), 403); // 기록자는 그대로 접근 불가

    const comment = await createComment(db, b, id, "댓글");
    const reply = await createComment(db, c, id, "답글", comment);
    await expect(createComment(db, a, id, "답글의 답글", reply).then(() => null, (e) => e.message)).resolves.toBe("답글을 달 수 없는 댓글이에요");
    const otherPost = await write(c);
    await expectFail(createComment(db, a, otherPost, "다른 글의 댓글에 답글", comment));

    let view = await getPost(db, a, id);
    expect(view.commentCount).toBe(2);
    expect(view.comments).toHaveLength(1);
    expect(view.comments[0]).toMatchObject({ body: "댓글", replies: [{ body: "답글", replies: [] }] });
    expect((await listPosts(db, a)).posts.find((p) => p.id === id)?.commentCount).toBe(2);

    await report(db, a, { kind: "comment", id: reply });
    await expectFail(report(db, a, { kind: "comment", id: reply }), 409);

    // b를 차단하면 b의 댓글과 그 아래 답글이 함께 사라지고 수도 맞는다
    await blockAuthor(db, a, { kind: "comment", id: comment });
    view = await getPost(db, a, id);
    expect(view.comments).toEqual([]);
    expect(view.commentCount).toBe(0);
    expect((await listPosts(db, a)).posts.find((p) => p.id === id)?.commentCount).toBe(0);
    await expectFail(createComment(db, a, id, "답글", comment), 404);
    await expectFail(report(db, a, { kind: "comment", id: reply }), 404);
    await expectFail(getPost(db, b, id), 404); // 차단은 양방향

    // c에게는 그대로 보인다
    expect((await getPost(db, c, id)).commentCount).toBe(2);

    await expectFail(deleteComment(db, b, reply), 404); // 남의 답글
    await deleteComment(db, c, reply);
    expect((await getPost(db, c, id)).comments[0].replies).toEqual([]);
    const again = await createComment(db, c, id, "새 답글", comment);
    await deleteComment(db, b, comment); // 댓글을 지우면 답글도 함께 지워진다
    expect((await getPost(db, c, id)).commentCount).toBe(0);
    expect((await db.select().from(comments)).map((x) => x.id)).not.toContain(again);

    await expectFail(deletePost(db, c, id), 404);
    await deletePost(db, a, id);
    await expectFail(getPost(db, c, id), 404);
  });

  it("신고로 숨겨진 댓글의 답글도 수에서 빠진다", async () => {
    const { partner: a } = await member();
    const { partner: b } = await member();
    const id = await write(a);
    const comment = await createComment(db, b, id, "댓글");
    await createComment(db, a, id, "답글", comment);
    for (let i = 0; i < 3; i++) await report(db, (await member()).partner, { kind: "comment", id: comment });
    expect((await getPost(db, a, id)).commentCount).toBe(0);
    expect((await listPosts(db, a)).posts[0].commentCount).toBe(0);
  });

  it("최신순으로 20개씩 더보기", async () => {
    const { partner } = await member();
    const { partner: other } = await member();
    const base = Date.parse("2026-10-01T00:00:00Z");
    await db.insert(posts).values(Array.from({ length: 45 }, (_, i) => ({
      id: `p${i}`, authorId: other.id, title: `글 ${i}`, body: "본문", createdAt: new Date(base + i * 60000),
    })));

    const first = await listPosts(db, partner);
    expect(first.posts).toHaveLength(20);
    expect(first.posts[0].title).toBe("글 44");
    expect(first.hasMore).toBe(true);

    const second = await listPosts(db, partner, 2);
    expect(second.posts).toHaveLength(40);
    expect(second.hasMore).toBe(true);

    const last = await listPosts(db, partner, 3);
    expect(last.posts).toHaveLength(45);
    expect(last.posts[44].title).toBe("글 0");
    expect(last.hasMore).toBe(false);
    expect((await listPosts(db, partner, -3)).posts).toHaveLength(20); // 이상한 값은 1쪽
  });

  it("예전 질문·팁 글도 한 목록에 나온다", async () => {
    const { partner } = await member();
    const id = await write(partner);
    await db.update(posts).set({ board: "tip" }).where(eq(posts.id, id));
    await write(partner);
    expect((await listPosts(db, partner)).posts).toHaveLength(2);
  });
});

describe("파트너 홈의 달", () => {
  it("연결되면 실제 달, 잠시 멈추면 초승달", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    const partner = await reload(you);
    const expected = moonShape(estimate(await listPeriods(db, me.id), [], TODAY), TODAY);
    expect(expected).not.toEqual(CRESCENT);
    expect((await partnerView(db, partner, TODAY))?.moon).toEqual(expected);
    await setPaused(db, me, true);
    expect((await partnerView(db, partner, TODAY))?.moon).toEqual(CRESCENT);
  });
});

describe("통증·기분", () => {
  const START = "2026-10-28";

  async function bleeding() {
    const { me, you } = await pair();
    const record = await savePeriod(db, me.id, { startDate: START }, TODAY);
    return { me, you, record };
  }

  it("생리 중인 날만 남길 수 있고, 날짜별 하나이며 고칠 수 있고 비우면 지워진다", async () => {
    const { me } = await bleeding();
    await expectFail(saveDayLog(db, me, { day: "2026-10-27", pain: "mild", moods: [] }, TODAY)); // 생리 전날
    await expectFail(saveDayLog(db, me, { day: "2026-10-31", pain: "mild", moods: [] }, TODAY)); // 내일
    await expectFail(saveDayLog(db, me, { day: TODAY, pain: "bogus", moods: [] }, TODAY));

    await saveDayLog(db, me, { day: TODAY, pain: "severe", moods: ["tired", "sensitive", "bogus"] }, TODAY);
    expect(await dayLogOn(db, me.id, TODAY)).toEqual({ day: TODAY, pain: "severe", moods: ["sensitive", "tired"] });
    await saveDayLog(db, me, { day: TODAY, pain: null, moods: ["calm"] }, TODAY);
    expect(await listDayLogs(db, me.id)).toEqual([{ day: TODAY, pain: null, moods: ["calm"] }]);
    await saveDayLog(db, me, { day: TODAY, pain: null, moods: [] }, TODAY);
    expect(await listDayLogs(db, me.id)).toEqual([]);
  });

  it("파트너는 남길 수 없고, 오늘 것만 보며 잠시 멈추면 숨겨진다", async () => {
    const { me, you } = await bleeding();
    await saveDayLog(db, me, { day: "2026-10-29", pain: "mild", moods: ["down"] }, TODAY);
    await connect(me, you);
    const partner = await reload(you);
    await expectFail(saveDayLog(db, partner, { day: TODAY, pain: "mild", moods: [] }, TODAY), 403);

    expect((await partnerView(db, partner, TODAY))?.todayBody).toBeNull(); // 어제 것은 보내지 않는다
    expect(JSON.stringify(await partnerView(db, partner, TODAY))).not.toContain("down");

    await saveDayLog(db, me, { day: TODAY, pain: "severe", moods: ["tired"] }, TODAY);
    const view = (await partnerView(db, partner, TODAY))!;
    expect(view.todayBody).toEqual({ pain: "severe", moods: ["tired"] });

    await setPaused(db, me, true);
    expect((await partnerView(db, partner, TODAY))?.todayBody).toBeNull();
    await setPaused(db, me, false);
    await updateSharing(db, me, { shareFrom: TODAY }, TODAY); // 생리 시작일이 공유 시작일 전이면 그 기록처럼 숨긴다
    expect((await partnerView(db, partner, TODAY))?.todayBody).toBeNull();
  });

  it("생리 기록을 지우거나 날짜를 줄이면 속하지 않게 된 날의 내용이 함께 지워진다", async () => {
    const { me, record } = await bleeding();
    await saveDayLog(db, me, { day: START, pain: "mild", moods: [] }, TODAY);
    await saveDayLog(db, me, { day: TODAY, pain: "severe", moods: [] }, TODAY);
    await savePeriod(db, me.id, { ...record, endDate: "2026-10-29" }, TODAY);
    expect((await listDayLogs(db, me.id)).map((l) => l.day)).toEqual([START]);
    await deletePeriod(db, me.id, record.id);
    expect(await listDayLogs(db, me.id)).toEqual([]);
  });

  it("지난 생리 요약: 통증이 가장 심했던 첫날과 자주 남긴 기분", () => {
    const period = { startDate: "2026-10-01", endDate: "2026-10-05" };
    const logs = [
      { day: "2026-09-30", pain: "severe" as const, moods: [] },
      { day: "2026-10-01", pain: "mild" as const, moods: ["tired" as const] },
      { day: "2026-10-02", pain: "severe" as const, moods: ["tired" as const, "down" as const] },
      { day: "2026-10-03", pain: "severe" as const, moods: [] },
    ];
    expect(summarizeLogs(period, logs)).toEqual({ pain: "2일째 통증이 가장 심했어요", mood: "자주 남긴 기분은 피곤이에요" });
    expect(summarizeLogs(period, [{ day: "2026-10-01", pain: "none", moods: [] }])).toEqual({ pain: null, mood: null });
  });

  it("탈퇴하면 함께 지워진다", async () => {
    const { me } = await bleeding();
    await saveDayLog(db, me, { day: TODAY, pain: "severe", moods: ["tired"] }, TODAY);
    await withdraw(db, me);
    expect(await db.select().from(dayLogs)).toEqual([]);
    const [row] = await db.select().from(users).where(eq(users.id, me.id));
    expect(row).toMatchObject({ healthConsentAt: null, ageConfirmedAt: null, transferConsentAt: null });
  });
});

describe("알아두면 좋은 것", () => {
  it("글마다 주소가 다르고 단정·진단 표현이 없다", () => {
    expect(ARTICLES).toHaveLength(8);
    expect(findArticle("prediction-misses")).toBeUndefined();
    expect(findArticle("cycle-differs")).toBeUndefined();
    expect(ARTICLES.map((a) => a.title)).not.toContain("주기는 사람마다 달라요");
    expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(8);
    for (const { body } of ARTICLES) expect(body.join(" ")).not.toMatch(/100%|진단|치료|처방|진통제/);
    expect(findArticle("pms")?.title).toBe("PMS란");
    expect(findArticle("없는글")).toBeUndefined();
  });
});
