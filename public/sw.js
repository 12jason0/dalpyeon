// 우리주기 서비스 워커: 푸시 알림, 앱 껍데기 캐시.
// 배포마다 등록 주소의 ?v=커밋이 바뀌어 새 워커가 설치되고 옛 캐시가 지워진다. v가 없으면(로컬) 캐시하지 않는다.
const VERSION = new URL(self.location.href).searchParams.get("v");
const ASSETS = `assets-${VERSION}`;
const PAGES = `pages-${VERSION}`; // 건강 기록이 든 HTML. 로그아웃·탈퇴 때 NotificationSettings가 지운다
// 글꼴 파일은 이름에 내용 해시가 붙어 바뀌면 주소도 바뀐다. 배포가 바뀌어도 지우지 않아서 5.7MB 손글씨를 다시 받지 않는다.
const FONTS = "fonts-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== ASSETS && k !== PAGES && k !== FONTS).map((k) => caches.delete(k)));
    // 워커가 깨어나는 시간만큼 페이지 요청이 늦어지지 않게 한다
    await self.registration.navigationPreload?.enable();
    await self.clients.claim();
  })());
});

const NO_CACHE = /^\/(api|admin|login|signup|join)(\/|$)/;

function isAsset(url) {
  if (url.origin !== self.location.origin) return url.hostname === "cdn.jsdelivr.net"; // Pretendard 글꼴
  return /^\/(_next\/static\/|icon|apple-icon)/.test(url.pathname);
}

const isFont = (url) => url.origin === self.location.origin && /^\/_next\/static\/media\/.+\.(ttf|otf|woff2?)$/.test(url.pathname);

async function cacheFirst(request, name = ASSETS) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// 쿼리는 키에서 뺀다. 경로마다 최신 한 장만 남아 캐시가 늘지 않는다.
async function networkFirst(event, path) {
  const cache = await caches.open(PAGES);
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    if (response.ok && !response.redirected) event.waitUntil(cache.put(path, response.clone()));
    return response;
  } catch {
    return (await cache.match(path)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  if (!VERSION || event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (isFont(url)) return event.respondWith(cacheFirst(event.request, FONTS));
  if (isAsset(url)) return event.respondWith(cacheFirst(event.request));
  // 로그인·가입 화면은 캐시된 HTML을 보여주지 않는다(로그인 상태가 바뀌는 곳이라 지난 화면이 나오면 안 된다). 브라우저가 직접 받는다.
  if (event.request.mode === "navigate" && !NO_CACHE.test(url.pathname)) event.respondWith(networkFirst(event, url.pathname));
});

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
