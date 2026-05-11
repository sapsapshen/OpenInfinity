"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import type { GenerationJobInput, GenerationJobStatusEvent, StoredNode } from "@/lib/types";

type Props = {
  initialNode?: StoredNode | null;
  initialSessionNodes?: StoredNode[];
};

type NavigationContext = {
  parent: StoredNode | null;
  siblings: StoredNode[];
  children: StoredNode[];
};

const EMPTY_SESSION_NODES: StoredNode[] = [];

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sameNode(left: StoredNode | null, right: StoredNode | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  return (
    left.id === right.id &&
    left.parentId === right.parentId &&
    left.query === right.query &&
    left.pageTitle === right.pageTitle &&
    left.imageUrl === right.imageUrl &&
    left.videoUrl === right.videoUrl &&
    left.createdAt === right.createdAt
  );
}

function sameNodeList(left: StoredNode[], right: StoredNode[]): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((node, index) => sameNode(node, right[index] ?? null));
}

function buildLineage(node: StoredNode | null, allNodes: StoredNode[]): StoredNode[] {
  if (!node) {
    return [];
  }
  const byId = new Map(allNodes.map((item) => [item.id, item]));
  const chain: StoredNode[] = [];
  let cursor: StoredNode | undefined = node;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain;
}

function buildNavigationContext(node: StoredNode | null, allNodes: StoredNode[]): NavigationContext {
  if (!node) {
    return { parent: null, siblings: [], children: [] };
  }
  const parent = node.parentId ? allNodes.find((item) => item.id === node.parentId) ?? null : null;
  const siblings = parent
    ? allNodes.filter((item) => item.parentId === parent.id && item.id !== node.id)
    : [];
  const children = allNodes.filter((item) => item.parentId === node.id);
  return { parent, siblings, children };
}

function mapStageToText(event: GenerationJobStatusEvent): string {
  switch (event.stage) {
    case "queued":
      return event.message ?? "任务已提交，正在准备生成…";
    case "understanding-click":
      return event.message ?? "正在理解点击区域…";
    case "planning":
      return event.message ?? "正在规划页面结构…";
    case "generating-image":
      return event.message ?? "正在生成图片…";
    case "saving-node":
      return event.message ?? "正在保存节点与图片…";
    case "complete":
      return event.message ?? "页面已保存。";
    default:
      return "正在处理…";
  }
}

async function createAnnotatedImage(
  image: HTMLImageElement,
  click: { x: number; y: number },
): Promise<string> {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(image, 0, 0, naturalWidth, naturalHeight);
  const px = click.x * naturalWidth;
  const py = click.y * naturalHeight;
  context.strokeStyle = "#f43535";
  context.lineWidth = Math.max(4, naturalWidth / 180);
  context.beginPath();
  context.moveTo(px - 28, py);
  context.lineTo(px + 28, py);
  context.moveTo(px, py - 28);
  context.lineTo(px, py + 28);
  context.stroke();
  context.beginPath();
  context.arc(px, py, 18, 0, Math.PI * 2);
  context.stroke();
  return canvas.toDataURL("image/png");
}

async function waitForJobResult(
  jobId: string,
  onStatus: (event: GenerationJobStatusEvent) => void,
): Promise<StoredNode> {
  const eventSource = new EventSource(`/api/jobs/${jobId}/events`);

  return await new Promise<StoredNode>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      eventSource.close();
    };

    eventSource.addEventListener("status", (event) => {
      onStatus(JSON.parse((event as MessageEvent).data) as GenerationJobStatusEvent);
    });

    eventSource.addEventListener("result", (event) => {
      settled = true;
      cleanup();
      resolve(JSON.parse((event as MessageEvent).data) as StoredNode);
    });

    eventSource.addEventListener("failure", (event) => {
      settled = true;
      cleanup();
      const payload = JSON.parse((event as MessageEvent).data) as { detail?: string };
      reject(new Error(payload.detail || "生成失败"));
    });

    eventSource.onerror = async () => {
      if (settled) {
        return;
      }
      cleanup();
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("任务状态读取失败");
        }
        const payload = (await response.json()) as {
          state: "queued" | "running" | "completed" | "failed";
          status: GenerationJobStatusEvent;
          node: StoredNode | null;
          error: string | null;
        };
        onStatus(payload.status);
        if (payload.state === "completed" && payload.node) {
          settled = true;
          resolve(payload.node);
          return;
        }
        settled = true;
        reject(new Error(payload.error || "任务连接中断"));
      } catch (error) {
        settled = true;
        reject(error instanceof Error ? error : new Error("任务连接中断"));
      }
    };
  });
}

function NodePreviewCard({
  label,
  node,
  active = false,
  onNavigate,
}: {
  label: string;
  node: StoredNode;
  active?: boolean;
  onNavigate: (nodeId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`branch-card ${active ? "active" : ""}`}
      onClick={() => onNavigate(node.id)}
    >
      <span className="branch-card-kicker">{label}</span>
      <div className="branch-card-media">
        <img alt={node.pageTitle} src={node.imageUrl} />
      </div>
      <strong>{node.pageTitle}</strong>
      <span>{node.query}</span>
    </button>
  );
}

export function FlipbookExperience({ initialNode, initialSessionNodes }: Props) {
  const safeInitialNode = initialNode ?? null;
  const safeInitialSessionNodes = initialSessionNodes ?? EMPTY_SESSION_NODES;
  const router = useRouter();
  const [currentNode, setCurrentNode] = useState<StoredNode | null>(safeInitialNode);
  const [sessionNodes, setSessionNodes] = useState<StoredNode[]>(safeInitialSessionNodes);
  const [query, setQuery] = useState(safeInitialNode?.query ?? "");
  const [statusText, setStatusText] = useState("输入一个主题，开始无限翻页探索。");
  const [errorText, setErrorText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageTier, setImageTier] = useState<"fast" | "balanced" | "pro">("balanced");
  const [videoTier, setVideoTier] = useState<"fast" | "balanced" | "pro">("fast");
  const [tapMarker, setTapMarker] = useState<{ x: number; y: number } | null>(null);
  const [imageExpired, setImageExpired] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCurrentNode((previous) => (sameNode(previous, safeInitialNode) ? previous : safeInitialNode));
  }, [safeInitialNode]);

  useEffect(() => {
    setSessionNodes((previous) =>
      sameNodeList(previous, safeInitialSessionNodes) ? previous : safeInitialSessionNodes,
    );
  }, [safeInitialSessionNodes]);

  useEffect(() => {
    if (currentNode) {
      setQuery(currentNode.query);
      setImageExpired(false);
    }
  }, [currentNode?.id, currentNode?.query]);

  const lineage = useMemo(() => buildLineage(currentNode, sessionNodes), [currentNode, sessionNodes]);
  const navigationContext = useMemo(
    () => buildNavigationContext(currentNode, sessionNodes),
    [currentNode, sessionNodes],
  );
  const displayedQuery = currentNode?.query ?? "";
  const displayedTitle = currentNode?.pageTitle ?? "";
  const displayedFacts = currentNode?.facts ?? [];
  const displayedImageSrc = currentNode?.imageUrl ?? null;

  function applyGeneratedNode(node: StoredNode): StoredNode {
    setCurrentNode(node);
    setSessionNodes((previous) => {
      const byId = new Map(previous.map((item) => [item.id, item]));
      byId.set(node.id, node);
      return Array.from(byId.values()).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    });
    router.push(`/n/${node.id}`);
    return node;
  }

  async function requestGeneration(body: GenerationJobInput): Promise<StoredNode> {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "任务创建失败");
    }
    const payload = (await response.json()) as { jobId: string };
    return waitForJobResult(payload.jobId, (event) => {
      setStatusText(mapStageToText(event));
    });
  }

  function navigateToNode(nodeId: string) {
    router.push(`/n/${nodeId}`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setErrorText("请输入一个主题。");
      return;
    }

    setErrorText("");
    setIsGenerating(true);
    setStatusText("任务已创建，正在准备生成…");
    try {
      const sessionId = makeId();
      const node = await requestGeneration({
        query: trimmed,
        sessionId,
        imageTier,
        aspectRatio: "16:9",
        language: "zh-CN",
      });
      setImageExpired(false);
      applyGeneratedNode(node);
      setStatusText("点击图片任意区域，继续探索下一页。");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "生成失败");
      setStatusText("这次生成没有成功，请重试。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleImageClick(event: MouseEvent<HTMLDivElement>) {
    if (!currentNode || isGenerating || !imageRef.current || imageExpired) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const click = { x, y };

    setTapMarker(click);
    setIsGenerating(true);
    setErrorText("");
    setStatusText("任务已创建，正在理解点击区域…");

    try {
      const annotatedImageDataUrl = await createAnnotatedImage(imageRef.current, click);
      const node = await requestGeneration({
        query: currentNode.pageTitle,
        sessionId: currentNode.sessionId,
        parentId: currentNode.id,
        parentTitle: currentNode.pageTitle,
        parentFacts: currentNode.facts,
        parentPrompt: currentNode.finalPrompt,
        parentStyle: currentNode.styleAnchor,
        annotatedImageDataUrl,
        click,
        imageTier,
        aspectRatio: currentNode.aspectRatio,
        language: "zh-CN",
      });
      setImageExpired(false);
      applyGeneratedNode(node);
      setStatusText("下一页已生成，继续点击图片探索。");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "点击探索失败");
      setStatusText("这次点击没有生成新页，请重试。");
    } finally {
      setIsGenerating(false);
      window.setTimeout(() => setTapMarker(null), 1000);
    }
  }

  async function handleAnimate() {
    if (!currentNode || isAnimating) {
      return;
    }

    setIsAnimating(true);
    setErrorText("");
    setStatusText("正在生成短视频…");
    try {
      const response = await fetch(`/api/nodes/${currentNode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "animate",
          prompt: currentNode.finalPrompt,
          pageTitle: currentNode.pageTitle,
          facts: currentNode.facts,
          imageUrl: currentNode.imageUrl,
          aspectRatio: currentNode.aspectRatio,
          videoTier,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "视频生成失败");
      }
      const updatedNode = (await response.json()) as StoredNode;
      setCurrentNode(updatedNode);
      setSessionNodes((previous) =>
        previous.map((item) => (item.id === updatedNode.id ? updatedNode : item)),
      );
      setStatusText("动画已生成，可以直接播放。");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "视频生成失败");
      setStatusText("动画生成失败，请稍后重试。");
    } finally {
      setIsAnimating(false);
    }
  }

  async function handleShare() {
    if (!currentNode) {
      return;
    }

    const url = `${window.location.origin}/n/${currentNode.id}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: currentNode.pageTitle,
          text: currentNode.facts.slice(0, 2).join(" · ") || currentNode.query,
          url,
        });
        setStatusText("已打开系统分享面板。");
        return;
      } catch {
        // Fallback to clipboard below.
      }
    }

    await navigator.clipboard.writeText(url);
    setStatusText("已复制当前节点链接。注意：图片受 TTL 影响，过期后可从父节点继续探索。");
  }

  return (
    <div className="page-shell">
      <div className="browser-stage">
        <div className="browser-window">
          <div className="browser-toolbar">
            <button
              className="toolbar-circle"
              onClick={() =>
                currentNode?.parentId ? navigateToNode(currentNode.parentId) : router.push("/play")
              }
              type="button"
              aria-label={currentNode?.parentId ? "Go to parent page" : "Back to play"}
            />
            <form className="address-form" onSubmit={handleSubmit}>
              <div className="history-strip">
                {lineage.length > 0 ? (
                  lineage.map((node, index) => (
                    <button
                      key={node.id}
                      type="button"
                      className={`history-pill ${node.id === currentNode?.id ? "active" : ""}`}
                      onClick={() => navigateToNode(node.id)}
                    >
                      {index > 0 ? <span className="history-sep">/</span> : null}
                      <span>{node.pageTitle}</span>
                    </button>
                  ))
                ) : (
                  <span className="history-placeholder">
                    从一个主题开始，系统会把每一页变成可持续探索的图片。
                  </span>
                )}
              </div>
              <div className="search-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="query-input"
                  placeholder="例如：海上丝绸之路、人体免疫系统、宋代汴京夜市"
                />
                <button className="primary-button" disabled={isGenerating} type="submit">
                  {isGenerating ? "生成中" : "开始"}
                </button>
              </div>
            </form>
          </div>

          <div className="browser-content">
            <div
              className={`result-frame ${currentNode && !imageExpired ? "interactive" : "empty"} ${isGenerating ? "busy" : ""}`}
              onClick={currentNode && !imageExpired ? handleImageClick : undefined}
            >
              {currentNode ? (
                <>
                  {!imageExpired ? (
                    <img
                      ref={imageRef}
                      alt={displayedTitle}
                      className="result-image"
                      src={displayedImageSrc ?? undefined}
                      onError={() => setImageExpired(true)}
                    />
                  ) : (
                    <div className="expired-state">
                      <h2>当前页图片已过期</h2>
                      <p>节点链接仍然保留，但图片已被 TTL 清理。你可以回到父节点重新探索，或分享当前节点文本信息。</p>
                      <div className="expired-actions">
                        {currentNode?.parentId ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => navigateToNode(currentNode.parentId!)}
                          >
                            返回父节点
                          </button>
                        ) : null}
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => router.push("/play")}
                        >
                          新建探索
                        </button>
                        {currentNode ? (
                          <button className="secondary-button" type="button" onClick={handleShare}>
                            分享节点链接
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {tapMarker ? (
                    <span
                      className="tap-marker"
                      style={{
                        left: `${tapMarker.x * 100}%`,
                        top: `${tapMarker.y * 100}%`,
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <h1>OpenInfinity</h1>
                  <p>输入主题后生成一张可阅读、可点击、可继续翻页的知识页面。</p>
                </div>
              )}
              {isGenerating ? (
                <div className="frame-overlay">
                  <div className="loading-card">
                    <span className="loading-spinner" />
                    <strong>{statusText}</strong>
                    <span>生成完成后会自动保存为可分享页面。</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {currentNode ? (
          <section className="branch-map">
            <div className="branch-map-header">
              <div>
                <p className="page-kicker">Exploration map</p>
                <h3>当前探索分支</h3>
              </div>
                <span className="branch-map-meta">{sessionNodes.length} 个节点</span>
            </div>
            <div className="branch-grid">
              {navigationContext.parent ? (
                <div className="branch-column">
                  <p className="branch-title">上一页</p>
                  <NodePreviewCard
                    label="Parent"
                    node={navigationContext.parent}
                    onNavigate={navigateToNode}
                  />
                </div>
              ) : null}

              <div className="branch-column">
                <p className="branch-title">当前页</p>
                <NodePreviewCard
                  label="Current"
                  node={currentNode}
                  active
                  onNavigate={navigateToNode}
                />
              </div>

              {navigationContext.siblings.length > 0 ? (
                <div className="branch-column">
                  <p className="branch-title">同层分支</p>
                  <div className="branch-stack">
                    {navigationContext.siblings.map((node) => (
                      <NodePreviewCard
                        key={node.id}
                        label="Sibling"
                        node={node}
                        onNavigate={navigateToNode}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {navigationContext.children.length > 0 ? (
                <div className="branch-column">
                  <p className="branch-title">下一层</p>
                  <div className="branch-stack">
                    {navigationContext.children.map((node) => (
                      <NodePreviewCard
                        key={node.id}
                        label="Child"
                        node={node}
                        onNavigate={navigateToNode}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="control-row">
          <div className="segmented-control">
            <span>图片质量</span>
            {(["fast", "balanced", "pro"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={imageTier === item ? "active" : ""}
                onClick={() => setImageTier(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="segmented-control">
            <span>动画质量</span>
            {(["fast", "balanced", "pro"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={videoTier === item ? "active" : ""}
                onClick={() => setVideoTier(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button
              className="secondary-button"
              type="button"
              onClick={handleShare}
              disabled={!currentNode}
            >
              分享节点
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleAnimate}
              disabled={!currentNode || isAnimating || imageExpired}
            >
              {isAnimating ? "动画生成中" : "生成动画"}
            </button>
          </div>
        </div>

        <p className="status-line">{statusText}</p>
        {errorText ? <p className="error-line">{errorText}</p> : null}

        {currentNode ? (
          <article className="page-article">
            <header className="page-header">
              <p className="page-kicker">当前页面</p>
              <h2>{displayedTitle}</h2>
              <p>{displayedQuery}</p>
            </header>
            <section>
              <h3>图像中的关键事实</h3>
              <ul className="facts-list">
                {displayedFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </section>
            <p className="share-note">
              节点链接可长期访问；图片文件采用 TTL 清理，过期后仍可通过父节点继续恢复探索路径。
            </p>
            {currentNode.videoUrl ? (
              <section>
                <h3>动画预览</h3>
                <video className="video-player" controls src={currentNode.videoUrl} />
              </section>
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  );
}
