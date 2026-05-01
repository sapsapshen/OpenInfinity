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

export type GeneratePageResult = {
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
  image_data_url: string;
  subject: string | null;
  style_anchor: string | null;
  click_in_parent: ClickPoint | null;
};

