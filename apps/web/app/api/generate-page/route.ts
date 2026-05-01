import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch(`${env.backendApiUrl}/sse/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: body.query,
      session_id: body.sessionId ?? null,
      parent_id: body.parentId ?? null,
      parent_title: body.parentTitle ?? null,
      parent_facts: body.parentFacts ?? [],
      parent_prompt: body.parentPrompt ?? null,
      parent_style: body.parentStyle ?? null,
      annotated_image_data_url: body.annotatedImageDataUrl ?? null,
      click: body.click ?? null,
      aspect_ratio: body.aspectRatio ?? "16:9",
      image_tier: body.imageTier ?? "balanced",
      language: body.language ?? "zh-CN",
    }),
  });

  if (response.ok && response.body) {
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
  });
}
