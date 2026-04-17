/**
 * scCloud v2 — 分析结果可视化组件
 * 实时从后端 API (/api/tasks/{id}/result) 获取真实数据并渲染。
 * 各步骤均使用 R 引擎运算后返回的结构化 JSON，不再依赖 Demo 数据。
 *
 * 懒加载策略：
 *  - qc       → QCResultTabs 自管理（文字统计，无大图）
 *  - normalize → 自动加载（只有统计数字，无大图表，无需按钮）
 *  - 其他     → 用户点击"加载可视化结果"后再 fetch（防止大数据崩溃）
 */
"use client";

import React, { Component, type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";
import { type Task } from "../lib/api";
import QCResultTabs from "./QCResultTabs";
import {
  ScatterPlot,
  DeckScatterPlot,
  ViolinPlot,
  EnrichBubble,
  type ScatterData,
  type EnrichData,
} from "./charts";

/* ===== Error Boundary — 防止图表报错崩溃整页 ===== */

interface EBState { hasError: boolean; message: string }
class ResultErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err?.message ?? "未知错误" };
  }
  componentDidCatch() { /* 可接入 Sentry */ }
  render() {
    if (this.state.hasError) {
      return (
        <div className="callout callout-danger text-xs p-4 space-y-1">
          <p className="font-semibold">⚠ 可视化渲染出错</p>
          <p style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{this.state.message}</p>
          <button
            className="mt-2 px-3 py-1 text-xs rounded text-white"
            style={{ background: "var(--clr-amber)" }}
            onClick={() => this.setState({ hasError: false, message: "" })}
          >重新加载</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 安全提取散点数据（兼容 R 返回的大小写 x/X，以及 jsonlite 数组格式） */
function safeScatter(raw: unknown): ScatterData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const x = (r.x ?? r.X) as number[] | undefined;
  const y = (r.y ?? r.Y) as number[] | undefined;
  const cluster = (r.cluster ?? r.Cluster ?? r.label) as string[] | undefined;
  if (!Array.isArray(x) || !Array.isArray(y)) return undefined;
  return { x, y, cluster: Array.isArray(cluster) ? cluster : x.map(() => "0") };
}

/**
 * 安全提取字符串字段 —— R jsonlite 可能把单元素向量序列化为 ["path"] 数组。
 * 统一取第一个元素或直接返回字符串。
 */
function safeString(val: unknown): string | undefined {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0] as string;
  return undefined;
}

/** 随机降采样散点数据到 maxN 个点，防止大数据集导致渲染崩溃 */
function downsampleScatter(data: ScatterData, maxN = 3000): ScatterData {
  if (data.x.length <= maxN) return data;
  const step = Math.ceil(data.x.length / maxN);
  const x: number[] = [];
  const y: number[] = [];
  const cluster: string[] = [];
  for (let i = 0; i < data.x.length; i += step) {
    x.push(data.x[i]);
    y.push(data.y[i]);
    cluster.push(data.cluster[i]);
  }
  return { x, y, cluster };
}

/**
 * 带 Bearer token 认证的图片组件。
 * 浏览器 <img> 标签无法传 Authorization header，
 * 改用 fetch 拉取 blob 后转为对象 URL 注入 <img>。
 */
function AuthImg({ src, alt, className, style }: {
  src: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed]   = useState(false);

  useEffect(() => {
    if (!src) return;
    let objectUrl = "";
    setFailed(false);
    setBlobUrl(null);
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); })
      .catch(() => setFailed(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);

  if (!src || failed) return <div className="callout text-xs py-6 text-center" style={{ color: "var(--clr-text-faint)" }}>图片暂不可用（请重新运行该步骤）</div>;
  if (!blobUrl) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 rounded-full border-t-transparent animate-spin" style={{ borderColor: "var(--clr-amber)", borderTopColor: "transparent" }} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}

/** 
 * 带 Bearer token 的文件下载按钮组件。
 */
function AuthDownloadLink({ url, filename, className, style, children }: { url: string, filename: string, className?: string, style?: React.CSSProperties, children: React.ReactNode }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("下载失败");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert("文件获取失败，可能是不存在或已经过期");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button onClick={handleDownload} disabled={downloading} className={className} style={style}>
      {downloading ? <span className="opacity-70 flex items-center gap-1"><span className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"></span> 下载中...</span> : children}
    </button>
  );
}

interface ResultViewerProps {
  task: Task | null;
  stepLabel: string;
  StepIcon: ComponentType<{ className?: string; size?: number }>;
  taskCache?: Record<string, Task>;
}

/** 从 localStorage 读取 token */
function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("access_token") || "";
}

/** 获取任务结果 JSON */
async function fetchTaskResult(taskId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/tasks/${taskId}/result`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 由于 WebGL 重构提升了性能，现在所有有步骤均自动加载结果数据
// 不再需要显式点击加载图表按钮。

export default function ResultViewer({ task, stepLabel, StepIcon, taskCache }: ResultViewerProps) {
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  // 自动加载：任务完成后触发
  const [resultRequested, setResultRequested] = useState(false);

  useEffect(() => {
    // task 变化时重置（切换步骤 / 新任务提交时清空）
    setResultData(null);
    setResultRequested(false);
  }, [task?.id]);

  // 所有完成的任务自动加载结果数据
  useEffect(() => {
    if (task?.status === "completed" && task.step) {
      setResultRequested(true);
    }
  }, [task?.id, task?.status, task?.step]);

  useEffect(() => {
    if (!resultRequested) return;
    if (!task || task.status !== "completed") return;
    // QC 步骤由 QCResultTabs 自行管理
    if (task.step === "qc") return;
    setLoadingResult(true);
    fetchTaskResult(task.id).then((data) => {
      setResultData(data);
      setLoadingResult(false);
    });
  }, [resultRequested, task?.id, task?.status, task?.step]);

  /* ── 没有任务 ── */
  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: "var(--clr-text-faint)" }}>
        <StepIcon size={48} className="mb-4 opacity-20" />
        <p className="text-sm">选择参数并点击执行按钮开始分析</p>
        <p className="text-xs mt-2" style={{ color: "var(--clr-border)" }}>结果将显示在此区域</p>
      </div>
    );
  }

  /* ── 任务进行中 ── */
  if (task.status === "pending" || task.status === "running") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 border-2 rounded-full" style={{ borderColor: "var(--clr-border)" }} />
          <div
            className="absolute inset-0 border-2 rounded-full border-t-transparent"
            style={{ borderColor: "var(--clr-amber)", borderTopColor: "transparent", animation: "spin 1s linear infinite" }}
          />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--clr-amber)" }}>正在执行 {stepLabel}...</p>
        <p className="text-xs mt-2" style={{ color: "var(--clr-text-faint)" }}>{task.progress > 0 ? `进度: ${task.progress}%` : "初始化中..."}</p>
      </div>
    );
  }

  /* ── 任务失败 ── */
  if (task.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 mb-4 rounded-full flex items-center justify-center" style={{ background: "#FFF3F3", color: "var(--clr-danger)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </div>
        <p className="text-sm font-medium mb-2" style={{ color: "var(--clr-danger)" }}>分析失败</p>
        <div className="max-w-md text-center">
          <div className="callout callout-danger text-xs font-mono break-all">{task.error_msg || "未知错误"}</div>
        </div>
        <p className="text-xs mt-4" style={{ color: "var(--clr-text-faint)" }}>请检查参数后重试</p>
      </div>
    );
  }

  /* ── 任务完成 ── */
  const needsResultData = !["qc"].includes(task.step);

  return (
    <ResultErrorBoundary>
      <div className="space-y-4 animate-fade-in">
        {/* QC 步骤直接渲染 tabs，不需要懒加载按钮 */}
        {task.step === "qc" && (
          <QCResultTabs taskId={task.id} token={getToken()} />
        )}

        {needsResultData && resultRequested && loadingResult && (
          <div className="flex items-center gap-2 py-12 justify-center" style={{ color: "var(--clr-text-faint)" }}>
            <div className="w-4 h-4 border-2 rounded-full border-t-transparent animate-spin" style={{ borderColor: "var(--clr-amber)", borderTopColor: "transparent" }} />
            <span className="text-xs">加载可视化数据...</span>
          </div>
        )}

        {/* ── 非 QC 步骤：数据加载后渲染 ── */}
        {needsResultData && resultRequested && !loadingResult && (
          <>
            {task.step === "normalize" && resultData && <NormalizeResult data={resultData} />}
            {task.step === "reduce"    && <ReduceResult data={resultData} taskId={task.id} />}
            {task.step === "cluster"   && <ClusterResult data={resultData} taskId={task.id} />}
            {task.step === "markers"   && <MarkersResult data={resultData} task={task} taskCache={taskCache} />}
            {task.step === "enrich"    && <EnrichResult data={resultData} taskId={task.id} />}
            {!["qc","normalize","reduce","cluster","markers","enrich"].includes(task.step) && (
              <div className="callout text-xs">分析完成，详细结果可在输出文件中查看</div>
            )}
          </>
        )}
      </div>
    </ResultErrorBoundary>
  );
}

/* ===================================================
   各步骤专属结果子组件
=================================================== */

/** 标准化结果 */
function NormalizeResult({ data }: { data: Record<string, unknown> }) {
  const stats = data.stats as { cells?: number; genes?: number; assays?: string[] } | undefined;
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "细胞数", value: stats?.cells?.toLocaleString() ?? "—" },
        { label: "基因数", value: stats?.genes?.toLocaleString() ?? "—" },
        { label: "Assays", value: (stats?.assays ?? []).join(", ") || "—" },
      ].map((item) => (
        <div key={item.label} className="p-3 rounded text-center" style={{ background: "var(--clr-bg-alt)", border: "1px solid var(--clr-border)" }}>
          <p className="text-lg font-bold" style={{ color: "var(--clr-amber)" }}>{item.value}</p>
          <p className="text-xs mt-1" style={{ color: "var(--clr-text-faint)" }}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/** 降维结果 — deck.gl 交互式散点图（主），R PNG 可下载 */
function ReduceResult({ data, taskId }: { data: Record<string, unknown> | null; taskId?: string }) {
  const stats   = data?.stats as { method?: string; cells?: number; n_dims?: number } | undefined;
  const method  = (safeString(stats?.method) ?? "UMAP").toUpperCase();

  // R 原版 PNG（保留为可下载备选）
  const plotPath    = safeString(data?.plot_path);
  const plotFileName = plotPath ? plotPath.split("/").pop() : null;
  const plotSrc     = plotFileName && taskId
    ? `/api/tasks/${taskId}/plot?name=${encodeURIComponent(plotFileName)}`
    : null;

  // deck.gl 交互式散点图数据（主展示）
  const rawScatter = useMemo(() => safeScatter(data?.scatter_data), [data]);

  return (
    <div className="space-y-3">
      {/* 统计信息 */}
      {stats && (
        <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--clr-text-faint)" }}>
          <span>方法：<strong style={{ color: "var(--clr-amber)" }}>{method}</strong></span>
          <span>细胞数：<strong style={{ color: "var(--clr-text)" }}>{stats.cells?.toLocaleString()}</strong></span>
          {stats.n_dims && <span>PCA 维数：<strong style={{ color: "var(--clr-text)" }}>{stats.n_dims}</strong></span>}
        </div>
      )}
      {/* deck.gl 交互式散点图（主展示） */}
      {rawScatter ? (
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: "var(--clr-amber-dark)" }}>
            {method} 可视化
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>
              — WebGL 交互式 · {rawScatter.x.length.toLocaleString()} 个细胞
            </span>
          </p>
          <DeckScatterPlot data={rawScatter} method={method as "UMAP" | "tSNE" | "PCA"} height={520} />
        </div>
      ) : plotSrc ? (
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: "var(--clr-amber-dark)" }}>
            {method} 可视化
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>— R ggplot2 原版输出</span>
          </p>
          <AuthImg
            src={plotSrc}
            alt={`${method} reduction plot`}
            className="w-full rounded border"
            style={{ border: "1px solid var(--clr-border)", background: "#fff" }}
          />
        </div>
      ) : (
        <div className="callout text-xs">降维完成，但坐标数据暂未返回</div>
      )}
      {/* R PNG 下载按钮 */}
      {plotSrc && rawScatter && (
        <AuthDownloadLink
          url={plotSrc}
          filename={plotFileName || "reduce_plot.png"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors"
          style={{ background: "var(--clr-bg-alt)", color: "var(--clr-amber-dark)", border: "1px solid var(--clr-border)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          下载 R 原版高清图 (.png)
        </AuthDownloadLink>
      )}
    </div>
  );
}

/** 聚类结果 — 完整展示原版 R 脚本所有输出 */
function ClusterResult({ data, taskId }: { data: Record<string, unknown> | null; taskId?: string }) {
  // ── 统计 ──
  const stats = data?.stats as { clusters?: number; cluster_levels?: string[]; cells?: number } | undefined;

  // ── 图片 URL 构建 ──
  const mkSrc = (name: string) => taskId ? `/api/tasks/${taskId}/plot?name=${encodeURIComponent(name)}` : null;
  const umapSrc   = mkSrc("plot_cluster.png");         // my_distPlot5: Cluster UMAP
  const sankeySrc = mkSrc("plot_cluster_sankey.png");  // my_distPlot4: 样本 Cluster 占比图
  const groupSrc  = mkSrc("plot_cluster_group.png");   // my_distPlot6: 分组 UMAP

  // ── 表格数据 ──
  type FreqRow = { Cluster?: string; Sample?: string; CellNumber?: number; Freq?: number };
  const clusterNum = (data?.cluster_num ?? []) as FreqRow[];
  const freqTable  = (data?.freq_table   ?? []) as FreqRow[];

  // ── deck.gl 交互式散点图数据 ──
  const rawScatter = useMemo(() => safeScatter(data?.scatter_data), [data]);

  // ── Tab 状态 ──
  type TabId = "interactive" | "stats" | "sankey" | "umap" | "group" | "subtype";
  const [activeTab, setActiveTab] = useState<TabId>("interactive");
  const tabs: { id: TabId; label: string }[] = [
    { id: "interactive", label: "🔬 交互式 UMAP" },
    { id: "stats",   label: "结果统计" },
    { id: "sankey",  label: "样本占比图" },
    { id: "umap",    label: "R 原版 UMAP" },
    { id: "group",   label: "分组 UMAP" },
    { id: "subtype", label: "细胞亚类" },
  ];

  // ── 子标题工具 ──
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs font-semibold mb-2" style={{ color: "var(--clr-amber-dark)" }}>{children}
      <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>— R ggplot2 原版输出</span>
    </p>
  );

  return (
    <div className="space-y-4">
      {/* ── 顶部概览胶囊 ── */}
      {stats && (
        <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--clr-text-faint)" }}>
          <span>细胞数：<strong style={{ color: "var(--clr-text)" }}>{stats.cells?.toLocaleString()}</strong></span>
          <span>聚类数：<strong style={{ color: "var(--clr-amber)", fontSize: "1rem" }}>{stats.clusters ?? "—"}</strong></span>
          <span className="break-all">聚类标签：<strong style={{ color: "var(--clr-text)" }}>{(stats.cluster_levels ?? []).join(" · ")}</strong></span>
        </div>
      )}

      {/* ── Tab 导航 ── */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-all"
            style={activeTab === t.id
              ? { background: "var(--clr-amber)", color: "#fff", boxShadow: "0 0 8px rgba(200,96,25,0.4)" }
              : { background: "transparent", color: "var(--clr-text-muted)", border: "1px solid var(--clr-border)" }
            }
          >{t.label}</button>
        ))}
      </div>

      {/* ── Tab 0: 交互式 UMAP（deck.gl WebGL） ── */}
      {activeTab === "interactive" && (
        <div className="space-y-1 animate-fade-in">
          {rawScatter ? (
            <>
              <p className="text-xs font-medium" style={{ color: "var(--clr-amber-dark)" }}>
                Cluster UMAP 图
                <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>
                  — WebGL 交互式 · {rawScatter.x.length.toLocaleString()} 个细胞
                </span>
              </p>
              <DeckScatterPlot data={rawScatter} method="UMAP" height={560} />
            </>
          ) : (
            <div className="callout text-xs">散点数据未返回，请查看"R 原版 UMAP"标签页</div>
          )}
        </div>
      )}

      {/* ── Tab 1: 结果统计 ── */}
      {activeTab === "stats" && (
        <div className="space-y-5">
          {/* 样本聚类数目统计 */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--clr-amber-dark)" }}>样本聚类数目统计
              <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>— my_cluster_num1()</span>
            </p>
            {clusterNum.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cluster</th><th>Sample</th><th className="text-right">细胞数</th></tr></thead>
                  <tbody>
                    {clusterNum.map((row, i) => (
                      <tr key={i}>
                        <td className="font-mono font-semibold" style={{ color: "var(--clr-amber-dark)" }}>{row.Cluster}</td>
                        <td>{row.Sample}</td>
                        <td className="text-right">{row.CellNumber?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="callout text-xs">数目统计数据暂未返回</div>}
          </div>

          {/* 样本聚类频率统计 */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--clr-amber-dark)" }}>样本聚类频率统计
              <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>— my_freqTable()</span>
            </p>
            {freqTable.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cluster</th><th>Sample</th><th className="text-right">频率</th></tr></thead>
                  <tbody>
                    {freqTable.map((row, i) => (
                      <tr key={i}>
                        <td className="font-mono font-semibold" style={{ color: "var(--clr-amber-dark)" }}>{row.Cluster}</td>
                        <td>{row.Sample}</td>
                        <td className="text-right font-mono">{row.Freq !== undefined ? (row.Freq * 100).toFixed(2) + "%" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="callout text-xs">频率统计数据暂未返回</div>}
          </div>
        </div>
      )}

      {/* ── Tab 2: 样本 Cluster 占比图（my_distPlot4: Sankey + 堆叠柱） ── */}
      {activeTab === "sankey" && (
        <div className="space-y-1">
          <SectionTitle>样本 Cluster 占比图 — Fraction of cell populations (%)</SectionTitle>
          <AuthImg src={sankeySrc} alt="Sample Cluster Proportion"
            className="w-full rounded border" style={{ border: "1px solid var(--clr-border)", background: "#fff" }} />
        </div>
      )}

      {/* ── Tab 3: Cluster UMAP 图（my_distPlot5） ── */}
      {activeTab === "umap" && (
        <div className="space-y-1">
          <SectionTitle>Cluster UMAP 图</SectionTitle>
          <AuthImg src={umapSrc} alt="Cluster UMAP"
            className="w-full rounded border" style={{ border: "1px solid var(--clr-border)", background: "#fff" }} />
        </div>
      )}

      {/* ── Tab 4: 分组 Cluster UMAP 图（my_distPlot6） ── */}
      {activeTab === "group" && (
        <div className="space-y-1">
          <SectionTitle>分组 Cluster UMAP 图</SectionTitle>
          <AuthImg src={groupSrc} alt="Group Cluster UMAP"
            className="w-full rounded border" style={{ border: "1px solid var(--clr-border)", background: "#fff" }} />
        </div>
      )}

      {/* ── Tab 5: 细胞亚类结果（RenameIdents2 后的 cluster 标签） ── */}
      {activeTab === "subtype" && (
        <div className="space-y-2">
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--clr-amber-dark)" }}>细胞亚类结果
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>— RenameIdents2() 聚类命名</span>
          </p>
          {stats?.cluster_levels && stats.cluster_levels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {stats.cluster_levels.map((cl, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(200,96,25,0.08)", color: "var(--clr-amber-dark)", border: "1px solid rgba(200,96,25,0.2)" }}>
                  {cl}
                </span>
              ))}
            </div>
          ) : <div className="callout text-xs">聚类标签数据暂未返回</div>}
          {clusterNum.length > 0 && (
            <div className="mt-3">
              <p className="text-xs mb-1.5" style={{ color: "var(--clr-text-faint)" }}>各亚类细胞总数：</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Cluster</th><th className="text-right">总细胞数</th></tr></thead>
                  <tbody>
                    {Object.entries(
                      clusterNum.reduce((acc, row) => {
                        if (row.Cluster) acc[row.Cluster] = (acc[row.Cluster] || 0) + (row.CellNumber || 0);
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([cluster, total]) => (
                      <tr key={cluster}>
                        <td className="font-mono font-semibold" style={{ color: "var(--clr-amber-dark)" }}>{cluster}</td>
                        <td className="text-right">{total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 数据下载 ── */}
      <div className="pt-4 border-t mt-6" style={{ borderColor: "var(--clr-border)" }}>
        <p className="text-xs font-semibold mb-3" style={{ color: "var(--clr-amber-dark)" }}>结果数据下载</p>
        <div className="flex flex-col gap-2 items-start">
          {['stats', 'subtype'].includes(activeTab) && (
            <>
              <AuthDownloadLink 
                url={mkSrc("seurat_reduced.rds")!} 
                filename="seurat_reduced.rds"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white hover:opacity-90"
                style={{ background: "var(--clr-amber)", boxShadow: "0 2px 4px rgba(200,96,25,0.2)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                数据批次校正后rds文件 (seurat_reduced)
              </AuthDownloadLink>
              <AuthDownloadLink 
                url={mkSrc("seurat_clustered.rds")!} 
                filename="seurat_clustered.rds"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white hover:opacity-90"
                style={{ background: "var(--clr-amber)", boxShadow: "0 2px 4px rgba(200,96,25,0.2)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                数据批次校正后细胞群亚类rds文件 (seurat_clustered)
              </AuthDownloadLink>
            </>
          )}

          {activeTab === 'sankey' && sankeySrc && (
            <AuthDownloadLink 
              url={sankeySrc} 
              filename="plot_cluster_sankey.png"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white hover:opacity-90"
              style={{ background: "var(--clr-amber)", boxShadow: "0 2px 4px rgba(200,96,25,0.2)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载样本 Cluster 占比图 (.png)
            </AuthDownloadLink>
          )}

          {activeTab === 'umap' && umapSrc && (
            <AuthDownloadLink 
              url={umapSrc} 
              filename="plot_cluster.png"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white hover:opacity-90"
              style={{ background: "var(--clr-amber)", boxShadow: "0 2px 4px rgba(200,96,25,0.2)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载 Cluster UMAP 图 (.png)
            </AuthDownloadLink>
          )}

          {activeTab === 'group' && groupSrc && (
            <AuthDownloadLink 
              url={groupSrc} 
              filename="plot_cluster_group.png"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white hover:opacity-90"
              style={{ background: "var(--clr-amber)", boxShadow: "0 2px 4px rgba(200,96,25,0.2)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载分组 Cluster UMAP 图 (.png)
            </AuthDownloadLink>
          )}
        </div>
      </div>
    </div>
  );
}

/** 差异基因结果 */
function MarkersResult({ task, data, taskCache }: { task: Task; data: Record<string, unknown> | null; taskCache?: Record<string, Task> }) {
  type GeneRow = { gene?: string; avg_log2FC?: number; p_val_adj?: number; pct1?: number; pct2?: number };
  const topGenes = (data?.top_genes ?? []) as GeneRow[];
  const stats    = data?.stats as { total_deg?: number; clusters_analyzed?: string } | undefined;

  const dotplotSrc = task ? `/api/tasks/${task.id}/plot?name=plot_markers_dotplot.png` : null;
  const heatmapSrc = task ? `/api/tasks/${task.id}/plot?name=plot_markers_heatmap.png` : null;

  const [activeTab, setActiveTab] = useState(0);
  const TABS = ["全局差异表", "大盘基因图", "单簇特征分布图", "双簇对比表"];

  // 提取 Cluster levels
  const clusterTask = taskCache?.["cluster"];
  const [clusterLevels, setClusterLevels] = useState<string[]>([]);
  
  useEffect(() => {
    if (clusterTask) {
      if (clusterTask.status === "completed" && clusterTask.result_path) {
          fetchTaskResult(clusterTask.id).then(d => {
             if (d?.stats?.cluster_levels) {
                 setClusterLevels(d.stats.cluster_levels as string[]);
             }
          });
      }
    }
  }, [clusterTask?.id]);

  // Tab 3 State
  const [tab3Cluster, setTab3Cluster] = useState<string>("");
  const [tab3TaskId, setTab3TaskId] = useState<string | null>(null);
  const [tab3Loading, setTab3Loading] = useState(false);
  const [tab3Error, setTab3Error] = useState<string | null>(null);
  const [tab3PlotMode, setTab3PlotMode] = useState<'feature' | 'vln'>('feature');

  // Tab 4 State
  const [tab4C1, setTab4C1] = useState<string>("");
  const [tab4C2, setTab4C2] = useState<string>("");
  const [tab4TaskId, setTab4TaskId] = useState<string | null>(null);
  const [tab4Data, setTab4Data] = useState<GeneRow[] | null>(null);
  const [tab4Loading, setTab4Loading] = useState(false);
  const [tab4Error, setTab4Error] = useState<string | null>(null);

  useEffect(() => {
    if (clusterLevels.length > 0) {
       if (!tab3Cluster) setTab3Cluster(clusterLevels[0]);
       if (!tab4C1) setTab4C1(clusterLevels[0]);
       if (!tab4C2) setTab4C2(clusterLevels.length > 1 ? clusterLevels[1] : clusterLevels[0]);
    }
  }, [clusterLevels]);

  const pollTask = async (taskId: string) => {
     const token = getToken();
     while (true) {
       await new Promise(r => setTimeout(r, 2000));
       const res = await fetch(`/api/tasks/${taskId}`, { headers: { Authorization: `Bearer ${token}` }});
       if (!res.ok) throw new Error("获取任务状态失败");
       const t = await res.json();
       if (t.status === "completed") return t;
       if (t.status === "failed") throw new Error(t.error_msg || "任务执行失败");
     }
  };

  const runSubTask = async (step: string, params: any, setLoader: any, setError: any, onSuccess: any) => {
    setLoader(true); setError(null);
    try {
      const token = getToken();
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: task.project_id, step, params })
      });
      if (!res.ok) throw new Error(`提交失败: ${res.statusText}`);
      const t = await res.json();
      const finalTask = await pollTask(t.id);
      
      const rRes = await fetch(`/api/tasks/${t.id}/result`, { headers: { Authorization: `Bearer ${token}` } });
      const finalResult = await rRes.json();
      onSuccess(t.id, finalResult);
    } catch(err: any) {
      setError(err.message);
    } finally {
      setLoader(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b" style={{ borderColor: 'var(--clr-border)' }}>
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2`}
            style={{ 
              borderColor: activeTab === i ? 'var(--clr-amber)' : 'transparent',
              color: activeTab === i ? 'var(--clr-amber-dark)' : 'var(--clr-text-muted)'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {/* Tab 1: 全局差异表 */}
        {activeTab === 0 && (
          <div className="space-y-3 animate-fade-in">
             {stats && (
              <div className="flex gap-4 text-xs" style={{ color: "var(--clr-text-faint)" }}>
                <span>共 <strong style={{ color: "var(--clr-amber)" }}>{stats.total_deg}</strong> 个差异基因</span>
                <span>分析聚类：<strong style={{ color: "var(--clr-text)" }}>{stats.clusters_analyzed}</strong></span>
              </div>
            )}
            {topGenes.length > 0 ? (
              <div className="table-wrap max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-stone-50 shadow-sm z-10">
                    <tr>
                      <th className="py-2 px-3 text-left">Gene</th>
                      <th className="py-2 px-3 text-right">avg_log2FC</th>
                      <th className="py-2 px-3 text-right">p_val_adj</th>
                      <th className="py-2 px-3 text-right">pct.1</th>
                      <th className="py-2 px-3 text-right">pct.2</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGenes.map((row, i) => (
                      <tr key={i} className="border-t border-stone-100 hover:bg-stone-50">
                        <td className="py-2 px-3 font-mono font-semibold" style={{ color: "var(--clr-amber-dark)" }}>{row.gene ?? "—"}</td>
                        <td className="py-2 px-3 text-right">{row.avg_log2FC?.toFixed(3) ?? "—"}</td>
                        <td className="py-2 px-3 text-right font-mono text-xs">{row.p_val_adj !== undefined ? row.p_val_adj.toExponential(2) : "—"}</td>
                        <td className="py-2 px-3 text-right">{row.pct1?.toFixed(2) ?? "—"}</td>
                        <td className="py-2 px-3 text-right">{row.pct2?.toFixed(2) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="callout text-xs">差异基因表数据暂未返回</div>
            )}
            <div className="mt-4">
              <AuthDownloadLink 
                url={`/api/tasks/${task.id}/plot?name=diff_genes.csv`} 
                filename="diff_genes.csv"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
                style={{ background: "var(--clr-amber)" }}
              >
                下载完整差异基因表 (.csv)
              </AuthDownloadLink>
            </div>
          </div>
        )}

        {/* Tab 2: 大盘基因图 */}
        {activeTab === 1 && (
          <div className="space-y-6 animate-fade-in flex flex-col items-center">
            <div className="w-full flex-col flex items-center">
              <p className="text-sm font-semibold mb-2 self-start" style={{ color: 'var(--clr-text)' }}>各聚类显著差异基因点图 (DotPlot)</p>
              {dotplotSrc && <AuthImg src={dotplotSrc} alt="DotPlot" className="w-full max-w-4xl border rounded shadow-sm" style={{ borderColor: 'var(--clr-border)' }} />}
            </div>
            <div className="w-full h-px" style={{ background: 'var(--clr-border)' }}></div>
            <div className="w-full flex-col flex items-center">
              <p className="text-sm font-semibold mb-2 self-start" style={{ color: 'var(--clr-text)' }}>各聚类显著差异基因热图 (Heatmap) (需要 ntop 增加才有明显表现)</p>
              {heatmapSrc && <AuthImg src={heatmapSrc} alt="Heatmap" className="w-full max-w-4xl border rounded shadow-sm" style={{ borderColor: 'var(--clr-border)' }} />}
            </div>
          </div>
        )}

        {/* Tab 3: 单簇特征图 */}
        {activeTab === 2 && (
          <div className="space-y-4 animate-fade-in">
             <div className="flex items-center gap-4 bg-stone-50 p-3 rounded border" style={{ borderColor: 'var(--clr-border)' }}>
               <label className="text-sm font-medium" style={{ color: 'var(--clr-text-muted)' }}>选择聚类群:</label>
               <select 
                 value={tab3Cluster} 
                 onChange={e => setTab3Cluster(e.target.value)}
                 className="px-2 py-1 text-sm border rounded focus:outline-none"
                 style={{ borderColor: 'var(--clr-border)' }}
               >
                 {clusterLevels.map(c => <option key={c} value={c}>Cluster {c}</option>)}
               </select>
               <button 
                 onClick={() => runSubTask("plot_markers", { cluster: tab3Cluster, ...task.params }, setTab3Loading, setTab3Error, (tid: string) => setTab3TaskId(tid))}
                 disabled={tab3Loading}
                 className="px-3 py-1 text-white text-sm rounded shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                 style={{ background: 'var(--clr-amber)' }}
               >
                 {tab3Loading ? "计算中..." : "生成表达特征图"}
               </button>
             </div>
             
             {tab3Error && <div className="callout callout-danger text-xs">{tab3Error}</div>}
             
             {tab3TaskId && !tab3Loading && !tab3Error && (
               <div className="mt-4 w-full animate-fade-in">
                 {/* 子标题切换按钮 */}
                 <div className="flex gap-2 mb-4">
                   {([['feature', 'FeaturePlot 特征图 (UMAP)'], ['vln', 'VlnPlot 小提琴图 (Expression)']] as const).map(([mode, label]) => (
                     <button
                       key={mode}
                       onClick={() => setTab3PlotMode(mode)}
                       className="px-3 py-1.5 text-xs font-medium rounded-full transition-all"
                       style={tab3PlotMode === mode
                         ? { background: 'var(--clr-amber)', color: '#fff', boxShadow: '0 2px 8px rgba(200,96,25,0.3)' }
                         : { background: 'rgba(200,96,25,0.06)', color: 'var(--clr-text-muted)', border: '1px solid var(--clr-border)' }
                       }
                     >{label}</button>
                   ))}
                 </div>
                 {/* FeaturePlot */}
                 {tab3PlotMode === 'feature' && (
                   <AuthImg 
                     src={`/api/tasks/${tab3TaskId}/plot?name=${encodeURIComponent(`plot_markers_feature_${tab3Cluster}.png`)}`} 
                     alt={`Feature Plot ${tab3Cluster}`} 
                     className="w-full max-w-4xl border rounded shadow-sm bg-white mx-auto block" 
                   />
                 )}
                 {/* VlnPlot */}
                 {tab3PlotMode === 'vln' && (
                   <AuthImg 
                     src={`/api/tasks/${tab3TaskId}/plot?name=${encodeURIComponent(`plot_markers_vln_${tab3Cluster}.png`)}`} 
                     alt={`Vln Plot ${tab3Cluster}`} 
                     className="w-full max-w-4xl border rounded shadow-sm bg-white mx-auto block" 
                   />
                 )}
               </div>
             )}
          </div>
        )}

        {/* Tab 4: 二簇对比 */}
        {activeTab === 3 && (
          <div className="space-y-4 animate-fade-in">
             <div className="flex items-center gap-4 bg-stone-50 p-3 rounded border" style={{ borderColor: 'var(--clr-border)' }}>
               <label className="text-sm font-medium" style={{ color: 'var(--clr-text-muted)' }}>组一 (Group 1):</label>
               <select value={tab4C1} onChange={e => setTab4C1(e.target.value)} className="px-2 py-1 text-sm border rounded">
                 {clusterLevels.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
               <span className="text-stone-400 font-bold">vs</span>
               <label className="text-sm font-medium" style={{ color: 'var(--clr-text-muted)' }}>组二 (Group 2):</label>
               <select value={tab4C2} onChange={e => setTab4C2(e.target.value)} className="px-2 py-1 text-sm border rounded">
                 {clusterLevels.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
               <button 
                 onClick={() => runSubTask("markers_pairwise", { cluster_1: tab4C1, cluster_2: tab4C2, ...task.params }, setTab4Loading, setTab4Error, (tid: string, res: any) => {
                     setTab4TaskId(tid);
                     setTab4Data((res.top_genes ?? []) as GeneRow[]);
                 })}
                 disabled={tab4Loading || tab4C1 === tab4C2}
                 className="px-3 py-1 text-white text-sm rounded shadow-sm hover:opacity-90 disabled:opacity-50"
                 style={{ background: 'var(--clr-amber)' }}
               >
                 {tab4Loading ? "对比计算中..." : "进行成对差异分析"}
               </button>
             </div>
             
             {tab4Error && <div className="callout callout-danger text-xs">{tab4Error}</div>}
             {tab4C1 === tab4C2 && <div className="text-xs text-stone-500">（请选择两个不同的组进行对比）</div>}
             
             {tab4TaskId && !tab4Loading && !tab4Error && tab4Data && (
               <div className="animate-fade-in">
                 <div className="flex gap-4 text-xs mb-3" style={{ color: "var(--clr-text-faint)" }}>
                   <span>分析对：<strong style={{ color: "var(--clr-text)" }}>{tab4C1} vs {tab4C2}</strong></span>
                 </div>
                 <div className="table-wrap max-h-96 overflow-y-auto mb-4">
                   <table className="w-full">
                     <thead className="sticky top-0 bg-stone-50 shadow-sm z-10">
                       <tr>
                         <th className="py-2 px-3 text-left">Gene</th>
                         <th className="py-2 px-3 text-right">avg_log2FC</th>
                         <th className="py-2 px-3 text-right">p_val_adj</th>
                         <th className="py-2 px-3 text-right">pct.1</th>
                         <th className="py-2 px-3 text-right">pct.2</th>
                       </tr>
                     </thead>
                     <tbody>
                       {tab4Data.map((row, i) => (
                         <tr key={i} className="border-t border-stone-100 hover:bg-stone-50">
                           <td className="py-2 px-3 font-mono font-semibold" style={{ color: "var(--clr-amber-dark)" }}>{row.gene ?? "—"}</td>
                           <td className="py-2 px-3 text-right">{row.avg_log2FC?.toFixed(3) ?? "—"}</td>
                           <td className="py-2 px-3 text-right font-mono text-xs">{row.p_val_adj !== undefined ? row.p_val_adj.toExponential(2) : "—"}</td>
                           <td className="py-2 px-3 text-right">{row.pct1?.toFixed(2) ?? "—"}</td>
                           <td className="py-2 px-3 text-right">{row.pct2?.toFixed(2) ?? "—"}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
                 <AuthDownloadLink 
                   url={`/api/tasks/${tab4TaskId}/plot?name=${encodeURIComponent(`diff_genes_${tab4C1}_vs_${tab4C2}.csv`)}`} 
                   filename={`diff_genes_${tab4C1}_vs_${tab4C2}.csv`}
                   className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors text-white"
                   style={{ background: "var(--clr-amber)" }}
                 >
                   下载成对差异基因表 (.csv)
                 </AuthDownloadLink>
               </div>
             )}
          </div>
        )}

      </div>
    </div>
  );
}

/** 富集分析结果 — 严格依赖 R 原版脚本输出，展示 ggplot2 图 */
function EnrichResult({ data, taskId }: { data: Record<string, unknown> | null; taskId?: string }) {
  const enrichData = data?.enrich_data as EnrichData | undefined;
  const stats      = data?.stats as { pathway?: string; direction?: string; significant_terms?: number } | undefined;

  // 安全提取 plot_path：R jsonlite 有时将单元素向量序列化为 ["path"] 数组
  const plotPath    = safeString(data?.plot_path);
  const plotFileName = plotPath ? plotPath.split("/").pop() : null;
  const plotSrc = plotFileName && taskId
    ? `/api/tasks/${taskId}/plot?name=${encodeURIComponent(plotFileName)}`
    : null;

  const csvFileName = plotFileName
    ? plotFileName.replace("plot_enrich_", "enrich_").replace(".png", ".csv")
    : null;
  const csvSrc = csvFileName && taskId
    ? `/api/tasks/${taskId}/plot?name=${encodeURIComponent(csvFileName)}`
    : null;

  return (
    <div className="space-y-4">
      {/* 摘要 stats */}
      {stats && (
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--clr-text-faint)" }}>
          <span>通路数据库：<strong style={{ color: "var(--clr-amber)" }}>{stats.pathway}</strong></span>
          <span>基因方向：<strong style={{ color: "var(--clr-text)" }}>{stats.direction}</strong></span>
          <span>显著通路：<strong style={{ color: stats.significant_terms ? "var(--clr-amber)" : "var(--clr-text-faint)" }}>
            {stats.significant_terms ?? 0} 条
          </strong></span>
        </div>
      )}

      {/* R 原版 ggplot2 图（主展示） */}
      {plotSrc ? (
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: "var(--clr-amber-dark)" }}>
            富集分析图
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>
              — R ggplot2 原版输出（{stats?.pathway} {stats?.direction}）
            </span>
          </p>
          <AuthImg
            src={plotSrc}
            alt={`${stats?.pathway} ${stats?.direction} enrichment plot`}
            className="w-full rounded border"
            style={{ border: "1px solid var(--clr-border)", background: "#fff" }}
          />
          {/* 下载 CSV 链接 */}
          {csvSrc && (
            <a
              href={csvSrc}
              download={csvFileName ?? "enrich_result.csv"}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors"
              style={{ color: "var(--clr-amber-dark)", border: "1px solid var(--clr-border)", background: "rgba(200,96,25,0.04)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              下载富集结果表 ({csvFileName})
            </a>
          )}
        </div>
      ) : enrichData ? (
        /* PNG 不可用时 fallback 到 Plotly 气泡图 */
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color: "var(--clr-amber-dark)" }}>
            富集气泡图
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-faint)" }}>
              — {enrichData.terms.length} 个通路
            </span>
          </p>
          <EnrichBubble data={enrichData} title={`${stats?.pathway ?? "GO"} Enrichment (${stats?.direction ?? ""})`} />
        </div>
      ) : (
        <div className="callout text-xs">
          富集数据暂未返回（可能无显著通路，或需重新运行富集步骤以生成新格式数据）
        </div>
      )}
    </div>
  );
}
