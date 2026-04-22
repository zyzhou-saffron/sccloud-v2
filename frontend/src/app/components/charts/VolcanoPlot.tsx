"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";

// react-plotly.js 需要动态导入（SSR 不支持 Plotly）
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

/* ================================================================
 *  火山图组件 — 用于双簇差异基因的 log2FC vs -log10(p_val_adj) 展示
 *  
 *  参考标准：
 *    x 轴 = avg_log2FC（效应量）
 *    y 轴 = -log10(p_val_adj)（统计显著性）
 *    颜色 = 上调(红) / 下调(蓝) / 不显著(灰)
 *  
 *  阈值默认：|log2FC| > 1 且 p_adj < 0.05
 * ================================================================ */

export interface VolcanoPoint {
  gene_id: string;
  avg_log2FC: number;
  p_val_adj: number;
}

interface VolcanoPlotProps {
  data: VolcanoPoint[];
  /** log2FC 绝对值阈值，默认 1 */
  fcThreshold?: number;
  /** p_val_adj 阈值，默认 0.05 */
  pThreshold?: number;
  height?: number;
  /** 分析对标签 */
  title?: string;
}

export default function VolcanoPlot({
  data,
  fcThreshold = 1,
  pThreshold = 0.05,
  height = 440,
  title,
}: VolcanoPlotProps) {
  const { upGenes, downGenes, nsGenes } = useMemo(() => {
    const up: VolcanoPoint[] = [];
    const down: VolcanoPoint[] = [];
    const ns: VolcanoPoint[] = [];

    for (const pt of data) {
      // 跳过无效值
      if (
        pt.avg_log2FC == null ||
        pt.p_val_adj == null ||
        isNaN(pt.avg_log2FC) ||
        isNaN(pt.p_val_adj)
      )
        continue;

      const isSignificant = pt.p_val_adj < pThreshold;
      const isUp = pt.avg_log2FC > fcThreshold;
      const isDown = pt.avg_log2FC < -fcThreshold;

      if (isSignificant && isUp) up.push(pt);
      else if (isSignificant && isDown) down.push(pt);
      else ns.push(pt);
    }

    return { upGenes: up, downGenes: down, nsGenes: ns };
  }, [data, fcThreshold, pThreshold]);

  // 计算 -log10(p_val_adj)，p=0 时 cap 到 300
  const negLog10 = (p: number) =>
    p <= 0 ? 300 : -Math.log10(p);

  const makeTrace = (
    points: VolcanoPoint[],
    name: string,
    color: string,
    symbol: string,
  ): Partial<Plotly.Data> => ({
    x: points.map((p) => p.avg_log2FC),
    y: points.map((p) => negLog10(p.p_val_adj)),
    text: points.map(
      (p) =>
        `<b>${p.gene_id}</b><br>log2FC: ${p.avg_log2FC.toFixed(3)}<br>p_adj: ${p.p_val_adj.toExponential(2)}`,
    ),
    hoverinfo: "text" as const,
    mode: "markers" as const,
    type: "scattergl" as const,
    name: `${name} (${points.length})`,
    marker: {
      color,
      size: 5,
      opacity: 0.7,
      symbol,
    },
  });

  const traces = [
    makeTrace(nsGenes, "不显著", "#BFBFBF", "circle"),
    makeTrace(downGenes, "下调", "#4A90D9", "circle"),
    makeTrace(upGenes, "上调", "#E25B45", "circle"),
  ];

  // 阈值参考线
  const maxY = Math.max(
    ...data
      .filter((p) => p.p_val_adj != null && !isNaN(p.p_val_adj))
      .map((p) => negLog10(p.p_val_adj)),
    5,
  );
  const pLine = negLog10(pThreshold);

  return (
    <div style={{ width: "100%" }}>
      {title && (
        <p
          className="text-xs font-medium mb-1"
          style={{ color: "var(--clr-amber-dark)" }}
        >
          火山图 (Volcano Plot)
          <span
            className="font-normal ml-1"
            style={{ color: "var(--clr-text-faint)" }}
          >
            — {title} · {data.length} 个基因
          </span>
        </p>
      )}
      <Plot
        data={traces as Plotly.Data[]}
        layout={{
          width: undefined,
          height,
          autosize: true,
          margin: { l: 55, r: 20, t: 10, b: 45 },
          xaxis: {
            title: { text: "log₂(Fold Change)", font: { size: 12 } },
            zeroline: true,
            zerolinecolor: "#E0E0E0",
            gridcolor: "#F5F5F5",
          },
          yaxis: {
            title: { text: "-log₁₀(p_adj)", font: { size: 12 } },
            gridcolor: "#F5F5F5",
          },
          plot_bgcolor: "#FFFFFF",
          paper_bgcolor: "transparent",
          legend: {
            x: 1,
            xanchor: "right",
            y: 1,
            bgcolor: "rgba(255,255,255,0.85)",
            bordercolor: "#E0E0E0",
            borderwidth: 1,
            font: { size: 10 },
          },
          shapes: [
            // 水平线: -log10(pThreshold)
            {
              type: "line",
              x0: -100,
              x1: 100,
              y0: pLine,
              y1: pLine,
              line: { color: "#C86019", width: 1, dash: "dash" },
            },
            // 垂直线: -fcThreshold
            {
              type: "line",
              x0: -fcThreshold,
              x1: -fcThreshold,
              y0: 0,
              y1: maxY * 1.1,
              line: { color: "#C86019", width: 1, dash: "dash" },
            },
            // 垂直线: +fcThreshold
            {
              type: "line",
              x0: fcThreshold,
              x1: fcThreshold,
              y0: 0,
              y1: maxY * 1.1,
              line: { color: "#C86019", width: 1, dash: "dash" },
            },
          ],
          hovermode: "closest",
        }}
        config={{
          displayModeBar: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
          displaylogo: false,
          responsive: true,
        }}
        useResizeHandler
        style={{ width: "100%", height }}
      />
      {/* 统计概要 */}
      <div
        className="flex gap-4 text-xs mt-1"
        style={{ color: "var(--clr-text-faint)" }}
      >
        <span>
          阈值: |log₂FC| &gt; {fcThreshold}, p_adj &lt; {pThreshold}
        </span>
        <span>
          上调:{" "}
          <strong style={{ color: "#E25B45" }}>{upGenes.length}</strong>
        </span>
        <span>
          下调:{" "}
          <strong style={{ color: "#4A90D9" }}>{downGenes.length}</strong>
        </span>
        <span>
          不显著:{" "}
          <strong style={{ color: "#999" }}>{nsGenes.length}</strong>
        </span>
      </div>
    </div>
  );
}
