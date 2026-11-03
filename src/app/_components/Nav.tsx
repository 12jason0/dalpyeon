"use client";
import { BookOpen, ChartColumn, Home, MessageCircle, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { HEADER_ID } from "@/lib/calendar";
import type { Role } from "@/lib/db/schema";
import { navFor, type NavKey } from "@/lib/nav";
import { BrandLogo } from "./BrandLogo";
import { NewsBell } from "./NewsSheet";

const ICONS = { home: Home, report: ChartColumn, community: MessageCircle, learn: BookOpen, me: User };

// loading.tsx는 미리 만들어 두는 화면이라 역할을 모른다. 마지막으로 그린 메뉴의 역할을 기억해 쓴다.
let lastRole: Role | null = null;

/** 로딩 중 메뉴. 첫 진입과 로그인 전 화면에서는 그리지 않는다. */
export function LoadingNav({ active }: { active: NavKey }) {
  const pathname = usePathname();
  if (!lastRole || (active === "home" && pathname !== "/" && pathname !== "/calendar")) return null;
  return <Nav role={lastRole} active={active} />;
}

const TAB_PATHS = ["/", "/calendar", "/report", "/community", "/learn", "/me"];

/** 로딩 중 헤더. 탭 화면에서만 메뉴와 같은 조건으로 그린다. */
export function LoadingHeader() {
  const pathname = usePathname();
  return lastRole && TAB_PATHS.includes(pathname) ? <Header /> : null;
}

/** 탭 화면 맨 위의 헤더. main의 위 여백을 지우고 화면 끝에 붙는다. 종을 누르면 새 소식 시트가 열린다. */
export function Header({ dot, openNews }: { dot?: React.ReactNode; openNews?: boolean }) {
  return (
    <header id={HEADER_ID} className="sticky top-0 z-20 -mx-6 mb-4 -mt-[max(3rem,env(safe-area-inset-top))] flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between bg-paper px-6 pt-[env(safe-area-inset-top)]">
      <span className="flex items-center gap-1.5">
        <BrandLogo size={22} />
        <span className="text-[17px] font-medium tracking-tight">디어데이</span>
      </span>
      <NewsBell dot={dot} initiallyOpen={openNews} />
    </header>
  );
}

// ── 스포트라이트 ──
// 탭을 누르면 바 위쪽 레일을 따라 조명이 미끄러지고, 멈추면서 진자처럼 흔들린 뒤 도착한 아이콘에 불이 들어온다.
// 메뉴는 페이지(와 로딩 화면)마다 새로 그려진다. 움직임을 모듈에 기억해 두고, 새로 그려진 메뉴가 같은 지점부터 이어 재생한다.
const SLIDE_MS = 480;
const SWING_MS = 1000;
const LIGHT_DELAY_MS = 300;
const LIGHT_MS = 260;

type Spot = { role: Role; from: number; to: number; start: number };
type Shown = Spot & { elapsed: number };
let spot: Spot | null = null;
let lastSpot: { role: Role; index: number } | null = null;

export function Nav({ role, active }: { role: Role; active: NavKey }) {
  const items = navFor(role);
  const index = Math.max(0, items.findIndex((item) => item.key === active));
  const [shown, setShown] = useState<Shown | null>(null);

  // 그리기 전에: 진행 중인 움직임이 이 탭으로 오는 중이면 이어 재생, 다른 길(뒤로 가기 등)로 탭이 바뀌었으면 새로 시작
  useLayoutEffect(() => {
    lastRole = role;
    const now = performance.now();
    const running = spot && spot.role === role && spot.to === index && now - spot.start < SWING_MS ? spot : null;
    const moved = !running && lastSpot?.role === role && lastSpot.index !== index ? { role, from: lastSpot.index, to: index, start: now } : null;
    if (moved) spot = moved;
    const next = running ?? moved;
    setShown(next && { ...next, elapsed: now - next.start });
    lastSpot = { role, index };
  }, [role, index]);

  // 누르는 즉시 조명을 보낸다. 페이지가 바뀌면 새 메뉴가 이어받는다.
  const pick = (to: number) => {
    const from = shown?.to ?? index;
    if (to === from) return;
    spot = { role, from, to, start: performance.now() };
    lastSpot = { role, index: to };
    setShown({ ...spot, elapsed: 0 });
  };

  const target = shown?.to ?? index;
  const delay = (ms: number) => `${ms - (shown?.elapsed ?? 0)}ms`;
  const count = items.length;
  return (
    // 높이 54px. 메뉴 위에 뜨는 버튼들은 safe-area + 12 + 54 + 8 = 74px 위에 둔다(page.tsx, HomeCalendar.tsx).
    <nav data-floating className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-30 mx-auto h-[54px] max-w-[26rem] rounded-full border-[0.5px] border-line bg-card shadow-[0_4px_20px_rgb(63_58_61/0.12)]">
      <ul className="relative flex h-full overflow-hidden rounded-full p-1">
        {/* 조명 캡슐. 탭 링크와 같은 칸(바 안쪽 4px)에 딱 맞고, 빛줄기는 이 캡슐 밖으로 나가지 않게 잘린다.
            캡슐은 미끄러지고(slide) 안쪽 빛줄기는 위 가운데를 축으로 흔들린다(swing). 너비가 %라 화면 크기가 바뀌어도 맞는다. */}
        <li
          aria-hidden key={shown ? `${shown.start}` : "still"}
          className="spot pointer-events-none absolute inset-y-1 left-1 rounded-full bg-period/40 [clip-path:inset(0_round_9999px)]"
          style={{
            width: `calc((100% - 0.5rem) / ${count})`,
            transform: `translateX(${target * 100}%)`,
            ...(shown && {
              "--spot-from": `${shown.from * 100}%`, "--spot-to": `${shown.to * 100}%`, "--spot-dir": Math.sign(shown.to - shown.from),
              animation: `spot-slide ${SLIDE_MS}ms cubic-bezier(0.45, 0, 0.2, 1) ${delay(0)} both`,
            }),
          } as React.CSSProperties}
        >
          <span className="spot-cone" style={shown ? { animation: `spot-swing ${SWING_MS}ms ease-out ${delay(0)} both` } : undefined} />
        </li>
        {items.map(({ key, href, label }, i) => {
          const Icon = ICONS[key];
          const lit = i === target;
          return (
            <li key={key} className="relative flex-1">
              <Link
                href={href} onClick={() => pick(i)} prefetch // 탭 화면을 데이터까지 미리 받아 두어 누르면 바로 바뀐다(next.config staleTimes)
                aria-current={active === key ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[11px] ${lit ? "nav-lit font-medium" : "text-muted"}`}
                style={lit && shown ? { animation: `spot-light ${LIGHT_MS}ms ease-out ${delay(LIGHT_DELAY_MS)} both` } : undefined}
              >
                <Icon size={22} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
