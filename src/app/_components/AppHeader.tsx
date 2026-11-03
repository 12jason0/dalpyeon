import { Suspense } from "react";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/services/auth";
import { newsFor } from "@/lib/services/push";
import { Header } from "./Nav";

async function UnreadDot({ user }: { user: User }) {
  const news = await newsFor(await getDb(), user);
  if (news.replies + news.care === 0) return null;
  return (
    <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent">
      <span className="sr-only">안 읽은 소식 있음</span>
    </span>
  );
}

/** 탭 화면 공통 헤더. 안 읽은 소식 점은 조회가 끝나는 대로 나타난다. openNews면 새 소식 시트가 열린 채로 시작한다. */
export function AppHeader({ user, openNews }: { user: User; openNews?: boolean }) {
  return <Header dot={<Suspense><UnreadDot user={user} /></Suspense>} openNews={openNews} />;
}
