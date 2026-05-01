import path from "node:path";

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveStoreDir(storeDir: string | undefined): string {
  if (!storeDir) {
    return path.resolve(process.cwd(), ".data/images");
  }
  return path.isAbsolute(storeDir) ? storeDir : path.resolve(process.cwd(), storeDir);
}

export const env = {
  backendApiUrl: process.env.BACKEND_API_URL ?? "http://localhost:8787",
  postgresUrl:
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/openflipbook",
  imageStoreDir: resolveStoreDir(process.env.IMAGE_STORE_DIR),
  imageTtlHours: parseNumber(process.env.IMAGE_TTL_HOURS, 24),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
};
