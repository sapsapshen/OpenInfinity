import { getSessionNodes } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nodes = await getSessionNodes(id);
  return Response.json({ nodes });
}

