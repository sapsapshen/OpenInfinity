import { Pool } from "pg";

import { env } from "./env";
import type { StoredNode } from "./types";

type NodeRow = {
  id: string;
  session_id: string;
  parent_id: string | null;
  query: string;
  page_title: string;
  facts: string[];
  prompt: string;
  final_prompt: string;
  image_key: string;
  image_url: string;
  image_model: string;
  image_mime_type: string;
  aspect_ratio: StoredNode["aspectRatio"];
  style_anchor: string | null;
  subject: string | null;
  click_in_parent: StoredNode["clickInParent"];
  video_url: string | null;
  video_model: string | null;
  created_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __openInfinityPostgresPool__: Pool | undefined;
}

let schemaReadyPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (!global.__openInfinityPostgresPool__) {
    global.__openInfinityPostgresPool__ = new Pool({
      connectionString: env.postgresUrl,
    });
  }
  return global.__openInfinityPostgresPool__;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          parent_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
          query TEXT NOT NULL,
          page_title TEXT NOT NULL,
          facts JSONB NOT NULL,
          prompt TEXT NOT NULL,
          final_prompt TEXT NOT NULL,
          image_key TEXT NOT NULL,
          image_url TEXT NOT NULL,
          image_model TEXT NOT NULL,
          image_mime_type TEXT NOT NULL,
          aspect_ratio TEXT NOT NULL,
          style_anchor TEXT,
          subject TEXT,
          click_in_parent JSONB,
          video_url TEXT,
          video_model TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_nodes_session_created_at ON nodes (session_id, created_at)",
      );
      await pool.query("CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes (parent_id)");
    })();
  }
  await schemaReadyPromise;
}

function toStoredNode(row: NodeRow): StoredNode {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentId: row.parent_id,
    query: row.query,
    pageTitle: row.page_title,
    facts: row.facts,
    prompt: row.prompt,
    finalPrompt: row.final_prompt,
    imageKey: row.image_key,
    imageUrl: row.image_url,
    imageModel: row.image_model,
    imageMimeType: row.image_mime_type,
    aspectRatio: row.aspect_ratio,
    styleAnchor: row.style_anchor,
    subject: row.subject,
    clickInParent: row.click_in_parent,
    videoUrl: row.video_url,
    videoModel: row.video_model,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function insertNode(node: StoredNode): Promise<StoredNode> {
  await ensureSchema();
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO nodes (
        id, session_id, parent_id, query, page_title, facts, prompt, final_prompt,
        image_key, image_url, image_model, image_mime_type, aspect_ratio,
        style_anchor, subject, click_in_parent, video_url, video_model, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16::jsonb, $17, $18, $19::timestamptz
      )
    `,
    [
      node.id,
      node.sessionId,
      node.parentId,
      node.query,
      node.pageTitle,
      JSON.stringify(node.facts),
      node.prompt,
      node.finalPrompt,
      node.imageKey,
      node.imageUrl,
      node.imageModel,
      node.imageMimeType,
      node.aspectRatio,
      node.styleAnchor,
      node.subject,
      JSON.stringify(node.clickInParent),
      node.videoUrl,
      node.videoModel,
      node.createdAt,
    ],
  );
  return node;
}

export async function getNodeById(id: string): Promise<StoredNode | null> {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query<NodeRow>("SELECT * FROM nodes WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ? toStoredNode(result.rows[0]) : null;
}

export async function getSessionNodes(sessionId: string): Promise<StoredNode[]> {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query<NodeRow>(
    "SELECT * FROM nodes WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId],
  );
  return result.rows.map(toStoredNode);
}

export async function updateNodeVideo(
  id: string,
  videoUrl: string,
  videoModel: string,
): Promise<StoredNode | null> {
  await ensureSchema();
  const pool = getPool();
  const result = await pool.query<NodeRow>(
    `
      UPDATE nodes
      SET video_url = $2, video_model = $3
      WHERE id = $1
      RETURNING *
    `,
    [id, videoUrl, videoModel],
  );
  return result.rows[0] ? toStoredNode(result.rows[0]) : null;
}
