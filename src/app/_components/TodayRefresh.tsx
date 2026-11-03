"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { todaySeoul } from "@/lib/dates";

/**
 * 화면의 "오늘"이 서울 날짜와 어긋나면 서버에서 다시 그린다.
 * 홈 화면 앱은 어제 열어 둔 화면을 그대로 다시 보여주고(백그라운드 복귀, 뒤로 가기 캐시),
 * 서비스 워커는 네트워크가 잠깐 안 될 때 마지막 HTML을 꺼내 준다. 셋 다 서버가 그날 계산한 today가 그대로 남는다.
 * 처음 그릴 때, 화면으로 돌아올 때, 자정이 지날 때만 확인한다. 새로 고친 뒤 다시 확인하지는 않아서 기기 시계가 틀려도 반복되지 않는다.
 */
export function TodayRefresh({ today }: { today: string }) {
  const router = useRouter();

  useEffect(() => {
    const check = () => {
      if (todaySeoul() !== today) router.refresh();
    };
    check();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    // 화면을 켜 둔 채 자정을 넘길 때. 서울 자정까지 남은 시간 뒤에 한 번 확인한다.
    const now = new Date();
    const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const untilMidnight = (24 * 3600 - (seoul.getHours() * 3600 + seoul.getMinutes() * 60 + seoul.getSeconds())) * 1000 + 1000;
    const timer = window.setTimeout(check, untilMidnight);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      window.clearTimeout(timer);
    };
  }, [today, router]);

  return null;
}
