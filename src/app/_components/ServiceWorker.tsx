"use client";
import { useEffect } from "react";

/** 앱을 열면 항상 등록한다. version은 배포 커밋으로, 바뀌면 새 워커가 옛 캐시를 지운다. */
export function ServiceWorker({ version }: { version?: string }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(version ? `/sw.js?v=${version}` : "/sw.js").catch(() => undefined);
  }, [version]);
  return null;
}
