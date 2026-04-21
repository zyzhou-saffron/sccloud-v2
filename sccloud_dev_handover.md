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

### 🧊 问题频发 5：sessionStorage 过期状态导致前端守卫逻辑失效
分析页面 (`analysis/page.tsx`) 使用 `sessionStorage` 持久化 `project`、`uploadedFile`、`taskCache` 等状态，以便刷新后恢复上下文。**陷阱在于：** 当用户此前选择过的项目被删除、或服务端数据清空后，`sessionStorage` 中仍残留旧的 `project` 对象。此时：
*   `ProjectSelector` 组件从 API 拉取项目列表后找不到匹配项，**UI 正确地显示「选择项目...」**；
*   但 `page.tsx` 中的 `project` state 却是从 `sessionStorage` 恢复的非 `null` 旧值；
*   导致 `if (!project)` 的卫语句失效 —— 用户点击上传区时，守卫被绕过，原生文件选择器照常弹出，而不是提示用户先选择项目。

**表象极具迷惑性**：开发者只看到 UI 上显示"选择项目..."，直觉认为 `project === null`，但实际上它非空。这个 bug 反复修了多轮才定位到根因。

👉 **已实施的解决对策**：在 `ProjectSelector.tsx` 中增加了一个 `useEffect` 守卫钩子：
```tsx
useEffect(() => {
  if (!loading && selectedId !== null && projects.length >= 0) {
    const match = projects.find((p) => p.id === selectedId);
    if (!match) { onSelect(null); } // 主动通知父组件清除过期选择
  }
}, [loading, selectedId, projects, onSelect]);
```
**核心原则**：凡是从 `sessionStorage` / `localStorage` 恢复的"引用型"状态（project、task 等），必须在对应数据源(API)加载完毕后做一次 **"存在性校验"**，不匹配则立即清除。切勿盲目信任浏览器端缓存的对象。

### 👻 问题频发 6：WebSocket 竞态导致任务完成后结果区域空白
任务完成后，结果面板一片空白，但状态胶囊正确显示"✅ 完成"。刷新页面后结果正常出现。

**根因链路**：`ProgressTracker` 同时使用 WebSocket + 轮询监控任务。当 WS 先于轮询收到完成信号时：
1.  WS `onComplete` 回调调用 `fireDone()` **不带** task 参数；
2.  `fireDone` 构造一个残缺的 mock task：`{ id, status: "completed", progress: 100, step: "unknown" }`，传给父组件的 `handleTaskComplete`；
3.  `handleTaskComplete` 将此 mock 写入 `taskCache`，`currentTask.status` 变为 `"completed"`；
4.  `page.tsx` 的回退轮询看到 `status === "completed"` → **立刻停止轮询**，不再从 API 获取完整 Task；
5.  `ResultViewer` 收到的 task 的 `step` 字段是 `"unknown"`，导致所有 `task.step === "qc"` 等分支判断全部 `false`，结果区域无任何组件渲染。

**表象极具迷惑性**：状态胶囊显示"完成"（因为 `status` 字段确实是 `"completed"`），但子组件选择分支全部落空导致白屏。刷新后 `sessionStorage` 恢复的是 slim 化的缓存（包含正确的 `step` 字段，因为 `updateTaskCache` 的 slim 序列化取的是 `t.step`——但如果写入时 step 就是 "unknown"，sessionStorage 里也会是 "unknown"）。实际上刷新能恢复是因为 `page.tsx` 初始化时会从 API 重新 fetch 最新的 task 状态覆盖缓存。

👉 **已实施的解决对策（双保险）**：

**第一层 — 数据源防护** (`page.tsx`)：`handleTaskComplete` 改为 `async`，始终从 API 重新获取完整 Task，mock 对象永不进入缓存：
```tsx
const handleTaskComplete = async (partialTask: Task) => {
  try {
    const fresh = await getTask(partialTask.id);
    updateTaskCache(step.id, fresh);
  } catch {
    updateTaskCache(step.id, partialTask); // API 不可达时降级
  }
};
```

**第二层 — 渲染判断防护** (`ResultViewer.tsx`)：步骤匹配改用父组件显式传入的 `stepId` prop，不再依赖 `task.step`：
```tsx
// 之前（脆弱）：依赖可能残缺的 task 对象
{task.step === "qc" && <QCResultTabs />}

// 现在（健壮）：依赖稳定的父组件 prop
{stepId === "qc" && <QCResultTabs />}
```

**核心原则**：凡是 callback 传入的对象（特别是 WebSocket / 事件回调），**不要假设其字段完整**。涉及缓存写入前，应从权威数据源（API/DB）重新获取完整数据。渲染逻辑应优先依赖稳定的 props / context，而非易变的嵌套对象属性。

## 4. 特色说明
*   **设计系统**：UI 的背景色为带点米白质感的暖调，注重阴影层级、微过渡动画（`animate-fade-in`）和圆润边缘。强调极好的 UX 提示文案与响应。图表主要采用 D3.js（部分交互图）、deck.gl WebGL（处理海量散点UMAP图）、及 fallback 供下载的原生 R PNG 图。
*   **数据通讯机制**：单次任务为异步提交 -> Backend 交给 Celery/Redis -> Plumber 监听响应 -> Redis 发布订阅实时进度 -> FastAPI WebSocket 转发 -> Frontend 显示进度条。

### 🖥 Landing Page 响应式缩放系统 (Hero 区域)

首页 Hero 区域采用了一套**基于 JavaScript 的动态视口缩放系统**，而非传统的 CSS 媒体查询（后者因 Tailwind/Next.js 构建链的特殊性在生产环境容易失效）。核心架构位于 `page.tsx` 的 `heroDash` state hook 中。

**关键设计决策及原理**：

1.  **JS 视口插值取代 CSS 媒体查询**：通过 `window.innerWidth` 实时计算 Dashboard 的 `scale`、`width`、`marginRight` 和 3D 旋转角度。使用 `resize` 事件监听器保持响应性。
    ```
    设计基准: 1680px → 1024px 线性插值
    t = clamp((vw - 1024) / (1680 - 1024), 0, 1)
    ```

2.  **中线约束公式**：为防止 Dashboard 的左视觉边缘侵入左侧文字区域，scale 被限制为：
    ```
    maxScale = (vw/2 + |marginRight|) / dashboardWidth
    ```
    `transformOrigin: "right center"` 意味着缩放从右边展开，左边缘 = 右边缘 – width × scale。该公式确保左边缘永远不越过视口中线。

3.  **左侧文字使用 CSS `zoom` 而非 `transform: scale()`**：
    *   `transform: scale()` 只影响视觉渲染，**不改变布局盒模型** → 文字仍在原始容器宽度内换行，且受 `transformOrigin` 影响位置偏移。
    *   `zoom` 同时缩放视觉和布局 → 文字按缩放后的"更宽"容器排版，不会因容器变窄而换行。
    *   标题 `<h1>` 额外设置 `whiteSpace: "nowrap"`，`<br />` 标签的刻意换行仍生效，但容器宽度不足时不会产生多余折行。

4.  **Flex 对齐使用 `items-center`**：左栏用 `zoom`（缩小布局高度），右栏用 `transform: scale()`（不改变布局高度）。若用 `items-start` 顶端对齐，两边高度差异会导致视觉上下错位。`items-center` 让两栏始终基于同一水平中轴线对齐。

5.  **3D 浮动动画 `float-y`**（定义在 `globals.css`）：仅包含 `translateY` 位移，不含 `scale`，避免与 3D `transform` 冲突产生"呼吸感"缩放。

👉 **核心原则**：在 Next.js + Tailwind 工程中做复杂的响应式 3D 布局时，优先使用 JS 动态计算 + 内联样式，而非依赖 CSS 类/媒体查询。后者在 SSR 构建、CSS 优先级竞争、以及浏览器缓存等环节容易出现样式不生效的问题。

---

## 5. 项目代码量统计 (截至 2026-04-21)

| 模块 | 行数 | 说明 |
|---|---|---|
| Frontend (`.tsx/.ts/.css`) | ~7,300 行 | Next.js + React 组件、API 客户端、CSS |
| Backend (`.py`) | ~1,420 行 | FastAPI 路由、Auth、DB 模型、R 桥接 |
| **v2 总计** | **~8,720 行** | 不含 node_modules / venv |
| v1 (app-new.R) | ~3,030 行 | 原始 R Shiny 单文件 |
| **增幅** | **+5,690 行 (+188%)** | 前后端分离 + UI 精细化 + 用户系统 |

---
**接力提示**：在开始接下来的任务前，请用工具分析以上重点并牢记在上下文，继续用优雅、稳健的工程代码为 USER 的平台添砖加瓦！
