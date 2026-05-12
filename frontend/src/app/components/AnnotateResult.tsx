/**
 * scCloud v2 — Step 8 细胞注释 (Annotate) 结果展示组件
 */
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { submitTask, getTask, apiFetch, updateTaskResult, type Task } from "../lib/api";
import DeckScatterPlot from "./charts/DeckScatterPlot";
import type { ScatterData } from "./charts/ScatterPlot";
import GeneExpressionPopup from "./GeneExpressionPopup";

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

interface MarkerTableRow {
  cluster_id: string;
  celltype: string;
  markers: string[];
  annotation_result?: string;
  original_celltype?: string;
}

interface AnnotateData {
  status: string;
  result_path?: string;
  plot_path?: string;
  scatter_data?: { x: number[]; y: number[]; cluster: string[]; celltype?: string[] };
  stats?: {
    cells: number;
    cell_types: number;
    anno_type: string;
    species?: string;
    tissue?: string;
  };
  freq_table?: Array<{ CellType: string; Sample?: string; Freq?: number; n?: number; pct?: number }>;
  marker_table?: MarkerTableRow[];
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
  const [markerTable, setMarkerTable] = useState<MarkerTableRow[]>(annotateData?.marker_table ?? []);

  // 当原始数据变化时重置本地状态
  useEffect(() => {
    setLocalScatter(rawScatter);
    setMarkerTable(annotateData?.marker_table ?? []);
  }, [rawScatter, annotateData?.marker_table]);

  // 编辑中的 annotation_result 值
  const [editedResults, setEditedResults] = useState<Record<string, string>>({});

  // ── 合并模式状态 ──
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeTargetName, setMergeTargetName] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [currentColorBy, setCurrentColorBy] = useState("celltype");
  // 表格点击的高亮类型："cluster" | "celltype" | null
  const [tableHighlightType, setTableHighlightType] = useState<"cluster" | "celltype" | null>(null);

  // ── 基因表达弹窗状态（hover 触发，跟随鼠标） ──
  const [activeGene, setActiveGene] = useState<string | null>(null);
  const [activeCellType, setActiveCellType] = useState<string | null>(null);
  const [geneMousePos, setGeneMousePos] = useState<{ x: number; y: number } | null>(null);
  const geneCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genePopupHovered = useRef(false);

  const openGenePopup = (gene: string, celltype: string, e: React.MouseEvent) => {
    if (geneCloseTimer.current) { clearTimeout(geneCloseTimer.current); geneCloseTimer.current = null; }
    setActiveGene(gene);
    setActiveCellType(celltype);
    setGeneMousePos({ x: e.clientX, y: e.clientY });
  };
  const scheduleCloseGenePopup = () => {
    geneCloseTimer.current = setTimeout(() => {
      if (!genePopupHovered.current) {
        setActiveGene(null);
        setActiveCellType(null);
        setGeneMousePos(null);
      }
    }, 200);
  };

  // 图例维度：表格选中 cluster → 显示 cluster，表格选中 celltype → 显示 celltype
  const deckColorBy = tableHighlightType ?? (mergeMode ? "cluster" : undefined);
  const deckMergeIdKey = tableHighlightType ?? "celltype";

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

  // ── Marker 表格分页 ──
  const [markerPage, setMarkerPage] = useState(0);
  const pageSize = 10;
  const markerPageData = markerTable.slice(markerPage * pageSize, (markerPage + 1) * pageSize);
  const markerTotalPages = Math.ceil(markerTable.length / pageSize);

  // 重置编辑状态（合并模式退出时）
  useEffect(() => {
    if (!mergeMode) {
      setEditedResults({});
      setTableHighlightType(null);
      setSelectedForMerge(new Set());
    }
  }, [mergeMode]);

  const displayScatter = localScatter ?? rawScatter;

  // ── 合并处理（直接更新本地状态 + 持久化到后端，不经过 R engine） ──
  const handleMerge = useCallback(async () => {
    if (selectedForMerge.size < 2 || !mergeTargetName.trim()) return;
    setMerging(true);
    setMergeError(null);

    // 构建 merge_map: celltype -> target
    const merge_map: Record<string, string> = {};
    const target = mergeTargetName.trim();

    if (tableHighlightType === "celltype") {
      for (const ct of selectedForMerge) {
        merge_map[ct] = target;
      }
    } else {
      for (const cid of selectedForMerge) {
        const row = markerTable.find(r => r.cluster_id === cid);
        if (row) merge_map[row.celltype] = target;
      }
    }

    try {
      // 1. 更新 scatter_data.celltype 数组
      const scatter = displayScatter;
      let newScatter: ScatterData | undefined;
      if (scatter) {
        const newCelltype = [...(scatter.celltype ?? [])];
        for (let i = 0; i < newCelltype.length; i++) {
          if (merge_map[newCelltype[i]]) {
            newCelltype[i] = merge_map[newCelltype[i]];
          }
        }
        newScatter = { ...scatter, celltype: newCelltype };
        setLocalScatter(newScatter);
      }

      // 2. 更新 markerTable（只更新 celltype，保留 original_celltype 不变）
      const newMarkerTable = markerTable.map(row =>
        merge_map[row.celltype]
          ? { ...row, celltype: merge_map[row.celltype] }
          : row
      );
      setMarkerTable(newMarkerTable);

      // 3. 持久化到后端
      const updatePayload: Record<string, unknown> = {
        marker_table: newMarkerTable,
      };
      if (newScatter) {
        updatePayload.scatter_data = {
          ...annotateData?.scatter_data,
          celltype: newScatter.celltype,
        };
      }
      await updateTaskResult(taskId, updatePayload);

      // 4. 重置合并状态
      setSelectedForMerge(new Set());
      setMergeTargetName("");
      setMergeMode(false);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "合并失败");
    } finally {
      setMerging(false);
    }
  }, [selectedForMerge, mergeTargetName, tableHighlightType, markerTable, displayScatter, taskId, annotateData?.scatter_data]);

  const toggleMergeSelection = useCallback((id: string, type?: "cluster" | "celltype") => {
    if (type) {
      if (mergeMode) {
        // 调整模式：多选，但只能选同一列
        const switchColumn = tableHighlightType && tableHighlightType !== type;
        if (switchColumn) {
          // 切换列：清空旧选区，选中新项
          setTableHighlightType(type);
          setSelectedForMerge(new Set([id]));
        } else {
          // 同列：累加 toggle
          setTableHighlightType(type);
          setSelectedForMerge(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            if (next.size === 0) setTableHighlightType(null);
            return next;
          });
        }
      } else {
        // 非调整模式：单选（替换）
        const isDeselect = selectedForMerge.has(id) && selectedForMerge.size === 1;
        if (isDeselect) {
          setTableHighlightType(null);
          setSelectedForMerge(new Set());
        } else {
          setTableHighlightType(type);
          setSelectedForMerge(new Set([id]));
        }
      }
    } else {
      // 从 UMAP 图例点击：正常 toggle
      setSelectedForMerge(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (next.size === 0) setTableHighlightType(null);
        return next;
      });
    }
  }, [mergeMode, tableHighlightType, selectedForMerge]);

  // 保存编辑后的注释结果（更新本地状态 + 持久化到后端）
  const [savingResults, setSavingResultsState] = useState(false);
  const handleSaveResults = useCallback(async () => {
    if (Object.keys(editedResults).length === 0) return;

    // 构建 merge_map: cluster_id -> new_celltype
    const clusterRename: Record<string, string> = {};
    for (const [cid, newName] of Object.entries(editedResults)) {
      if (newName.trim()) clusterRename[cid] = newName.trim();
    }

    if (Object.keys(clusterRename).length === 0) return;

    // 更新 scatter_data.celltype 数组
    let newScatter: ScatterData | undefined;
    const scatter = displayScatter;
    if (scatter) {
      const newCelltype = [...(scatter.celltype ?? [])];
      for (let i = 0; i < newCelltype.length; i++) {
        const cid = scatter.cluster[i];
        if (clusterRename[cid]) {
          newCelltype[i] = clusterRename[cid];
        }
      }
      newScatter = { ...scatter, celltype: newCelltype };
      setLocalScatter(newScatter);
    }

    // 更新 markerTable（只更新 celltype，保留 original_celltype 不变）
    const newMarkerTable = markerTable.map(row =>
      clusterRename[row.cluster_id]
        ? { ...row, celltype: clusterRename[row.cluster_id] }
        : row
    );
    setMarkerTable(newMarkerTable);

    setEditedResults({});
    setMergeMode(false);

    // 持久化到后端
    setSavingResultsState(true);
    try {
      const updatePayload: Record<string, unknown> = {
        marker_table: newMarkerTable,
      };
      if (newScatter) {
        updatePayload.scatter_data = {
          ...annotateData?.scatter_data,
          celltype: newScatter.celltype,
        };
      }
      await updateTaskResult(taskId, updatePayload);
    } catch (e) {
      console.error("保存注释结果失败:", e);
    } finally {
      setSavingResultsState(false);
    }
  }, [editedResults, displayScatter, markerTable, taskId, annotateData?.scatter_data]);

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
              {markerTable.length || (stats.cell_types ?? "—")}
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
            mergeIdKey={deckMergeIdKey}
            colorBy={deckColorBy}
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

      {/* ── 保存编辑后的注释结果 ── */}
      {mergeMode && Object.keys(editedResults).length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 p-3 rounded"
          style={{ background: "rgba(200,96,25,0.06)", border: "1px solid var(--clr-amber)" }}
        >
          <span className="text-xs" style={{ color: "var(--clr-text)" }}>
            已修改 <strong>{Object.keys(editedResults).length}</strong> 个聚类的 CellType
          </span>
          <button
            disabled={savingResults}
            onClick={handleSaveResults}
            className="px-4 py-1.5 rounded text-xs font-medium text-white disabled:opacity-50"
            style={{ background: "var(--clr-amber)", cursor: savingResults ? "default" : "pointer" }}
          >
            {savingResults ? "保存中..." : "保存注释结果"}
          </button>
          {mergeError && <span className="text-xs" style={{ color: "var(--clr-danger)" }}>{mergeError}</span>}
        </div>
      )}

      {/* ── Marker 基因注释表 ── */}
      {markerTable.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
            细胞类型注释
            <span className="font-normal ml-1" style={{ color: "var(--clr-text-muted)" }}>
              — {markerTable.length} 个聚类
            </span>
          </p>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--clr-border)" }}>
            <table className="w-full text-xs" style={{ background: "var(--clr-bg-alt)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--clr-border)", background: "var(--clr-bg)" }}>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    ClusterID
                  </th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    原始注释
                  </th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    CellType
                  </th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--clr-amber-dark)" }}>
                    Marker Genes
                  </th>
                </tr>
              </thead>
              <tbody>
                {markerPageData.map((row, idx) => {
                  const isSelected = selectedForMerge.has(row.cluster_id) || selectedForMerge.has(row.celltype);
                  const rowBg = isSelected
                    ? "rgba(200,96,25,0.1)"
                    : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.4)";
                  const displayCelltype = editedResults[row.cluster_id] ?? row.celltype;
                  return (
                    <tr
                      key={row.cluster_id}
                      style={{
                        borderBottom: "1px solid var(--clr-border)",
                        background: rowBg,
                        transition: "background 0.15s",
                      }}
                    >
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => toggleMergeSelection(row.cluster_id, "cluster")}
                          className="px-2 py-0.5 rounded text-xs font-mono transition-all"
                          style={{
                            background: isSelected && tableHighlightType === "cluster" ? "var(--clr-amber)" : "var(--clr-bg-alt)",
                            color: isSelected && tableHighlightType === "cluster" ? "#fff" : "var(--clr-text)",
                            border: `1px solid ${isSelected && tableHighlightType === "cluster" ? "var(--clr-amber)" : "var(--clr-border)"}`,
                            cursor: "pointer",
                          }}
                        >
                          {row.cluster_id}
                        </button>
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--clr-text-muted)" }}>
                        {row.original_celltype ?? row.celltype}
                      </td>
                      <td className="px-2 py-1.5">
                        {mergeMode ? (
                          <input
                            type="text"
                            value={displayCelltype}
                            onChange={e => {
                              setEditedResults(prev => ({ ...prev, [row.cluster_id]: e.target.value }));
                            }}
                            className="w-full px-1.5 py-0.5 rounded text-xs"
                            style={{
                              border: "1px solid var(--clr-border)",
                              background: "var(--clr-bg)",
                              color: "var(--clr-text)",
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => toggleMergeSelection(row.celltype, "celltype")}
                            className="px-2 py-0.5 rounded text-xs transition-all"
                            style={{
                              background: isSelected && tableHighlightType === "celltype" ? "var(--clr-amber)" : "var(--clr-bg-alt)",
                              color: isSelected && tableHighlightType === "celltype" ? "#fff" : "var(--clr-text)",
                              border: `1px solid ${isSelected && tableHighlightType === "celltype" ? "var(--clr-amber)" : "var(--clr-border)"}`,
                              cursor: "pointer",
                            }}
                          >
                            {row.celltype}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--clr-text)", maxWidth: 260 }}>
                        {row.markers.length > 0 ? (
                          <>
                            {row.markers.slice(0, 5).map((g, gi) => (
                              <React.Fragment key={g}>
                                <button
                                  onMouseEnter={(e) => openGenePopup(g, row.celltype, e)}
                                  onMouseLeave={scheduleCloseGenePopup}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    color: activeGene === g ? "#60a5fa" : "var(--clr-text)",
                                    cursor: "pointer",
                                    textDecoration: activeGene === g ? "underline" : "none",
                                    fontSize: "inherit",
                                    fontFamily: "inherit",
                                  }}
                                >
                                  {g}
                                </button>
                                {gi < Math.min(4, row.markers.length - 1) && (
                                  <span style={{ color: "var(--clr-text-muted)" }}>, </span>
                                )}
                              </React.Fragment>
                            ))}
                            {row.markers.length > 5 && (
                              <span style={{ color: "var(--clr-text-muted)" }}> +{row.markers.length - 5}</span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: "var(--clr-text-faint)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── 分页控制 ── */}
          {markerTotalPages > 1 && (
            <div className="flex justify-center gap-2 text-xs">
              <button
                disabled={markerPage === 0}
                onClick={() => setMarkerPage(Math.max(0, markerPage - 1))}
                className="px-2 py-1 rounded disabled:opacity-50"
                style={{
                  border: "1px solid var(--clr-border)",
                  background: markerPage === 0 ? "transparent" : "var(--clr-bg-alt)",
                  cursor: markerPage === 0 ? "default" : "pointer",
                }}
              >
                上一页
              </button>
              <span style={{ color: "var(--clr-text-muted)" }}>
                第 {markerPage + 1} / {markerTotalPages} 页
              </span>
              <button
                disabled={markerPage >= markerTotalPages - 1}
                onClick={() => setMarkerPage(Math.min(markerTotalPages - 1, markerPage + 1))}
                className="px-2 py-1 rounded disabled:opacity-50"
                style={{
                  border: "1px solid var(--clr-border)",
                  background: markerPage >= markerTotalPages - 1 ? "transparent" : "var(--clr-bg-alt)",
                  cursor: markerPage >= markerTotalPages - 1 ? "default" : "pointer",
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

      {/* ── 基因表达弹窗（hover 触发） ── */}
      {activeGene && geneMousePos && typeof window !== "undefined" && createPortal(
        <GeneExpressionPopup
          gene={activeGene}
          celltype={activeCellType}
          projectId={task.project_id}
          mousePos={geneMousePos}
          onMouseEnter={() => {
            genePopupHovered.current = true;
            if (geneCloseTimer.current) { clearTimeout(geneCloseTimer.current); geneCloseTimer.current = null; }
          }}
          onMouseLeave={() => {
            genePopupHovered.current = false;
            scheduleCloseGenePopup();
          }}
          token={token}
        />,
        document.body
      )}
    </div>
  );
}
