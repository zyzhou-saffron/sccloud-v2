/**
 * scCloud v2 — UMAP/tSNE 散点图组件
 *
 * 对应旧系统 plotOutput("umapPlot")
 * 旧实现: Shiny renderPlot → DimPlot(seurat_obj)
 * 新实现: R 引擎返回坐标 JSON → Plotly scatter plot
 *
 * 数据格式 (R 引擎 → 后端 → 前端):
 * {
 *   x: number[],     // UMAP_1 / tSNE_1
 *   y: number[],     // UMAP_2 / tSNE_2
 *   cluster: string[], // 聚类标签
 *   sample: string[],  // 样本来源
 * }
 */
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

/* Plotly.js 需要 CSR — 使用 dynamic import 避免 SSR */
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/* 颜色映射 — 暖色系 + 高饱和度 */
const PALETTE = [
  "#f59e0b", "#ef4444", "#10b981", "#3b82f6", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7",
  "#e11d48", "#0ea5e9", "#84cc16", "#f43f5e", "#6366f1",
  "#d946ef", "#22d3ee", "#eab308", "#64748b", "#fb923c",
];

export interface ScatterData {
  x: number[];
  y: number[];
  cluster: string[];
  sample?: string[];
}

interface ScatterPlotProps {
  data: ScatterData | null;
  method?: "UMAP" | "tSNE" | "PCA";
  colorBy?: "cluster" | "sample";
  height?: number;
}

export default function ScatterPlot({
  data,
  method = "UMAP",
  colorBy = "cluster",
  height = 500,
}: ScatterPlotProps) {
  /* 按分组生成 trace */
  const traces = useMemo(() => {
    if (!data) return [];

    const groupKey = colorBy === "sample" ? data.sample || data.cluster : data.cluster;
    const groups = [...new Set(groupKey)];

    return groups.map((group, i) => {
      const indices = groupKey
        .map((g, idx) => (g === group ? idx : -1))
        .filter((idx) => idx >= 0);

      return {
        x: indices.map((idx) => data.x[idx]),
        y: indices.map((idx) => data.y[idx]),
        mode: "markers" as const,
        type: "scattergl" as const,
        name: group,
        marker: {
          color: PALETTE[i % PALETTE.length],
          size: 3,
          opacity: 0.7,
        },
        hovertemplate: `${group}<br>${method}_1: %{x:.2f}<br>${method}_2: %{y:.2f}<extra></extra>`,
      };
    });
  }, [data, colorBy, method]);

  if (!data) {
    return (
      <div
        className="flex items-center justify-center bg-stone-900/50 rounded-xl border border-stone-800"
        style={{ height }}
      >
        <div className="text-center text-stone-600">
          <div className="text-3xl mb-2">📈</div>
          <p className="text-xs">{method} 可视化</p>
          <p className="text-[10px] mt-1">等待分析完成后加载数据</p>
        </div>
      </div>
    );
  }

  return (
    <Plot
      data={traces}
      layout={{
        height,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#57534e", family: "Inter, sans-serif", size: 11 },
        xaxis: {
          title: `${method}_1`,
          gridcolor: "rgba(168, 162, 158, 0.25)",
          zerolinecolor: "rgba(168, 162, 158, 0.3)",
        },
        yaxis: {
          title: `${method}_2`,
          gridcolor: "rgba(168, 162, 158, 0.25)",
          zerolinecolor: "rgba(168, 162, 158, 0.3)",
        },
        legend: {
          bgcolor: "transparent",
          font: { size: 10, color: "#57534e" },
          itemsizing: "constant",
        },
        margin: { l: 50, r: 20, t: 30, b: 50 },
        hovermode: "closest",
      }}
      config={{
        responsive: true,
        displaylogo: false,
        displayModeBar: true,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
      }}
      style={{ width: "100%" }}
    />
  );
}
