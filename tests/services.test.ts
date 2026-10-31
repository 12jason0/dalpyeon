import { beforeEach, describe, expect, it } from "vitest";
import { createLocalDb, type DB } from "@/lib/db";
import { addDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { createSession, deleteSession, limit, login, signup, userFromToken, type User } from "@/lib/services/auth";
import { clearCare, getCare, respondToCare, saveCare } from "@/lib/services/care";
import {
  activeCouple, approveRequest, claimInvite, createInvite, disconnect, pendingRequests, rejectRequest, updateSharing, waitingClaim,
} from "@/lib/services/couples";
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
  const me = await signup(db, { email: "me@example.com", password: "password-1", role: "recorder", nickname: "나" });
  const you = await signup(db, { email: "you@example.com", password: "password-2", role: "partner", nickname: "너" });
  return { me, you };
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
    const user = await signup(db, { email: " Me@Example.com ", password: "password-1", role: "recorder", nickname: "나" });
    expect(user.email).toBe("me@example.com");
    await expectFail(signup(db, { email: "me@example.com", password: "password-1", role: "partner", nickname: "다른" }), 409);
    await expectFail(login(db, { email: "me@example.com", password: "wrong-pass" }), 401);
    await expectFail(login(db, { email: "nobody@example.com", password: "password-1" }), 401);
    const logged = await login(db, { email: "ME@example.com", password: "password-1" });
    const { token } = await createSession(db, logged.id);
    expect((await userFromToken(db, token))?.id).toBe(user.id);
    expect(await userFromToken(db, "fake-token")).toBeNull();
    await deleteSession(db, token);
    expect(await userFromToken(db, token)).toBeNull();
  });

  it("입력 검증: 짧은 비밀번호·역할 없음 거부", async () => {
    await expectFail(signup(db, { email: "a@b.co", password: "short", role: "recorder", nickname: "a" }));
    await expectFail(signup(db, { email: "a@b.co", password: "password-1", role: "admin", nickname: "a" }));
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
  it("코드 → 요청 → 승인. 역할 확인, 1:1", async () => {
    const { me, you } = await pair();
    await expectFail(createInvite(db, you), 403);
    const { code } = await createInvite(db, me);
    await expectFail(claimInvite(db, me, code), 403);
    await expectFail(claimInvite(db, you, "AAAA-AAAA"), 404);
    const { id } = await claimInvite(db, you, code);
    expect(await waitingClaim(db, you)).toMatchObject({ nickname: "나" });
    expect(await pendingRequests(db, me)).toHaveLength(1);
    await expectFail(claimInvite(db, you, code), 404); // 한 번 쓴 코드는 끝
    const couple = await approveRequest(db, me, id, TODAY);
    expect(couple.permissions).toEqual({ periods: false, predictions: false, fertility: false, care: false });
    expect(couple.shareFrom).toBe(TODAY);
    await expectFail(createInvite(db, me), 409);
    const third = await signup(db, { email: "x@example.com", password: "password-3", role: "partner", nickname: "셋" });
    await expectFail(createInvite(db, third), 403);
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

describe("공유", () => {
  it("기본은 아무것도 안 보이고, 켠 항목만 보인다", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    let view = await partnerView(db, you, TODAY);
    expect(view).toMatchObject({ recorderNickname: "나", current: null, nextPeriod: null, fertileWindow: null, recentPeriods: [], care: [] });

    // 예측만 켬: 다음 예정일은 보이지만 과거 기록·간격은 안 보인다
    await updateSharing(db, me, { permissions: { predictions: true }, shareFrom: TODAY, paused: false }, TODAY);
    view = await partnerView(db, you, TODAY);
    expect(view?.nextPeriod?.startDate).toBe("2026-10-30");
    expect(view?.recentPeriods).toEqual([]);
    expect(view?.fertileWindow).toBeNull();
    expect(JSON.stringify(view)).not.toContain("intervals");

    // 기록 공유를 켜도 공유 시작일 이전 기록은 안 보인다
    await updateSharing(db, me, { permissions: { periods: true }, shareFrom: TODAY, paused: false }, TODAY);
    expect((await partnerView(db, you, TODAY))?.recentPeriods).toEqual([]);
    await updateSharing(db, me, { permissions: { periods: true }, shareFrom: "2026-09-01", paused: false }, TODAY);
    expect((await partnerView(db, you, TODAY))?.recentPeriods.map((p) => p.startDate)).toEqual(["2026-10-02", "2026-09-04"]);

    // 일시정지하면 전부 숨김
    await updateSharing(db, me, { permissions: { periods: true, predictions: true }, shareFrom: "2026-09-01", paused: true }, TODAY);
    view = await partnerView(db, you, TODAY);
    expect(view).toMatchObject({ paused: true, recentPeriods: [], nextPeriod: null });

    await expectFail(updateSharing(db, you, { permissions: {}, shareFrom: TODAY, paused: false }, TODAY), 403);
    await expectFail(updateSharing(db, me, { permissions: {}, shareFrom: "2026-12-01", paused: false }, TODAY));
  });

  it("연결 해제하면 볼 수 없고, 다시 연결하면 공유는 처음부터", async () => {
    const { me, you } = await pair();
    await fourPeriods(me);
    await connect(me, you);
    await updateSharing(db, me, { permissions: { periods: true, predictions: true, fertility: true, care: true }, shareFrom: "2026-01-01", paused: false }, TODAY);
    await disconnect(db, you);
    expect(await partnerView(db, you, TODAY)).toBeNull();
    const again = await connect(me, you);
    expect(again.permissions.periods).toBe(false);
  });
});

describe("오늘 필요한 배려", () => {
  it("요청별 공유 + 답장 + 수정하면 답장 초기화", async () => {
    const { me, you } = await pair();
    await connect(me, you);
    await updateSharing(db, me, { permissions: { care: true }, shareFrom: TODAY, paused: false }, TODAY);

    await expectFail(saveCare(db, me, { presets: [], message: "  ", share: true }, TODAY));
    await saveCare(db, me, { presets: ["rest", "warm_food", "bogus"], message: "", share: false }, TODAY);
    expect((await getCare(db, me, TODAY))?.presets).toEqual(["rest", "warm_food"]);
    expect((await partnerView(db, you, TODAY))?.care).toEqual([]); // 요청 자체를 공유 안 함

    await saveCare(db, me, { presets: ["rest", "warm_food"], message: "", share: true }, TODAY);
    const [care] = (await partnerView(db, you, TODAY))!.care;
    await respondToCare(db, you, care.id, "will_help", TODAY);
    expect((await getCare(db, me, TODAY))?.response).toBe("will_help");
    await expectFail(respondToCare(db, you, care.id, "whatever", TODAY));
    await expectFail(respondToCare(db, me, care.id, "seen", TODAY), 403);

    // 공유 여부만 바꾸면 답장 유지, 내용을 바꾸면 초기화
    await saveCare(db, me, { presets: ["rest", "warm_food"], message: "", share: true }, TODAY);
    expect((await getCare(db, me, TODAY))?.response).toBe("will_help");
    await saveCare(db, me, { presets: ["company"], message: "일찍 와줘", share: true }, TODAY);
    expect((await getCare(db, me, TODAY))?.response).toBeNull();

    // 배려 공유를 끄면 답장도 못 한다
    await updateSharing(db, me, { permissions: { care: false }, shareFrom: TODAY, paused: false }, TODAY);
    await expectFail(respondToCare(db, you, care.id, "seen", TODAY), 404);

    await clearCare(db, me, TODAY);
    expect(await getCare(db, me, TODAY)).toBeNull();
  });
});
