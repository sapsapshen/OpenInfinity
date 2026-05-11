import "server-only";

import { randomUUID } from "node:crypto";

import { insertNode } from "@/lib/db";
import { imageUrlFromKey, saveImageFromDataUrl } from "@/lib/localstore";
import type { BackendGenerateResult, StoredNode } from "@/lib/types";

export async function persistGeneratedNode(payload: BackendGenerateResult): Promise<StoredNode> {
  const id = randomUUID();
  const sessionId = payload.session_id ?? randomUUID();
  const saved = await saveImageFromDataUrl(`${sessionId}/${id}`, payload.image_data_url);

  const node: StoredNode = {
    id,
    sessionId,
    parentId: payload.parent_id ?? null,
    query: payload.query,
    pageTitle: payload.page_title,
    facts: payload.facts,
    prompt: payload.prompt,
    finalPrompt: payload.final_prompt,
    imageKey: saved.key,
    imageUrl: imageUrlFromKey(saved.key),
    imageModel: payload.image_model,
    imageMimeType: payload.image_mime_type || saved.mimeType,
    aspectRatio: payload.aspect_ratio,
    styleAnchor: payload.style_anchor,
    subject: payload.subject,
    clickInParent: payload.click_in_parent,
    videoUrl: null,
    videoModel: null,
    createdAt: new Date().toISOString(),
  };

  return insertNode(node);
}
