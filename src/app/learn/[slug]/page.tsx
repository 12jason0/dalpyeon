import { notFound } from "next/navigation";
import { ARTICLE_FOOTER, findArticle } from "@/lib/content/articles";
import { requireUser } from "@/lib/session";
import { BackLink } from "../../_components/BackLink";
import { Nav } from "../../_components/Nav";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser("partner");
  const article = findArticle((await params).slug);
  if (!article) notFound();
  return (
    <>
      <BackLink href="/learn" />
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{article.title}</h1>
      <div className="mt-6 space-y-4 text-[17px] leading-relaxed">
        {article.body.map((text) => <p key={text}>{text}</p>)}
      </div>
      <p className="mt-10 text-xs leading-relaxed text-muted">{ARTICLE_FOOTER}</p>
      <Nav role={user.role} active="home" />
    </>
  );
}
