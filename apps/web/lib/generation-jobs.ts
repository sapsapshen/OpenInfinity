import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { startImageStoreJanitor } from "@/lib/localstore";
import { persistGeneratedNode } from "@/lib/node-store";
import type {
  BackendGenerateResult,
  GenerationJobEvent,
  GenerationJobInput,
  GenerationJobSnapshot,
  GenerationJobState,
  GenerationJobStatusEvent,
  StoredNode,
} from "@/lib/types";

type JobListener = (event: GenerationJobEvent) => void;

type GenerationJobRecord = {
  id: string;
  input: GenerationJobInput;
  state: GenerationJobState;
  createdAt: string;
  updatedAt: string;
  status: GenerationJobStatusEvent;
  node: StoredNode | null;
  error: string | null;
  events: GenerationJobEvent[];
  listeners: Set<JobListener>;
};

declare global {
  // eslint-disable-next-line no-var
  var __openInfinityGenerationJobs__: Map<string, GenerationJobRecord> | undefined;
}

const encoder = new TextEncoder();
const jobs = global.__openInfinityGenerationJobs__ ?? new Map<string, GenerationJobRecord>();

if (!global.__openInfinityGenerationJobs__) {
  global.__openInfinityGenerationJobs__ = jobs;
}

function createJobId(): string {
  return randomUUID();
}

function snapshotOf(job: GenerationJobRecord): GenerationJobSnapshot {
  return {
    id: job.id,
    state: job.state,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    node: job.node,
    error: job.error,
  };
}

function emit(job: GenerationJobRecord, event: GenerationJobEvent) {
  job.updatedAt = new Date().toISOString();
  job.events.push(event);
  if (event.type === "status") {
    job.status = event.status;
  } else if (event.type === "result") {
    job.state = "completed";
    job.node = event.node;
    job.error = null;
  } else if (event.type === "error") {
    job.state = "failed";
    job.error = event.detail;
  }

  for (const listener of job.listeners) {
    listener(event);
  }
}

async function parseBackendGenerationStream(
  response: Response,
  onStatus: (event: GenerationJobStatusEvent) => void,
): Promise<BackendGenerateResult> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "页面生成失败");
  }
  if (!response.body) {
    throw new Error("生成流没有返回内容");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BackendGenerateResult | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const lines = rawEvent.split("\n").filter(Boolean);
      let eventName = "message";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      const data = dataLines.join("\n");
      if (!data || data === "[DONE]") {
        continue;
      }

      if (eventName === "status") {
        onStatus(JSON.parse(data) as GenerationJobStatusEvent);
        continue;
      }

      if (eventName === "error") {
        const payload = JSON.parse(data) as { detail?: string };
        throw new Error(payload.detail || "生成失败");
      }

      if (eventName === "result") {
        result = JSON.parse(data) as BackendGenerateResult;
      }
    }

    if (done) {
      break;
    }
  }

  if (!result) {
    throw new Error("生成结果缺失");
  }

  return result;
}

async function runJob(job: GenerationJobRecord): Promise<void> {
  job.state = "running";
  emit(job, {
    type: "status",
    status: {
      stage: "queued",
      message: "任务已创建，正在提交生成请求…",
    },
  });

  try {
    startImageStoreJanitor();
    const response = await fetch(`${env.backendApiUrl}/sse/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: job.input.query,
        session_id: job.input.sessionId ?? null,
        parent_id: job.input.parentId ?? null,
        parent_title: job.input.parentTitle ?? null,
        parent_facts: job.input.parentFacts ?? [],
        parent_prompt: job.input.parentPrompt ?? null,
        parent_style: job.input.parentStyle ?? null,
        annotated_image_data_url: job.input.annotatedImageDataUrl ?? null,
        click: job.input.click ?? null,
        aspect_ratio: job.input.aspectRatio ?? "16:9",
        image_tier: job.input.imageTier ?? "balanced",
        language: job.input.language ?? "zh-CN",
      }),
      cache: "no-store",
    });

    const generated = await parseBackendGenerationStream(response, (status) => {
      emit(job, { type: "status", status });
    });

    emit(job, {
      type: "status",
      status: {
        stage: "saving-node",
        message: "正在保存节点与图片…",
      },
    });

    const node = await persistGeneratedNode(generated);
    emit(job, {
      type: "status",
      status: {
        stage: "complete",
        message: "页面已保存，可以继续探索。",
      },
    });
    emit(job, { type: "result", node });
  } catch (error) {
    emit(job, {
      type: "error",
      detail: error instanceof Error ? error.message : "生成失败",
    });
  }
}

export function createGenerationJob(input: GenerationJobInput): GenerationJobSnapshot {
  const now = new Date().toISOString();
  const job: GenerationJobRecord = {
    id: createJobId(),
    input,
    state: "queued",
    createdAt: now,
    updatedAt: now,
    status: {
      stage: "queued",
      message: "任务已创建，等待执行…",
    },
    node: null,
    error: null,
    events: [
      {
        type: "status",
        status: {
          stage: "queued",
          message: "任务已创建，等待执行…",
        },
      },
    ],
    listeners: new Set<JobListener>(),
  };

  jobs.set(job.id, job);
  queueMicrotask(() => {
    void runJob(job);
  });

  return snapshotOf(job);
}

export function getGenerationJob(jobId: string): GenerationJobSnapshot | null {
  const job = jobs.get(jobId);
  return job ? snapshotOf(job) : null;
}

export function getGenerationJobHistory(jobId: string): GenerationJobEvent[] | null {
  const job = jobs.get(jobId);
  return job ? [...job.events] : null;
}

export function subscribeGenerationJob(jobId: string, listener: JobListener): (() => void) | null {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }
  job.listeners.add(listener);
  return () => {
    job.listeners.delete(listener);
  };
}

export function isGenerationJobTerminal(jobId: string): boolean {
  const job = jobs.get(jobId);
  return job ? job.state === "completed" || job.state === "failed" : true;
}

export function formatGenerationSseEvent(event: GenerationJobEvent): Uint8Array {
  if (event.type === "status") {
    return encoder.encode(`event: status\ndata: ${JSON.stringify(event.status)}\n\n`);
  }
  if (event.type === "result") {
    return encoder.encode(`event: result\ndata: ${JSON.stringify(event.node)}\n\n`);
  }
  return encoder.encode(`event: failure\ndata: ${JSON.stringify({ detail: event.detail })}\n\n`);
}
