import {
  formatGenerationSseEvent,
  getGenerationJob,
  getGenerationJobHistory,
  isGenerationJobTerminal,
  subscribeGenerationJob,
} from "@/lib/generation-jobs";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getGenerationJob(id);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const history = getGenerationJobHistory(id) ?? [];
      for (const event of history) {
        controller.enqueue(formatGenerationSseEvent(event));
      }

      if (isGenerationJobTerminal(id)) {
        controller.close();
        return;
      }

      const unsubscribe = subscribeGenerationJob(id, (event) => {
        controller.enqueue(formatGenerationSseEvent(event));
        if (event.type === "result" || event.type === "error") {
          unsubscribe?.();
          controller.close();
        }
      });

      if (!unsubscribe) {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
