import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FlipbookExperience } from "@/components/flipbook-experience";
import { getNodeById, getSessionNodes } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const node = await getNodeById(id);
  if (!node) {
    return {
      title: "Page not found | OpenInfinity",
    };
  }

  const title = `${node.pageTitle} | OpenInfinity`;
  const description = node.facts.slice(0, 3).join(" · ") || node.query;
  const image =
    env.siteUrl && node.imageUrl ? new URL(node.imageUrl, env.siteUrl).toString() : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function NodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = await getNodeById(id);
  if (!node) {
    notFound();
  }
  const sessionNodes = await getSessionNodes(node.sessionId);
  return <FlipbookExperience initialNode={node} initialSessionNodes={sessionNodes} />;
}
