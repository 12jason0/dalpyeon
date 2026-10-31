import Link from "next/link";
import { timeAgo } from "@/lib/dates";
import { myPosts } from "@/lib/services/community";
import type { User } from "@/lib/services/auth";
import { getDb } from "@/lib/db";
import { deletePostAction } from "../actions";
import { Nav } from "../_components/Nav";

export const RULES = ["상대를 깎아내리는 글", "성적인 글", "개인정보"];

export function Confirm({ label, confirm, action, fields }: {
  label: string; confirm: string; action: (form: FormData) => Promise<void>; fields: Record<string, string>;
}) {
  return (
    <details>
      <summary className="link cursor-pointer list-none text-sm leading-11">{label}</summary>
      <form action={action}>
        {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <button type="submit" className="h-11 text-sm text-period underline underline-offset-4">{confirm}</button>
      </form>
    </details>
  );
}

/** 내가 쓴 글 목록. 연결이 끊겼거나 숨겨진 글도 여기서 지울 수 있다. */
export async function MyPosts({ user, member }: { user: User; member: boolean }) {
  const mine = await myPosts(await getDb(), user);
  if (!mine.length) return null;
  return (
    <section className="mt-16">
      <h2 className="mb-5 text-sm font-medium text-muted">내가 쓴 글</h2>
      <ul>
        {mine.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 border-b border-line py-3">
            <span className="min-w-0">
              {member && !p.hidden
                ? <Link href={`/community/${p.id}`} className="text-[17px]">{p.title}</Link>
                : <span className="text-[17px]">{p.title}</span>}
              <span className="mt-1 block text-[13px] text-muted">{timeAgo(p.createdAt)}{p.hidden && " · 숨겨진 글"}</span>
            </span>
            <span className="shrink-0"><Confirm label="삭제" confirm="정말 지울게요" action={deletePostAction} fields={{ id: p.id }} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 기록자·연결 없는 사람에게는 안내 문구와 자기 글만 보여준다. */
export async function Gate({ user }: { user: User }) {
  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight">이야기</h1>
      <p className="mt-10 text-[17px] leading-relaxed text-muted">이야기는 연결된 파트너만 볼 수 있어요.</p>
      <MyPosts user={user} member={false} />
      <Nav role={user.role} active="community" />
    </>
  );
}
