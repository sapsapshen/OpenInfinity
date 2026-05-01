import { env } from "@/lib/env";

export const runtime = "nodejs";

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  let imageUrl: string | null = null;

  if (typeof body.imageUrl === "string" && isPublicHttpUrl(body.imageUrl)) {
    imageUrl = body.imageUrl;
  } else if (typeof body.imageUrl === "string" && env.siteUrl) {
    const resolvedUrl = new URL(body.imageUrl, env.siteUrl).toString();
    if (isPublicHttpUrl(resolvedUrl)) {
      imageUrl = resolvedUrl;
    }
  }

  if (!imageUrl) {
    return new Response(
      JSON.stringify({
        detail:
          "动画生成需要公网可访问的图片 URL。请为 NEXT_PUBLIC_SITE_URL 配置可被 DashScope 访问的正式站点域名。",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const response = await fetch(`${env.backendApiUrl}/animate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      image_data_url: null,
      prompt: body.prompt,
      page_title: body.pageTitle,
      facts: body.facts ?? [],
      aspect_ratio: body.aspectRatio ?? "16:9",
      video_tier: body.videoTier ?? "fast",
    }),
  });

  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
  });
}
