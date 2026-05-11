import { persistGeneratedNode } from "@/lib/node-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const created = await persistGeneratedNode({
    session_id: body.sessionId ?? null,
    parent_id: body.parentId ?? null,
    query: body.query,
    page_title: body.pageTitle,
    facts: body.facts ?? [],
    prompt: body.prompt,
    final_prompt: body.finalPrompt,
    aspect_ratio: body.aspectRatio ?? "16:9",
    image_model: body.imageModel,
    image_mime_type: body.imageMimeType ?? "image/png",
    image_data_url: body.imageDataUrl,
    subject: body.subject ?? null,
    style_anchor: body.styleAnchor ?? null,
    click_in_parent: body.clickInParent ?? null,
  });
  return Response.json(created, { status: 201 });
}
