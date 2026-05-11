import { readStoredImage } from "@/lib/localstore";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const stored = await readStoredImage(key.map((part) => decodeURIComponent(part)).join("/"));
  if (!stored) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(stored.buffer), {
    headers: {
      "Content-Type": stored.mimeType,
      "Cache-Control": "public, max-age=3600, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
