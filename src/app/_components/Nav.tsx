import { CalendarDays, Heart, Home, MessageCircle, User } from "lucide-react";
import Link from "next/link";
import type { Role } from "@/lib/db/schema";

export function Nav({ role, active }: { role: Role; active: "home" | "records" | "calendar" | "community" | "connect" | "me" }) {
  const items = [
    { key: "home", href: "/", label: "오늘", icon: Home },
    ...(role === "recorder"
      ? [{ key: "records", href: "/records", label: "기록", icon: CalendarDays }]
      : [
          { key: "calendar", href: "/calendar", label: "달력", icon: CalendarDays },
          { key: "community", href: "/community", label: "이야기", icon: MessageCircle },
        ]),
    { key: "connect", href: "/connect", label: "연결", icon: Heart },
    { key: "me", href: "/me", label: "마이", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
