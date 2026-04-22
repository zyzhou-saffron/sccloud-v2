/**
 * scCloud v2 — deck.gl WebGL 散点图组件
 *
 * 替代旧版 Plotly ScatterPlot，使用 WebGL 原生渲染：
 * - 10 万级细胞流畅缩放（1 draw call）
 * - 鼠标悬停显示细胞信息 tooltip
 * - 图例点击切换聚类高亮
 *
 * 数据格式（与 R 引擎返回一致）:
 * { x: number[], y: number[], cluster: string[] }
 */
"use client";

import { useCallback, useMemo, useState } from "react";
import { OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import DeckGL from "@deck.gl/react";
import type { ScatterData } from "./ScatterPlot";

/* ── 色板：暖色系高饱和度，匹配 ComputaBio 学术调性 ── */
const PALETTE: [number, number, number][] = [
  [245, 158, 11],  // amber
  [239, 68, 68],   // red
  [16, 185, 129],  // emerald
  [59, 130, 246],  // blue
  [139, 92, 246],  // violet
  [236, 72, 153],  // pink
  [6, 182, 212],   // cyan
  [249, 115, 22],  // orange
  [20, 184, 166],  // teal
  [168, 85, 247],  // purple
  [225, 29, 72],   // rose
  [14, 165, 233],  // sky
  [132, 204, 22],  // lime
  [244, 63, 94],   // red-rose
  [99, 102, 241],  // indigo
  [217, 70, 239],  // fuchsia
  [34, 211, 238],  // cyan-light
  [234, 179, 8],   // yellow
  [100, 116, 139], // slate
  [251, 146, 60],  // orange-light
];

interface DeckScatterPlotProps {
  data: ScatterData | null;
  method?: "UMAP" | "tSNE" | "PCA";
  height?: number;
  children?: React.ReactNode;
}

/** 将平行数组转为点对象数组（deck.gl accessor 需要） */
function toPoints(data: ScatterData) {
  const result: { x: number; y: number; cluster: string; idx: number }[] = [];
  for (let i = 0; i < data.x.length; i++) {
    result.push({
      x: data.x[i],
      y: data.y[i],
      cluster: data.cluster[i],
      idx: i,
    });
  }
  return result;
}

export default function DeckScatterPlot({
  data,
  method = "UMAP",
  height = 500,
  children,
}: DeckScatterPlotProps) {
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    object?: { x: number; y: number; cluster: string; idx: number };
  } | null>(null);

  // 图例：哪些聚类被隐藏
  const [hiddenClusters, setHiddenClusters] = useState<Set<string>>(new Set());

  // 将平行数组 → 对象数组（仅在数据变化时重算）
  const points = useMemo(() => (data ? toPoints(data) : []), [data]);

  // 提取唯一聚类列表（保持原始顺序）
  const clusters = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of data.cluster) {
      if (!seen.has(c)) {
        seen.add(c);
        result.push(c);
      }
    }
    return result;
  }, [data]);

  // 聚类 → 颜色索引映射
  const colorMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    clusters.forEach((c, i) => {
      map.set(c, PALETTE[i % PALETTE.length]);
    });
    return map;
  }, [clusters]);

  // 计算数据边界 → 初始视口
  const initialViewState = useMemo(() => {
    if (!data || data.x.length === 0) {
      return { target: [0, 0], zoom: 1 };
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < data.x.length; i++) {
      if (data.x[i] < minX) minX = data.x[i];
      if (data.x[i] > maxX) maxX = data.x[i];
      if (data.y[i] < minY) minY = data.y[i];
      if (data.y[i] > maxY) maxY = data.y[i];
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const maxRange = Math.max(rangeX, rangeY);
    // zoom 公式：log2(视口像素 / 数据范围)
    const zoom = Math.log2(Math.min(600, height) / maxRange) - 0.3;
    return { target: [cx, cy], zoom: Math.max(-2, Math.min(zoom, 10)) };
  }, [data, height]);

  // 过滤后的点（排除隐藏聚类）
  const filteredPoints = useMemo(() => {
    if (hiddenClusters.size === 0) return points;
    return points.filter((p) => !hiddenClusters.has(p.cluster));
  }, [points, hiddenClusters]);

  const onHover = useCallback(
    (info: { x: number; y: number; object?: unknown }) => {
      if (info.object) {
        setHoverInfo(
          info as { x: number; y: number; object: { x: number; y: number; cluster: string; idx: number } }
        );
      } else {
        setHoverInfo(null);
      }
    },
    []
  );

  // 图例点击
  const toggleCluster = useCallback((cluster: string) => {
    setHiddenClusters((prev) => {
      const next = new Set(prev);
      if (next.has(cluster)) {
        next.delete(cluster);
      } else {
        next.add(cluster);
      }
      return next;
    });
  }, []);

  if (!data) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{
          height,
          background: "var(--clr-bg-alt)",
          border: "1px solid rgba(45,41,38,0.06)",
        }}
      >
        <div className="text-center" style={{ color: "var(--clr-text-faint)" }}>
          <p className="text-sm">📈 {method} 可视化</p>
          <p className="text-xs mt-1">等待分析完成后加载数据</p>
        </div>
      </div>
    );
  }

  const layer = new ScatterplotLayer({
    id: "scatter",
    data: filteredPoints,
    getPosition: (d: { x: number; y: number }) => [d.x, d.y],
    getFillColor: (d: { cluster: string }) => {
      const c = colorMap.get(d.cluster) || [128, 128, 128];
      return [c[0], c[1], c[2], 180];
    },
    getRadius: 3,
    radiusUnits: "pixels" as const,
    radiusMinPixels: 1.5,
    radiusMaxPixels: 8,
    pickable: true,
    onHover,
    updateTriggers: {
      getFillColor: [hiddenClusters.size],
    },
  });

  return (
    <div className="relative" style={{ height }}>
      {/* deck.gl 画布 */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          height,
          background: "#FFFFFF",
          border: "1px solid rgba(45,41,38,0.06)",
        }}
      >
        <DeckGL
          views={new OrthographicView({})}
          initialViewState={initialViewState}
          controller={true}
          layers={[layer]}
          style={{ position: "relative", width: "100%", height: "100%" }}
        />
      </div>

      {/* Tooltip */}
      {hoverInfo?.object && (
        <div
          className="absolute pointer-events-none z-10 px-3 py-2 rounded-md text-xs"
          style={{
            left: hoverInfo.x + 12,
            top: hoverInfo.y - 40,
            background: "rgba(30,27,24,0.92)",
            color: "#fff",
            backdropFilter: "blur(4px)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            maxWidth: 200,
          }}
        >
          <div className="font-semibold" style={{ color: "var(--clr-gold)" }}>
            {hoverInfo.object.cluster}
          </div>
          <div className="mt-0.5 opacity-80">
            {method}_1: {hoverInfo.object.x.toFixed(3)}
          </div>
          <div className="opacity-80">
            {method}_2: {hoverInfo.object.y.toFixed(3)}
          </div>
          <div className="opacity-60 mt-0.5">Cell #{hoverInfo.object.idx}</div>
        </div>
      )}

      {/* 图例 */}
      <div
        className="absolute top-2 right-2 z-10 rounded-md px-3 py-2 max-h-64 overflow-y-auto"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(45,41,38,0.08)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <p
          className="text-[10px] font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: "var(--clr-text-faint)" }}
        >
          Clusters
        </p>
        {clusters.map((c) => {
          const color = colorMap.get(c) || [128, 128, 128];
          const isHidden = hiddenClusters.has(c);
          return (
            <button
              key={c}
              onClick={() => toggleCluster(c)}
              className="flex items-center gap-1.5 w-full text-left py-0.5 text-xs transition-opacity"
              style={{ opacity: isHidden ? 0.3 : 1 }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  background: `rgb(${color[0]},${color[1]},${color[2]})`,
                }}
              />
              <span
                style={{
                  color: "var(--clr-text)",
                  textDecoration: isHidden ? "line-through" : "none",
                }}
              >
                {c}
              </span>
            </button>
          );
        })}
      </div>

      {/* 左下角操作提示 */}
      <div
        className="absolute bottom-2 left-2 z-10 text-[10px] px-2 py-1 rounded"
        style={{
          background: "rgba(255,255,255,0.8)",
          color: "var(--clr-text-faint)",
        }}
      >
        🖱 滚轮缩放 · 拖拽平移 · 悬停查看
        <span className="ml-2 font-mono" style={{ color: "var(--clr-amber)" }}>
          {data.x.length.toLocaleString()} cells
        </span>
      </div>

      {/* 外部注入的额外元素（如下载按钮） */}
      {children}
    </div>
  );
}
