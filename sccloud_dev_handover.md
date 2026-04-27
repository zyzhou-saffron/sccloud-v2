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

### 🎨 问题频发 7：CSS 自定义类 + 媒体查询在 Next.js 生产环境中"静默失效"
在 `globals.css` 中定义了 `.hero-dashboard-3d` 类并配合 `@media (max-width: 1439px)` 媒体查询调整 3D Dashboard 的 `transform` 和 `width`。**本地开发完全正常，但部署到生产服务器后，媒体查询中的样式完全不生效**——Dashboard 仍然按默认的 `scale(1.6)` 渲染，导致在小屏幕上严重溢出。

**根因分析**：Next.js + Tailwind 的 CSS 构建链中，自定义 CSS 的优先级、Tree Shaking 规则以及浏览器缓存叠加在一起，导致自定义媒体查询在生产 build 中被覆盖或忽略。排查极其困难——通过 SSH 验证服务器上的源文件**确实包含**正确的 CSS 类和媒体查询，但运行时就是不生效。

👉 **解决对策**：**彻底放弃 CSS 类 + 媒体查询方案**，改用 JavaScript `useEffect` + `window.innerWidth` 动态计算所有响应式参数，通过内联 `style` 直接写入。内联样式优先级最高，不受 CSS 构建链影响，且所见即所得。
👉 **核心原则**：在 Next.js/Tailwind 项目中，涉及 `transform`、`perspective` 等复杂 CSS 属性的响应式调整，**不要依赖 globals.css 中的自定义类 + 媒体查询**，直接用 JS 计算 + 内联样式。这能节省至少 3-4 轮"改 CSS → build → deploy → 发现不生效"的无意义循环。

### 📐 问题频发 8：用 `transform: scale()` 缩放文字容器导致文字仍然换行
为让左侧标题文字随视口等比缩小，最初使用 `transform: scale(0.6)` 配合 `transformOrigin: "left top"` 缩放整个文字容器。**结果：文字视觉上变小了，但仍然在原始宽度处换行！** 且内容整体往左上角偏移，不再垂直居中。

**根因分析**：`transform: scale()` 是纯视觉变换，**不改变元素的布局盒模型**。浏览器排版引擎计算文字换行时，使用的仍然是 `transform` 之前的容器宽度。所以即使视觉缩到了 60%，文字依然在"100% 宽度"的基准下换行。而 `transformOrigin: "left top"` 让缩小后的内容"贴"在左上角，导致内容不再居中。

👉 **解决对策**：改用 CSS `zoom` 属性。`zoom` 同时缩放视觉渲染**和布局盒模型**——容器在缩放后"变宽"了（以缩放像素计），文字有更多排版空间，不会触发换行。且 `zoom` 不需要 `transformOrigin`，缩放后元素自然保持原有位置。
👉 **额外保险**：对标题 `<h1>` 添加 `whiteSpace: "nowrap"`。`<br />` 标签的刻意换行仍然生效（`<br>` 是强制换行，不受 `white-space` 限制），但容器宽度不足时绝不会产生多余折行。

### ↕️ 问题频发 9：`zoom` 与 `transform: scale()` 混用时的垂直错位
左栏用 `zoom` 缩放（影响布局高度），右栏 Dashboard 用 `transform: scale()` 缩放（不影响布局高度）。两栏在 Flex 容器中使用 `items-start`（顶端对齐）时，**左栏缩小后布局高度变小、顶端对齐导致内容"上浮"，而右栏布局高度不变、相对"下沉"**，视觉上左边往上走、右边往下走。

👉 **解决对策**：将 Flex 容器的对齐方式从 `items-start` 改为 **`items-center`**。无论两侧缩放的实现方式不同（zoom vs transform），它们的视觉中心始终对齐在同一水平线上。
👉 **核心原则**：当 Flex 子元素使用不同的缩放机制（一个影响布局、一个不影响布局）时，**绝对不要用 `items-start` 或 `items-end`**，必须用 `items-center` 才能保持视觉平衡。

## 4. UI 设计理念与设计系统规范

本项目的 UI 设计语言经历了从早期原型到当前"ComputaBio 暖色学术风格"的完整演进。以下所有设计决策都是固化在代码中的，后续开发**必须遵循**，不得随意引入冲突风格。

### 🎨 4.1 色彩系统 — "暖调学术" (ComputaBio Palette)

所有颜色通过 CSS 自定义属性定义在 `globals.css` 的 `:root` 中，**绝不在组件中硬编码色值**。

| 变量 | 色值 | 用途 |
|---|---|---|
| `--clr-amber` | `#C2693D` | 主色调 — 暖赭石 |
| `--clr-amber-light` | `#D4784A` | 悬停态 |
| `--clr-amber-dark` | `#9E4C13` | 按下态/强调 |
| `--clr-gold` | `#FFD42A` | 辅助金色 |
| `--clr-bg` | `#FAF7F4` | 页面背景 — 暖奶油白，**绝不用纯白 `#FFF`** |
| `--clr-bg-alt` | `#F3EDE7` | 交替区域背景 |
| `--clr-dark-deep` | `#1E1B18` | 标题深色 — 浓缩咖啡色 |
| `--clr-text` | `#3B3836` | 正文色 — 暖灰，**绝不用纯黑 `#000`** |
| `--clr-text-muted` | `#7C7067` | 次要文字 |
| `--clr-border` | `#E8E2DA` | 边框 — 暖色调分割线 |

**核心原则**：整个 UI 不允许出现"冷色调"的白/灰/黑。所有中性色都带有暖色偏移（warm undertone）。这是区别于普通 SaaS 产品的学术气质关键。

### 🔤 4.2 字体系统 — 编辑风衬线 + 几何无衬线

| 变量 | 字体族 | 用途 |
|---|---|---|
| `--font-display` | `Playfair Display`, `Noto Serif SC`, `Songti SC`, serif | Landing page 大标题 — 编辑风衬线体 |
| `--font-serif` | `Noto Serif SC`, `Songti SC`, serif | 中文衬线体 |
| `--font-sans` | `DM Sans`, `Noto Sans SC`, `PingFang SC`, sans-serif | 正文/UI 控件 — 几何无衬线体 |
| `--font-mono` | `JetBrains Mono`, `Menlo`, monospace | 代码/技术文字 |

**原则**：Landing page 标题使用衬线体（`--font-display`）传达学术权威感；Dashboard 内全部使用无衬线体（`--font-sans`）保证功能界面的可读性。

### 🖌 4.3 图标系统 — SVG 描边线条图标 (替代 Emoji)

> **⚠️ 重要：项目中绝不使用 Emoji 作为图标。**

早期版本曾使用 Emoji（如 🔬🧬📊）作为步骤图标，存在以下问题：
*   **跨平台不一致**：同一个 Emoji 在 macOS/Windows/Linux/Android 上渲染完全不同。
*   **色彩冲突**：Emoji 自带的花花绿绿配色与暖色设计系统严重不搭。
*   **尺寸不可控**：Emoji 的 line-height/baseline 在不同浏览器中表现不一致。

**已采用的方案**：自建 `Icons.tsx` 组件库，参考 **GitHub Octicons** 风格的 SVG 描边线条图标：
```tsx
// Icons.tsx — 统一规范:
// 1. 24x24 viewBox
// 2. fill="none" stroke="currentColor" (继承父元素颜色)
// 3. strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
// 4. 可配置 size 和 className
```

目前已有 16 个自定义图标：`IconMicroscope`（显微镜/QC）、`IconBarChart`（柱状图/标准化）、`IconAxis`（坐标系/降维）、`IconCluster`（节点网络/聚类）、`IconTestTube`（试管/差异基因）、`IconPathway`（链环/通路富集）、`IconWaveform`（波形/Marker 表达）、`IconTag`（标签/细胞注释）等。

**新增图标规则**：
1.  必须在 `Icons.tsx` 中新增，**不要在组件中内联 SVG**。
2.  必须使用 `currentColor` 填充，让图标颜色跟随 CSS 父元素。
3.  统一 `strokeWidth={1.5}` 线条粗细。

### 🌊 4.4 阴影与动画系统

**阴影**（定义在 CSS 变量中）：
*   `--shadow-sm`：卡片微阴影（轻量悬浮）。
*   `--shadow-md`：弹窗/下拉菜单（中等层级）。
*   `--shadow-lg`：模态框/核心面板（重层级）。
*   `--shadow-glow`：主色调光晕（用于 CTA 按钮 hover 态）。
*   所有阴影使用 `rgba(45,41,38,...)` 暖色底调，**绝不用纯黑阴影**。

**动画规范**：
*   进场动画：`fadeUp`（上滑渐显）、`fadeIn`（渐显）、`scaleUp`（放大渐显），统一 `cubic-bezier(0.22,1,0.36,1)` 缓动。
*   循环动画：`float-y`（上下漂浮，仅含 `translateY`，不含 `scale`，避免与 3D `transform` 冲突）。
*   **禁止使用 `backdrop-filter` 做大面积动画**——曾因 600 个元素使用 `backdrop-filter: blur()` 导致帧率降至 5fps（见 git commit `07e5201`）。

### 📊 4.5 图表技术栈

| 场景 | 技术 | 原因 |
|---|---|---|
| 海量散点 (UMAP/PCA) | **deck.gl** (WebGL) | 万级细胞点的流畅缩放平移，DOM 方案无法承载 |
| 交互式图表 (DotPlot/Violin) | **D3.js** | 灵活的 SVG 操控，支持 tooltip 交互 |
| 静态结果图 | **R PNG** (通过 AuthImg) | R 引擎直接渲染，前端做权限代理展示 |

### 🧩 4.6 组件设计原则

*   **圆润边缘**：全局 `--radius: 10px`，按钮和卡片统一圆角，避免锐利直角。
*   **渐变按钮**：CTA 按钮使用 `linear-gradient` 暖色渐变 + `box-shadow` hover 光晕，不用纯色扁平按钮。
*   **间距层次**：使用 Tailwind 的 4px 基准间距系统（`p-4`, `gap-6`, `mb-8` 等）。
*   **过渡时长**：所有 hover/focus 过渡统一 `transition: all 0.2s ease` 或 `0.3s`，不允许出现生硬的瞬间状态切换。
*   **空状态**：所有列表/面板的空状态必须有温暖的插图+引导文案（如"尚无分析任务，点击上方步骤开始"），禁止白屏空白。

### 📱 4.7 数据通讯机制
*   **任务执行流**：异步提交 → Backend 交给 Celery/Redis → Plumber 监听响应 → Redis 发布订阅实时进度 → FastAPI WebSocket 转发 → Frontend 显示进度条。

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

### 🖼️ 问题频发 10：Patchwork 子图对齐与图例挤压问题
在 R 引擎中渲染复杂多图合并（如 `FeaturePlot` + `VlnPlot`）时，如果启用 Patchwork 的 `guides = "collect"` 来合并图例，在遇到子图坐标轴标签长度差异极大，或者某子图缺失图例时，会导致**整个拼图严重错位或某个大图被极度挤压变形**。

👉 **解决对策**：放弃 `guides="collect"`。如果需要强制对齐不同子图的绘图区域，最好的方式是**统一坐标轴范围**。在 ggplot 中使用 `scale_x_continuous(limits = c(min, max))` 强制对齐，同时允许各个子图各自保留图例，以保证主图区的等宽视觉。

### 📏 问题频发 11：后端生成图片的“过拉伸/过压缩”与前端响应式冲突
Marker 基因可视化中，如果一次只查询了 1 个基因，R 后端生成的是一张小图。但如果前端在 `<img />` 或其父容器中硬编码了 `width: 100%` 或 `flex: 1`，这张小图会被**强行拉伸填满整个屏幕，导致极度模糊**（马赛克级）。反之，如果基因极多，又会被过度压缩。

👉 **解决对策**：**前端与业务逻辑解耦，通过数量计算最大宽度**。在渲染组件时，根据查询的基因数量（`nMarkers`）动态限制容器最大宽度。
例如：
```tsx
// 基因很少时，不让它拉伸填满
const getDynamicWidth = (n: number) => {
  if (n <= 2) return 'max-w-[40%]';
  if (n <= 4) return 'max-w-[60%]';
  return 'w-full';
}
<div className={`mx-auto ${getDynamicWidth(features.length)}`}>...</div>
```

### 🧮 问题频发 12：R (Plumber) 引擎中因除 0 导致的 NaN 画布崩溃
在动态计算 `ggsave` 输出的画布宽高时（如 `height = ceiling(length(features) / n_col) * base_height`），一旦 `features` 为空或被过滤完（长度为 0），计算出的高/宽会变成 0，进而导致 `ggsave` 报 `dimensions exceed 50 inches` 或直接 NaN 崩溃，返回 HTTP 500。

👉 **解决对策**：在 R 引擎中所有涉及动态计算长宽比的地方，**必须加入 `max(1, ...)` 的兜底保护**。
```R
# 错误写法
n_col <- ceiling(length(features) / 2)
# 正确写法 (永远不为 0)
n_col <- max(1, ceiling(length(features) / 2))
```

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
