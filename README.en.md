# OpenInfinity

[中文](./README.md) | [English](./README.en.md) | [Español](./README.es.md)

> **OpenInfinity is built on top of the MIT-licensed [openflipbook](https://github.com/eren23/openflipbook).**  
> It preserves the original "image-as-page, click-as-navigation, infinite exploration" interaction model while adapting the stack for Mainland China deployment, local-first storage, and maintainable engineering workflows — with significant performance optimizations reducing end-to-end generation latency by 10×.

OpenInfinity is a local-first interactive visual exploration system for knowledge browsing and AI-generated page navigation:

- **Frontend**: Next.js 15 App Router
- **Backend**: FastAPI orchestration service
- **Text planning**: DeepSeek
- **Click understanding VLM**: Alibaba Cloud DashScope (Qwen-VL-Plus)
- **Image generation**: SiliconFlow (Kolors / Flux, ~3–8 s sync) or DashScope Wanx (async, switchable)
- **Image-to-video**: Alibaba Cloud DashScope Wanx i2v
- **Metadata storage**: PostgreSQL
- **Image persistence**: local TTL file storage inside the project

## Preview

| Generation and browsing UI | Exploration graph UI |
| --- | --- |
| ![OpenInfinity screenshot 1](./68d2a816-f0c8-4e86-8704-a23d11b731f0.png) | ![OpenInfinity screenshot 2](./f1089dd5-6497-4065-875c-539ceb01f5ad.png) |

## Performance improvements

The project has gone through multiple rounds of deep optimization that dramatically reduce click-to-image latency:

### 10× faster image generation

| Metric | Before (DashScope async-poll) | After (SiliconFlow sync) |
| --- | --- | --- |
| Typical image generation latency | 20–60 seconds | **3–8 seconds** |
| Polling rounds | Up to 80 × 3 s sleeps | None — synchronous response |
| Image transfer path | Download → base64 encode → SSE (~1.4 MB) | CDN URL returned; web layer fetches once |

### Eliminated browser base64 round-trip

```
Before: backend downloads image → base64 encodes → SSE streams → browser decodes → POSTs back to server
After:  backend returns CDN URL → web server fetches URL → saves locally → browser only consumes URL
```

The browser is completely removed from the large-image transfer path, eliminating ~1.4 MB of base64 data per generation round-trip.

### Server-side async job flow

- Browser POSTs query/click/sessionId, immediately receives a `jobId`
- Tracks progress via SSE (understanding → planning → generating → saving)
- All persistence happens server-side; the browser only consumes the final node URL
- `sweepExpiredFiles` moved off the request path into a background interval janitor

### VLM model optimization

- Click understanding switched from `qwen-vl-max-latest` → `qwen-vl-plus` (~50% faster)
- Coarse click localization does not require the heaviest VLM model

### Other engineering fixes

- Fixed Node.js v25 `localStorage.getItem` TypeError crashing Next.js dev server (HTTP 500)
- Fixed `run-local.sh` startup hang caused by curl with no `--max-time` during Turbopack compilation
- Eliminated duplicate DB reads on `/n/[id]` page hydration via React `cache()`

## Why we recommend domestic AI services

For deployments targeting Mainland China, the recommended stack is **DeepSeek + DashScope + SiliconFlow**:

1. **Better network reachability** — no dependency on overseas APIs, CDNs, or proxy chains.
2. **More predictable latency** — SiliconFlow Kolors/Flux returns synchronously; no polling wait.
3. **Operational and compliance advantages** in mainland deployment scenarios.
4. **Free tier available** — SiliconFlow offers a generous free quota; Kolors works out of the box.

## Technical architecture

### Interaction model

1. A user enters a topic and receives an annotated, readable page image.
2. The user clicks on any region of the image.
3. A vision model (Qwen-VL-Plus) interprets the clicked area.
4. A planning model (DeepSeek) generates the next page from that subject.
5. An image model (SiliconFlow or DashScope) generates the image synchronously/asynchronously.
6. Visual style is preserved across generations to create a shareable exploration tree.

### System layers

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web | Next.js 15 | Rendering, interaction, SSE job stream, node persistence |
| Backend | FastAPI | Planning, click understanding, image generation orchestration |
| Database | PostgreSQL | Nodes, sessions, parent-child graph, metadata |
| Asset store | Local files + TTL | Persistent images with background cleanup |

### Key engineering decisions

- **Server-side job queue**: POST returns `jobId` instantly; SSE pushes each stage's progress.
- **URL-based image persistence**: CDN URLs fetched once server-side; no browser involvement in image transfer.
- **Multi-provider image dispatch**: `IMAGE_PROVIDER` env var switches between SiliconFlow (fast sync) and DashScope (high quality async).
- **Local image storage**: no OSS / S3 / R2 required by default.
- **Permalinkable nodes** with parent-child navigation history.
- **Background janitor**: file expiry sweep is fully async and never blocks requests.
- **Local-first startup**: `run-local.sh` / `restart.sh` bring up the full stack without Docker.

## Recommended AI stack

| Capability | Recommended provider | Current default |
| --- | --- | --- |
| Text planning | DeepSeek | `deepseek-v4-flash` |
| Click understanding VLM | DashScope | `qwen-vl-plus` |
| Image generation (fast) | SiliconFlow | `Kwai-Kolors/Kolors` (~3–5 s) |
| Image generation (quality) | DashScope Wanx | `wanx2.1-t2i-plus` (~20–60 s) |
| Image-to-video | DashScope Wanx i2v | `wanx2.1-i2v-turbo` |

## Project structure

```text
apps/
  backend/   FastAPI AI orchestration service
  web/       Next.js site, interaction layer, persistence APIs
docker-compose.yml
run-local.sh   Full local control script (init, start, stop, status, clean)
restart.sh     One-command restart for all services
```

## Prerequisites

- Node.js 20+ (Node.js 22 recommended; v25 has known compatibility issues)
- npm
- Python 3.11 / 3.12 / 3.13 (3.14+ not supported)
- PostgreSQL 16 (`initdb`, `pg_ctl`, `psql`, `createdb` required for the local script)

Suggested setup on macOS:

```bash
brew install node
brew install python@3.12
brew install postgresql@16
```

## Environment files

Copy the templates first:

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
```

Key settings in `apps/backend/.env`:

```env
DEEPSEEK_API_KEY=your_deepseek_key

# Image provider — pick one:
# Option 1: SiliconFlow (recommended — sync, ~3-8 s)
IMAGE_PROVIDER=siliconflow
SILICONFLOW_API_KEY=your_siliconflow_key   # free key at siliconflow.cn

# Option 2: DashScope Wanx (higher quality, async ~20-60 s)
# IMAGE_PROVIDER=dashscope
# DASHSCOPE_API_KEY=your_dashscope_key
```

> `NEXT_PUBLIC_SITE_URL` must be a publicly reachable domain if you want image-to-video generation to work with DashScope.

## Startup

### One-command local startup (recommended)

```bash
bash ./run-local.sh
```

This script automatically: initializes PostgreSQL → starts the database → installs backend/frontend dependencies → starts FastAPI + Next.js.

Default URLs:

- `http://127.0.0.1:3000/play`
- `http://127.0.0.1:3000/status`

### One-command restart

```bash
bash ./restart.sh           # restart all services
bash ./restart.sh --logs    # restart then tail all three logs (Ctrl+C exits tailing, services keep running)
```

### Other control commands

```bash
bash ./run-local.sh stop      # stop all services
bash ./run-local.sh status    # show running state
bash ./run-local.sh clean     # clear Next.js build cache and stop the frontend
```

## Step-by-step local startup

### 1. Prepare PostgreSQL

Create your database and user, then point `apps/web/.env.local` to it:

```env
POSTGRES_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/openflipbook
```

### 2. Start the backend

```bash
cd apps/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

### 3. Start the frontend

```bash
cd apps/web
npm install
npm run dev
```

### 4. Open the app

```text
http://127.0.0.1:3000/play
```

## Optional Docker Compose startup

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
# Fill in your own API keys and database password
docker compose up --build
```

## Security guidance

- Do not commit `apps/backend/.env`, `apps/web/.env.local`, or `.env.compose`.
- Do not commit real API keys, passwords, logs, or generated image caches.
- Prefer the local-file + PostgreSQL setup first, then extend to distributed deployment only when needed.

## Acknowledgement

OpenInfinity is **developed from the MIT-licensed [openflipbook](https://github.com/eren23/openflipbook)** and extends it with:

- Mainland-China-friendly AI infrastructure (DeepSeek + DashScope + SiliconFlow)
- SiliconFlow + DashScope dual-provider image generation (10× speed improvement)
- Server-side async job flow eliminating browser base64 round-trips
- PostgreSQL metadata persistence and local TTL image storage
- Background file janitor; cleanup never blocks user requests
- Full local one-command startup and restart scripts
- Node.js v25 compatibility fix

See the upstream project and this repository's `LICENSE` for licensing details.
