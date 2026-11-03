"use client";
import { Bell, BookOpen, ChartColumn, Home, MessageCircle, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { HEADER_ID } from "@/lib/calendar";
import type { Role } from "@/lib/db/schema";
import { navFor, type NavKey } from "@/lib/nav";
import { BrandMoon } from "./BrandMoon";

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

/** 탭 화면 맨 위의 헤더. main의 위 여백을 지우고 화면 끝에 붙는다. */
export function Header({ dot }: { dot?: React.ReactNode }) {
  return (
    <header id={HEADER_ID} className="sticky top-0 z-20 -mx-6 mb-4 -mt-[max(3rem,env(safe-area-inset-top))] flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between bg-paper px-6 pt-[env(safe-area-inset-top)]">
      <span className="flex items-center gap-1.5">
        <BrandMoon size={20} className="text-accent" />
        <span className="text-[17px] font-medium tracking-tight">우리주기</span>
      </span>
      <Link href="/news" aria-label="새 소식" className="relative -mr-3 flex h-11 w-11 items-center justify-center text-muted">
        <Bell size={22} aria-hidden />
        {dot}
      </Link>
    </header>
  );
}

export function Nav({ role, active }: { role: Role; active: NavKey }) {
  useEffect(() => {
    lastRole = role;
  }, [role]);
  return (
    <nav data-floating className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-30 mx-auto h-16 max-w-[26rem] rounded-full border-[0.5px] border-line bg-card shadow-[0_4px_20px_rgb(63_58_61/0.12)]">
      <ul className="flex h-full p-1">
        {navFor(role).map(({ key, href, label }) => {
          const Icon = ICONS[key];
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active === key ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[11px] ${active === key ? "bg-period/60 font-semibold text-period-ink" : "text-muted"}`}
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
