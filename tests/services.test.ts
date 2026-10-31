import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDb, type DB } from "@/lib/db";
import { comments, invitations, posts, pushSubscriptions, reports, users } from "@/lib/db/schema";
import { addDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { createSession, deleteSession, limit, login, recordHealthConsent, signup, userFromToken, type User } from "@/lib/services/auth";
import { clearCare, getCare, respondToCare, saveCare } from "@/lib/services/care";
import {
  activeCouple, claimInvite, claimWithLimit, createInvite, disconnect, setSharingItem, tryClaim, updateSharing,
} from "@/lib/services/couples";
import {
  agreeToRules, blockAuthor, communityAccess, createComment, createPost, decideReport, deleteComment, deletePost, getPost, listPosts,
  listReports, myPosts, report, updateComment, updatePost,
} from "@/lib/services/community";
import { kakaoAuthorizeUrl, kakaoEnabled, kakaoLanding, signInWithKakao } from "@/lib/services/kakao";
import { currentPeriod, deletePeriod, listPeriods, predictionFor, savePeriod } from "@/lib/services/periods";
import { partnerView } from "@/lib/services/partner";
import {
  cronAuthorized, markNewsSeen, newsFor, notifyCare, notifyConnected, notifyReply, reminderEnabled, removeSubscription, saveSubscription,
  sendPush, sendReminders, setReminder, type Sender,
} from "@/lib/services/push";

const TODAY = "2026-10-30";
let db: DB;

async function expectFail(promise: Promise<unknown>, status?: number) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  if (status) expect((err as AppError).status).toBe(status);
}

async function pair(): Promise<{ me: User; you: User }> {
  const me = await signup(db, { email: "me@example.com", password: "password-1", nickname: "나", healthConsent: true });
  const you = await signup(db, { email: "you@example.com", password: "password-2", nickname: "너", healthConsent: true });
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

async function fourPeriods(user: User) {
  // 28일 간격 4번 → 예측 가능
  for (const start of ["2026-07-10", "2026-08-07", "2026-09-04", "2026-10-02"]) {
    await savePeriod(db, user.id, { startDate: start, endDate: addDays(start, 4) }, TODAY);
  }
}

beforeEach(async () => {
  db = await createLocalDb();
});

describe("계정", () => {
  it("가입 → 로그인 → 세션 → 로그아웃", async () => {
    const user = await signup(db, { email: " Me@Example.com ", password: "password-1", nickname: "나", healthConsent: true });
    expect(user.email).toBe("me@example.com");
    await expectFail(signup(db, { email: "me@example.com", password: "password-1", nickname: "다른", healthConsent: true }), 409);
    await expectFail(login(db, { email: "me@example.com", password: "wrong-pass" }), 401);
    await expectFail(login(db, { email: "nobody@example.com", password: "password-1" }), 401);
    const logged = await login(db, { email: "ME@example.com", password: "password-1" });
    const { token } = await createSession(db, logged.id);
    expect((await userFromToken(db, token))?.id).toBe(user.id);
    expect(await userFromToken(db, "fake-token")).toBeNull();
    await deleteSession(db, token);
    expect(await userFromToken(db, token)).toBeNull();
  });

  it("가입하면 누구나 기록자", async () => {
    const user = await signup(db, { email: "a@b.co", password: "password-1", nickname: "a", healthConsent: true });
    expect(user.role).toBe("recorder");
    expect((await reload(user)).role).toBe("recorder");
  });

  it("건강 정보 동의 없이는 가입할 수 없고, 동의 시각을 저장한다", async () => {
    const input = { email: "a@b.co", password: "password-1", nickname: "a" };
    for (const healthConsent of [false, undefined, "on", 1]) await expectFail(signup(db, { ...input, healthConsent }));
    expect(await db.select().from(users)).toEqual([]);
    const before = Date.now();
    const user = await signup(db, { ...input, healthConsent: true });
    const [row] = await db.select({ at: users.healthConsentAt }).from(users).where(eq(users.id, user.id));
    expect(row.at?.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("기존 가입자: 세션에 동의 여부가 실리고, 동의하면 기록되며 첫 동의 시각은 바뀌지 않는다", async () => {
    const user = await signup(db, { email: "old@b.co", password: "password-1", nickname: "옛", healthConsent: true });
    await db.update(users).set({ healthConsentAt: null }).where(eq(users.id, user.id));
    const { token } = await createSession(db, user.id);
    expect((await userFromToken(db, token))?.healthConsentAt).toBeNull();

    await recordHealthConsent(db, user);
    const first = (await userFromToken(db, token))?.healthConsentAt;
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 5));
    await recordHealthConsent(db, user);
    expect((await userFromToken(db, token))?.healthConsentAt).toEqual(first);
  });

  it("입력 검증: 짧은 비밀번호 거부", async () => {
    await expectFail(signup(db, { email: "a@b.co", password: "short", nickname: "a", healthConsent: true }));
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
    expect(currentPeriod(await listPeriods(db, me.id), "2026-11-10")).toBeNull(); // 종료일 없어도 10일 넘으면 진행 중 아님
  });
});

describe("커플 연결", () => {
  it("코드 입력 → 바로 연결. 1:1", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await expectFail(claimInvite(db, you, "AAAA-AAAA"), 404);
    const couple = await claimInvite(db, you, code, TODAY);
    expect(couple).toMatchObject({ recorderId: me.id, partnerId: you.id, status: "active" });
    expect(couple.permissions).toEqual({ periods: false, predictions: false, fertility: false, care: false });
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
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", healthConsent: true });
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
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", healthConsent: true });
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
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", healthConsent: true });
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
    const late = await signup(db, { email: "y@example.com", password: "password-4", nickname: "넷", healthConsent: true });
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
    const fourth = await signup(db, { email: "y@example.com", password: "password-4", nickname: "넷", healthConsent: true });
    const mine = await createInvite(db, me);
    const yours = await createInvite(db, you);
    await claimInvite(db, fourth, yours.code);
    await expectFail(claimInvite(db, you, mine.code), 409);
    expect((await reload(you)).role).toBe("recorder");
  });

  it("이미 파트너가 있는 기록자의 코드로는 연결되지 않는다", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", healthConsent: true });
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

describe("공유 토글", () => {
  it("한 항목만 바뀌고 나머지는 그대로다. 잠시 멈추기도 같은 방식", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    await Promise.all([setSharingItem(db, me, "care", true), setSharingItem(db, me, "periods", true)]);
    expect((await activeCouple(db, me.id))?.permissions).toEqual({ periods: true, predictions: false, fertility: false, care: true });
    await setSharingItem(db, me, "care", false);
    await setSharingItem(db, me, "paused", true);
    expect(await activeCouple(db, me.id)).toMatchObject({ paused: true, permissions: { periods: true, care: false } });
  });

  it("권한이 없거나 없는 항목이면 바뀌지 않는다", async () => {
    const { me, you } = await pair();
    await expectFail(setSharingItem(db, me, "care", true), 404); // 연결 전
    await connect(me, you);
    await expectFail(setSharingItem(db, await reload(you), "care", true), 403); // 파트너는 못 바꾼다
    await expectFail(setSharingItem(db, me, "isAdmin", true), 400);
    await expectFail(setSharingItem(db, me, "care}", true), 400);
    expect((await activeCouple(db, me.id))?.permissions).toEqual({ periods: false, predictions: false, fertility: false, care: false });
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
    expect(user).toMatchObject({ email: null, role: "recorder", nickname: "지민", healthConsentAt: null });
    expect(kakaoLanding(user, undefined)).toBe("/consent");
    expect(kakaoLanding(user, "ABCDEFGH")).toBe("/consent"); // 코드가 있어도 동의가 먼저

    const body = calls[0].init?.body as URLSearchParams;
    expect(Object.fromEntries(body)).toMatchObject({ code: "auth-code", client_id: "rest-key", client_secret: "secret", redirect_uri: REDIRECT });
    expect(calls[1].init?.headers).toEqual({ Authorization: "Bearer token-1" });
  });

  it("다시 로그인하면 같은 계정이고, 이메일 없는 계정이 여럿이어도 된다", async () => {
    const first = await signInWithKakao(db, "a", REDIRECT, kakao(1001, "지민").fetcher);
    await recordHealthConsent(db, first);
    const again = await signInWithKakao(db, "b", REDIRECT, kakao(1001, "바뀐이름").fetcher);
    expect(again.id).toBe(first.id);
    expect(again.nickname).toBe("지민");
    expect(kakaoLanding(again, undefined)).toBe("/");
    expect(kakaoLanding(again, "ABCDEFGH")).toBe("/join?code=ABCDEFGH"); // 쓰던 계정은 확인 화면을 거친다

    const other = await signInWithKakao(db, "c", REDIRECT, kakao(1002, "도윤").fetcher);
    expect(other.id).not.toBe(first.id);
    expect(await db.select({ id: users.id }).from(users)).toHaveLength(2);
  });

  it("닉네임이 없거나 길어도 가입된다", async () => {
    expect((await signInWithKakao(db, "a", REDIRECT, kakao(1001).fetcher)).nickname).toBe("우리주기 사용자");
    expect((await signInWithKakao(db, "b", REDIRECT, kakao(1002, "가".repeat(30)).fetcher)).nickname).toHaveLength(20);
  });

  it("코드로 들어와 가입하면 동의 뒤 그 코드로 바로 연결된다", async () => {
    const { me } = await pair();
    const { code } = await createInvite(db, me);
    const user = await signInWithKakao(db, "a", REDIRECT, kakao(1001, "도윤").fetcher);
    await recordHealthConsent(db, user); // healthConsentAction과 같은 순서
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
  const newcomer = () => signup(db, { email: "new@example.com", password: "password-9", nickname: "새", healthConsent: true });
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
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋", healthConsent: true });
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
  it("기본은 아무것도 안 보이고, 켠 항목만 보인다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    const partner = await reload(you);
    let view = await partnerView(db, partner, TODAY);
    expect(view).toMatchObject({ recorderNickname: "나", current: null, nextPeriod: null, fertileWindow: null, recentPeriods: [], care: [] });

    // 예측만 켬: 다음 예정일은 보이지만 과거 기록·간격은 안 보인다
    await updateSharing(db, me, { permissions: { predictions: true }, shareFrom: TODAY, paused: false }, TODAY);
    view = await partnerView(db, partner, TODAY);
    expect(view?.nextPeriod?.startDate).toBe("2026-10-30");
    expect(view?.recentPeriods).toEqual([]);
    expect(view?.fertileWindow).toBeNull();
    expect(JSON.stringify(view)).not.toContain("intervals");

    // 기록 공유를 켜도 공유 시작일 이전 기록은 안 보인다
    await updateSharing(db, me, { permissions: { periods: true }, shareFrom: TODAY, paused: false }, TODAY);
    expect((await partnerView(db, partner, TODAY))?.recentPeriods).toEqual([]);
    await updateSharing(db, me, { permissions: { periods: true }, shareFrom: "2026-09-01", paused: false }, TODAY);
    expect((await partnerView(db, partner, TODAY))?.recentPeriods.map((p) => p.startDate)).toEqual(["2026-10-02", "2026-09-04"]);

    // 일시정지하면 전부 숨김
    await updateSharing(db, me, { permissions: { periods: true, predictions: true }, shareFrom: "2026-09-01", paused: true }, TODAY);
    view = await partnerView(db, partner, TODAY);
    expect(view).toMatchObject({ paused: true, recentPeriods: [], nextPeriod: null });

    await expectFail(updateSharing(db, partner, { permissions: {}, shareFrom: TODAY, paused: false }, TODAY), 403);
    await expectFail(updateSharing(db, me, { permissions: {}, shareFrom: "2026-12-01", paused: false }, TODAY));
  });

  it("파트너 달력에는 켠 항목의 날짜만 들어간다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    const partner = await reload(you);
    const asOf = "2026-10-12"; // 예상 가임기(10.11~17)가 아직 지나지 않은 날
    const types = async (month?: string) => [...new Set((await partnerView(db, partner, asOf, month))!.calendar.map((m) => m.type))];
    const share = (permissions: Record<string, boolean>, shareFrom = "2026-09-01", paused = false) =>
      updateSharing(db, me, { permissions, shareFrom, paused }, asOf);

    expect(await types()).toEqual([]); // 기본은 아무것도 없음

    await share({ periods: true });
    expect(await types()).toEqual(["period"]);
    await share({ predictions: true });
    expect(await types()).toEqual(["predicted_period"]);
    await share({ fertility: true });
    expect(await types()).toEqual(["estimated_fertile_window"]); // 예측 날짜도, 배란 추정일도 없음

    // 공유 시작일 이전의 실제 기록은 안 보인다
    await share({ periods: true }, "2026-09-01");
    expect((await partnerView(db, partner, asOf, "2026-08"))!.calendar).toEqual([]);
    expect((await partnerView(db, partner, asOf, "2026-09"))!.calendar.map((m) => m.date))
      .toEqual(["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"]);
    await share({ periods: true }, "2026-09-05");
    expect((await partnerView(db, partner, asOf, "2026-09"))!.calendar).toEqual([]); // 9.4 시작 기록 전체가 숨겨짐

    // 지나간 예측은 안 보이고, 달력에 기록 id도 내려가지 않는다
    await share({ periods: true, predictions: true, fertility: true });
    const late = await partnerView(db, partner, "2026-10-31", "2026-10");
    expect(late!.calendar.some((m) => m.type === "predicted_period" && m.date < "2026-10-31")).toBe(false);
    expect(JSON.stringify(late!.calendar)).not.toContain("recordId");

    // 일시정지면 비어 있다
    await share({ periods: true, predictions: true, fertility: true }, "2026-09-01", true);
    expect((await partnerView(db, partner, asOf))!.calendar).toEqual([]);
  });

  it("연결 해제하면 볼 수 없고, 다시 연결하면 공유는 처음부터", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    await updateSharing(db, me, { permissions: { periods: true, predictions: true, fertility: true, care: true }, shareFrom: "2026-01-01", paused: false }, TODAY);
    const partner = await reload(you);
    await disconnect(db, partner);
    expect(await partnerView(db, partner, TODAY)).toBeNull(); // 끊기 전에 연 화면에서도 아무것도 안 보인다
    const again = await connect(me, await reload(you));
    expect(again.permissions.periods).toBe(false);
  });
});

describe("커뮤니티", () => {
  let seq = 0;

  /** 기록자와 연결된 파트너 한 명. agree면 이용 규칙에도 동의한다. */
  async function member(agree = true) {
    const n = ++seq;
    const recorder = await signup(db, { email: `r${n}@example.com`, password: "password-1", nickname: `기록${n}`, healthConsent: true });
    const joined = await signup(db, { email: `p${n}@example.com`, password: "password-1", nickname: `본명${n}`, healthConsent: true });
    await connect(recorder, joined);
    const partner = await reload(joined);
    if (agree) await agreeToRules(db, partner, "");
    return { partner, recorder };
  }
  const post = (user: User, board = "question", title = "제목") => createPost(db, user, { board, title, body: "본문" });

  it("기록자·연결 없는 사람은 읽기도 쓰기도 못 한다", async () => {
    const { partner, recorder } = await member();
    const stranger = await signup(db, { email: "s@example.com", password: "password-1", nickname: "남", healthConsent: true });
    const id = await post(partner);
    for (const user of [recorder, stranger]) {
      await expectFail(listPosts(db, user, "question"), 403);
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
    expect((await listPosts(db, partner, "question"))).toHaveLength(1); // 읽기는 가능
    await expectFail(post(partner), 403);
    await expectFail(createComment(db, partner, id, "댓글"), 403);

    expect(await agreeToRules(db, partner, "")).toMatch(/^편-\d{4}$/);
    expect(await agreeToRules(db, partner, "다른이름")).toMatch(/^편-\d{4}$/); // 두 번째는 그대로
    await post(partner);

    const third = (await member(false)).partner;
    await expectFail(agreeToRules(db, third, (await communityAccess(db, partner)).nickname), 409);
    await expectFail(agreeToRules(db, third, "운영자님"));
    await expectFail(agreeToRules(db, third, "가"));
    expect(await agreeToRules(db, third, " 든든한편 ")).toBe("든든한편");
  });

  it("글·댓글 길이와 게시판 검증, 내 글만 수정·삭제, 익명 유지", async () => {
    const { partner } = await member();
    const other = (await member()).partner;
    await expectFail(createPost(db, partner, { board: "free", title: "제목", body: "본문" }));
    await expectFail(createPost(db, partner, { board: "tip", title: " ", body: "본문" }));
    await expectFail(createPost(db, partner, { board: "tip", title: "가".repeat(61), body: "본문" }));
    await expectFail(createPost(db, partner, { board: "tip", title: "제목", body: "가".repeat(2001) }));

    const id = await post(partner, "tip", "<script>alert(1)</script>");
    expect((await getPost(db, partner, id)).title).toBe("<script>alert(1)</script>"); // 그대로 보관, 화면에서 글자로 출력
    expect(await listPosts(db, partner, "question")).toEqual([]);
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
    const json = JSON.stringify([view, await listPosts(db, other, "tip")]);
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
    expect(await listPosts(db, c, "question")).toHaveLength(1);
    await report(db, c, { kind: "post", id });
    expect(await listPosts(db, d, "question")).toEqual([]);
    await expectFail(getPost(db, d, id), 404);

    await db.update(users).set({ isAdmin: true }).where(eq(users.id, a.id));
    const admin = await reload(a);
    expect(await listPosts(db, admin, "question")).toMatchObject([{ id, hidden: true }]); // 운영자는 숨긴 글도 읽는다
    expect(await listReports(db, admin)).toMatchObject([{ kind: "post", id, total: 3, hidden: true }]);
    await expectFail(listReports(db, d), 403);
    await expectFail(decideReport(db, d, { kind: "post", id }, "dismissed"), 403);

    await decideReport(db, admin, { kind: "post", id }, "dismissed");
    expect(await listReports(db, admin)).toEqual([]);
    expect(await listPosts(db, d, "question")).toHaveLength(1);
    await report(db, d, { kind: "post", id }); // 기각 뒤 새 신고 1건으로 다시 숨겨지지 않는다
    expect(await listPosts(db, c, "question")).toHaveLength(1);

    await decideReport(db, admin, { kind: "post", id }, "hidden");
    expect(await listPosts(db, c, "question")).toEqual([]);
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
    expect((await listPosts(db, partner, "question"))[0].commentCount).toBe(0);
    await expectFail(updateComment(db, author, cid, "고침"), 404);
    await deleteComment(db, author, cid); // 숨겨져도 지울 수는 있다
  });

  it("차단은 양방향: 서로 안 보이고 댓글도 못 단다", async () => {
    const { partner: me } = await member();
    const { partner: you } = await member();
    const { partner: third } = await member();
    const mine = await post(me, "question", "내 글");
    const yours = await post(you, "question", "네 글");
    const open = await post(third, "question", "셋째 글");
    const yourComment = await createComment(db, you, open, "네 댓글");
    await createComment(db, me, open, "내 댓글");

    await blockAuthor(db, me, { kind: "comment", id: yourComment });
    await expectFail(blockAuthor(db, me, { kind: "post", id: yours }), 404); // 이미 안 보이는 사람의 글

    for (const [viewer, otherPost, ownTitle] of [[me, yours, "내 글"], [you, mine, "네 글"]] as const) {
      const titles = (await listPosts(db, viewer, "question")).map((p) => p.title);
      expect(titles).toContain(ownTitle);
      expect(titles).toHaveLength(2);
      await expectFail(getPost(db, viewer, otherPost), 404);
      await expectFail(createComment(db, viewer, otherPost, "댓글"), 404);
      await expectFail(report(db, viewer, { kind: "post", id: otherPost }), 404);
      const shared = (await listPosts(db, viewer, "question")).find((p) => p.id === open);
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

  it("글쓰기 요청 제한: 10분에 5개, 다른 계정은 영향 없음", async () => {
    const { partner } = await member();
    const other = (await member()).partner;
    for (let i = 0; i < 5; i++) await post(partner);
    await expectFail(post(partner), 429);
    expect(await listPosts(db, other, "question")).toHaveLength(5);
    const id = await post(other);
    await expectFail(createPost(db, partner, { board: "tip", title: "제목", body: "가".repeat(2001) })); // 검증 실패가 먼저
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
    await expectFail(listPosts(db, left, "question"), 403);
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
    const sent: { endpoint: string; body: string; url: string }[] = [];
    const sender: Sender = async (target, payload) => {
      sent.push({ endpoint: target.endpoint, ...JSON.parse(payload) });
    };
    return { sent, sender };
  }

  async function shared(permissions: Record<string, boolean> = { care: true }, paused = false) {
    const { me, you } = await pair();
    await connect(me, you);
    await updateSharing(db, me, { permissions, shareFrom: TODAY, paused }, TODAY);
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
    expect(sent).toMatchObject([{ endpoint: sub("me").endpoint, title: "우리주기", body: "파트너가 연결됐어요", url: "/connect?sharing=new" }]);

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
    expect(sent).toMatchObject([{ endpoint: sub("you").endpoint, body: "새 배려 요청이 왔어요 💗" }]);
    expect(await saveCare(db, me, { presets: ["company"], message: "", share: true }, TODAY)).toBe(false); // 수정은 다시 안 보냄
    expect(JSON.stringify(sent)).not.toContain("조용히");
    expect(partner.role).toBe("partner");
  });

  it("권한이 없으면 보내지 않는다: 배려 공유 꺼짐·일시정지·연결 없음", async () => {
    for (const [permissions, paused] of [[{ care: false }, false], [{ care: true }, true]] as const) {
      db = await createLocalDb();
      const { me } = await shared(permissions, paused);
      const { sent, sender } = outbox();
      await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
      await notifyCare(db, me, TODAY, sender);
      expect(sent).toEqual([]);
    }
    db = await createLocalDb();
    const { me, partner } = await shared();
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    await disconnect(db, me);
    const { sent, sender } = outbox();
    await notifyCare(db, me, TODAY, sender);
    await notifyReply(db, await reload(partner), "any", TODAY, sender);
    expect(sent).toEqual([]);
  });

  it("답장은 기록자에게 파트너 이름으로, 첫 답장만. 공유를 끄면 보내지 않는다", async () => {
    const { me, partner } = await shared();
    const { sent, sender } = outbox();
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    const care = (await getCare(db, me, TODAY))!;
    expect(await respondToCare(db, partner, care.id, "seen", TODAY)).toBe(true);
    expect(await respondToCare(db, partner, care.id, "done", TODAY)).toBe(false);
    await notifyReply(db, partner, care.id, TODAY, sender);
    expect(sent).toMatchObject([{ endpoint: sub("me").endpoint, body: "너님이 답장했어요" }]);
    await updateSharing(db, me, { permissions: { care: false }, shareFrom: TODAY, paused: false }, TODAY);
    await notifyReply(db, partner, care.id, TODAY, sender);
    expect(sent).toHaveLength(1);
  });

  it("발송이 실패해도 저장된 내용은 그대로이고 오류가 밖으로 나오지 않는다", async () => {
    const { me, partner } = await shared();
    const sender: Sender = async () => { throw new Error("boom"); };
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    await expect(notifyCare(db, me, TODAY, sender)).resolves.toBeUndefined();
    expect((await partnerView(db, partner, TODAY))?.care).toHaveLength(1);
    const broken = db;
    db = await createLocalDb();
    await expect(notifyCare(db, me, TODAY, sender)).resolves.toBeUndefined(); // 없는 계정이어도 조용히
    db = broken;
  });

  it("예정일 3일 전 알림: 본인에게만, 하루 한 번, 끄면 보내지 않는다", async () => {
    const { me, partner } = await shared({ predictions: true });
    await fourPeriods(me); // 다음 예정일 2026-10-30
    const { sent, sender } = outbox();
    expect(await sendReminders(db, "2026-10-26", sender)).toBe(0); // 4일 전
    expect(await sendReminders(db, "2026-10-27", sender)).toBe(1);
    expect(sent).toMatchObject([{ endpoint: sub("me").endpoint, body: "오늘 확인할 소식이 있어요" }]);
    expect(JSON.stringify(sent)).not.toContain("생리"); // 잠금 화면에 보이는 문구
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
    await updateSharing(db, me, { permissions: { care: true }, shareFrom: TODAY, paused: false }, TODAY);
    const partner = await reload(you);
    await saveCare(db, me, { presets: ["rest"], message: "", share: true }, TODAY);
    expect(await newsFor(db, partner, TODAY)).toMatchObject({ care: 1 });
    await markNewsSeen(db, partner);
    expect(await newsFor(db, partner, TODAY)).toMatchObject({ care: 0 });

    await respondToCare(db, partner, (await getCare(db, me, TODAY))!.id, "seen", TODAY);
    expect(await newsFor(db, me, TODAY)).toMatchObject({ replies: 1 });
    await markNewsSeen(db, me);
    expect(await newsFor(db, me, TODAY)).toMatchObject({ replies: 0 });

    await updateSharing(db, me, { permissions: { care: false }, shareFrom: TODAY, paused: false }, TODAY);
    await saveCare(db, me, { presets: ["company"], message: "", share: true }, TODAY);
    expect(await newsFor(db, partner, TODAY)).toMatchObject({ care: 0 }); // 공유를 끄면 파트너에게 소식도 없다
  });
});

describe("오늘 필요한 배려", () => {
  it("요청별 공유 + 답장 + 수정하면 답장 초기화", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    const partner = await reload(you);
    await updateSharing(db, me, { permissions: { care: true }, shareFrom: TODAY, paused: false }, TODAY);

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

    // 배려 공유를 끄면 답장도 못 한다
    await updateSharing(db, me, { permissions: { care: false }, shareFrom: TODAY, paused: false }, TODAY);
    await expectFail(respondToCare(db, partner, care.id, "seen", TODAY), 404);

    await clearCare(db, me, TODAY);
    expect(await getCare(db, me, TODAY)).toBeNull();
  });
});
