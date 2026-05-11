# OpenInfinity

[中文](./README.md) | [English](./README.en.md) | [Español](./README.es.md)

> **OpenInfinity 基于 MIT 开源项目 [openflipbook](https://github.com/eren23/openflipbook) 开发。**  
> 本项目在保留"图片即页面、点击即导航、无限翻页探索"交互范式的基础上，面向中国大陆网络环境，对模型供应链、存储方式、启动方式与工程可维护性进行了系统化改造，并经历了多轮深度性能优化。

OpenInfinity 是一个面向知识探索、视觉叙事与交互式内容生成的本地优先方案：

- **前端**：Next.js 15 App Router
- **后端**：FastAPI 编排服务
- **文本规划**：DeepSeek
- **视觉理解**：阿里云百炼 DashScope（Qwen-VL-Plus）
- **文生图**：SiliconFlow（Kolors / Flux）或 DashScope Wanx，可切换
- **图生视频**：阿里云百炼 DashScope Wanx i2v
- **元数据存储**：PostgreSQL
- **图片持久化**：项目目录内 TTL 本地文件存储

## 界面预览

| 生成与浏览界面 | 节点探索界面 |
| --- | --- |
| ![OpenInfinity screenshot 1](./68d2a816-f0c8-4e86-8704-a23d11b731f0.png) | ![OpenInfinity screenshot 2](./f1089dd5-6497-4065-875c-539ceb01f5ad.png) |

## 性能优化亮点

相较于初始版本，本项目已完成多轮深度优化，交互延迟大幅降低：

### 图像生成提速 10× 以上

| 指标 | 优化前（DashScope 异步轮询）| 优化后（SiliconFlow 同步） |
| --- | --- | --- |
| 典型出图延迟 | 20–60 秒 | **3–8 秒** |
| 轮询次数 | 最多 80 次 × 3 秒 | 无轮询，同步返回 |
| 图像传输方式 | 后端下载→base64编码→SSE传输（~1.4 MB）| 直接返回 CDN URL，web 层按需下载 |

### 架构层面去掉大图二次中转

```
旧路径：后端下载图片 → base64 编码 → SSE 传输 → 前端解码 → POST 上传回服务端
新路径：后端返回 CDN URL → web 服务端直接从 URL 下载落盘 → 浏览器仅消费 URL
```

浏览器不再参与大图传输，彻底消除约 1.4 MB/次的 base64 双向中转。

### 服务端异步任务流

- 前端提交请求后立即获得 `jobId`，通过 SSE 实时获取生成进度
- 生成、落盘、写库全部在服务端完成，浏览器仅消费最终 URL 与节点信息
- 文件过期清理（`sweepExpiredFiles`）移出请求链路，改为后台定时任务

### VLM 模型优化

- 点击理解从 `qwen-vl-max-latest` 改为 `qwen-vl-plus`，延迟降低约 50%
- 点击定位任务不需要最重型的 VLM，轻量模型效果等价

### 其他工程修复

- 修复 Node.js v25 下 `localStorage.getItem` TypeError 导致 Next.js 开发服务 500 的问题
- 修复 `run-local.sh` curl 无超时导致启动脚本卡死的问题
- 消除 `/n/[id]` 页面 hydration 后的重复数据库查询

## 为什么推荐本土 AI 方案

对于中国大陆部署环境，推荐优先采用 **DeepSeek + DashScope + SiliconFlow**：

1. **网络可达性更稳定**：降低对海外 API、对象存储与代理链路的依赖。
2. **时延更可控**：SiliconFlow Kolors / Flux 同步出图，无异步轮询等待。
3. **更易运维与合规**：企业内网、云上 VPC 与本地开发环境接入更直接。
4. **成本可控**：SiliconFlow 提供免费额度，Kolors 无需额外配置即可使用。

## 技术方案总览

### 交互架构

1. 用户输入主题，生成一张带标题、标注与知识点的"说明型页面图片"。
2. 用户点击图片上的任意区域。
3. 视觉模型（Qwen-VL-Plus）判断该区域代表的对象或主题。
4. 文本规划模型（DeepSeek）基于点击结果生成下一页内容与提示词。
5. 图像生成服务（SiliconFlow 或 DashScope）同步/异步生成图片，直接落盘到 web 服务端。
6. 系统保持父子页面的视觉风格连续性，形成可分享的探索图谱。

### 系统分层

| 层级 | 技术 | 职责 |
| --- | --- | --- |
| Web | Next.js 15 | 页面渲染、交互、SSE 进度流、节点持久化 |
| Backend | FastAPI | 文本规划、点击理解、图像生成编排 |
| Database | PostgreSQL | 节点、会话、父子关系、页面元数据 |
| Asset Store | 本地文件 + TTL | 页面图片本地保存与后台过期清理 |

### 关键工程设计

- **服务端异步任务流**：POST 提交即返回 `jobId`，SSE 推送每个阶段进度。
- **URL 直传落盘**：图像 CDN URL 直接在服务端下载并保存，浏览器不参与大图中转。
- **多提供商图像分发**：`IMAGE_PROVIDER` 环境变量一键切换 SiliconFlow（快速同步）或 DashScope（高质异步）。
- **本地图片存储**：不依赖 OSS / R2 / S3，所有图片保存在项目目录并通过同域 API 提供访问。
- **节点持久化**：每张页面都可保存为独立 permalink，并保留父子关系与点击坐标。
- **后台 Janitor**：文件过期清理完全异步，不阻塞任何用户请求。
- **本地优先启动**：`run-local.sh` / `restart.sh` 无需 Docker 即可一键启动全栈。

## 推荐 AI 服务组合

| 能力 | 推荐方案 | 当前默认实现 |
| --- | --- | --- |
| 文本规划 | DeepSeek | `deepseek-v4-flash` |
| 点击理解 VLM | 阿里云百炼 DashScope | `qwen-vl-plus` |
| 文生图（快速） | SiliconFlow | `Kwai-Kolors/Kolors`（~3–5 s） |
| 文生图（高质） | 阿里云百炼 DashScope Wanx | `wanx2.1-t2i-plus`（~20–60 s） |
| 图生视频 | 阿里云百炼 DashScope Wanx i2v | `wanx2.1-i2v-turbo` |

## 项目结构

```text
apps/
  backend/   FastAPI AI 编排服务
  web/       Next.js 站点、交互与持久化 API
docker-compose.yml
run-local.sh   完整本地启动脚本（初始化 + 启动 + 停止 + 状态）
restart.sh     一键重启全部服务
```

## 启动前准备

### 1. 基础环境

- Node.js 20+（推荐 Node.js 22，避免 v25 兼容性问题）
- npm
- Python 3.11 / 3.12 / 3.13（不支持 3.14+）
- PostgreSQL 16（本地脚本模式需要 `initdb`、`pg_ctl`、`psql`、`createdb`）

macOS 推荐安装：

```bash
brew install node
brew install python@3.12
brew install postgresql@16
```

### 2. 环境变量文件

复制后再填写你自己的配置：

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
```

`apps/backend/.env` 核心配置项：

```env
DEEPSEEK_API_KEY=your_deepseek_key

# 图像提供商选择（二选一）
# 选项 1：SiliconFlow（推荐，同步出图 ~3-8s）
IMAGE_PROVIDER=siliconflow
SILICONFLOW_API_KEY=your_siliconflow_key   # 注册 siliconflow.cn 获取免费 key

# 选项 2：DashScope Wanx（高质量，异步 ~20-60s）
# IMAGE_PROVIDER=dashscope
# DASHSCOPE_API_KEY=your_dashscope_key
```

> `NEXT_PUBLIC_SITE_URL` 在启用图生视频时应配置为 **DashScope 可访问的公网域名**；仅使用 `localhost` 无法完成图生视频。

## 启动方式

### 一键启动（推荐）

```bash
bash ./run-local.sh
```

脚本会自动完成：初始化 PostgreSQL → 启动数据库 → 安装后端/前端依赖 → 启动 FastAPI + Next.js

默认访问地址：

- `http://127.0.0.1:3000/play`
- `http://127.0.0.1:3000/status`

### 一键重启

```bash
bash ./restart.sh           # 重启所有服务
bash ./restart.sh --logs    # 重启后实时跟踪三端日志（Ctrl+C 退出跟踪，服务继续运行）
```

### 其他控制命令

```bash
bash ./run-local.sh stop      # 停止所有服务
bash ./run-local.sh status    # 查看运行状态
bash ./run-local.sh clean     # 清理前端编译缓存后停止前端
```

## 分步本地启动

如果你希望手动分步启动，可按下面流程执行。

### 步骤 1：准备数据库

确保 PostgreSQL 已启动，并创建数据库；然后把连接串写入 `apps/web/.env.local`：

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

```bash
cp .env.compose.example .env.compose
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
# 填入你自己的 API key 与数据库密码
docker compose up --build
```

## 安全与配置建议

- 不要提交 `apps/backend/.env`、`apps/web/.env.local`、`.env.compose` 等本地配置文件。
- 不要把真实 API key、数据库密码、临时日志与图片缓存提交到仓库。
- 推荐使用 **本地文件存储 + PostgreSQL** 作为默认方案，先跑通核心链路，再评估云存储或多机部署。

## 致谢与许可证说明

OpenInfinity **基于 MIT 开源项目 [openflipbook](https://github.com/eren23/openflipbook) 开发**，在此基础上补充了：

- 中国大陆网络可达性适配与本土 AI 供应链集成
- SiliconFlow + DashScope 双提供商图像生成架构（10× 提速）
- 服务端异步任务流，彻底移除浏览器大图二次中转
- PostgreSQL 元数据持久化与本地图片 TTL 存储
- 后台文件 Janitor，过期清理不阻塞请求链路
- 完全本地一键启动/重启脚本
- Node.js v25 兼容性修复

上游项目许可证请参考其原始仓库与本仓库中的 `LICENSE` 文件。
