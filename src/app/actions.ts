"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { todaySeoul } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { limit, login, signup } from "@/lib/services/auth";
import { clearCare, respondToCare, saveCare } from "@/lib/services/care";
import {
  approveRequest, claimInvite, createInvite, disconnect, rejectRequest, updateSharing, PERMISSION_KEYS,
} from "@/lib/services/couples";
import { deletePeriod, listPeriods, savePeriod } from "@/lib/services/periods";
import { clientIp, endSession, requireUser, startSession } from "@/lib/session";

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
    const values = form ? Object.fromEntries(keep.map((k) => [k, String(form.get(k) ?? "")])) : undefined;
    if (e instanceof AppError) return { error: e.message, values };
    console.error(e);
    return { error: "문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values };
  }
}

const refresh = () => revalidatePath("/", "layout");

// ── 계정 ─────────────────────────────────────────

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await attempt(async () => {
    const db = await getDb();
    await limit(db, "signup", await clientIp(), 10, 3600);
    const user = await signup(db, {
      email: form.get("email"), password: form.get("password"), role: form.get("role"), nickname: form.get("nickname"),
    });
    await startSession(user.id);
  }, form, ["email", "nickname", "role"]);
  if (result?.error) return result;
  redirect("/");
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

export async function startTodayAction(_: FormState): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await savePeriod(await getDb(), user.id, { startDate: todaySeoul() });
    refresh();
  });
}

export async function endTodayAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    const db = await getDb();
    const period = (await listPeriods(db, user.id)).find((p) => p.id === form.get("id"));
    if (!period) throw new AppError("기록을 찾을 수 없어요");
    await savePeriod(db, user.id, { ...period, endDate: todaySeoul() });
    refresh();
  });
}

export async function deletePeriodAction(form: FormData) {
  const user = await requireUser("recorder");
  await deletePeriod(await getDb(), user.id, String(form.get("id")));
  refresh();
  redirect("/records");
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

export async function claimAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("partner");
    const db = await getDb();
    await limit(db, "claim", user.id, 10, 900);
    await limit(db, "claim-ip", await clientIp(), 30, 900);
    await claimInvite(db, user, form.get("code"));
    refresh();
  }, form, ["code"]);
}

export async function approveAction(form: FormData) {
  const user = await requireUser("recorder");
  await approveRequest(await getDb(), user, String(form.get("id"))).catch(ignoreAppError);
  refresh();
}

export async function rejectAction(form: FormData) {
  const user = await requireUser("recorder");
  await rejectRequest(await getDb(), user, String(form.get("id"))).catch(ignoreAppError);
  refresh();
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

export async function disconnectAction() {
  const user = await requireUser();
  await disconnect(await getDb(), user).catch(ignoreAppError);
  refresh();
}

// ── 오늘 필요한 배려 ──────────────────────────────

export async function saveCareAction(_: FormState, form: FormData): Promise<FormState> {
  return attempt(async () => {
    const user = await requireUser("recorder");
    await saveCare(await getDb(), user, {
      presets: form.getAll("presets"), message: form.get("message"), share: form.get("share") === "on",
    });
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
  await respondToCare(await getDb(), user, String(form.get("careId")), form.get("response")).catch(ignoreAppError);
  refresh();
}

// 버튼 하나짜리 동작은 실패해도(이미 처리됨·만료 등) 화면을 새로 고쳐 현재 상태를 보여주면 충분하다.
function ignoreAppError(e: unknown) {
  if (!(e instanceof AppError)) throw e;
}
