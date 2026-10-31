import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createLocalDb, type DB } from "@/lib/db";
import { comments, invitations, posts, reports, users } from "@/lib/db/schema";
import { addDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { createSession, deleteSession, limit, login, signup, userFromToken, type User } from "@/lib/services/auth";
import { clearCare, getCare, respondToCare, saveCare } from "@/lib/services/care";
import {
  activeCouple, approveRequest, claimInvite, claimWithLimit, createInvite, disconnect, pendingRequests, rejectRequest, tryClaim, updateSharing,
  waitingClaim,
} from "@/lib/services/couples";
import {
  agreeToRules, blockAuthor, communityAccess, createComment, createPost, decideReport, deleteComment, deletePost, getPost, listPosts,
  listReports, myPosts, report, updateComment, updatePost,
} from "@/lib/services/community";
import { currentPeriod, deletePeriod, listPeriods, predictionFor, savePeriod } from "@/lib/services/periods";
import { partnerView } from "@/lib/services/partner";

const TODAY = "2026-10-30";
let db: DB;

async function expectFail(promise: Promise<unknown>, status?: number) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  if (status) expect((err as AppError).status).toBe(status);
}

async function pair(): Promise<{ me: User; you: User }> {
  const me = await signup(db, { email: "me@example.com", password: "password-1", nickname: "나" });
  const you = await signup(db, { email: "you@example.com", password: "password-2", nickname: "너" });
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
  const { id } = await claimInvite(db, you, code.toLowerCase()); // 소문자·하이픈 입력도 받는다
  return approveRequest(db, me, id, TODAY);
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
    const user = await signup(db, { email: " Me@Example.com ", password: "password-1", nickname: "나" });
    expect(user.email).toBe("me@example.com");
    await expectFail(signup(db, { email: "me@example.com", password: "password-1", nickname: "다른" }), 409);
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
    const user = await signup(db, { email: "a@b.co", password: "password-1", nickname: "a" });
    expect(user.role).toBe("recorder");
    expect((await reload(user)).role).toBe("recorder");
  });

  it("입력 검증: 짧은 비밀번호 거부", async () => {
    await expectFail(signup(db, { email: "a@b.co", password: "short", nickname: "a" }));
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
  it("코드 → 요청 → 승인. 1:1", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await expectFail(claimInvite(db, you, "AAAA-AAAA"), 404);
    const { id } = await claimInvite(db, you, code);
    expect(await waitingClaim(db, you)).toMatchObject({ nickname: "나" });
    expect(await pendingRequests(db, me)).toHaveLength(1);
    await expectFail(claimInvite(db, you, code), 404); // 한 번 쓴 코드는 끝
    const couple = await approveRequest(db, me, id, TODAY);
    expect(couple.permissions).toEqual({ periods: false, predictions: false, fertility: false, care: false });
    expect(couple.shareFrom).toBe(TODAY);
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

  it("코드 입력만 하면 역할은 그대로", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    await claimInvite(db, you, code);
    expect((await reload(you)).role).toBe("recorder");
  });

  it("승인하면 입력한 사람만 파트너가 된다", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    expect((await reload(you)).role).toBe("partner");
    expect((await reload(me)).role).toBe("recorder");
  });

  it("거절하면 기록자 그대로", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    const { id } = await claimInvite(db, you, code);
    await rejectRequest(db, me, id);
    expect((await reload(you)).role).toBe("recorder");
    expect(await waitingClaim(db, you)).toBeNull();
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

  it("입력한 사람이 만들어 둔 코드는 승인되면 무효", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋" });
    const yours = await createInvite(db, you);
    const { id: stale } = await claimInvite(db, third, yours.code);
    const mine = await createInvite(db, me);
    const late = await signup(db, { email: "y@example.com", password: "password-4", nickname: "넷" });
    const { id } = await claimInvite(db, you, mine.code);
    await approveRequest(db, me, id, TODAY);
    expect(await waitingClaim(db, third)).toBeNull();
    await expectFail(approveRequest(db, await reload(you), stale, TODAY), 403);
    await expectFail(claimInvite(db, late, yours.code), 404);
  });

  it("서로의 코드를 입력해도 먼저 승인한 쪽만 연결된다", async () => {
    const { me, you } = await pair();
    const mine = await createInvite(db, me);
    const yours = await createInvite(db, you);
    const toMe = await claimInvite(db, you, mine.code);
    const toYou = await claimInvite(db, me, yours.code);
    await approveRequest(db, me, toMe.id, TODAY);
    expect(await waitingClaim(db, me)).toBeNull();
    await expectFail(approveRequest(db, await reload(you), toYou.id, TODAY), 403);
    expect((await reload(me)).role).toBe("recorder");
  });

  it("이미 다른 연결의 기록자인 사람은 파트너가 될 수 없다", async () => {
    const { me, you } = await pair();
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋" });
    const fourth = await signup(db, { email: "y@example.com", password: "password-4", nickname: "넷" });
    // you가 me의 코드를 입력해 둔 뒤, you의 코드를 fourth가 입력해 you가 먼저 승인한다
    const mine = await createInvite(db, me);
    const yours = await createInvite(db, you);
    const toMe = await claimInvite(db, you, mine.code);
    const toYou = await claimInvite(db, fourth, yours.code);
    await approveRequest(db, you, toYou.id, TODAY);
    await expectFail(approveRequest(db, me, toMe.id, TODAY), 404); // 요청이 이미 무효
    expect((await reload(you)).role).toBe("recorder");
    await expectFail(claimInvite(db, you, (await createInvite(db, third)).code), 409);
  });

  it("새 코드를 만들면 이전 요청은 무효, 거절도 가능", async () => {
    const { me, you } = await pair();
    const first = await createInvite(db, me);
    const { id } = await claimInvite(db, you, first.code);
    await createInvite(db, me);
    await expectFail(approveRequest(db, me, id, TODAY), 404);
    const second = await createInvite(db, me);
    const req = await claimInvite(db, you, second.code);
    await rejectRequest(db, me, req.id);
    expect(await activeCouple(db, me.id)).toBeNull();
  });
});

describe("코드로 시작하기", () => {
  const newcomer = () => signup(db, { email: "new@example.com", password: "password-9", nickname: "새" });
  const count = async () => (await db.select({ id: users.id }).from(users)).length;

  it("맞는 코드: 가입하면 승인 대기 상태, 역할은 그대로", async () => {
    const { me } = await pair();
    const { code } = await createInvite(db, me);
    const user = await newcomer();
    expect(await tryClaim(db, user, code, "1.1.1.1")).toBeNull();
    expect(await waitingClaim(db, user)).toMatchObject({ nickname: "나" });
    expect((await reload(user)).role).toBe("recorder");
    expect(await pendingRequests(db, me)).toHaveLength(1);
  });

  it("틀린 코드·만료된 코드: 가입은 유지되고 대기 상태가 아니다", async () => {
    const { me } = await pair();
    const before = await count();
    const user = await newcomer();
    expect(await tryClaim(db, user, "AAAA-AAAA", "1.1.1.1")).toBe("code");
    expect(await tryClaim(db, user, "", "1.1.1.1")).toBe("code");

    const { code } = await createInvite(db, me);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await tryClaim(db, user, code, "1.1.1.1")).toBe("code");

    expect(await count()).toBe(before + 1);
    expect(await waitingClaim(db, user)).toBeNull();
    expect(await pendingRequests(db, me)).toEqual([]);
  });

  it("로그인 상태에서 [연결 요청 보내기]: 연결 안 됨이면 요청, 연결 중이면 안내, 자기 코드는 거부", async () => {
    const { me, you } = await pair();
    const { code } = await createInvite(db, me);
    expect(await tryClaim(db, you, code.toLowerCase(), "1.1.1.1")).toBeNull();
    expect(await waitingClaim(db, you)).toMatchObject({ nickname: "나" });
    expect(await tryClaim(db, me, code, "1.1.1.1")).toBe("code");

    await approveRequest(db, me, (await pendingRequests(db, me))[0].id, TODAY);
    const third = await signup(db, { email: "x@example.com", password: "password-3", nickname: "셋" });
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
    const recorder = await signup(db, { email: `r${n}@example.com`, password: "password-1", nickname: `기록${n}` });
    const joined = await signup(db, { email: `p${n}@example.com`, password: "password-1", nickname: `본명${n}` });
    await connect(recorder, joined);
    const partner = await reload(joined);
    if (agree) await agreeToRules(db, partner, "");
    return { partner, recorder };
  }
  const post = (user: User, board = "question", title = "제목") => createPost(db, user, { board, title, body: "본문" });

  it("기록자·연결 없는 사람은 읽기도 쓰기도 못 한다", async () => {
    const { partner, recorder } = await member();
    const stranger = await signup(db, { email: "s@example.com", password: "password-1", nickname: "남" });
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
