# OpenInfinity

[中文](./README.md) | [English](./README.en.md) | [Español](./README.es.md)

> **OpenInfinity is built on top of the MIT-licensed [openflipbook](https://github.com/eren23/openflipbook).**  
> It preserves the original “image-as-page, click-as-navigation, infinite exploration” interaction model while adapting the stack for Mainland China deployment, local-first storage, and maintainable engineering workflows.

OpenInfinity is a local-first interactive visual exploration system for knowledge browsing and AI-generated page navigation:

- **Frontend**: Next.js 15 App Router
- **Backend**: FastAPI orchestration service
- **Text planning**: DeepSeek
- **Vision / image / video generation**: Alibaba Cloud DashScope (Qwen-VL / Wanx)
- **Metadata storage**: PostgreSQL
- **Image persistence**: local TTL file storage inside the project

## Preview

| Generation and browsing UI | Exploration graph UI |
| --- | --- |
| ![OpenInfinity screenshot 1](./68d2a816-f0c8-4e86-8704-a23d11b731f0.png) | ![OpenInfinity screenshot 2](./f1089dd5-6497-4065-875c-539ceb01f5ad.png) |

## Why we recommend domestic AI services

For deployments targeting Mainland China, the recommended stack is **DeepSeek + Alibaba Cloud DashScope**:

1. **Better network reachability** across local development and production.
2. **More predictable latency** for planning, VLM, image generation, and video generation.
3. **Operational and compliance advantages** in mainland deployment scenarios.
4. **Cleaner replacement of overseas dependencies** such as remote font/CDN/model chains.

## Technical architecture

### Interaction model

OpenInfinity follows the core openflipbook pattern:

1. A user enters a topic and gets an annotated, readable page image.
2. The user clicks on any region of the image.
3. A vision model interprets the clicked area.
4. A planning model generates the next page from that clicked subject.
5. Visual style is preserved across generations to create an exploration tree.

### System layers

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web | Next.js 15 | Rendering, interaction, API proxying, node persistence |
| Backend | FastAPI | Planning, click understanding, image generation, video orchestration |
| Database | PostgreSQL | Nodes, sessions, parent-child graph, metadata |
| Asset store | Local files + TTL | Persistent images with automatic cleanup |

### Key engineering decisions

- **SSE status streaming** for visible generation stages.
- **Local image storage** instead of OSS / S3 / R2 by default.
- **Permalinkable nodes** with parent-child navigation history.
- **Style inheritance** through click-understanding output.
- **Local-first startup** via `run-local.sh` without requiring Docker.

## Recommended AI stack

| Capability | Recommended provider | Current default |
| --- | --- | --- |
| Text planning | DeepSeek | `deepseek-v4-flash` |
| Click understanding VLM | DashScope | `qwen-vl-max-latest` |
| Text-to-image | DashScope Wanx | `wanx2.1-t2i-*` |
| Image-to-video | DashScope Wanx i2v | `wanx2.1-i2v-*` |

## Project structure

```text
apps/
  backend/   FastAPI AI orchestration service
  web/       Next.js site, interaction layer, persistence APIs
docker-compose.yml
run-local.sh
```

## Prerequisites

- Node.js 20+
- npm
- Python 3.11 / 3.12 / 3.13
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

Then fill in:

- `DEEPSEEK_API_KEY`
- `DASHSCOPE_API_KEY`
- `POSTGRES_URL`
- `NEXT_PUBLIC_SITE_URL`

> `NEXT_PUBLIC_SITE_URL` must be a publicly reachable domain if you want image-to-video generation to work with DashScope.

## One-command local startup (recommended)

```bash
bash ./run-local.sh
```

This script automatically:

1. Initializes a project-local PostgreSQL data directory
2. Starts PostgreSQL
3. Creates the backend virtual environment and installs dependencies
4. Installs frontend dependencies
5. Starts FastAPI and Next.js

Default URLs:

- `http://127.0.0.1:3000/play`
- `http://127.0.0.1:3000/status`

Common commands:

```bash
bash ./run-local.sh start
bash ./run-local.sh stop
bash ./run-local.sh restart
bash ./run-local.sh status
bash ./run-local.sh clean
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

- Mainland-China-friendly AI infrastructure
- PostgreSQL metadata persistence
- Local TTL image storage
- Full local bootstrap scripting

See the upstream project and this repository’s `LICENSE` for licensing details.
