/** 하단 메뉴 항목. 연결은 마이 안에 있다. */
import type { Role } from "./db/schema";

export type NavKey = "home" | "report" | "community" | "learn" | "me";

export function navFor(role: Role): { key: NavKey; href: string; label: string }[] {
  return [
    { key: "home", href: "/", label: "홈" },
    ...(role === "recorder"
      ? [{ key: "report" as const, href: "/report", label: "리포트" }]
      : [
          { key: "community" as const, href: "/community", label: "남친톡" },
          { key: "learn" as const, href: "/learn", label: "상식" },
        ]),
    { key: "me", href: "/me", label: "마이" },
  ];
}
