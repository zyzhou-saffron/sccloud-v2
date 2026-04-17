/**
 * scCloud v2 — 分析流程向导页面
 *
 * Phase 3 重写: 从静态 UI → 完全 API 对接
 * Phase 5 重构: ComputaBio 暖色学术风格
 * Phase 6: Emoji → SVG line icons (GitHub Octicons style)
 */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import ProjectSelector from "../../components/ProjectSelector";
import ProgressTracker from "../../components/ProgressTracker";
import ResultViewer from "../../components/ResultViewer";
import TaskHistory from "../../components/TaskHistory";
import Tooltip from "../../components/Tooltip";
import {
  IconMicroscope, IconBarChart, IconAxis, IconCluster,
  IconTestTube, IconPathway, IconWaveform, IconTag, IconUpload, IconQuestion
} from "../../components/Icons";
import { getTask, submitTask, type Project, type Task } from "../../lib/api";

/* ===== 步骤定义 ===== */

interface StepDef {
  id: string;
  num: number;
  label: string;
  Icon: ComponentType<{ className?: string; size?: number }>;
  desc: string;
  apiStep: string;
}

const STEPS: StepDef[] = [
  { id: "qc", num: 1, label: "数据预处理", Icon: IconMicroscope, desc: "质控过滤", apiStep: "qc" },
  { id: "normalize", num: 2, label: "数据标准化", Icon: IconBarChart, desc: "SCTransform", apiStep: "normalize" },
  { id: "reduce", num: 3, label: "数据降维", Icon: IconAxis, desc: "PCA/UMAP/tSNE", apiStep: "reduce" },
  { id: "cluster", num: 4, label: "批次聚类", Icon: IconCluster, desc: "Harmony 校正", apiStep: "cluster" },
  { id: "markers", num: 5, label: "差异基因", Icon: IconTestTube, desc: "FindMarkers", apiStep: "markers" },
  { id: "enrich", num: 6, label: "通路富集", Icon: IconPathway, desc: "GO/KEGG/GSEA", apiStep: "enrich" },
  { id: "marker_expr", num: 7, label: "Marker 表达", Icon: IconWaveform, desc: "基因表达可视化", apiStep: "marker_expr" },
  { id: "annotate", num: 8, label: "细胞注释", Icon: IconTag, desc: "SingleR/手动", apiStep: "annotate" },
];

/* ===== 各步骤参数定义 ===== */

const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  qc: { max_mt_ratio: 20, min_features: 200, max_features: 5000, umi_min_pct: 0, umi_max_pct: 1 },
  normalize: {},
  reduce: { method: "umap", n_pcs: 30, group_by: "Sample" },
  cluster: { method: "harmony", resolution: 0.5, n_dims: 30, group_by: "Sample" },
  markers: { min_pct: 0.1, logfc_threshold: 0.25, test_use: "wilcox", ntop: 5 },
  enrich: { pathway: "GO", direction: "Up" },
  marker_expr: {},
  annotate: { mode: "auto", group_by: "Sample" },
};

/* ===== 主组件 ===== */

/** sessionStorage 工具函数 */
const SS_KEY = "sccloud_analysis_state";
function loadSession() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(sessionStorage.getItem(SS_KEY) || "null"); } catch { return null; }
}
function saveSession(patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadSession() || {};
    sessionStorage.setItem(SS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch { /* ignore */ }
}

function AnalysisPageContent() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get("project");

  // ── 从 sessionStorage 恢复持久化状态 ──
  const ss = loadSession();

  const [activeStep, _setActiveStep] = useState<number>(ss?.activeStep ?? 0);
  const [project, setProject] = useState<Project | null>(
    // 恢复项目对象（仅保存 id/name/storage_path 等轻量字段）
    ss?.project ?? null
  );
  const [params, setParams] = useState<Record<string, Record<string, unknown>>>(
    ss?.params ?? JSON.parse(JSON.stringify(DEFAULT_PARAMS))
  );
  // 每个步骤单独缓存最近一次 task，切换步骤不会丢失
  const [taskCache, setTaskCache] = useState<Record<string, Task>>(
    ss?.taskCache ?? {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // uploadedFile: { name: 原文件名, path: 服务器路径 } 或 null
  const [uploadedFile, setUploadedFile] = useState<{ name: string; path: string } | null>(
    ss?.uploadedFile ?? null
  );
  // 上传进度（0-100）
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const step = STEPS[activeStep];
  // 当前步骤的 task（来自 cache）
  const currentTask = taskCache[step.id] ?? null;
  const currentTaskId = currentTask?.id ?? null;

  /** 持久化包装器 */
  const setActiveStep = (v: number | ((p: number) => number)) => {
    _setActiveStep((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      saveSession({ activeStep: next });
      return next;
    });
  };
  // showResults 现在已废弃，由 currentTask 自动驱动，保留 setter 以兼容历史 sessionStorage
  const setShowResults = (_v: boolean) => { saveSession({ showResults: _v }); };

  /** 更新某步骤的 task 缓存并持久化（只存轻量字段，防止 sessionStorage 溢出） */
  const updateTaskCache = useCallback((stepId: string, task: Task) => {
    setTaskCache((prev) => {
      const next = { ...prev, [stepId]: task };
      // 只持久化轻量元数据，不含 params（可能很大）
      const slim: Record<string, Partial<Task>> = {};
      for (const [k, t] of Object.entries(next)) {
        slim[k] = { id: t.id, step: t.step, status: t.status,
                    result_path: t.result_path, completed_at: t.completed_at,
                    error_msg: t.error_msg, progress: t.progress };
      }
      saveSession({ taskCache: slim });
      return next;
    });
  }, []);

  /** 清除某步骤的 task 缓存（点击"返回参数设置"时使用） */
  const clearTaskCache = useCallback((stepId: string) => {
    setTaskCache((prev) => {
      const next = { ...prev };
      delete next[stepId];
      const slim: Record<string, Partial<Task>> = {};
      for (const [k, t] of Object.entries(next)) {
        slim[k] = { id: t.id, step: t.step, status: t.status,
                    result_path: t.result_path, completed_at: t.completed_at,
                    error_msg: t.error_msg, progress: t.progress };
      }
      saveSession({ taskCache: slim });
      return next;
    });
  }, []);

  /** 刷新后从 API 批量恢复 task 对象 */
  useEffect(() => {
    const savedCache = ss?.taskCache as Record<string, Task> | undefined;
    if (!savedCache || Object.keys(savedCache).length === 0) return;
    const token = localStorage.getItem("access_token") || "";
    // 只恢复当前步骤的 task（减少请求数）
    const stepId = STEPS[ss?.activeStep ?? 0]?.id;
    const savedTask = savedCache[stepId];
    if (!savedTask?.id) return;
    fetch(`/api/tasks/${savedTask.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((task: Task | null) => {
        if (task) updateTaskCache(stepId, task);
      })
      .catch(() => { /* 找不到就算 */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** params / uploadedFile 变更时持久化 */
  useEffect(() => { saveSession({ params }); }, [params]);
  useEffect(() => { saveSession({ uploadedFile }); }, [uploadedFile]);

  /**
   * 安全回退轮询：独立检测当前步骤任务的终态。
   * 防止 ProgressTracker 的 onComplete/onError 回调因竞态条件
   * （如 WebSocket 先到但 getTask 失败）未能更新父组件 taskCache，
   * 导致 ResultViewer 永久卡在 "正在执行" 转圈的问题。
   */
  useEffect(() => {
    if (!currentTask?.id) return;
    if (currentTask.status === "completed" || currentTask.status === "failed" || currentTask.status === "cancelled") return;

    const interval = setInterval(async () => {
      try {
        const fresh = await getTask(currentTask.id);
        if (fresh.status === "completed" || fresh.status === "failed") {
          updateTaskCache(step.id, fresh);
          clearInterval(interval);
        }
      } catch { /* 静默忽略，下次重试 */ }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentTask?.id, currentTask?.status, step.id, updateTaskCache]);

  const stepParams = params[step.id] || {};

  const updateParam = useCallback(
    (key: string, value: unknown) => {
      setParams((prev) => ({
        ...prev,
        [step.id]: { ...prev[step.id], [key]: value },
      }));
    },
    [step.id]
  );

  /** 真实分片上传 RDS 文件到项目目录 */
  const handleFileUpload = async (file: File) => {
    if (!project) { setError("请先选择项目"); return; }
    const CHUNK = 5 * 1024 * 1024; // 5MB per chunk
    const token = localStorage.getItem("access_token") || "";
    setUploadProgress(0);
    setError(null);
    try {
      // 1. 初始化
      const initForm = new FormData();
      initForm.append("filename", file.name);
      initForm.append("file_size", String(file.size));
      const initRes = await fetch("/api/upload/init", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: initForm,
      });
      if (!initRes.ok) throw new Error("初始化上传失败");
      const { upload_id } = await initRes.json() as { upload_id: string };

      // 2. 分片上传
      const totalChunks = Math.ceil(file.size / CHUNK);
      for (let i = 0; i < totalChunks; i++) {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        const chunkForm = new FormData();
        chunkForm.append("upload_id", upload_id);
        chunkForm.append("chunk_index", String(i));
        chunkForm.append("chunk", blob, file.name);
        const chunkRes = await fetch("/api/upload/chunk", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: chunkForm,
        });
        if (!chunkRes.ok) throw new Error(`分片 ${i + 1} 上传失败`);
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 95));
      }

      // 3. 合并
      const completeForm = new FormData();
      completeForm.append("upload_id", upload_id);
      completeForm.append("project_id", String(project.id));
      const completeRes = await fetch("/api/upload/complete", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: completeForm,
      });
      if (!completeRes.ok) throw new Error("合并文件失败");
      const { path: filePath } = await completeRes.json() as { path: string };

      setUploadProgress(100);
      setUploadedFile({ name: file.name, path: filePath });
      setTimeout(() => setUploadProgress(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
      setUploadProgress(null);
    }
  };

  const handleSubmit = async () => {
    if (!project) { setError("请先选择项目"); return; }
    setError(null); setSubmitting(true);
    setShowResults(true);
    try {
      // QC 步骤时把已上传文件路径注入参数
      const finalParams = step.id === "qc" && uploadedFile
        ? { ...stepParams, rds_file_path: uploadedFile.path }
        : stepParams;
      const task = await submitTask({ project_id: project.id, step: step.apiStep, params: finalParams });
      updateTaskCache(step.id, task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally { setSubmitting(false); }
  };

  const handleTaskComplete = (task: Task) => { updateTaskCache(step.id, task); };
  const handleTaskError = () => {};
  const handleSelectHistory = (task: Task) => {
    const idx = STEPS.findIndex((s) => s.apiStep === task.step);
    if (idx >= 0) {
      updateTaskCache(STEPS[idx].id, task);
      setActiveStep(idx);
    }
  };
  const handleProjectSelect = (p: Project) => {
    // 切换项目时重置所有与项目绑定的状态，避免旧数据泄漏
    setProject(p);
    setUploadedFile(null);
    setTaskCache({});
    setParams(JSON.parse(JSON.stringify(DEFAULT_PARAMS)));
    _setActiveStep(0);
    saveSession({
      project: p,
      uploadedFile: null,
      taskCache: {},
      params: JSON.parse(JSON.stringify(DEFAULT_PARAMS)),
      activeStep: 0,
    });
    setError(null);
  };

  // 参数面板折叠由当前步骤是否有任务自动驱动，不再依赖全局 showResults
  const hasTaskForStep = currentTask !== null;

  const inputCls = "w-full px-3 py-2 bg-white border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#C86019]/30 transition-colors";
  const inputStyle = { borderColor: "var(--clr-border)", color: "var(--clr-text)" };
  /* 跨浏览器统一 select 样式：移除原生箭头，用自定义 SVG chevron */
  const selectCls = inputCls + " cursor-pointer";
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: "32px",
  };

  return (
    <div className="animate-fade-in">
      {/* 标题 + 项目选择器 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark-deep)" }}>
          scRNA分析
        </h1>
        <div className="w-72">
          <ProjectSelector
            selectedId={project?.id ?? (initialProjectId ? Number(initialProjectId) : null)}
            onSelect={handleProjectSelect}
          />
        </div>
      </div>

      <div className="flex gap-6">
        {/* ===== Step Sidebar ===== */}
        <div className="w-56 shrink-0 space-y-1">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setActiveStep(i); setError(null); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-left transition-all duration-200"
              style={
                activeStep === i
                  ? { borderLeft: "3px solid var(--clr-amber)", color: "var(--clr-amber-dark)", background: "rgba(200,96,25,0.06)", fontWeight: 600 }
                  : { borderLeft: "3px solid transparent", color: "var(--clr-text-muted)" }
              }
            >
              <s.Icon size={18} className={activeStep === i ? "text-[#C86019]" : "text-[#999]"} />
              <div>
                <div>{s.num}. {s.label}</div>
                <div className="text-xs" style={{ color: "var(--clr-text-faint)" }}>{s.desc}</div>
              </div>
            </button>
          ))}

          {project && (
            <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--clr-border)" }}>
              <TaskHistory projectId={project.id} onSelect={handleSelectHistory} />
            </div>
          )}
        </div>

        {/* ===== Main Content ===== */}
        <div className="flex-1 flex gap-6 items-stretch">
          {/* Parameters Panel — 动态收缩 */}
          <div
            style={{
              width: hasTaskForStep ? 0 : 288,
              minWidth: hasTaskForStep ? 0 : 288,
              opacity: hasTaskForStep ? 0 : 1,
              overflow: 'hidden',
              transition: 'width 0.45s cubic-bezier(0.4,0,0.2,1), min-width 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
              flexShrink: 0,
              alignSelf: 'stretch',
            }}
          >
            <div className="card space-y-4" style={{ width: 288 }}>
              <div className="card-label">参数设置</div>
              <h3 className="font-semibold flex items-center gap-2" style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark)" }}>
                <step.Icon size={18} />
                {step.label}
              </h3>

              {/* QC 参数 */}
              {step.id === "qc" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>上传原始 RDS 文件</label>

                    {/* 上传按钮 — 始终显示 */}
                    <label
                      className="flex items-center justify-center gap-2 w-full py-2 bg-white cursor-pointer hover:shadow-sm transition-all text-xs border border-dashed rounded mb-1.5"
                      style={{
                        borderColor: uploadedFile ? "#C86019" : "var(--clr-border)",
                        color: uploadedFile ? "#C86019" : "var(--clr-text-muted)",
                        background: uploadedFile ? "rgba(200,96,25,0.04)" : undefined,
                        pointerEvents: uploadProgress !== null ? "none" : undefined,
                        opacity: uploadProgress !== null ? 0.6 : 1,
                      }}
                    >
                      <IconUpload size={14} className="text-[#C86019]" />
                      <span>{uploadedFile ? "重新上传" : "点击上传 .rds 文件"}</span>
                      <input
                        type="file"
                        accept=".rds,.h5seurat,.h5ad,.rdata"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                      />
                    </label>

                    {/* 上传进度条 */}
                    {uploadProgress !== null && (
                      <div className="w-full px-1 space-y-1">
                        <div className="flex justify-between text-[10px]" style={{ color: "var(--clr-amber-dark)" }}>
                          <span>上传中...</span><span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-1 rounded-full" style={{ background: "var(--clr-border)" }}>
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: "var(--clr-amber)" }} />
                        </div>
                      </div>
                    )}

                    {/* 已上传文件名 + 独立垃圾桶 */}
                    {uploadedFile && uploadProgress === null && (
                      <div className="flex items-center gap-2 mt-1">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2D8A56" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="flex-1 truncate text-[11px]" style={{ color: "var(--clr-text-muted)" }}>{uploadedFile.name}</span>
                        <button
                          type="button"
                          onClick={() => { setUploadedFile(null); saveSession({ uploadedFile: null }); }}
                          title="移除文件"
                          className="p-1 rounded hover:bg-red-50 transition-colors shrink-0"
                          style={{ color: "var(--clr-danger)" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>最大线粒体基因比例 (%)</span>
                      <Tooltip content="变量: max_mt_ratio\n\n设定细胞内线粒体基因表达占比的最大阈值。\n线粒体占比居高(如>10~20%)通常标志着由于膜破裂导致的胞质转录本大规模流失，细胞处于濒死受损状态。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="range" min="0" max="100" value={stepParams.max_mt_ratio as number} onChange={(e) => updateParam("max_mt_ratio", Number(e.target.value))} className="w-full accent-[#C86019]" />
                    <div className="text-xs text-right" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>{stepParams.max_mt_ratio as number}%</div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>最小表达基因数</span>
                      <Tooltip content="变量: min_features\n\n细胞必须检测到的最小独特基因数量(Features)。\n基因数过少通常意味着由于测序深度不足、细胞破裂或该液滴中根本没有包裹有效细胞(空泡液滴)，用于基础质控。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.min_features as number} onChange={(e) => updateParam("min_features", Number(e.target.value))} min={1} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>最大表达基因数</span>
                      <Tooltip content="变量: max_features\n\n细胞内检测到的最大独特基因数量。\n基因数过高往往是因为一个液滴内包裹了两个或多个细胞(双细胞/多细胞混合物)，导致检测到的基因种类异常偏多，剔除它们可避免产生混合伪类群。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.max_features as number} onChange={(e) => updateParam("max_features", Number(e.target.value))} min={1} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>nUMI 底部过滤分位数</span>
                      <Tooltip content="变量: umi_min_pct\n\n基于全群细胞UMI总数(nCount_RNA)分布计算下限截取分位。0 意味着不裁选，0.05 代表去除总体 UMI 最小的那 5% 的低质量游离碎片。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.umi_min_pct as number} onChange={(e) => updateParam("umi_min_pct", Number(e.target.value))} min={0} max={1} step={0.01} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>nUMI 顶部过滤分位数</span>
                      <Tooltip content="变量: umi_max_pct\n\n基于全群细胞UMI总数分布计算上限截取分位。1 意味着不裁选，0.95 代表去除总体 UMI 极高极异常的那 5% 的双细胞复合体。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.umi_max_pct as number} onChange={(e) => updateParam("umi_max_pct", Number(e.target.value))} min={0} max={1} step={0.01} className={inputCls} style={inputStyle} />
                  </div>
                </>
              )}

              {step.id === "normalize" && (
                <p className="text-xs" style={{ color: "var(--clr-text-muted)" }}>使用 SCTransform + glmGamPoi 方法进行标准化。需要先完成数据预处理 (Step 1)。</p>
              )}

              {step.id === "reduce" && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>降维方法</span>
                      <Tooltip content="变量: method\n\n在高维基因空间内降维映射的算法。\nUMAP / t-SNE 注重局部近邻结构的非线性拓扑保留，适合可视化；PCA 则是寻找全局方差最大的线性组合，常作为前置步骤计算。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <select value={stepParams.method as string} onChange={(e) => updateParam("method", e.target.value)} className={selectCls} style={selectStyle}>
                      <option value="umap">UMAP</option><option value="tsne">t-SNE</option><option value="pca">PCA</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>PCA 维度</span>
                      <Tooltip content="变量: n_pcs\n\n参与下游降维和聚类的主成分(Principal Components)数量。\n截取前列的主要维度可去除背景技术噪音(Dropout/技术变异)，保留起主要作用的生物学异质性。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.n_pcs as number} onChange={(e) => updateParam("n_pcs", Number(e.target.value))} min={2} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>分组方式</label>
                    <div className="flex gap-4">
                      {["Sample", "Group"].map((v) => (
                        <label key={v} className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: "var(--clr-text)" }}>
                          <input type="radio" name="group_by" value={v} checked={stepParams.group_by === v} onChange={() => updateParam("group_by", v)} className="accent-[#C86019]" />
                          {v === "Sample" ? "样本" : "处理组"}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step.id === "cluster" && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>校正方法</span>
                      <Tooltip content="变量: method\n\nHarmony 是目前最流行的单细胞批次校正算法，速度快、效果好。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <select value={stepParams.method as string} onChange={(e) => updateParam("method", e.target.value)} className={selectCls} style={selectStyle}><option value="harmony">Harmony</option></select>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>降维维度</span>
                      <Tooltip content="变量: n_dims\n\nPCA/Harmony 使用的维度数，通常 20~30 维。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.n_dims as number} onChange={(e) => updateParam("n_dims", Number(e.target.value))} min={2} max={50} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>批次校正分组</span>
                      <Tooltip content="变量: group_by\n\n指定按哪个元数据字段进行批次校正。通常选 Sample（样本）或 group（处理组）。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <div className="flex gap-4">
                      {["Sample", "group"].map((v) => (
                        <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--clr-text)" }}>
                          <input type="radio" name="cluster_group_by" value={v} checked={(stepParams.group_by ?? "Sample") === v} onChange={() => updateParam("group_by", v)} className="accent-[#C86019]" />
                          {v === "Sample" ? "样本" : "处理组"}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>聚类分辨率</span>
                      <Tooltip content="变量: resolution\n\n决定 SNN 图聚类敏感度。数值越大细胞亚群越细密（0.8+）；数值越小划分越粗放（0.2）。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="range" min="0" max="2" step="0.01" value={stepParams.resolution as number} onChange={(e) => updateParam("resolution", Number(e.target.value))} className="w-full accent-[#C86019]" />
                    <div className="flex justify-between text-[10px]" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>
                      <span>0</span><span style={{ color: "var(--clr-amber)",fontWeight:600 }}>{stepParams.resolution as number}</span><span>2</span>
                    </div>
                  </div>
                </>
              )}

              {step.id === "markers" && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>最小细胞比例</span>
                      <Tooltip content="变量: min_pct\n\n设定只在各对比组内最少 x% 分数的细胞中表达的基因才会参与统计检验。这极大提高了运算速度，屏蔽了纯属技术噪音的散发基因。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.min_pct as number} onChange={(e) => updateParam("min_pct", Number(e.target.value))} min={0} max={1} step={0.01} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>log2FC 阈值</span>
                      <Tooltip content="变量: logfc_threshold\n\n两簇间平均基因表达量差异(以2为底的对数折叠变化)。差异绝对值必须超过此限制才被定性为差异表达基因(DEG)。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.logfc_threshold as number} onChange={(e) => updateParam("logfc_threshold", Number(e.target.value))} step={0.05} className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>检验方法</label>
                    <select value={stepParams.test_use as string} onChange={(e) => updateParam("test_use", e.target.value)} className={selectCls} style={selectStyle}>
                      <option value="wilcox">Wilcoxon</option><option value="t">t-test</option><option value="bimod">Bimod</option><option value="roc">ROC</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>Top 基因数 (ntop)</span>
                      <Tooltip content="变量: ntop\n\n决定在「热图」和「点图」中提取每个簇的前多少个最显著基因进行展示（默认: 5）。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <input type="number" value={stepParams.ntop as number ?? 5} onChange={(e) => updateParam("ntop", Number(e.target.value))} min={1} max={50} className={inputCls} style={inputStyle} />
                  </div>
                </>
              )}

              {step.id === "enrich" && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                      <span>富集通路</span>
                      <Tooltip content="变量: pathway\n\n基因集富集的参考生命网络。\nGO：基因本体论(生物功能注释)；\nKEGG：系统互作的代谢信号通路；\nGSEA：无需过滤直接评估基因阵列在通路的整体偏移程度。">
                        <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                      </Tooltip>
                    </label>
                    <select value={stepParams.pathway as string} onChange={(e) => updateParam("pathway", e.target.value)} className={selectCls} style={selectStyle}>
                      <option value="GO">GO</option><option value="KEGG">KEGG</option><option value="GSEA">GSEA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>基因方向</label>
                    <div className="flex gap-4">
                      {["Up", "Down"].map((v) => (
                        <label key={v} className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: "var(--clr-text)" }}>
                          <input type="radio" name="direction" value={v} checked={stepParams.direction === v} onChange={() => updateParam("direction", v)} className="accent-[#C86019]" /> {v}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step.id === "marker_expr" && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>Marker 基因文件</label>
                  <label className="flex items-center justify-center gap-2 w-full py-2 bg-white cursor-pointer hover:shadow-sm transition-all text-xs border border-dashed rounded" style={{ borderColor: 'var(--clr-border)', color: 'var(--clr-text-muted)' }}>
                    <IconUpload size={14} className="text-[#C86019]" />
                    <span>上传 Marker 列表 (.txt)</span>
                    <input type="file" accept=".txt" className="hidden" />
                  </label>
                </div>
              )}

              {step.id === "annotate" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>注释方式</label>
                    <div className="flex gap-4">
                      {[{ v: "auto", l: "自动注释" }, { v: "manual", l: "手动注释" }].map(({ v, l }) => (
                        <label key={v} className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: "var(--clr-text)" }}>
                          <input type="radio" name="anno_mode" value={v} checked={stepParams.mode === v} onChange={() => updateParam("mode", v)} className="accent-[#C86019]" /> {l}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>分组方式</label>
                    <select value={stepParams.group_by as string} onChange={(e) => updateParam("group_by", e.target.value)} className={selectCls} style={selectStyle}>
                      <option value="Sample">Sample</option><option value="Group">Group</option><option value="CellType">CellType</option>
                    </select>
                  </div>
                </>
              )}

              {error && <div className="callout callout-danger text-xs">{error}</div>}

              <button
                onClick={handleSubmit}
                disabled={submitting || !project || (step.id === "qc" && !uploadedFile)}
                className="w-full py-2.5 text-white font-semibold rounded text-sm transition-all duration-300 shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: submitting || !project || (step.id === "qc" && !uploadedFile) ? "var(--clr-dark-light)" : "var(--clr-amber)" }}
              >
                {submitting ? (
                  <><svg className="w-4 h-4" viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite" }}><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> 提交中...</>
                ) : (
                  <>▶ 执行{step.label}</>
                )}
              </button>

              {!project && <p className="text-[10px] text-center" style={{ color: "var(--clr-text-faint)" }}>请先在顶部选择一个项目</p>}
              {project && step.id === "qc" && !uploadedFile && <p className="text-[10px] text-center" style={{ color: "var(--clr-warn)" }}>请先上传 .rds 数据文件</p>}
            </div>
          </div>

          {/* Results Panel — 动态扩展 */}
          <div style={{ flex: 1, transition: 'flex 0.45s cubic-bezier(0.4,0,0.2,1)' }}>
            <div className="card p-6 min-h-[500px]">
              <div className="section-header mb-4" style={{ paddingBottom: "10px" }}>
                <div className="section-num">{step.num}</div>
                <div className="flex-1 flex items-center justify-between">
                  <div className="section-title">{step.label} — 结果</div>
                  {/* 完成胶囊标志 */}
                  {currentTask?.status === 'completed' && (
                    <span
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: '#E6F6ED', color: '#2D8A56', border: '1px solid #C3E6D1' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      完成
                      {currentTask.completed_at && (
                        <span style={{ color: '#5BAD82', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                          {new Date(currentTask.completed_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </span>
                  )}
                  {currentTask?.status === 'failed' && (
                    <span
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: '#FFF3F3', color: '#B85450', border: '1px solid #F5C6C6' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      失败
                    </span>
                  )}
                </div>
              </div>

              {currentTaskId && currentTask?.status !== 'completed' && currentTask?.status !== 'failed' && (
                <div className="mb-6">
                  <ProgressTracker taskId={currentTaskId} stepLabel={step.label} onComplete={handleTaskComplete} onError={handleTaskError} />
                </div>
              )}

              <ResultViewer task={currentTask} stepLabel={step.label} StepIcon={step.Icon} taskCache={taskCache} />

              {/* 底部导航 — 仅在当前步骤有任务时显示 */}
              {hasTaskForStep && (
                <div className="mt-6 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--clr-border)' }}>
                  <button
                    onClick={() => clearTaskCache(step.id)}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded transition-all duration-200 hover:shadow-sm"
                    style={{ color: 'var(--clr-amber-dark)', border: '1px solid var(--clr-border)', background: 'rgba(200,96,25,0.04)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    返回参数设置
                  </button>

                  {activeStep < STEPS.length - 1 && currentTask?.status === 'completed' && (
                    <button
                      onClick={() => {
                        setActiveStep((prev) => prev + 1);
                        setError(null);
                      }}
                      className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white rounded transition-all duration-200 hover:shadow-md"
                      style={{ background: 'var(--clr-amber)' }}
                    >
                      下一步: {STEPS[activeStep + 1].label}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="p-8" style={{ color: "var(--clr-text-muted)" }}>加载中...</div>}>
      <AnalysisPageContent />
    </Suspense>
  );
}
