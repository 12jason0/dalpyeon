"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { getDb, type DB } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { AppError, errorKind } from "@/lib/errors";
import { withdraw } from "@/lib/services/account";
import { changePassword, limit, login, recordConsents, signup, updateNickname } from "@/lib/services/auth";
import { clearCare, respondToCare, saveCare, type ResponseKey } from "@/lib/services/care";
import {
  agreeToRules, blockAuthor, createComment, createPost, decideReport, deleteComment, deletePost, report, toggleLike, unblock, updateComment, updatePost,
  type Target,
} from "@/lib/services/community";
import {
  clearSharingNotice, createInvite, disconnect, setPaused, updateSharing,
} from "@/lib/services/couples";
import { saveDayLog } from "@/lib/services/daylogs";
import { deletePeriod, listPeriods, savePeriod, setUsualCycle, snoozeEndQuestion } from "@/lib/services/periods";
import {
  markNewsSeen, newsItems, notifyCare, notifyReply, removeSubscription, saveSubscription, setReminder,
  type NewsItem,
} from "@/lib/services/push";
import { claimInvite, clientIp, endSession, requireLogin, requireUser, sessionToken, landWithInvite, startSession, takeJoinCode } from "@/lib/session";

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
    console.error("action failed", errorKind(e));
    return { error: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values };
  }
}

const refresh = () => revalidatePath("/", "layout");

/** 알림은 응답을 보낸 뒤 처리한다. 실패해도 이미 저장된 내용에 영향이 없다. */
const later = (work: (db: DB) => Promise<void>) => after(async () => {
  try {
    await work(await getDb());
  } catch (e) {
    console.error("after failed", errorKind(e));
  }
});

// ── 계정 ─────────────────────────────────────────

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    const db = await getDb();
    await limit(db, "signup", await clientIp(), 10, 3600);
    const user = await signup(db, {
      email: form.get("email"), password: form.get("password"), nickname: form.get("nickname"), ...consentsOf(form),
    });
    await startSession(user.id);
  }, form, ["email", "nickname"]);
  if (result?.error) return result;
  redirect("/");
}

const consentsOf = (form: FormData) => ({
  ageConfirmed: form.get("ageConfirmed") === "on", healthConsent: form.get("healthConsent") === "on", transferConsent: form.get("transferConsent") === "on",
});

/** /join: 가입 → 세션 → 코드 연결. 코드가 틀려도 가입은 유지하고 연결 화면에서 다시 입력하게 한다. */
export async function joinAction(_: FormState, form: FormData): Promise<FormState> {
  let next = "/connect";
  const result = await attempt(async () => {
    const db = await getDb();
    await limit(db, "signup", await clientIp(), 10, 3600);
    const user = await signup(db, {
      email: form.get("email"), password: form.get("password"), nickname: form.get("nickname"), ...consentsOf(form),
    });
    await startSession(user.id);
    next = await claimInvite(user, String(form.get("code") ?? ""));
  }, form, ["email", "nickname", "code"]);
  if (result?.error) return result;
  redirect(next);
}

/** 이미 로그인한 사람이 확인 화면에서 [연결하기]를 눌렀을 때만 연결한다. */
export async function joinWithLinkAction(form: FormData) {
  const next = await claimInvite(await requireUser(), String(form.get("code") ?? ""));
  refresh();
  redirect(next);
}

/** 초대 링크(/join?login=1)에서 오면 숨은 code가 있고, 로그인하자마자 연결한다. */
export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "");
  let next = "/";
  const result = await attempt(async () => {
    const db = await getDb();
    await limit(db, "login-ip", await clientIp(), 30, 900);
    await limit(db, "login-email", String(form.get("email") ?? "").toLowerCase(), 10, 900);
    const user = await login(db, { email: form.get("email"), password: form.get("password") });
    await startSession(user.id);
    if (code) next = await landWithInvite(user, code);
  }, form, ["email"]);
  if (result?.error) return result;
  redirect(next);
}

export async function consentAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireLogin();
  const db = await getDb();
  const failed = await attempt(() => recordConsents(db, user, consentsOf(form)));
  if (failed?.error) return failed;
  // /join에서 카카오로 가입했다면 동의가 끝난 지금 그 코드로 연결한다
  const code = await takeJoinCode();
  const next = code ? await claimInvite(user, code) : "/";
  refresh();
  redirect(next);
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    await changePassword(await getDb(), await requireUser(), {
      current: form.get("current"), next: form.get("next"), confirm: form.get("confirm"),
    }, await sessionToken());
  });
}

export async function saveNicknameAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    await updateNickname(await getDb(), await requireUser(), form.get("nickname"));
    refresh();
  });
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function withdrawAction(_: FormState): Promise<FormState> {
  const result = await attempt(async () => {
    const user = await requireUser();
    await withdraw(await getDb(), user);
    await endSession();
    refresh();
  });
  if (result?.error) return result;
  redirect("/");
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
  redirect("/report");
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

async function myPeriod(db: DB, ownerId: string, form: FormData) {
  const period = (await listPeriods(db, ownerId)).find((p) => p.id === form.get("id"));
  if (!period) throw new AppError("기록을 찾을 수 없어요");
  return period;
}

export async function endTodayAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    const db = await getDb();
    await savePeriod(db, user.id, { ...await myPeriod(db, user.id, form), endDate: dayOf(form) });
    refresh();
  });
}

/**
 * 날짜 시트의 "저장": 시작일·끝난 날과 그날 통증·기분을 한 번에 저장한다. 예측 제외 표시는 그대로 둔다.
 * 날짜를 먼저 저장하고(검증 실패면 아무것도 바뀌지 않는다), 바뀐 기간에 그날이 아직 들어 있을 때만 통증·기분을 저장한다.
 * (기간 밖으로 빠진 날의 통증·기분은 savePeriod가 지운다.)
 */
export async function saveRecordDayAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    const db = await getDb();
    const saved = await savePeriod(db, user.id, { ...await myPeriod(db, user.id, form), startDate: form.get("startDate"), endDate: form.get("endDate") || null });
    const day = String(form.get("day") ?? "");
    if (saved.startDate <= day && (!saved.endDate || day <= saved.endDate)) {
      await saveDayLog(db, user, { day, pain: form.get("pain"), moods: form.getAll("moods") });
    }
    refresh();
  });
}

export async function snoozeEndAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await snoozeEndQuestion(await getDb(), user.id, String(form.get("id")));
    refresh();
  });
}

export async function saveUsualCycleAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    await setUsualCycle(await getDb(), await requireUser("recorder"), form.get("usualCycle"));
    refresh();
  });
}

export async function saveDayLogAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await saveDayLog(await getDb(), user, { day: form.get("day"), pain: form.get("pain"), moods: form.getAll("moods") });
    refresh();
  });
}

export async function deletePeriodAction(form: FormData) {
  const user = await requireUser("recorder");
  await deletePeriod(await getDb(), user.id, String(form.get("id")));
  refresh();
  if (form.get("stay") !== "on") redirect("/report"); // 홈의 시트에서 지우면 그 자리에 머문다
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
      shareFrom: form.get("shareFrom"),
    });
    refresh();
  });
}

export async function pauseAction(on: boolean): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await setPaused(await getDb(), user, on);
    refresh();
  });
}

/** 홈의 확인 링크. 한 번 누르면 사라지고 공유 설정으로 간다. */
export async function checkSharingAction() {
  await clearSharingNotice(await getDb(), await requireUser("recorder"));
  refresh();
  redirect("/connect");
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
  const response = form.get("response");
  const changed = await respondToCare(await getDb(), user, careId, response).catch(ignoreAppError);
  // 답장이 생기거나 바뀔 때마다 알린다. 같은 답장을 다시 누르면 changed가 false다.
  if (changed) later((d) => notifyReply(d, user, careId, response as ResponseKey));
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
  redirect("/community/new");
}

export async function savePostAction(_: FormState, form: FormData): Promise<FormState> {
  let id = String(form.get("id") ?? "");
  const result = await attempt(async () => {
    const user = await requireUser("partner");
    const db = await getDb();
    const input = { board: form.get("board"), title: form.get("title"), body: form.get("body") };
    if (id) await updatePost(db, user, id, input);
    else id = await createPost(db, user, input);
    refresh();
  }, form, ["board", "title", "body"]);
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
    else await createComment(db, user, postId, form.get("body"), (form.get("parentId") as string) || null);
    refresh();
  }, form, ["body"]);
  // 새 댓글은 그 자리에서 입력칸만 비운다. 수정·답글은 주소의 ?edit=·?reply=를 지우려고 다시 연다.
  if (result?.error || !(id || form.get("parentId"))) return result;
  redirect(`/community/${postId}`);
}

export async function likeAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    await toggleLike(await getDb(), await requireUser("partner"), String(form.get("id")));
    refresh();
  });
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

export async function unblockAction(form: FormData) {
  await unblock(await getDb(), await requireUser(), form.get("key")).catch(ignoreAppError);
  refresh();
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

/** 새 소식 시트가 열리는 순간: 읽음 처리하고 목록을 돌려준다. 다시 그려지면서 종의 점도 사라진다. */
export async function openNewsAction(): Promise<NewsItem[]> {
  const user = await requireUser();
  const db = await getDb();
  const [items] = await Promise.all([newsItems(db, user), markNewsSeen(db, user)]);
  refresh();
  return items;
}

// 버튼 하나짜리 동작은 실패해도(이미 처리됨·만료 등) 화면을 새로 고쳐 현재 상태를 보여주면 충분하다.
function ignoreAppError(e: unknown) {
  if (!(e instanceof AppError)) throw e;
}
