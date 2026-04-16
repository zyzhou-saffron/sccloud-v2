/**
 * scCloud v2 — Violin Plot 组件
 *
 * 对应旧系统 plotOutput("violinPlot")
 * 旧实现: Shiny renderPlot → VlnPlot(seurat_obj, features)
 * 新实现: R 引擎返回表达值 JSON → Plotly violin
 *
 * 数据格式:
 * {
 *   groups: string[],     // 聚类或样本名
 *   values: number[][],   // 每组的表达值数组
 *   gene: string,         // 基因名
 * }
 */
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const PALETTE = [
  "#f59e0b", "#ef4444", "#10b981", "#3b82f6", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7",
];

export interface ViolinData {
  groups: string[];
  values: number[][];
  gene: string;
}

interface ViolinPlotProps {
  data: ViolinData | null;
  height?: number;
}

export default function ViolinPlot({ data, height = 400 }: ViolinPlotProps) {
  const traces = useMemo(() => {
    if (!data) return [];

    return data.groups.map((group, i) => ({
      type: "violin" as const,
      y: data.values[i],
      name: group,
      box: { visible: true },
      meanline: { visible: true },
      line: { color: PALETTE[i % PALETTE.length] },
      fillcolor: `${PALETTE[i % PALETTE.length]}30`,
      hovertemplate: `${group}<br>Expression: %{y:.3f}<extra></extra>`,
    }));
  }, [data]);

  if (!data) {
    return (
      <div
        className="flex items-center justify-center bg-stone-900/50 rounded-xl border border-stone-800"
        style={{ height }}
      >
        <div className="text-center text-stone-600">
          <div className="text-3xl mb-2">🎻</div>
          <p className="text-xs">Violin Plot</p>
          <p className="text-[10px] mt-1">等待数据加载</p>
        </div>
      </div>
    );
  }

  return (
    <Plot
      data={traces}
      layout={{
        height,
        title: {
          text: data.gene,
          font: { color: "#44403c", size: 14 },
        },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#57534e", family: "Inter, sans-serif", size: 11 },
        xaxis: {
          gridcolor: "rgba(168, 162, 158, 0.25)",
        },
        yaxis: {
          title: "Expression",
          gridcolor: "rgba(168, 162, 158, 0.25)",
          zerolinecolor: "rgba(168, 162, 158, 0.3)",
        },
        showlegend: false,
        margin: { l: 50, r: 20, t: 40, b: 50 },
      }}
      config={{ responsive: true, displaylogo: false, displayModeBar: true }}
      style={{ width: "100%" }}
    />
  );
}
