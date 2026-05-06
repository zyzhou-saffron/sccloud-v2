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

/* ── 多色板（可切换） ── */
const PALETTES: Record<string, { name: string; colors: [number, number, number][] }> = {
  tol: {
    name: "Tol (色盲安全)",
    colors: [
      [68, 119, 170],   // Blue    #4477AA
      [102, 204, 238],  // Cyan    #66CCEE
      [34, 136, 51],    // Green   #228833
      [204, 187, 68],   // Yellow  #CCBB44
      [238, 102, 119],  // Red     #EE6677
      [170, 51, 119],   // Purple  #AA3377
      [187, 187, 187],  // Grey    #BBBBBB
      [0, 153, 136],    // Teal    #009988
      [238, 119, 51],   // Orange  #EE7733
      [238, 51, 119],   // Magenta #EE3377
      [51, 34, 136],    // Indigo  #332288
      [153, 153, 51],   // Olive   #999933
      [221, 204, 119],  // Sand    #DDCC77
      [204, 102, 119],  // Rose    #CC6677
      [136, 34, 85],    // Wine    #882255
    ],
  },
  vivid: {
    name: "Vivid (高饱和)",
    colors: [
      [228, 26, 28],    // Red
      [55, 126, 184],   // Blue
      [77, 175, 74],    // Green
      [255, 127, 0],    // Orange
      [152, 78, 163],   // Purple
      [247, 129, 191],  // Pink
      [166, 86, 40],    // Brown
      [255, 215, 0],    // Gold
      [0, 128, 128],    // Teal
      [148, 103, 189],  // Amethyst
      [31, 119, 180],   // Steel Blue
      [174, 199, 232],  // Light Blue
      [255, 152, 150],  // Salmon
      [197, 176, 213],  // Lavender
      [128, 128, 128],  // Grey
    ],
  },
  nature: {
    name: "Nature (经典)",
    colors: [
      [0, 114, 178],    // Blue    #0072B2
      [230, 159, 0],    // Orange  #E69F00
      [0, 158, 115],    // Teal    #009E73
      [213, 94, 0],     // Vermil. #D55E00
      [86, 180, 233],   // Sky     #56B4E9
      [204, 121, 167],  // Purple  #CC79A7
      [240, 228, 66],   // Yellow  #F0E442
      [153, 153, 153],  // Grey    #999999
      [68, 119, 170],   // Blue2
      [17, 119, 51],    // Green
      [153, 153, 51],   // Olive
      [136, 34, 85],    // Wine
      [221, 204, 119],  // Sand
      [68, 170, 153],   // Teal2
      [51, 34, 136],    // Indigo
    ],
  },
  pastel: {
    name: "Pastel (柔和)",
    colors: [
      [102, 194, 165],  // Teal    #66C2A5
      [252, 141, 98],   // Orange  #FC8D62
      [141, 160, 203],  // Blue    #8DA0CB
      [231, 138, 195],  // Pink    #E78AC3
      [166, 216, 84],   // Green   #A6D854
      [255, 217, 47],   // Yellow  #FFD92F
      [229, 196, 148],  // Sand    #E5C494
      [179, 179, 179],  // Grey    #B3B3B3
      [166, 86, 40],    // Brown
      [247, 129, 191],  // Pink2
      [0, 128, 128],    // Teal2
      [148, 103, 189],  // Amethyst
      [166, 216, 84],   // Lime
      [255, 152, 150],  // Salmon
      [128, 128, 128],  // Grey2
    ],
  },
};

const DEFAULT_PALETTE = "tol";

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

  // 色板选择
  const [paletteKey, setPaletteKey] = useState(DEFAULT_PALETTE);
  const currentPalette = PALETTES[paletteKey]?.colors || PALETTES[DEFAULT_PALETTE].colors;

  // 将平行数组 → 对象数组（仅在数据变化时重算）
  const points = useMemo(() => (data ? toPoints(data) : []), [data]);

  // 提取唯一聚类列表并按自然数值排序（C1, C2, ..., C10）
  const clusters = useMemo(() => {
    if (!data) return [];
    const unique = Array.from(new Set(data.cluster));
    unique.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    return unique;
  }, [data]);

  // 聚类 → 颜色索引映射
  const colorMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    clusters.forEach((c, i) => {
      map.set(c, currentPalette[i % currentPalette.length]);
    });
    return map;
  }, [clusters, currentPalette]);

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
      return [c[0], c[1], c[2], 102]; // alpha ~0.4
    },
    stroked: false,
    getRadius: 4,
    radiusUnits: "pixels" as const,
    radiusMinPixels: 2,
    radiusMaxPixels: 8,
    pickable: true,
    onHover,
    updateTriggers: {
      getFillColor: [hiddenClusters.size, paletteKey],
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
        {/* 色板选择器 */}
        <div className="mb-2">
          <select
            value={paletteKey}
            onChange={(e) => setPaletteKey(e.target.value)}
            className="w-full text-[10px] px-1.5 py-1 rounded"
            style={{
              border: "1px solid var(--clr-border)",
              background: "var(--clr-bg-alt)",
              color: "var(--clr-text)",
              cursor: "pointer",
            }}
          >
            {Object.entries(PALETTES).map(([key, pal]) => (
              <option key={key} value={key}>{pal.name}</option>
            ))}
          </select>
        </div>
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
