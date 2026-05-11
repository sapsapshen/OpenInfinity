import { getGenerationJob } from "@/lib/generation-jobs";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getGenerationJob(id);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(job);
}
