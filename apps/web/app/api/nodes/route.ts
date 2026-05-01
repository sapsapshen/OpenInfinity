import { randomUUID } from "node:crypto";

import { insertNode } from "@/lib/db";
import { imageUrlFromKey, saveImageFromDataUrl } from "@/lib/localstore";
import type { StoredNode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const id = randomUUID();
  const sessionId = body.sessionId ?? randomUUID();
  const saved = await saveImageFromDataUrl(`${sessionId}/${id}`, body.imageDataUrl);

  const node: StoredNode = {
    id,
    sessionId,
    parentId: body.parentId ?? null,
    query: body.query,
    pageTitle: body.pageTitle,
    facts: body.facts ?? [],
    prompt: body.prompt,
    finalPrompt: body.finalPrompt,
    imageKey: saved.key,
    imageUrl: imageUrlFromKey(saved.key),
    imageModel: body.imageModel,
    imageMimeType: body.imageMimeType ?? saved.mimeType,
    aspectRatio: body.aspectRatio ?? "16:9",
    styleAnchor: body.styleAnchor ?? null,
    subject: body.subject ?? null,
    clickInParent: body.clickInParent ?? null,
    videoUrl: null,
    videoModel: null,
    createdAt: new Date().toISOString(),
  };

  const created = await insertNode(node);
  return Response.json(created, { status: 201 });
}
