"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { logoutAction, setReminderAction, subscribeAction, unsubscribeAction, withdrawAction, type FormState } from "../actions";
import { ErrorText, Submit } from "./Submit";

type Status = "loading" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

function toKey(base64: string) {
  const text = atob(`${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function NotificationSettings({ publicKey, showReminder, reminder }: { publicKey: string | null; showReminder: boolean; reminder: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void (async () => {
      if (isIos() && !isStandalone()) return setStatus("ios-browser");
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      setStatus((await currentSubscription()) ? "on" : "off");
    })();
  }, [publicKey]);

  // 권한 요청은 이 버튼을 눌렀을 때만 한다
  const turnOn = () => start(async () => {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey!) });
      const { endpoint, keys } = subscription.toJSON();
      const result = await subscribeAction({ endpoint, p256dh: keys?.p256dh, auth: keys?.auth });
      if (result?.error) {
        await subscription.unsubscribe();
        return setError(result.error);
      }
      setStatus("on");
    } catch {
      setError("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  });

  const turnOff = () => start(async () => {
    setError(null);
    const subscription = await currentSubscription();
    if (subscription) await dropSubscription(subscription);
    setStatus("off");
  });

  return (
    <section className="card mt-3">
      <div className="flex items-center justify-between gap-4 py-1">
        <span className="min-w-0 text-[15px]">
          알림 받기
          {status === "denied" && <span className="mt-1 block text-[13px] text-muted">브라우저 설정에서 알림이 차단돼 있어요. 설정에서 허용해 주세요.</span>}
          {status === "unsupported" && <span className="mt-1 block text-[13px] text-muted">이 브라우저에서는 알림을 받을 수 없어요.</span>}
        </span>
        <input
          type="checkbox" role="switch" className="switch" aria-label="알림 받기" checked={status === "on"}
          disabled={pending || (status !== "on" && status !== "off")}
          onChange={() => (status === "on" ? turnOff() : turnOn())}
        />
      </div>
      {status === "ios-browser" && (
        <div className="mt-2 text-[13px] leading-relaxed text-muted">
          <p className="text-[15px] text-ink">홈 화면에 추가한 앱에서만 알림을 받을 수 있어요</p>
          <p className="mt-1">Safari 아래쪽 공유 버튼을 누르고 &ldquo;홈 화면에 추가&rdquo;를 고른 뒤, 홈 화면의 우리주기를 열어 다시 켜 주세요.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-period-ink">{error}</p>}
      {showReminder && (
        <form action={setReminderAction} className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-3">
          <label htmlFor="reminder" className="text-[15px]">생리 예정일 3일 전 알림</label>
          <input
            id="reminder" name="reminder" type="checkbox" role="switch" className="switch" defaultChecked={reminder}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </form>
      )}
    </section>
  );
}

async function dropSubscription(subscription: PushSubscription) {
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await unsubscribeAction(endpoint);
}

/** 계정을 떠날 때 이 기기의 구독도 지운다. 같은 기기로 다음 사람이 써도 이전 계정 알림이 오지 않게. */
async function leaveThisDevice() {
  // 오프라인용으로 저장된 HTML에는 건강 기록이 들어 있다
  if ("caches" in window) await Promise.all((await caches.keys()).filter((k) => k.startsWith("pages-")).map((k) => caches.delete(k)));
  if (!("serviceWorker" in navigator)) return;
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) await dropSubscription(subscription);
}

export function LogoutButton({ className = "mt-10 text-center", buttonClassName = "link h-11 text-sm" }: { className?: string; buttonClassName?: string }) {
  const logout = async () => {
    await leaveThisDevice();
    await logoutAction();
  };
  return (
    <form action={logout} className={className}>
      <button type="submit" className={buttonClassName}>로그아웃</button>
    </form>
  );
}

export function WithdrawForm({ buttonClassName }: { buttonClassName: string }) {
  const [state, action] = useActionState<FormState, FormData>(async (prev) => {
    await leaveThisDevice();
    return withdrawAction(prev);
  }, null);
  return (
    <form action={action} className="mt-4">
      <Submit className={buttonClassName}>탈퇴할게요</Submit>
      <ErrorText message={state?.error} />
    </form>
  );
}
