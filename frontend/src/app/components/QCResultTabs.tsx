/**
 * scCloud v2 — QC 结果 Tab 展示组件
 * ComputaBio 暖色学术风格
 *
 * 对应旧系统的 Tab:
 *   过滤结果 / 样本相关性 / 样本质控 / 样本线粒体基因占比 / 样本UMI基因统计
 */
"use client";

import { useState, useEffect } from "react";

// ===== 类型定义 =====

interface MitoRow {
  Sample: string;
  "mt<=5%": string;
  "mt<=10%": string;
  "mt<=15%": string;
  "mt<=20%": string;
  "mt<=30%": string;
  "mt<=50%": string;
  "mt<=80%": string;
  "mt<=100%": string;
}

interface UmiRow {
  Sample: string;
  umisMax: string;
  umisMed: string;
  umisMin: string;
  genesMax: string;
  genesMed: string;
  genesMin: string;
}

interface QCResult {
  status: string[];
  result_path: string[];
  stats: {
    total_cells_before: number[];
    total_cells_after: number[];
    total_genes: number[];
    samples: number[];
  };
  mito_table_before: MitoRow[];
  mito_table_after: MitoRow[];
  umi_gene_before: UmiRow[];
  umi_gene_after: UmiRow[];
  /** R 引擎生成的样本相关性散点图路径 */
  corr_plot_path?: string | string[];
  /** R 引擎生成的过滤前后 VlnPlot 路径 */
  violin_plot_path?: string | string[];
}

interface QCResultTabsProps {
  taskId: string;
  token: string;
}

// ===== 工具函数 =====

/** 安全提取字符串 — R jsonlite 有时将单元素向量序列化为数组 */
function safeString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

/** 从 plot_path 提取文件名，构造 /api/tasks/{id}/plot?name= URL */
function plotUrl(taskId: string, plotPath: unknown): string | null {
  const p = safeString(plotPath);
  if (!p) return null;
  const name = p.split("/").pop();
  if (!name) return null;
  return `/api/tasks/${taskId}/plot?name=${encodeURIComponent(name)}`;
}

/**
 * 带认证的图片组件 — 通过 fetch + Bearer token 加载受保护的图片资源。
 * 浏览器 <img> 标签无法传 Authorization header，
 * 改用 fetch 拉取 blob 后转为对象 URL 注入 <img>。
 */
function AuthImg({ src, alt, token, className, style }: {
  src: string | null;
  alt: string;
  token: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return;
    let objectUrl = "";
    setFailed(false);
    setBlobUrl(null);
    fetch(src, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); })
      .catch(() => setFailed(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, token]);

  if (!src || failed) return <div className="callout text-xs py-6 text-center" style={{ color: "var(--clr-text-faint)" }}>图片暂不可用</div>;
  if (!blobUrl) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 rounded-full border-t-transparent animate-spin" style={{ borderColor: "var(--clr-amber)", borderTopColor: "transparent" }} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}

// ===== Tab 定义 =====

const TABS = [
  { id: "filter", label: "过滤结果" },
  { id: "corr", label: "样本相关性" },
  { id: "qc", label: "样本质控" },
  { id: "mito", label: "样本线粒体基因占比" },
  { id: "umi", label: "样本UMI基因统计" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ===== 主组件 =====

export default function QCResultTabs({ taskId, token }: QCResultTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("filter");
  const [data, setData] = useState<QCResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const path = `/api/tasks/${taskId}/result`;
    fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [taskId, token]);

  if (loading) {
    return <div className="text-center py-8 text-sm" style={{ color: "var(--clr-text-muted)" }}>加载分析结果...</div>;
  }

  if (error || !data) {
    return <div className="text-center py-8 text-sm" style={{ color: "var(--clr-text-faint)" }}>暂无详细结果数据</div>;
  }

  return (
    <div className="space-y-4">
      {/* Tab 导航栏 — pill 框式 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200"
            style={activeTab === tab.id ? {
              background: "var(--clr-amber)",
              color: "#fff",
              border: "1.5px solid var(--clr-amber)",
              boxShadow: "0 2px 8px rgba(200,96,25,0.25)",
            } : {
              background: "transparent",
              color: "var(--clr-text-muted)",
              border: "1.5px solid var(--clr-border)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="animate-fade-in-fast">
        {activeTab === "filter" && <FilterResultTab data={data} />}
        {activeTab === "corr" && <CorrTab data={data} taskId={taskId} token={token} />}
        {activeTab === "qc" && <SampleQCTab data={data} taskId={taskId} token={token} />}
        {activeTab === "mito" && <MitoTab data={data} />}
        {activeTab === "umi" && <UmiTab data={data} />}
      </div>
    </div>
  );
}

// ===== Tab 1: 过滤结果 =====

function FilterResultTab({ data }: { data: QCResult }) {
  const stats = data.stats;
  const before = stats.total_cells_before?.[0] || 0;
  const after = stats.total_cells_after?.[0] || 0;
  const genes = stats.total_genes?.[0] || 0;
  const samples = stats.samples?.[0] || 0;
  const filtered = before - after;
  const pct = before > 0 ? ((filtered / before) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="stat-value">{before.toLocaleString()}</div>
          <div className="stat-label">过滤前细胞</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--clr-success)" }}>{after.toLocaleString()}</div>
          <div className="stat-label">过滤后细胞</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--clr-danger)" }}>{filtered.toLocaleString()}<span className="text-sm"> ({pct}%)</span></div>
          <div className="stat-label">过滤掉</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--clr-amber)" }}>{genes.toLocaleString()}</div>
          <div className="stat-label">基因数</div>
        </div>
      </div>

      {/* 数据概览 */}
      <div className="card">
        <div className="card-label">数据概览</div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span style={{ color: "var(--clr-text-muted)" }}>样本数: </span>
            <span className="font-semibold">{samples}</span>
          </div>
          <div>
            <span style={{ color: "var(--clr-text-muted)" }}>保留率: </span>
            <span className="font-semibold" style={{ color: "var(--clr-success)" }}>
              {before > 0 ? ((after / before) * 100).toFixed(1) : "100"}%
            </span>
          </div>
        </div>
      </div>

      <div className="callout text-xs">
        质控过滤根据设定的线粒体基因占比阈值和最小表达基因数阈值，
        去除低质量细胞。过滤后的数据将用于后续的标准化和降维分析。
      </div>
    </div>
  );
}

// ===== Tab 2: 样本相关性 =====

function CorrTab({ data, taskId, token }: { data: QCResult; taskId: string; token: string }) {
  const src = plotUrl(taskId, data.corr_plot_path);

  return (
    <div className="space-y-4">
      <div className="callout text-xs">
        上传rds文件中样本的相关性,如果nCount_RNA和线粒体基因间没有相关性,表明测序得到的Count基本都是细胞的功能基因,nCount_RNA和nFeature_RNA强相关的话,符合逻辑
      </div>

      {src ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <AuthImg
            src={src}
            alt="样本相关性散点图 — nCount_RNA vs percent.mt / nFeature_RNA"
            token={token}
            className="w-full h-auto"
            style={{ display: "block" }}
          />
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-sm" style={{ color: "var(--clr-text-faint)" }}>
            样本相关性图暂不可用（仅在新提交的 QC 任务中生成）
          </p>
        </div>
      )}
    </div>
  );
}

// ===== Tab 3: 样本质控 =====

function SampleQCTab({ data, taskId, token }: { data: QCResult; taskId: string; token: string }) {
  const vlnSrc = plotUrl(taskId, data.violin_plot_path);

  return (
    <div className="space-y-4">
      <div className="callout text-xs">
        过滤前后的小提琴图对比 (nCount_RNA、nFeature_RNA、percent.mt)。
        上方为过滤前，下方为过滤后，可直观观察过滤效果。
      </div>

      {/* VlnPlot 可视化 */}
      {vlnSrc ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <AuthImg
            src={vlnSrc}
            alt="过滤前后 VlnPlot — nCount_RNA / nFeature_RNA / percent.mt"
            token={token}
            className="w-full h-auto"
            style={{ display: "block" }}
          />
        </div>
      ) : (
        <div className="card text-center py-8">
          <p className="text-sm" style={{ color: "var(--clr-text-faint)" }}>
            小提琴图暂不可用（仅在新提交的 QC 任务中生成）
          </p>
        </div>
      )}

      {/* 过滤前后线粒体分布表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="card-label">过滤前 · 线粒体基因分布</div>
          <MitoTable rows={data.mito_table_before} />
        </div>
        <div>
          <div className="card-label" style={{ color: "var(--clr-success)" }}>过滤后 · 线粒体基因分布</div>
          <MitoTable rows={data.mito_table_after} />
        </div>
      </div>
    </div>
  );
}

// ===== Tab 4: 样本线粒体基因占比 =====

function MitoTab({ data }: { data: QCResult }) {
  return (
    <div className="space-y-4">
      <div className="callout text-xs">
        各样本在不同线粒体基因占比阈值下的细胞数量及比例。
        高线粒体占比通常表示细胞应激或凋亡。
      </div>
      <div><div className="card-label">过滤前 · 各样本线粒体分布</div><MitoTable rows={data.mito_table_before} /></div>
      <div><div className="card-label" style={{ color: "var(--clr-success)" }}>过滤后 · 各样本线粒体分布</div><MitoTable rows={data.mito_table_after} /></div>
    </div>
  );
}

// ===== Tab 5: 样本UMI基因统计 =====

function UmiTab({ data }: { data: QCResult }) {
  return (
    <div className="space-y-4">
      <div className="callout text-xs">
        各样本的 UMI 计数和基因数统计（最大值、中位数、最小值）。用于评估测序深度和数据质量。
      </div>
      <div><div className="card-label">过滤前 · UMI/Gene 统计</div><UmiTable rows={data.umi_gene_before} /></div>
      <div><div className="card-label" style={{ color: "var(--clr-success)" }}>过滤后 · UMI/Gene 统计</div><UmiTable rows={data.umi_gene_after} /></div>
    </div>
  );
}

// ===== 公共子组件 =====

function MitoTable({ rows }: { rows: MitoRow[] }) {
  if (!rows || rows.length === 0) return <p className="text-xs py-4 text-center" style={{ color: "var(--clr-text-faint)" }}>暂无数据</p>;
  const cols = ["mt<=5%", "mt<=10%", "mt<=15%", "mt<=20%", "mt<=30%", "mt<=50%"] as const;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Sample</th>{cols.map((c) => <th key={c} className="text-right">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ fontFamily: "var(--font-mono)", color: "var(--clr-amber-dark)" }}>{row.Sample}</td>
              {cols.map((c) => <td key={c} className="text-right">{row[c]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UmiTable({ rows }: { rows: UmiRow[] }) {
  if (!rows || rows.length === 0) return <p className="text-xs py-4 text-center" style={{ color: "var(--clr-text-faint)" }}>暂无数据</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Sample</th><th className="text-right">UMI Max</th><th className="text-right">UMI Med</th><th className="text-right">UMI Min</th><th className="text-right">Gene Max</th><th className="text-right">Gene Med</th><th className="text-right">Gene Min</th></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ fontFamily: "var(--font-mono)", color: "var(--clr-amber-dark)" }}>{row.Sample}</td>
              <td className="text-right">{row.umisMax}</td><td className="text-right">{row.umisMed}</td><td className="text-right">{row.umisMin}</td>
              <td className="text-right">{row.genesMax}</td><td className="text-right">{row.genesMed}</td><td className="text-right">{row.genesMin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
