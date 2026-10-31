import Link from "next/link";
import type { Role } from "@/lib/db/schema";

export function Nav({ role, active }: { role: Role; active: "home" | "records" | "calendar" | "community" | "connect" }) {
  const items = [
    { key: "home", href: "/", label: "오늘" },
    ...(role === "recorder"
      ? [{ key: "records", href: "/records", label: "기록" }]
      : [{ key: "calendar", href: "/calendar", label: "달력" }, { key: "community", href: "/community", label: "이야기" }]),
    { key: "connect", href: "/connect", label: "연결" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md justify-around px-6">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={`block px-4 py-4 text-[15px] ${active === item.key ? "font-semibold text-ink" : "text-muted"}`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
