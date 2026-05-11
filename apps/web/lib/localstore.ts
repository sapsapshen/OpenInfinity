import fs from "node:fs/promises";
import path from "node:path";

import { env } from "./env";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepStartedAt = 0;
let sweepPromise: Promise<void> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __openInfinityImageJanitorStarted__: boolean | undefined;
}

function assertSafeKey(key: string): string {
  if (!key || key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid image key");
  }
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key)) {
    throw new Error("Image key contains unsupported characters");
  }
  return key;
}

function resolvePathWithinStore(key: string): string {
  const root = path.resolve(env.imageStoreDir);
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Image path escapes storage root");
  }
  return target;
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported data URL");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".png";
}

async function sweepExpiredFiles(rootDir: string): Promise<void> {
  const now = Date.now();
  if (now - lastSweepStartedAt < SWEEP_INTERVAL_MS) {
    if (sweepPromise) {
      await sweepPromise;
    }
    return;
  }
  lastSweepStartedAt = now;
  const ttlMs = env.imageTtlHours * 60 * 60 * 1000;

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          const remaining = await fs.readdir(fullPath).catch(() => []);
          if (remaining.length === 0) {
            await fs.rmdir(fullPath).catch(() => undefined);
          }
          return;
        }
        const stats = await fs.stat(fullPath);
        if (now - stats.mtimeMs > ttlMs) {
          await fs.unlink(fullPath).catch(() => undefined);
        }
      }),
    );
  }

  sweepPromise = (async () => {
    await fs.mkdir(rootDir, { recursive: true });
    await walk(rootDir);
  })();

  try {
    await sweepPromise;
  } finally {
    sweepPromise = null;
  }
}

export function startImageStoreJanitor(): void {
  if (global.__openInfinityImageJanitorStarted__) {
    return;
  }
  global.__openInfinityImageJanitorStarted__ = true;

  const runSweep = () => {
    void sweepExpiredFiles(env.imageStoreDir).catch(() => undefined);
  };

  runSweep();
  const timer = setInterval(runSweep, SWEEP_INTERVAL_MS);
  timer.unref?.();
}

export async function saveImageFromUrl(
  keyBase: string,
  url: string,
): Promise<{ key: string; mimeType: string }> {
  startImageStoreJanitor();
  assertSafeKey(keyBase);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${response.status} ${response.statusText}`);
  }
  const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const key = assertSafeKey(`${keyBase}${extensionForMimeType(mimeType)}`);
  const targetPath = resolvePathWithinStore(key);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return { key, mimeType };
}

export async function saveImageFromDataUrl(
  keyBase: string,
  dataUrl: string,
): Promise<{ key: string; mimeType: string }> {
  startImageStoreJanitor();
  assertSafeKey(keyBase);
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const key = assertSafeKey(`${keyBase}${extensionForMimeType(mimeType)}`);
  const targetPath = resolvePathWithinStore(key);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return { key, mimeType };
}

export async function readStoredImage(
  key: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const safeKey = assertSafeKey(key);
  const targetPath = resolvePathWithinStore(safeKey);
  const stats = await fs.stat(targetPath).catch(() => null);
  if (!stats) {
    return null;
  }

  const ttlMs = env.imageTtlHours * 60 * 60 * 1000;
  if (Date.now() - stats.mtimeMs > ttlMs) {
    await fs.unlink(targetPath).catch(() => undefined);
    return null;
  }

  const buffer = await fs.readFile(targetPath);
  const extension = path.extname(targetPath).toLowerCase();
  const mimeType =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : "image/png";
  return { buffer, mimeType };
}

export async function readImageAsDataUrl(key: string): Promise<string | null> {
  const result = await readStoredImage(key);
  if (!result) {
    return null;
  }
  return `data:${result.mimeType};base64,${result.buffer.toString("base64")}`;
}

export function imageUrlFromKey(key: string): string {
  return `/api/images/${key.split("/").map(encodeURIComponent).join("/")}`;
}
