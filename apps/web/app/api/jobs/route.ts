import { createGenerationJob } from "@/lib/generation-jobs";
import type { GenerationJobInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as GenerationJobInput;
  const job = createGenerationJob(body);
  return Response.json({ jobId: job.id }, { status: 202 });
}
