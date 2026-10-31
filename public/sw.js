// 우리주기 서비스 워커: 푸시를 받아 알림을 띄우고, 누르면 앱을 연다.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "우리주기", {
      body: data.body || "",
      icon: "/icon",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 다른 사이트로 나가지 않도록 앱 안의 경로만 연다
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (!open) return self.clients.openWindow(url);
    await open.focus();
    return open.navigate(url).catch(() => undefined);
  })());
});
