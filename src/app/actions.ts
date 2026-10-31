"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { getDb, type DB } from "@/lib/db";
import { isMonth, todaySeoul } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { limit, login, recordHealthConsent, signup } from "@/lib/services/auth";
import { clearCare, respondToCare, saveCare } from "@/lib/services/care";
import {
  agreeToRules, blockAuthor, createComment, createPost, decideReport, deleteComment, deletePost, report, updateComment, updatePost,
  type Target,
} from "@/lib/services/community";
import {
  createInvite, disconnect, setSharingItem, tryClaim, updateSharing, PERMISSION_KEYS,
  type ClaimProblem,
} from "@/lib/services/couples";
import { deletePeriod, listPeriods, savePeriod } from "@/lib/services/periods";
import {
  markNewsSeen, notifyCare, notifyConnected, notifyReply, removeSubscription, saveSubscription, setReminder,
} from "@/lib/services/push";
import { clientIp, endSession, requireLogin, requireUser, startSession, takeJoinCode } from "@/lib/session";

export type FormState = {
  error?: string; ok?: boolean; code?: string; expiresAt?: string;
  /** 오류가 나면 입력값을 돌려줘서 폼이 비워지지 않게 한다 (비밀번호는 제외) */
  values?: Record<string, string>;
} | null;

/** 화면에 보여줄 수 있는 오류(AppError)만 메시지로 돌려주고, 나머지는 일반 메시지로 바꾼다. */
async function attempt(fn: () => Promise<FormState | void>, form?: FormData, keep: string[] = []): Promise<FormState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e); // requireUser의 이동은 오류가 아니다
    const values = form ? Object.fromEntries(keep.map((k) => [k, String(form.get(k) ?? "")])) : undefined;
    if (e instanceof AppError) return { error: e.message, values };
    console.error(e);
    return { error: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values };
  }
}

const refresh = () => revalidatePath("/", "layout");

/** 알림은 응답을 보낸 뒤 처리한다. 실패해도 이미 저장된 내용에 영향이 없다. */
const later = (work: (db: DB) => Promise<void>) => after(async () => {
  try {
    await work(await getDb());
  } catch (e) {
    console.error(e);
  }
});

// ── 계정 ─────────────────────────────────────────

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    const db = await getDb();
    await limit(db, "signup", await clientIp(), 10, 3600);
    const user = await signup(db, {
      email: form.get("email"), password: form.get("password"), nickname: form.get("nickname"), healthConsent: form.get("healthConsent") === "on",
    });
    await startSession(user.id);
  }, form, ["email", "nickname"]);
  if (result?.error) return result;
  redirect("/");
}

const connectAfterClaim = (problem: ClaimProblem | null, code: string) =>
  problem ? `/connect?claim=${problem}&code=${encodeURIComponent(code.slice(0, 12))}` : "/connect";

/** /join: 가입 → 세션 → 코드 연결. 코드가 틀려도 가입은 유지하고 연결 화면에서 다시 입력하게 한다. */
export async function joinAction(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "");
  let problem: ClaimProblem | null = null;
  const result = await attempt(async () => {
    const db = await getDb();
    const ip = await clientIp();
    await limit(db, "signup", ip, 10, 3600);
    const user = await signup(db, {
      email: form.get("email"), password: form.get("password"), nickname: form.get("nickname"), healthConsent: form.get("healthConsent") === "on",
    });
    await startSession(user.id);
    problem = await tryClaim(db, user, code, ip);
    if (!problem) later((d) => notifyConnected(d, user));
  }, form, ["email", "nickname", "code"]);
  if (result?.error) return result;
  redirect(connectAfterClaim(problem, code));
}

/** 이미 로그인한 사람이 확인 화면에서 [연결하기]를 눌렀을 때만 연결한다. */
export async function joinWithLinkAction(form: FormData) {
  const code = String(form.get("code") ?? "");
  const user = await requireUser();
  const problem = await tryClaim(await getDb(), user, code, await clientIp());
  if (!problem) later((d) => notifyConnected(d, user));
  refresh();
  redirect(connectAfterClaim(problem, code));
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    const db = await getDb();
    await limit(db, "login-ip", await clientIp(), 30, 900);
    await limit(db, "login-email", String(form.get("email") ?? "").toLowerCase(), 10, 900);
    const user = await login(db, { email: form.get("email"), password: form.get("password") });
    await startSession(user.id);
  }, form, ["email"]);
  if (result?.error) return result;
  redirect("/");
}

export async function healthConsentAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireLogin();
  if (form.get("healthConsent") !== "on") return { error: "동의해야 계속 쓸 수 있어요" };
  const db = await getDb();
  await recordHealthConsent(db, user);
  // /join에서 카카오로 가입했다면 동의가 끝난 지금 그 코드로 연결한다
  const code = await takeJoinCode();
  const problem = code ? await tryClaim(db, user, code, await clientIp()) : null;
  if (code && !problem) later((d) => notifyConnected(d, user));
  refresh();
  redirect(code ? connectAfterClaim(problem, code) : "/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

// ── 생리 기록 ─────────────────────────────────────

export async function savePeriodAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    const user = await requireUser("recorder");
    await savePeriod(await getDb(), user.id, {
      id: (form.get("id") as string) || null,
      startDate: form.get("startDate"),
      endDate: form.get("endDate") || null,
      excluded: form.get("excluded") === "on",
      excludeReason: form.get("excludeReason"),
    });
    refresh();
  }, form, ["startDate", "endDate", "excludeReason"]);
  if (result?.error || !form.get("id")) return result;
  redirect("/records");
}

// 달력에서 누른 날짜. 없으면 오늘. 날짜 검증은 savePeriod가 한다.
const dayOf = (form: FormData) => String(form.get("day") || todaySeoul());

export async function startTodayAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await savePeriod(await getDb(), user.id, { startDate: dayOf(form) });
    refresh();
  });
}

export async function endTodayAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    const db = await getDb();
    const period = (await listPeriods(db, user.id)).find((p) => p.id === form.get("id"));
    if (!period) throw new AppError("기록을 찾을 수 없어요");
    await savePeriod(db, user.id, { ...period, endDate: dayOf(form) });
    refresh();
  });
}

export async function deletePeriodAction(form: FormData) {
  const user = await requireUser("recorder");
  await deletePeriod(await getDb(), user.id, String(form.get("id")));
  refresh();
  const month = form.get("month");
  redirect(isMonth(month) ? `/records?month=${month}` : "/records");
}

// ── 커플 연결 ─────────────────────────────────────

export async function createInviteAction(_: FormState): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    const db = await getDb();
    await limit(db, "invite", user.id, 10, 3600);
    const { code, expiresAt } = await createInvite(db, user);
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  });
}

export async function sharingAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await updateSharing(await getDb(), user, {
      permissions: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, form.get(k) === "on"])),
      shareFrom: form.get("shareFrom"),
      paused: form.get("paused") === "on",
    });
    refresh();
  });
}

export async function toggleSharingAction(key: string, on: boolean): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await setSharingItem(await getDb(), user, key, on);
    refresh();
  });
}

export async function disconnectAction() {
  const user = await requireUser();
  await disconnect(await getDb(), user).catch(ignoreAppError);
  refresh();
}

// ── 오늘 필요한 배려 ──────────────────────────────

export async function saveCareAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    const firstShared = await saveCare(await getDb(), user, {
      presets: form.getAll("presets"), message: form.get("message"), share: form.get("share") === "on",
    });
    if (firstShared) later((d) => notifyCare(d, user));
    refresh();
  }, form, ["message"]);
}

export async function clearCareAction() {
  const user = await requireUser("recorder");
  await clearCare(await getDb(), user);
  refresh();
}

export async function respondAction(form: FormData) {
  const user = await requireUser("partner");
  const careId = String(form.get("careId"));
  const first = await respondToCare(await getDb(), user, careId, form.get("response")).catch(ignoreAppError);
  if (first) later((d) => notifyReply(d, user, careId));
  refresh();
}

// ── 커뮤니티 ──────────────────────────────────────

const targetOf = (form: FormData): Target => ({
  kind: form.get("kind") === "comment" ? "comment" : "post",
  id: String(form.get("id")),
});

export async function agreeAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    await agreeToRules(await getDb(), await requireUser("partner"), form.get("nickname"));
    refresh();
  }, form, ["nickname"]);
  if (result?.error) return result;
  redirect(`/community/new?board=${form.get("board") === "tip" ? "tip" : "question"}`);
}

export async function savePostAction(_: FormState, form: FormData): Promise<FormState> {
  let id = String(form.get("id") ?? "");
  const result = await attempt(async () => {
    const user = await requireUser("partner");
    const db = await getDb();
    const input = { title: form.get("title"), body: form.get("body") };
    if (id) await updatePost(db, user, id, input);
    else id = await createPost(db, user, { ...input, board: form.get("board") });
    refresh();
  }, form, ["title", "body"]);
  if (result?.error) return result;
  redirect(`/community/${id}`);
}

export async function deletePostAction(form: FormData) {
  const user = await requireUser();
  await deletePost(await getDb(), user, String(form.get("id"))).catch(ignoreAppError);
  refresh();
  redirect("/community");
}

export async function saveCommentAction(_: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  const postId = String(form.get("postId"));
  const result = await attempt(async () => {
    const user = await requireUser("partner");
    const db = await getDb();
    if (id) await updateComment(db, user, id, form.get("body"));
    else await createComment(db, user, postId, form.get("body"));
    refresh();
  }, form, ["body"]);
  if (result?.error || !id) return result;
  redirect(`/community/${postId}`);
}

export async function deleteCommentAction(form: FormData) {
  const user = await requireUser();
  await deleteComment(await getDb(), user, String(form.get("id"))).catch(ignoreAppError);
  refresh();
}

export async function reportAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    await report(await getDb(), await requireUser("partner"), targetOf(form));
    refresh();
  });
}

export async function blockAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    await blockAuthor(await getDb(), await requireUser("partner"), targetOf(form));
    refresh();
  });
  if (result?.error) return result;
  redirect("/community");
}

export async function decideReportAction(form: FormData) {
  const user = await requireUser();
  await decideReport(await getDb(), user, targetOf(form), form.get("decision") === "hidden" ? "hidden" : "dismissed").catch(ignoreAppError);
  refresh();
}

// ── 알림 ─────────────────────────────────────────

export async function subscribeAction(input: { endpoint: unknown; p256dh: unknown; auth: unknown }): Promise<FormState> {
  return attempt(async () => {
    await saveSubscription(await getDb(), await requireUser(), input);
  });
}

export async function unsubscribeAction(endpoint: string) {
  await removeSubscription(await getDb(), await requireUser(), endpoint);
}

export async function setReminderAction(form: FormData) {
  await setReminder(await getDb(), await requireUser("recorder"), form.get("reminder") === "on");
  refresh();
}

export async function markNewsSeenAction() {
  const user = await requireUser();
  await markNewsSeen(await getDb(), user);
  refresh();
  redirect("/");
}

// 버튼 하나짜리 동작은 실패해도(이미 처리됨·만료 등) 화면을 새로 고쳐 현재 상태를 보여주면 충분하다.
function ignoreAppError(e: unknown) {
  if (!(e instanceof AppError)) throw e;
}
