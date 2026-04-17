/**
 * scCloud v2 — QC 结果 Tab 展示组件
 * ComputaBio 暖色学术风格
 *
 * 对应旧系统的 Tab: 过滤结果 / 样本质控 / 样本线粒体基因占比 / 样本UMI基因统计
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
}

interface QCResultTabsProps {
  taskId: string;
  token: string;
}

// ===== Tab 定义 =====

const TABS = [
  { id: "filter", label: "过滤结果" },
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
        {activeTab === "qc" && <SampleQCTab data={data} />}
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

// ===== Tab 2: 样本质控 =====

function SampleQCTab({ data }: { data: QCResult }) {
  return (
    <div className="space-y-4">
      <div className="callout text-xs">
        上传 RDS 文件中样本的相关性。如果 nCount_RNA 和线粒体基因间没有相关性，
        表明测序得到的 Count 基本都是细胞的功能基因；nCount_RNA 和 nFeature_RNA
        强相关的话，符合逻辑。
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="card-label">过滤前 · 线粒体基因分布</div>
          <MitoTable rows={data.mito_table_before} />
        </div>
        <div>
          <div className="card-label">过滤后 · 线粒体基因分布</div>
          <MitoTable rows={data.mito_table_after} />
        </div>
      </div>
    </div>
  );
}

// ===== Tab 3: 样本线粒体基因占比 =====

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

// ===== Tab 4: 样本UMI基因统计 =====

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
