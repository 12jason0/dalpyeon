import Link from "next/link";
import { ARTICLE_FOOTER, ARTICLES } from "@/lib/content/articles";
import { requireUser } from "@/lib/session";
import { BackLink } from "../_components/BackLink";
import { Nav } from "../_components/Nav";

export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const user = await requireUser("partner");
  return (
    <>
      <BackLink href="/" />
      <h1 className="sr-only">알아두면 좋은 것</h1>
      <ul className="mt-2">
        {ARTICLES.map((a) => (
          <li key={a.slug} className="border-b border-line">
            <Link href={`/learn/${a.slug}`} className="block py-4">
              <span className="block text-[17px] font-medium">{a.title}</span>
              <span className="mt-1 block text-[13px] text-muted">{a.line}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs leading-relaxed text-muted">{ARTICLE_FOOTER}</p>
      <Nav role={user.role} active="home" />
    </>
  );
}
