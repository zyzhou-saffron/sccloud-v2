/**
 * scCloud v2 — Step 8 细胞注释 (Annotate) 结果展示组件
 */
"use client";

import React, { useState, useEffect } from "react";
import type { Task } from "../lib/api";

function getToken() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token") || "";
  }
  return "";
}

function AuthImg({ src, alt, token, className, style }: {
  src: string | null;
  alt: string;
  token?: string;
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
    const authToken = token || getToken();
    fetch(src, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); })
      .catch(() => setFailed(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, token]);

  if (failed) return <div className={className} style={style}>❌ Failed to load image</div>;
  if (!blobUrl) return <div className={className} style={style} />;

  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}

interface AnnotateData {
  status: string;
  result_path?: string;
  plot_path?: string;
  stats?: {
    cells: number;
    cell_types: number;
    anno_type: string;  // "自动注释" or "手动注释"
  };
  freq_table?: Array<{ CellType: string; Sample?: string; Freq?: number; n?: number; pct?: number }>;
}

export default function AnnotateResult({
  task,
  token,
}: {
  task: Task;
  token?: string;
}) {
  const taskId = task.id;

  // 解析结果数据
  let data: AnnotateData | null = null;
  try {
    if (task.result && typeof task.result === "string") {
      data = JSON.parse(task.result);
    } else if (task.result && typeof task.result === "object") {
      data = task.result as AnnotateData;
    }
  } catch (e) {
    console.error("Failed to parse annotate result:", e);
  }

  const stats = data?.stats;
  const freqTable = data?.freq_table ?? [];

  // ── 图片 URL 构建 ──
  const extractName = (val: unknown) => {
    if (typeof val === "string") return val.split("/").pop();
    if (Array.isArray(val) && typeof val[0] === "string")
      return (val[0] as string).split("/").pop();
    return null;
  };
  const plotName = extractName(data?.plot_path) ?? "plot_annotate.png";
  const plotSrc = taskId ? `/api/tasks/${taskId}/plot?name=${encodeURIComponent(plotName)}` : null;

  // ── 频率表分页 ──
  const [freqPage, setFreqPage] = useState(0);
  const pageSize = 10;
  const freqPageData = freqTable.slice(freqPage * pageSize, (freqPage + 1) * pageSize);
  const freqTotalPages = Math.ceil(freqTable.length / pageSize);

  return (
    <div className="space-y-4">
      {/* ── 顶部统计胶囊 ── */}
      {stats && (
        <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--clr-text-muted)" }}>
          <span>
            细胞数：
            <strong style={{ color: "var(--clr-text)" }}>
              {stats.cells?.toLocaleString()}
            </strong>
          </span>
          <span>
            细胞类型数：
            <strong style={{ color: "var(--clr-amber)", fontSize: "1rem" }}>
              {stats.cell_types ?? "—"}
            </strong>
          </span>
          <span>
            注释方法：
            <strong style={{ color: "var(--clr-text)" }}>
              {stats.anno_type ?? "—"}
            </strong>
          </span>
        </div>
      )}

      {/* ── UMAP 注释图 ── */}
      {plotSrc && (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
            细胞类型 UMAP 标注图
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-muted)" }}>
              — R ggplot2 原版输出
            </span>
          </p>
          <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "var(--clr-border)" }}>
            <AuthImg src={plotSrc} alt="Annotation UMAP" token={token} />
          </div>
        </div>
      )}

      {/* ── 细胞类型频率表 ── */}
      {freqTable.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
            细胞类型频率统计
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-muted)" }}>
              — {freqTable.length} 种细胞类型
            </span>
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--clr-border)" }}>
            <table className="w-full text-xs" style={{ background: "var(--clr-bg-alt)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--clr-border)", background: "var(--clr-bg)" }}>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    细胞类型
                  </th>
                  <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    样本
                  </th>
                  <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    占比
                  </th>
                </tr>
              </thead>
              <tbody>
                {freqPageData.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid var(--clr-border)",
                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    <td className="px-3 py-2" style={{ color: "var(--clr-text)" }}>
                      {row.CellType ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--clr-text)" }}>
                      {row.Sample ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: "var(--clr-text)" }}>
                      {((row.Freq ?? row.pct ?? 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 分页控制 ── */}
          {freqTotalPages > 1 && (
            <div className="flex justify-center gap-2 text-xs">
              <button
                disabled={freqPage === 0}
                onClick={() => setFreqPage(Math.max(0, freqPage - 1))}
                className="px-2 py-1 rounded disabled:opacity-50"
                style={{
                  border: "1px solid var(--clr-border)",
                  background: freqPage === 0 ? "transparent" : "var(--clr-bg-alt)",
                  cursor: freqPage === 0 ? "default" : "pointer",
                }}
              >
                上一页
              </button>
              <span style={{ color: "var(--clr-text-muted)" }}>
                第 {freqPage + 1} / {freqTotalPages} 页
              </span>
              <button
                disabled={freqPage >= freqTotalPages - 1}
                onClick={() => setFreqPage(Math.min(freqTotalPages - 1, freqPage + 1))}
                className="px-2 py-1 rounded disabled:opacity-50"
                style={{
                  border: "1px solid var(--clr-border)",
                  background: freqPage >= freqTotalPages - 1 ? "transparent" : "var(--clr-bg-alt)",
                  cursor: freqPage >= freqTotalPages - 1 ? "default" : "pointer",
                }}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 无数据状态 ── */}
      {!data && (
        <div className="callout text-xs" style={{ background: "rgba(255,215,0,0.08)", borderLeft: "3px solid var(--clr-gold)" }}>
          注释结果加载中或暂未返回...
        </div>
      )}
    </div>
  );
}
