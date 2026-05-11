export type ClickPoint = {
  x: number;
  y: number;
};

export type StoredNode = {
  id: string;
  sessionId: string;
  parentId: string | null;
  query: string;
  pageTitle: string;
  facts: string[];
  prompt: string;
  finalPrompt: string;
  imageKey: string;
  imageUrl: string;
  imageModel: string;
  imageMimeType: string;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  styleAnchor: string | null;
  subject: string | null;
  clickInParent: ClickPoint | null;
  videoUrl: string | null;
  videoModel: string | null;
  createdAt: string;
};

export type BackendGenerateResult = {
  session_id: string | null;
  parent_id: string | null;
  query: string;
  page_title: string;
  prompt: string;
  facts: string[];
  final_prompt: string;
  aspect_ratio: StoredNode["aspectRatio"];
  image_model: string;
  image_mime_type: string;
  /** Set when backend returns a CDN URL (preferred). */
  image_url: string | null;
  /** Set when backend returns bytes encoded as data URL (fallback). */
  image_data_url: string | null;
  subject: string | null;
  style_anchor: string | null;
  click_in_parent: ClickPoint | null;
};

export type GenerationJobInput = {
  query: string;
  sessionId?: string | null;
  parentId?: string | null;
  parentTitle?: string | null;
  parentFacts?: string[];
  parentPrompt?: string | null;
  parentStyle?: string | null;
  annotatedImageDataUrl?: string | null;
  click?: ClickPoint | null;
  aspectRatio?: StoredNode["aspectRatio"];
  imageTier?: "fast" | "balanced" | "pro";
  language?: string;
};

export type GenerationJobProgressStage =
  | "queued"
  | "understanding-click"
  | "planning"
  | "generating-image"
  | "saving-node"
  | "complete";

export type GenerationJobStatusEvent = {
  stage: GenerationJobProgressStage;
  message?: string;
};

export type GenerationJobState = "queued" | "running" | "completed" | "failed";

export type GenerationJobSnapshot = {
  id: string;
  state: GenerationJobState;
  createdAt: string;
  updatedAt: string;
  status: GenerationJobStatusEvent;
  node: StoredNode | null;
  error: string | null;
};

export type GenerationJobEvent =
  | { type: "status"; status: GenerationJobStatusEvent }
  | { type: "result"; node: StoredNode }
  | { type: "error"; detail: string };
