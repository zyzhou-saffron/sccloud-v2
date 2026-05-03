# scCloud v2 Pipeline 全流程分析 — 实现指南

## 概述

本次提交实现了 scCloud v2 的**全流程一键分析 (Pipeline Mode)** 核心功能，包括：

- ✅ **后端编排层**：`Pipeline` 模型 + Router + Executor，自动顺序执行 8 个分析步骤
- ✅ **Step 8 补全**：`AnnotateResult` 前端组件，展示细胞注释结果
- ✅ **实时监控**：`PipelineView` 组件，追踪 Pipeline 执行进度，每步完成后即时展示结果
- ✅ **错误处理**：任何步骤失败即停，已完成步骤正常展示
- ⏳ **UI 入口**：需用户在 `analysis/page.tsx` 中集成 Tab 切换（本指南提供代码片段）

---

## 已完成的代码模块

### 1. 后端：Database Models

**文件**: `backend/app/db/models.py`

新增 `Pipeline` 模型和修改 `Task` 模型：

```python
class Pipeline(Base):
    __tablename__ = "pipelines"
    id = Column(String(36), primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))
    params = Column(JSON)  # 全 8 步的参数集合
    status = Column(Enum("pending", "running", "completed", "failed", "cancelled"))
    current_step = Column(String(50), nullable=True)
    error_step = Column(String(50), nullable=True)
    error_msg = Column(Text, nullable=True)
    created_at, started_at, completed_at = ...
    tasks = relationship("Task", back_populates="pipeline")

# Task 表增加：
pipeline_id = Column(String(36), ForeignKey("pipelines.id"), nullable=True)
pipeline = relationship("Pipeline", back_populates="tasks")
```

**迁移**: 应用启动时 `Base.metadata.create_all()` 会自动创建 `pipelines` 表，无需 Alembic。

---

### 2. 后端：Pipeline Executor

**文件**: `backend/app/pipeline/executor.py`

核心函数 `async def run_pipeline(pipeline_id)` 实现：

1. 加载 Pipeline 记录
2. 遍历 8 个步骤顺序执行
3. 每步前设置 `pipeline.current_step`，完成后重新轮询监听
4. **特殊处理 Step 7** (marker_expr)：Phase A 已在 Pipeline 创建时同步解析，Phase B 对每个 cell_type 各跑一次
5. **Step 5 强制覆盖**：`cluster="All"`（运行前无法知道有哪些 cluster）
6. 任何步骤失败立即停止，设置 `error_step` 和 `error_msg`
7. 全部完成后设置 `status="completed"`

复用现有的 `call_r_engine()` 函数，无需改动 R 引擎代码。

---

### 3. 后端：Pipeline Router

**文件**: `backend/app/pipeline/router.py`

三个 API 端点：

```
POST /api/pipeline
  请求体:
  {
    "project_id": 1,
    "params": {
      "qc": {...},
      "normalize": {...},
      ...,
      "annotate": {...}
    },
    "marker_file_path": "/path/to/markers.xlsx"  (可选)
  }
  响应: {"pipeline_id": "uuid", "status": "pending"}
  
  工作流:
  1. 若有 marker_file_path，同步调用 /marker_expr Phase A 解析
  2. 得到 cell_types 列表后存入 params["marker_expr"]["cell_types"]
  3. 创建 Pipeline 记录
  4. BackgroundTasks 后台启动 run_pipeline()

GET /api/pipeline/{pipeline_id}
  返回 Pipeline 全状态 + 关联的 tasks 列表
  前端轮询此接口追踪进度
  
GET /api/pipeline?project_id=X&limit=10
  列出历史 Pipeline 记录
```

---

### 4. 前端：AnnotateResult 组件

**文件**: `frontend/src/app/components/AnnotateResult.tsx`

显示 Step 8 的分析结果：

- **顶部统计胶囊**：总细胞数、细胞类型数、注释方法
- **UMAP 图**：展示细胞类型标注 (使用 `<AuthImg>` 加载保护的图片端点)
- **频率表**：细胞类型名称 + 数量 + 占比 (分页展示)

**关键代码特征**：
- R 引擎返回的 result 结构：`{ status, result_path, plot_path, stats: {cells, cell_types, anno_type}, freq_table }`
- 必须使用 `<AuthImg>` 组件加载图片（传递 `token` 参数）
- 频率表采用分页（每页 10 行）

---

### 5. 前端：ResultViewer 集成

**文件**: `frontend/src/app/components/ResultViewer.tsx`

修改点（第 298 行）：

```tsx
// 新增 AnnotateResult 分支
{stepId === "annotate" && <AnnotateResult task={task} token={token} />}

// 更新 fallback 的 exclude 列表
{!["qc","normalize","reduce","cluster","markers","enrich","marker_expr","annotate"].includes(stepId) && ...}
```

现在 Step 8 执行完成后会正确展示结果，而不是"分析完成"文字。

---

### 6. 前端：Pipeline API 调用函数

**文件**: `frontend/src/app/lib/pipeline-api.ts`

三个异步函数：

```typescript
export async function createPipeline(token: string, data: PipelineParams): Promise<{pipeline_id, status}>
export async function getPipeline(token: string, pipelineId: string): Promise<Pipeline>
export async function listPipelines(token: string, projectId: number, limit?: number): Promise<Pipeline[]>
```

---

### 7. 前端：PipelineView 组件

**文件**: `frontend/src/app/dashboard/analysis/components/PipelineView.tsx`

显示 Pipeline 执行状态的实时仪表板：

- 顶部状态胶囊（待执行/运行中/已完成/已失败）
- 8 个步骤的列表，各自显示：
  - 运行中：进度条 (复用 ProgressTracker)
  - 已完成：可点击展开查看结果 (复用 ResultViewer)
  - 失败：显示错误信息
  - 待执行：灰色"待执行"标签

实现了 2 秒轮询机制，Pipeline 运行时自动监听 `GET /api/pipeline/{id}`。

---

## 未完成的工作（需用户补充）

### PipelineForm 组件（可选）

前端表单模块，用于用户填写全 8 步的参数，然后提交 Pipeline 创建请求。

**位置建议**: `frontend/src/app/dashboard/analysis/components/PipelineForm.tsx`

**核心功能**：
- 8 个可折叠的 Section，各自展示该步骤的参数输入
- 参数 UI 可直接从现有 `page.tsx` 第 509-1076 行的各步骤表单片段提取
- Step 5 (markers) 的 cluster 多选项应显示为"固定 All（全聚类分析）"的说明文字
- Step 7 (marker_expr) 包含文件上传 + Phase A 解析后显示 cell_types 列表
- Step 8 (annotate) 的 mode radio（自动/手动）
- 底部"开始全流程分析"按钮

**集成点**：在 `PipelineView` 上方显示 (若无活跃 Pipeline)，或单独作为一个独立 Tab。

---

### analysis/page.tsx 中的 Tab 集成

**目标**: 在 "单步分析"/"全流程" 之间切换

**代码框架**：

```tsx
// page.tsx 中的 mode state
const [analysisMode, setAnalysisMode] = useState<"single" | "pipeline">("single");

// ProjectSelector 下方添加 Tab
<div className="flex gap-2 mb-4 border-b" style={{ borderColor: "var(--clr-border)" }}>
  <button
    className={`px-4 py-2 text-sm font-semibold transition-all ${
      analysisMode === "single"
        ? `style={{ borderBottom: "2px solid var(--clr-amber)" }}`
        : `style={{ opacity: 0.6 }}`
    }`}
    onClick={() => setAnalysisMode("single")}
  >
    单步分析
  </button>
  <button
    className={`px-4 py-2 text-sm font-semibold transition-all ${
      analysisMode === "pipeline"
        ? `style={{ borderBottom: "2px solid var(--clr-amber)" }}`
        : `style={{ opacity: 0.6 }}`
    }`}
    onClick={() => setAnalysisMode("pipeline")}
  >
    全流程
  </button>
</div>

// 条件渲染
{analysisMode === "single" && (
  <>{ 现有所有代码 }</> 
)}
{analysisMode === "pipeline" && (
  <>
    {!activePipelineId && <PipelineForm projectId={project?.id} onSubmit={setActivePipelineId} />}
    {activePipelineId && <PipelineView pipelineId={activePipelineId} token={token} />}
  </>
)}
```

---

## 部署和测试步骤

### Step 1: 后端构建

```bash
cd ~/sccloud-r-engine
docker compose -f docker-compose.server.yml --env-file .env.server build backend
```

### Step 2: 数据库验证

容器启动后，进入 MariaDB 验证新表是否创建：

```bash
docker exec sccloud-r-engine-db-1 mysql -u sccloud_app -p<password> sccloud_v2 -e "SHOW TABLES; DESC pipelines;"
```

预期输出：
```
Tables_in_sccloud_v2
...
pipelines
tasks
```

### Step 3: 前端构建（仅若需集成 PipelineForm）

```bash
docker compose -f docker-compose.server.yml --env-file .env.server build frontend
```

### Step 4: 端到端测试

#### 4a. 使用 curl 测试后端 API

```bash
# 登录获取 token（假设用户 admin/admin）
TOKEN=$(curl -X POST http://<server-ip>:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .access_token)

# 创建 Pipeline
PIPELINE=$(curl -X POST http://<server-ip>:8000/api/pipeline \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": 1,
    "params": {
      "qc": {"max_mt_ratio": 20, "min_features": 200, "max_features": 5000},
      "normalize": {},
      "reduce": {"method": "umap", "n_pcs": 30},
      "cluster": {"resolution": 0.5},
      "markers": {"cluster": "All"},
      "enrich": {"pathway": "GO"},
      "marker_expr": {"cell_types": []},
      "annotate": {"anno_type": "自动注释"}
    }
  }')

PIPELINE_ID=$(echo $PIPELINE | jq -r .pipeline_id)

# 轮询监控进度
for i in {1..60}; do
  STATUS=$(curl -s http://<server-ip>:8000/api/pipeline/$PIPELINE_ID \
    -H "Authorization: Bearer $TOKEN" | jq .status)
  echo "[$i] Pipeline status: $STATUS"
  [ "$STATUS" = '"completed"' ] && break
  sleep 2
done
```

#### 4b. 在 Web UI 测试

1. 访问 `http://<server-ip>:9000`
2. 登录 → 进入 Analysis 页面
3. 切换到"全流程"Tab（若已集成）
4. 选择项目 → 填写参数 → 点击"开始全流程分析"
5. 实时监控 8 个步骤的执行进度
6. 每步完成后展开查看结果

---

## 关键设计决策

| 问题 | 决策 | 理由 |
|------|------|------|
| 步骤编排方式 | 后端 Pipeline 层顺序执行 | 稳定可靠，支持错误恢复 |
| Step 5 cluster 参数 | 固定"All"（不提供选择） | 运行前无法知道 cluster 列表 |
| Step 7 marker_expr | Phase A 在 Pipeline 创建时同步运行 | 避免表单复杂化 |
| 失败处理 | 立即停止，保留已完成结果 | 用户可检查中间结果排查问题 |
| 结果展示 | 每步完成后立即展示 | 更好的用户体验，实时反馈 |
| DB 迁移 | 自动 create_all() | 简化部署，无需 Alembic |

---

## 已知限制与未来改进

1. **PipelineForm 表单 UI 未实现**：用户可逐步补充（详见上文代码框架）
2. **Step 7 marker 文件必须先上传**：暂未支持直接在表单中上传文件再解析
3. **多个 Pipeline 并发**：当前实现支持，但 UI 未体现（PipelineView 一次只展示一个）
4. **Pipeline 中断/暂停**：暂未实现，只支持自动化执行
5. **参数验证**：目前由 R 引擎在执行时验证，未在后端预检

---

## 代码检查清单

- [x] 后端 Pipeline 模型编译通过
- [x] 后端 Router 和 Executor 代码无语法错误
- [x] 前端 AnnotateResult 组件无 TypeScript 错误
- [x] 前端 PipelineView 和 pipeline-api 正常导入
- [x] ResultViewer 成功集成 AnnotateResult 分支
- [x] Git 提交格式规范
- [ ] Docker 镜像构建成功（待 Docker 环境修复）
- [ ] 端到端测试通过（待用户部署后验证）

---

## 联系与反馈

如遇到问题，请检查：

1. **后端日志**：`docker logs sccloud-r-engine-backend-1 | grep -i error`
2. **R 引擎日志**：`docker logs sccloud-r-engine-r-engine-1`
3. **数据库**：确认 `pipelines` 表已创建且 `tasks.pipeline_id` 列存在
4. **Token 有效期**：Pipeline 执行可能耗时较长，JWT token 需足够长的有效期

---

**祝测试顺利！** 🚀
