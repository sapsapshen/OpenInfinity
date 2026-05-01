# OpenInfinity

[中文](./README.md) | [English](./README.en.md) | [Español](./README.es.md)

> **OpenInfinity 基于 MIT 开源项目 [openflipbook](https://github.com/eren23/openflipbook) 开发。**  
> 本项目在保留“图片即页面、点击即导航、无限翻页探索”交互范式的基础上，面向中国大陆网络环境，对模型供应链、存储方式、启动方式与工程可维护性进行了系统化改造。

OpenInfinity 是一个面向知识探索、视觉叙事与交互式内容生成的本地优先方案：

- **前端**：Next.js 15 App Router
- **后端**：FastAPI 编排服务
- **文本规划**：DeepSeek
- **视觉理解 / 生图 / 图生视频**：阿里云百炼 DashScope（Qwen-VL / Wanx）
- **元数据存储**：PostgreSQL
- **图片持久化**：项目目录内 TTL 本地文件存储

## 界面预览

| 生成与浏览界面 | 节点探索界面 |
| --- | --- |
| ![OpenInfinity screenshot 1](./68d2a816-f0c8-4e86-8704-a23d11b731f0.png) | ![OpenInfinity screenshot 2](./f1089dd5-6497-4065-875c-539ceb01f5ad.png) |

## 为什么建议优先选用本土 AI 方案

对于中国大陆部署环境，推荐优先采用 **DeepSeek + 阿里云百炼 DashScope**：

1. **网络可达性更稳定**：降低对海外 API、对象存储、字体与代理链路的依赖。
2. **时延更可控**：文本规划、视觉理解、生图和视频生成整体链路更适合大陆网络条件。
3. **更易运维与合规**：企业内网、云上 VPC 与本地开发环境接入更直接。
4. **更适合替代海外依赖**：可同时覆盖文本模型、VLM、文生图、图生视频等关键能力。

## 技术方案总览

### 1. 交互架构

OpenInfinity 延续 openflipbook 的核心交互模型：

1. 用户输入主题，生成一张带标题、标注与知识点的“说明型页面图片”。
2. 用户点击图片上的任意区域。
3. 视觉模型判断该区域所代表的对象或主题。
4. 文本规划模型基于点击结果生成下一页内容。
5. 系统保持父子页面的视觉风格连续性，形成可分享的探索图谱。

### 2. 系统分层

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| Web | Next.js 15 | 页面渲染、交互、API 代理、节点持久化 |
| Backend | FastAPI | 文本规划、点击理解、生图、视频生成编排 |
| Database | PostgreSQL | 节点、会话、父子关系、页面元数据 |
| Asset Store | 本地文件 + TTL | 页面图片本地保存与过期清理 |

### 3. 关键工程设计

- **SSE 流式生成反馈**：前端可实时显示“理解点击 → 规划页面 → 生成图片”等阶段状态。
- **本地图片存储**：不依赖 OSS / R2 / S3，所有图片保存在项目目录并通过同域 API 提供访问。
- **节点持久化**：每张页面都可保存为独立 permalink，并保留父子关系与点击坐标。
- **风格继承**：点击理解阶段会提取页面视觉风格摘要，用于下一页生成保持连续体验。
- **本地优先启动**：提供完全本地的一键脚本 `run-local.sh`，无需 Docker 即可启动。

## 推荐 AI 服务组合

| 能力 | 推荐方案 | 当前默认实现 |
| --- | --- | --- |
| 文本规划 | DeepSeek | `deepseek-v4-flash` |
| 点击理解 VLM | 阿里云百炼 DashScope | `qwen-vl-max-latest` |
| 文生图 | 阿里云百炼 DashScope Wanx | `wanx2.1-t2i-*` |
| 图生视频 | 阿里云百炼 DashScope Wanx i2v | `wanx2.1-i2v-*` |

## 项目结构

```text
apps/
  backend/   FastAPI AI 编排服务
  web/       Next.js 站点、交互与持久化 API
docker-compose.yml
run-local.sh
```

## 启动前准备

### 1. 基础环境

- Node.js 20+
- npm
- Python 3.11 / 3.12 / 3.13
- PostgreSQL 16（本地脚本模式需要 `initdb`、`pg_ctl`、`psql`、`createdb`）

macOS 推荐安装：

```bash
brew install node
brew install python@3.12
brew install postgresql@16
```

### 2. 环境变量文件

项目提供三类示例配置：

- `.env.compose.example`
- `apps/backend/.env.example`
- `apps/web/.env.example`

复制后再填写你自己的配置：

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
```

需要重点填写：

- `DEEPSEEK_API_KEY`
- `DASHSCOPE_API_KEY`
- `POSTGRES_URL`
- `NEXT_PUBLIC_SITE_URL`

> `NEXT_PUBLIC_SITE_URL` 在启用图生视频时应配置为 **DashScope 可访问的公网域名**；仅使用 `localhost` 无法完成图生视频。

## 一键脚本启动（推荐）

项目根目录提供了完全本地的启动脚本：

```bash
bash ./run-local.sh
```

脚本会自动完成：

1. 初始化项目内 PostgreSQL 数据目录
2. 启动 PostgreSQL
3. 创建后端虚拟环境并安装依赖
4. 安装前端依赖
5. 启动 FastAPI 与 Next.js

默认访问地址：

- `http://127.0.0.1:3000/play`
- `http://127.0.0.1:3000/status`

常用命令：

```bash
bash ./run-local.sh start
bash ./run-local.sh stop
bash ./run-local.sh restart
bash ./run-local.sh status
bash ./run-local.sh clean
```

## 分步本地启动

如果你希望手动分步启动，可按下面流程执行。

### 步骤 1：准备数据库

确保 PostgreSQL 已启动，并创建数据库与账号；然后把连接串写入 `apps/web/.env.local`：

```env
POSTGRES_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/openflipbook
```

### 步骤 2：启动后端

```bash
cd apps/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

### 步骤 3：启动前端

```bash
cd apps/web
npm install
npm run dev
```

### 步骤 4：打开页面

```text
http://127.0.0.1:3000/play
```

## 可选：Docker Compose 启动

如需容器化运行：

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
# 然后填入你自己的 API key 与数据库密码
docker compose up --build
```

## 安全与配置建议

- 不要提交 `apps/backend/.env`、`apps/web/.env.local`、`.env.compose` 等本地配置文件。
- 不要把真实 API key、数据库密码、临时日志与图片缓存提交到仓库。
- 推荐使用 **本地文件存储 + PostgreSQL** 作为默认方案，先跑通核心链路，再评估云存储或多机部署。

## 致谢与许可证说明

OpenInfinity **基于 MIT 开源项目 [openflipbook](https://github.com/eren23/openflipbook) 开发**，在此基础上补充了：

- 中国大陆网络可达性适配
- 本土 AI 供应链集成
- PostgreSQL 元数据持久化
- 本地图片 TTL 存储
- 完全本地一键启动脚本

上游项目许可证请参考其原始仓库与本仓库中的 `LICENSE` 文件。
