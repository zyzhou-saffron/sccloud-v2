# scCloud-v2 项目交接与开发完整规范指南 (给下一个 AI Agent)

> **Role & Context**: 你好，下一个 AI 助手！这份文档是由前序 AI 开发过程中总结的，目的是让你快速掌握 scCloud-v2 项目的运行逻辑、双机部署工作流以及踩遍了坑的历史教训。请在计划开发和执行各类系统命令前，完整阅读并遵从本规范。

---

## 1. 项目背景与技术栈架构
*   **用途**：单细胞 RNA 测序 (scRNA-Seq) 的可视化、自动化分析平台（重构自旧有的 Shiny App R 平台）。
*   **架构分为三层**：
    *   `frontend` (Next.js 14 App Router, React, TailwindCSS, TypeScript)：提供现代化的、具有“ComputaBio 暖色学术风格”及动画反馈的可视化界面。
    *   `backend` (Python FastAPI, MariaDB, Redis)：业务逻辑层，处理用户系统、文件流管理、Task 任务编排追踪，以及向 R 引擎发出 Celery/Redis RPC 调用。
    *   `r-engine` (R, Plumber, Seurat)：后端计算引擎。无状态的 REST API (封装在 `plumber.R` 内)，通过 `system2` 或内嵌逻辑调用原有 R 脚本 (`data_processing.R`, `data_plot.R` 等)。

## 2. 环境说明与双机工作流设定

本项目是经典的 **本地开发调试 -> 服务器部署** 模式。

*   **本地环境**：macOS (ARM64)，路径 `/Users/zyzhou./Downloads/scRNA/sccloud-v2`。
*   **远端服务器 (线上)**：GPU-zhouy1，路径 `~/sccloud-r-engine`。
*   **部署工具**：统一使用 Docker Compose。本地使用 `docker-compose.yml`，远端使用 `docker-compose.server.yml`。

### 标准迭代工作流 (SOP)
当你接到 USER 提出的功能需求时，请严格遵守以下 SOP 循环：

1.  **需求分析与代码检索**：使用 `grep_search` 等工具精准查阅当前前端、后端、或 R 代码的上下文。
2.  **代码修改**：使用文件修改工具 (如 `multi_replace_file_content`) 精准修改代码。
3.  **本地构建与重启**：
    *   执行形如 `docker compose build frontend && docker compose up -d frontend` 等指令热重载本地服务。
    *   等待 USER 测试验证（如果报错，根据 `docker compose logs [service_name] --tail 30` 排障）。
4.  **同步至远端服务器**：
    *   **核心动作**：通过 `scp` 将改动过的文件点对点发送到远端对应的目录中。（例如：`scp frontend/src/.../xxx.tsx GPU-zhouy1:~/sccloud-r-engine/frontend/src/.../xxx.tsx`）。
5.  **服务端重构加载**：
    *   执行 SSH 命令在服务端重新拉起容器。
    *   **⚠️ 致命红线操作 ⚠️**：重载远程服务时，必须！绝对必须带有 `--env-file .env.server` 参数！
    *   正确命令示例：`ssh GPU-zhouy1 "cd ~/sccloud-r-engine && docker compose -f docker-compose.server.yml --env-file .env.server up -d frontend --build"`。
6.  **Git 提交固化**：
    *   远端确认无误后，在本地终端执行 `git commit -am "feat/fix(scope): xxx"`。

---

## 3. 血泪教训（历史易犯错点总结）
为避免反复犯同类错误，请遵循以下核心准则：

### 🚨 绝对不可犯的错误 1：丢失服务器环境变量
在重启 `GPU-zhouy1` 端的容器时，如果执行的原生命令是 `docker compose up -d`，系统会丢失 MySQL 数据库密码与 JWT 密钥信息，导致后台崩溃或数据库重置初始化！
👉 **解决对策**：远端任何 `up`、`build` 或操作指令，必须加死 `--env-file .env.server` 参数（如：`docker compose -f docker-compose.server.yml --env-file .env.server up -d backend`）。

### 🖼 问题频发 2：图表图片加载 401 权限报错 (AuthImg)
前端在从 `backend` 请求产生的分析结果图表时（如 `/api/tasks/{id}/plot?name=xxx`），该 API 深受 JWT 保护。如果直接用原生的 `<img src="...">` 加载，会遗失 Authorization Header 导致 `401 Unauthorized` 拒绝访问。
👉 **解决对策**：项目中已自建封装了 `<AuthImg />` 组件。面对任何受保护的图片，**绝对不要使用原生 `<img>`**，请导入并使用 `AuthImg`。并且必须传入全局状态获取的 `token`。

### 🔄 问题频发 3：修改了 R 脚本但本地没生效
`sccloud-r-engine` 因为打包庞大耗时（几十GB依赖），本地不通过 `build` 参数而是挂载官方 `latest` 镜像。修改 `r-engine/plumber.R` 后，如果未做 volume 映射，容器内依然运行老旧进程。
👉 **解决对策**：`docker-compose.yml` 已经给 `r-engine` 配置了 `volumes: - ./r-engine/plumber.R:/app/plumber.R:ro` 和 `- ./r-engine/R:/app/R:ro` 挂载点。只需修改后执行 `docker compose restart r-engine` 即可生效。

### 🔌 问题频发 4：前端跨域配置及环境变量陷阱
切勿试图在前端注入绝对路径格式的 `NEXT_PUBLIC_API_URL` 或写死 WS 端口（如 `localhost:8000`）。这曾导致 docker 镜像受限于打死构建的环境，导致一套包无法在本地和远端双用。
👉 **解决对策**：
1. Next.js 已启用 `rewrites`，前端的 fetch 请一律使用相对前缀 `/api/...`（会被 Next 内置服务器自动代理向 Backend）。
2. WebSockets 一律靠读取浏览器宏环境动态拼装（如：`wss://${window.location.host}/ws/...`）。
3. 部署时，使用 `BACKEND_URL` 作为 Docker 构建的 `ARG` 来满足 next 服务端组件所需的内网路由通讯。这点 `docker-compose.yml` 层已配置完善，尽量别动。

## 4. 特色说明
*   **设计系统**：UI 的背景色为带点米白质感的暖调，注重阴影层级、微过渡动画（`animate-fade-in`）和圆润边缘。强调极好的 UX 提示文案与响应。图表主要采用 D3.js（部分交互图）、deck.gl WebGL（处理海量散点UMAP图）、及 fallback 供下载的原生 R PNG 图。
*   **数据通讯机制**：单次任务为异步提交 -> Backend 交给 Celery/Redis -> Plumber 监听响应 -> Redis 发布订阅实时进度 -> FastAPI WebSocket 转发 -> Frontend 显示进度条。

---
**接力提示**：在开始接下来的任务前，请用工具分析以上重点并牢记在上下文，继续用优雅、稳健的工程代码为 USER 的平台添砖加瓦！
