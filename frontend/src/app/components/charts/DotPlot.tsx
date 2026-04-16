/**
 * scCloud v2 — Dot Plot 组件
 *
 * 对应旧系统 plotOutput("dotPlot")
 * 旧实现: Shiny renderPlot → DotPlot(seurat_obj, features, group.by)
 * 新实现: R 引擎返回聚合数据 → Plotly scatter 气泡图
 *
 * 数据格式:
 * {
 *   genes: string[],          // 行 (基因名)
 *   clusters: string[],       // 列 (聚类)
 *   avg_exp: number[][],      // genes × clusters 平均表达
 *   pct_exp: number[][],      // genes × clusters 表达百分比
 * }
 */
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export interface DotPlotData {
  genes: string[];
  clusters: string[];
  avg_exp: number[][];
  pct_exp: number[][];
}

interface DotPlotProps {
  data: DotPlotData | null;
  height?: number;
}

export default function DotPlot({ data, height = 400 }: DotPlotProps) {
  const trace = useMemo(() => {
    if (!data) return null;

    const x: string[] = [];
    const y: string[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const texts: string[] = [];

    data.genes.forEach((gene, gi) => {
      data.clusters.forEach((cluster, ci) => {
        x.push(cluster);
        y.push(gene);
        /* 点大小 = 表达百分比 (0-100 → 4-20px) */
        sizes.push(Math.max(data.pct_exp[gi][ci] * 0.18 + 4, 4));
        /* 颜色 = 平均表达量 */
        colors.push(data.avg_exp[gi][ci]);
        texts.push(
          `${gene} in ${cluster}<br>Avg Exp: ${data.avg_exp[gi][ci].toFixed(2)}<br>Pct Exp: ${(data.pct_exp[gi][ci] * 100).toFixed(1)}%`
        );
      });
    });

    return {
      x,
      y,
      mode: "markers" as const,
      type: "scatter" as const,
      marker: {
        size: sizes,
        color: colors,
        colorscale: [
          [0, "#1c1917"],
          [0.3, "#78350f"],
          [0.6, "#f59e0b"],
          [1, "#fef3c7"],
        ],
        colorbar: {
          title: { text: "Avg Exp", font: { size: 10, color: "#a8a29e" } },
          tickfont: { size: 9, color: "#78716c" },
          thickness: 12,
          len: 0.5,
        },
      },
      text: texts,
      hovertemplate: "%{text}<extra></extra>",
    };
  }, [data]);

  if (!data) {
    return (
      <div
        className="flex items-center justify-center bg-stone-900/50 rounded-xl border border-stone-800"
        style={{ height }}
      >
        <div className="text-center text-stone-600">
          <div className="text-3xl mb-2">⚬</div>
          <p className="text-xs">Dot Plot</p>
          <p className="text-[10px] mt-1">等待数据加载</p>
        </div>
      </div>
    );
  }

  return (
    <Plot
      data={trace ? [trace] : []}
      layout={{
        height,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#57534e", family: "Inter, sans-serif", size: 11 },
        xaxis: {
          tickangle: -45,
          gridcolor: "rgba(168, 162, 158, 0.2)",
        },
        yaxis: {
          gridcolor: "rgba(168, 162, 158, 0.2)",
          autorange: "reversed",
        },
        margin: { l: 80, r: 30, t: 20, b: 80 },
        showlegend: false,
      }}
      config={{ responsive: true, displaylogo: false, displayModeBar: true }}
      style={{ width: "100%" }}
    />
  );
}
