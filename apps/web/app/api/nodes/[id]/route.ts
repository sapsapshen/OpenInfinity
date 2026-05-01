import { getNodeById, updateNodeVideo } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = await getNodeById(id);
  if (!node) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(node);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json();
  const { id } = await params;
  if (body.action !== "animate") {
    return new Response("Unsupported action", { status: 400 });
  }

  const animateResponse = await fetch(`${new URL(request.url).origin}/api/animate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: body.imageUrl,
      prompt: body.prompt,
      pageTitle: body.pageTitle,
      facts: body.facts ?? [],
      aspectRatio: body.aspectRatio ?? "16:9",
      videoTier: body.videoTier ?? "fast",
    }),
  });
  if (!animateResponse.ok) {
    return new Response(await animateResponse.text(), { status: animateResponse.status });
  }

  const payload = (await animateResponse.json()) as { video_url: string; video_model: string };
  const updated = await updateNodeVideo(id, payload.video_url, payload.video_model);
  if (!updated) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(updated);
}

