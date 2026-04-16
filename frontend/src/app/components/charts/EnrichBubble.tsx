/**
 * scCloud v2 — 富集分析气泡图
 *
 * 对应旧系统 plotOutput("enrichPlot")
 * 旧实现: Shiny renderPlot → dotplot(enrichResult)
 * 新实现: clusterProfiler JSON 结果 → Plotly bubble chart
 *
 * 数据格式:
 * {
 *   terms: string[],       // GO/KEGG 通路名
 *   gene_ratio: number[],  // 基因比例
 *   p_adjust: number[],    // 校正后 P 值
 *   count: number[],       // 基因数
 *   category: string[],    // BP/CC/MF / KEGG pathway
 * }
 */
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export interface EnrichData {
  terms: string[];
  gene_ratio: number[];
  p_adjust: number[];
  count: number[];
  category?: string[];
}

interface EnrichBubbleProps {
  data: EnrichData | null;
  title?: string;
  height?: number;
}

export default function EnrichBubble({
  data,
  title = "富集分析",
  height = 500,
}: EnrichBubbleProps) {
  const trace = useMemo(() => {
    if (!data) return null;

    /* Truncate long term names */
    const labels = data.terms.map((t) =>
      t.length > 40 ? t.slice(0, 38) + "…" : t
    );

    return {
      x: data.gene_ratio,
      y: labels,
      mode: "markers" as const,
      type: "scatter" as const,
      marker: {
        size: data.count.map((c) => Math.max(c * 1.5 + 6, 8)),
        color: data.p_adjust.map((p) => -Math.log10(p)),
        colorscale: "YlOrBr",
        colorbar: {
          title: {
            text: "-log₁₀(p.adj)",
            font: { size: 10, color: "#a8a29e" },
          },
          tickfont: { size: 9, color: "#78716c" },
          thickness: 12,
          len: 0.5,
        },
      },
      text: data.terms.map(
        (t, i) =>
          `${t}<br>Gene Ratio: ${data.gene_ratio[i].toFixed(3)}<br>Count: ${data.count[i]}<br>p.adj: ${data.p_adjust[i].toExponential(2)}`
      ),
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
          <div className="text-3xl mb-2">🔗</div>
          <p className="text-xs">{title}</p>
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
        title: {
          text: title,
          font: { color: "#44403c", size: 14 },
        },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#57534e", family: "Inter, sans-serif", size: 10 },
        xaxis: {
          title: "Gene Ratio",
          gridcolor: "rgba(168, 162, 158, 0.25)",
          zerolinecolor: "rgba(168, 162, 158, 0.3)",
        },
        yaxis: {
          autorange: "reversed",
          gridcolor: "rgba(168, 162, 158, 0.2)",
        },
        margin: { l: 200, r: 30, t: 40, b: 50 },
        showlegend: false,
      }}
      config={{ responsive: true, displaylogo: false, displayModeBar: true }}
      style={{ width: "100%" }}
    />
  );
}
