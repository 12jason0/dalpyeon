"use client";
import { ChartColumn, Heart, Home, MessageCircle, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { Role } from "@/lib/db/schema";

type Active = "home" | "report" | "community" | "connect" | "me";

// loading.tsx는 미리 만들어 두는 화면이라 역할을 모른다. 마지막으로 그린 메뉴의 역할을 기억해 쓴다.
let lastRole: Role | null = null;

/** 로딩 중 메뉴. 첫 진입과 로그인 전 화면에서는 그리지 않는다. */
export function LoadingNav({ active }: { active: Active }) {
  const pathname = usePathname();
  if (!lastRole || (active === "home" && pathname !== "/")) return null;
  return <Nav role={lastRole} active={active} />;
}

export function Nav({ role, active }: { role: Role; active: Active }) {
  useEffect(() => {
    lastRole = role;
  }, [role]);
  const items = [
    { key: "home", href: "/", label: "홈", icon: Home },
    ...(role === "recorder"
      ? [{ key: "report", href: "/report", label: "리포트", icon: ChartColumn }]
      : [{ key: "community", href: "/community", label: "이야기", icon: MessageCircle }]),
    { key: "connect", href: "/connect", label: "연결", icon: Heart },
    { key: "me", href: "/me", label: "마이", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md px-2">
        {items.map(({ key, href, label, icon: Icon }) => (
          <li key={key} className="flex-1">
            <Link
              href={href}
              aria-current={active === key ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active === key ? "font-semibold text-accent" : "text-muted"}`}
            >
              <Icon size={22} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
