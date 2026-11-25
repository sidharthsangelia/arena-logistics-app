import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HelpArticleView } from "@/components/help/HelpViews";
import { resolveHelpAudience } from "@/lib/help/audience.server";
import { getArticle } from "@/lib/help/registry";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ slug }, audience] = await Promise.all([params, resolveHelpAudience()]);
  const article = getArticle(slug, audience);
  return { title: article ? `${article.title} | Help` : "Help" };
}

/** An article the viewer may not read is a 404, exactly like one that does not exist. */
export default async function HelpArticlePage({ params }: { params: Params }) {
  const [{ slug }, audience] = await Promise.all([params, resolveHelpAudience()]);
  const article = getArticle(slug, audience);
  if (!article) notFound();
  return <HelpArticleView article={article} audience={audience} scope="arena" />;
}
