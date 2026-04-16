# scCloud v2 — 单细胞 RNA-seq 分析平台

> 从 R Shiny 迁移到现代全栈架构：Next.js + FastAPI + R Plumber

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | Next.js 16, Tailwind CSS, Plotly.js | 响应式 SPA |
| 后端 | FastAPI, SQLAlchemy 2.0, Redis | REST API + WebSocket |
| 计算 | R 4.3, Seurat 5, Plumber | 无状态计算引擎 |
| 部署 | Docker Compose, Nginx | 容器编排 |

## 快速开始

### 前提条件

- Node.js ≥ 18
- Python ≥ 3.11
- Docker + Docker Compose (R 引擎)
- Redis (可选，通过 Docker 启动)

### 1. 克隆项目

```bash
git clone <repo_url> sccloud-v2
cd sccloud-v2
```

### 2. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET 等

# 启动 (开发模式)
uvicorn app.main:app --reload --port 8000
```

### 3. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 4. 启动 Redis (可选)

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 5. 构建 R 引擎 (可选)

```bash
cd r-engine
docker build -t sccloud-r-engine .     # 约 30 分钟
docker run -p 8787:8787 sccloud-r-engine
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `sqlite:///./test.db` | 数据库连接字符串 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接 |
| `JWT_SECRET` | `CHANGE_ME` | **生产环境必须更改** |
| `R_ENGINE_URL` | `http://localhost:8787` | R Plumber 引擎地址 |
| `PROJECTS_ROOT` | `/data/projects` | 项目数据存储根目录 |
| `MAX_UPLOAD_SIZE_GB` | `30` | 单文件上传大小上限 |

## API 端点

### 认证 (`/api/auth`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 (OAuth2 表单) |
| POST | `/api/auth/refresh` | 刷新 Token |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/auth/change-password` | 修改密码 |

### 项目 (`/api/projects`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 列出项目 |
| POST | `/api/projects` | 创建项目 |
| DELETE | `/api/projects/{id}` | 删除项目 |

### 任务 (`/api/tasks`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tasks` | 提交分析任务 |
| GET | `/api/tasks` | 查询任务 (支持 project_id/status 筛选) |
| GET | `/api/tasks/{id}` | 获取任务详情 |
| POST | `/api/tasks/{id}/cancel` | 取消任务 |

### 文件上传 (`/api/upload`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload/init` | 初始化分片上传 |
| POST | `/api/upload/chunk` | 上传单个分片 |
| POST | `/api/upload/complete` | 合并分片 |
| GET | `/api/upload/status/{id}` | 查询上传进度 |

### 格式转换 (`/api/convert`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/convert/upload` | 上传转换文件 |
| POST | `/api/convert` | 执行格式转换 |

### 系统 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| WS | `/ws/tasks/{id}` | 任务进度 WebSocket |

## 分析流程

支持 8 步标准 scRNA-seq 分析：

1. **数据预处理** (QC) — 质控过滤
2. **数据标准化** — SCTransform
3. **数据降维** — PCA/UMAP/tSNE
4. **批次聚类** — Harmony 校正 + Louvain
5. **差异基因** — FindMarkers
6. **通路富集** — GO/KEGG/GSEA
7. **Marker 表达** — 基因可视化
8. **细胞注释** — SingleR/手动

## 项目结构

```
sccloud-v2/
├── frontend/               # Next.js 前端
│   └── src/app/
│       ├── lib/api.ts      # 统一 API 客户端
│       ├── components/     # 可复用组件 (Plotly 图表等)
│       └── dashboard/      # 仪表盘页面
├── backend/                # FastAPI 后端
│   └── app/
│       ├── auth/           # JWT 认证
│       ├── projects/       # 项目 CRUD
│       ├── tasks/          # 任务管理
│       ├── upload/         # 分片上传
│       ├── convert/        # 格式转换
│       ├── ws/             # WebSocket
│       └── utils/          # R 引擎桥接
├── r-engine/               # R 计算引擎
│   ├── Dockerfile
│   ├── plumber.R
│   └── R/                  # 9 个分析模块
├── docker-compose.yml      # 生产部署
└── docker-compose.dev.yml  # 开发环境 (仅 Redis)
```

## 生产部署

```bash
# 1. 配置环境变量
cp .env.example .env
vim .env  # 设置 DB_USER, DB_PASS, JWT_SECRET 等

# 2. 启动所有服务
docker compose up -d

# 3. 检查健康状态
curl http://localhost:8000/api/health
```

## License

MIT
