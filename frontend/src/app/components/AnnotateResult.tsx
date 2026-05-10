/**
 * scCloud v2 — Step 8 细胞注释 (Annotate) 结果展示组件
 */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { submitTask, getTask, apiFetch, type Task } from "../lib/api";
import DeckScatterPlot from "./charts/DeckScatterPlot";
import type { ScatterData } from "./charts/ScatterPlot";

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

  if (failed) return <div className={className} style={style}>Failed to load image</div>;
  if (!blobUrl) return <div className={className} style={style} />;

  return <img src={blobUrl} alt={alt} className={className} style={style} />;
}

interface AnnotateData {
  status: string;
  result_path?: string;
  plot_path?: string;
  scatter_data?: { x: number[]; y: number[]; cluster: string[] };
  stats?: {
    cells: number;
    cell_types: number;
    anno_type: string;
  };
  freq_table?: Array<{ CellType: string; Sample?: string; Freq?: number; n?: number; pct?: number }>;
}

function safeScatter(raw: unknown): ScatterData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const x = (r.x ?? r.X) as number[] | undefined;
  const y = (r.y ?? r.Y) as number[] | undefined;
  const cluster = (r.cluster ?? r.Cluster ?? r.label) as string[] | undefined;
  if (!Array.isArray(x) || !Array.isArray(y)) return undefined;
  return {
    x,
    y,
    cluster: Array.isArray(cluster) ? cluster : x.map(() => "0"),
    celltype: Array.isArray(r.celltype) ? r.celltype as string[] : undefined,
    sample: Array.isArray(r.sample) ? r.sample as string[] : undefined,
    group: Array.isArray(r.group) ? r.group as string[] : undefined,
  };
}

export default function AnnotateResult({
  data,
  task,
  token,
}: {
  data: Record<string, unknown> | null;
  task: Task;
  token?: string;
}) {
  const taskId = task.id;
  const annotateData = data as AnnotateData | null;

  const stats = annotateData?.stats;
  const rawScatter = useMemo(() => safeScatter(annotateData?.scatter_data), [annotateData]);

  // ── 本地状态（合并后可更新） ──
  const [localScatter, setLocalScatter] = useState<ScatterData | undefined>(rawScatter);
  const [localFreqTable, setLocalFreqTable] = useState<AnnotateData["freq_table"]>(annotateData?.freq_table ?? []);

  // 当原始数据变化时重置本地状态
  useEffect(() => {
    setLocalScatter(rawScatter);
    setLocalFreqTable(annotateData?.freq_table ?? []);
  }, [rawScatter, annotateData?.freq_table]);

  const freqTable = localFreqTable ?? [];

  // ── 合并模式状态 ──
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeTargetName, setMergeTargetName] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [currentColorBy, setCurrentColorBy] = useState("celltype");

  // 切换分类维度时清空合并选区
  useEffect(() => {
    setSelectedForMerge(new Set());
    setMergeTargetName("");
  }, [currentColorBy]);

  // ── 图片 URL 构建 ──
  const extractName = (val: unknown) => {
    if (typeof val === "string") return val.split("/").pop();
    if (Array.isArray(val) && typeof val[0] === "string")
      return (val[0] as string).split("/").pop();
    return null;
  };
  const plotName = extractName(annotateData?.plot_path) ?? "plot_annotate.png";
  const plotSrc = taskId ? `/api/tasks/${taskId}/plot?name=${encodeURIComponent(plotName)}` : null;

  // ── 频率表分页 ──
  const [freqPage, setFreqPage] = useState(0);
  const pageSize = 10;
  const freqPageData = freqTable.slice(freqPage * pageSize, (freqPage + 1) * pageSize);
  const freqTotalPages = Math.ceil(freqTable.length / pageSize);

  const displayScatter = localScatter ?? rawScatter;

  // ── 合并处理 ──
  const handleMerge = useCallback(async () => {
    if (selectedForMerge.size < 2 || !mergeTargetName.trim()) return;
    setMerging(true);
    setMergeError(null);

    // 根据当前分类维度构建 merge_map
    const merge_map: Record<string, string> = {};
    const target = mergeTargetName.trim();

    if (currentColorBy === "celltype") {
      // 直接按 celltype 合并
      for (const ct of selectedForMerge) {
        merge_map[ct] = target;
      }
    } else if (displayScatter) {
      // 按其他维度（cluster/sample/group）选中的，找到对应的 celltype 值进行合并
      const selectedCelltypes = new Set<string>();
      const categoryKey = currentColorBy as keyof typeof displayScatter;
      const categoryArr = displayScatter[categoryKey];
      const celltypeArr = displayScatter.celltype;
      if (Array.isArray(categoryArr) && Array.isArray(celltypeArr)) {
        for (let i = 0; i < categoryArr.length; i++) {
          if (selectedForMerge.has(categoryArr[i] as string)) {
            selectedCelltypes.add(celltypeArr[i]);
          }
        }
      }
      for (const ct of selectedCelltypes) {
        merge_map[ct] = target;
      }
    }

    try {
      const res = await submitTask({
        project_id: task.project_id,
        step: "merge_celltypes",
        params: { merge_map },
      });

      // 轮询等待完成
      const pollTask = async (id: string): Promise<Task> => {
        const t = await getTask(id);
        if (t.status === "failed") throw new Error(t.error_msg || "合并失败");
        if (t.status === "completed") return t;
        await new Promise(r => setTimeout(r, 1500));
        return pollTask(id);
      };

      const completedTask = await pollTask(res.id);

      // 获取更新后的结果
      const resultData = await apiFetch<Record<string, unknown>>(`/api/tasks/${completedTask.id}/result`);

      // 更新本地状态
      if (resultData?.scatter_data) {
        const newScatter = safeScatter(resultData.scatter_data);
        if (newScatter) setLocalScatter(newScatter);
      }
      if (resultData?.freq_table) {
        setLocalFreqTable(resultData.freq_table as AnnotateData["freq_table"]);
      }

      // 重置合并状态
      setSelectedForMerge(new Set());
      setMergeTargetName("");
      setMergeMode(false);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "合并失败");
    } finally {
      setMerging(false);
    }
  }, [selectedForMerge, mergeTargetName, task.project_id, currentColorBy, displayScatter]);

  const toggleMergeSelection = useCallback((celltype: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(celltype)) next.delete(celltype);
      else next.add(celltype);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* ── 顶部统计胶囊 + 编辑按钮 ── */}
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
              {freqTable.length || (stats.cell_types ?? "—")}
            </strong>
          </span>
          <span>
            注释方法：
            <strong style={{ color: "var(--clr-text)" }}>
              {stats.anno_type ?? "—"}
            </strong>
          </span>
          {/* 合并按钮 */}
          <button
            onClick={() => {
              setMergeMode(!mergeMode);
              if (mergeMode) {
                setSelectedForMerge(new Set());
                setMergeTargetName("");
                setMergeError(null);
              }
            }}
            className="ml-auto px-5 py-2 rounded-lg text-sm font-bold transition-colors"
            style={mergeMode
              ? { background: "var(--clr-amber)", color: "#fff", cursor: "pointer", boxShadow: "0 2px 8px rgba(200,96,25,0.3)" }
              : { background: "var(--clr-amber)", color: "#fff", cursor: "pointer", boxShadow: "0 2px 8px rgba(200,96,25,0.2)" }
            }
          >
            {mergeMode ? "退出调整" : "调整注释结果"}
          </button>
        </div>
      )}

      {/* ── 合并模式提示 ── */}
      {mergeMode && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded text-xs"
          style={{ background: "rgba(200,96,25,0.06)", border: "1px solid rgba(200,96,25,0.2)", color: "var(--clr-amber-dark)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
          点击图例或 UMAP 图上的点进行多选，然后输入合并后的名称
        </div>
      )}

      {/* ── UMAP 注释图 ── */}
      {displayScatter ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
            细胞类型 UMAP 标注图
          </p>
          <DeckScatterPlot
            data={displayScatter}
            method="UMAP"
            height={520}
            mergeMode={mergeMode}
            selectedForMerge={selectedForMerge}
            onToggleMerge={toggleMergeSelection}
            onColorByChange={setCurrentColorBy}
          />
        </div>
      ) : plotSrc && (
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

      {/* ── 合并操作栏 ── */}
      {mergeMode && selectedForMerge.size >= 2 && (
        <div
          className="flex flex-wrap items-center gap-3 p-3 rounded"
          style={{ background: "rgba(200,96,25,0.06)", border: "1px solid var(--clr-amber)" }}
        >
          <span className="text-xs" style={{ color: "var(--clr-text)" }}>
            已选择 <strong>{selectedForMerge.size}</strong> 项：
            {Array.from(selectedForMerge).join(" + ")}
          </span>
          <span className="text-xs" style={{ color: "var(--clr-text-muted)" }}>=</span>
          <input
            type="text"
            value={mergeTargetName}
            onChange={e => setMergeTargetName(e.target.value)}
            placeholder="合并后的名称..."
            className="px-2 py-1 rounded text-xs"
            style={{ border: "1px solid var(--clr-border)", width: 180, background: "var(--clr-bg-alt)", color: "var(--clr-text)" }}
          />
          <button
            disabled={!mergeTargetName.trim() || merging}
            onClick={handleMerge}
            className="px-4 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
            style={{ background: "var(--clr-amber)", cursor: !mergeTargetName.trim() || merging ? "default" : "pointer" }}
          >
            {merging ? "合并中..." : "合并"}
          </button>
          {mergeError && <span className="text-xs" style={{ color: "var(--clr-danger)" }}>{mergeError}</span>}
        </div>
      )}

      {mergeMode && selectedForMerge.size === 1 && (
        <div className="text-xs" style={{ color: "var(--clr-text-faint)" }}>
          请继续选择至少 2 项
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
      {!annotateData && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: "rgba(255,215,0,0.08)", borderLeft: "3px solid var(--clr-gold)", color: "var(--clr-text-muted)" }}>
          注释结果加载中或暂未返回...
        </div>
      )}
    </div>
  );
}
