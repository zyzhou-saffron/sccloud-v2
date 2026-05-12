/**
 * 项目文件选择模态框
 * 列出项目 storage_path 中已有的数据文件，支持勾选后批量添加
 */
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { listProjectFiles, inspectFileByPath, type ProjectFile, type InspectResult } from "../lib/api";

export interface FileWithInspect {
  path: string;
  inspect: InspectResult;
}

interface ProjectFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFilesSelected: (files: FileWithInspect[]) => void;
  projectId: number;
  existingPaths: string[];
}

export default function ProjectFilesModal({
  isOpen,
  onClose,
  onFilesSelected,
  projectId,
  existingPaths,
}: ProjectFilesModalProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    listProjectFiles(projectId)
      .then(setFiles)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const existingSet = new Set(existingPaths);
  const toggleSelect = (path: string) => {
    if (existingSet.has(path)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleConfirm = async () => {
    const paths = [...selected];
    if (paths.length === 0) return;
    setInspecting(true);
    setProgress({ done: 0, total: paths.length });
    try {
      const results: FileWithInspect[] = [];
      for (const p of paths) {
        const r = await inspectFileByPath(p);
        results.push({ path: p, inspect: r });
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }
      onFilesSelected(results);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析文件失败");
    } finally {
      setInspecting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-xl shadow-2xl animate-fade-in"
        style={{ background: "var(--clr-bg-card)", border: "1px solid var(--clr-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--clr-border)" }}>
          <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark-deep)" }}>
            从项目文件选择
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5 transition-colors" style={{ color: "var(--clr-text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: "calc(80vh - 120px)" }}>
          {error && (
            <div className="mb-3 px-3 py-2 rounded text-xs border" style={{ borderColor: "var(--clr-danger)", background: "rgba(220,53,69,0.05)", color: "var(--clr-danger)" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center">
              <svg className="animate-spin mx-auto mb-2" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--clr-amber)" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="15.7" opacity="0.3" /><circle cx="12" cy="12" r="10" strokeDasharray="15.7" /></svg>
              <p className="text-xs" style={{ color: "var(--clr-text-muted)" }}>加载文件列表...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs" style={{ color: "var(--clr-text-muted)" }}>项目中暂无数据文件</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)" }}>
                  <th className="px-2 py-1.5" style={{ width: "60px" }}></th>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>文件名</th>
                  <th className="px-2 py-1.5 text-right text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>大小</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const isExisting = existingSet.has(f.path);
                  const isSelected = selected.has(f.path);
                  return (
                    <tr
                      key={f.path}
                      onClick={() => toggleSelect(f.path)}
                      className={`transition-colors ${isExisting ? "opacity-50" : "cursor-pointer hover:bg-white/60"}`}
                      style={{ borderBottom: "1px solid var(--clr-border)", height: "32px" }}
                    >
                      <td className="px-2 text-center" style={{ height: "32px", verticalAlign: "middle" }}>
                        {isExisting ? (
                          <span className="text-[10px] leading-none" style={{ color: "var(--clr-text-faint)" }}>已添加</span>
                        ) : (
                          <input type="checkbox" checked={isSelected} readOnly className="accent-[#C86019]" />
                        )}
                      </td>
                      <td className="px-2 text-xs truncate max-w-[280px]" style={{ height: "32px", verticalAlign: "middle", color: "var(--clr-text)" }} title={f.filename}>{f.filename}</td>
                      <td className="px-2 text-xs text-right whitespace-nowrap" style={{ height: "32px", verticalAlign: "middle", color: "var(--clr-text-muted)", fontFamily: "var(--font-mono)" }}>{f.size_mb} MB</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)" }}>
          <span className="text-xs" style={{ color: "var(--clr-text-faint)" }}>
            {inspecting ? `解析中 ${progress.done}/${progress.total}...` : `已选 ${selected.size} 个文件`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border transition-colors hover:bg-black/5" style={{ borderColor: "var(--clr-border)", color: "var(--clr-text-muted)" }}>
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0 || inspecting}
              className="px-3 py-1.5 text-xs rounded font-medium text-white transition-all"
              style={{
                background: selected.size === 0 || inspecting ? "var(--clr-text-muted)" : "var(--clr-amber)",
                cursor: selected.size === 0 || inspecting ? "not-allowed" : "pointer",
                opacity: selected.size === 0 || inspecting ? 0.6 : 1,
              }}
            >
              确认添加
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
