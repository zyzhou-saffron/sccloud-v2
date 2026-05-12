/**
 * 已上传文件/样本表格组件
 * 每样本一行，支持分组管理和删除
 * 无文件时显示居中的"添加样本"按钮，有文件时最后一行显示"＋ 添加样本"
 */
"use client";

import React, { useState } from "react";

export interface SampleRow {
  fileName: string;
  filePath: string;
  sampleName: string;
  cellCount: number;
  geneCount: number;
  fileSizeMb: number;
  ensemblVersion: string;
}

interface UploadedFilesTableProps {
  samples: SampleRow[];
  sampleGroups: Record<string, string>;
  onGroupChange: (sampleName: string, group: string) => void;
  onDelete: (sampleName: string, filePath: string) => void;
  onAddSample: () => void;
}

const PRESET_GROUPS = ["Control", "Case"];

export default function UploadedFilesTable({
  samples,
  sampleGroups,
  onGroupChange,
  onDelete,
  onAddSample,
}: UploadedFilesTableProps) {
  const [customGroup, setCustomGroup] = useState<Record<string, boolean>>({});

  // 收集已使用的分组选项
  const usedGroups = [...new Set(Object.values(sampleGroups).filter(Boolean))];
  const allGroupOptions = [...new Set([...PRESET_GROUPS, ...usedGroups])];

  return (
    <div
      className="mb-6 rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--clr-border)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--clr-bg-alt)", borderBottom: "1px solid var(--clr-border)" }}>
            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>文件名</th>
            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>样本名</th>
            <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>细胞数</th>
            <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>基因数</th>
            <th className="px-3 py-2 text-right text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>大小</th>
            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--clr-text-muted)" }}>Ensembl</th>
            <th className="px-3 py-2 text-left text-xs font-semibold" style={{ color: "var(--clr-amber-dark)" }}>分组</th>
            <th className="px-3 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s, i) => {
            const currentGroup = sampleGroups[s.sampleName] || "";
            const isCustom = customGroup[s.sampleName] || false;

            return (
              <tr
                key={`${s.filePath}:${s.sampleName}`}
                className="hover:bg-white/50 transition-colors"
                style={{ borderBottom: "1px solid var(--clr-border)" }}
              >
                <td className="px-3 py-2 text-xs" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>
                  {i + 1}
                </td>
                <td className="px-3 py-2 text-xs truncate max-w-[120px]" style={{ color: "var(--clr-text)" }} title={s.fileName}>
                  {s.fileName}
                </td>
                <td className="px-3 py-2 text-xs font-medium" style={{ color: "var(--clr-text)" }}>
                  {s.sampleName}
                </td>
                <td className="px-3 py-2 text-xs text-right" style={{ color: "var(--clr-text)", fontFamily: "var(--font-mono)" }}>
                  {s.cellCount.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-right" style={{ color: "var(--clr-text)", fontFamily: "var(--font-mono)" }}>
                  {s.geneCount.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-right" style={{ color: "var(--clr-text-muted)", fontFamily: "var(--font-mono)" }}>
                  {s.fileSizeMb} MB
                </td>
                <td className="px-3 py-2 text-xs" style={{ color: s.ensemblVersion !== "unknown" ? "var(--clr-amber-dark)" : "var(--clr-text-faint)" }}>
                  {s.ensemblVersion === "unknown" ? "—" : s.ensemblVersion}
                </td>
                <td className="px-3 py-2">
                  {isCustom ? (
                    <input
                      type="text"
                      value={currentGroup}
                      onChange={(e) => onGroupChange(s.sampleName, e.target.value)}
                      onBlur={() => {
                        if (!currentGroup) setCustomGroup(prev => ({ ...prev, [s.sampleName]: false }));
                      }}
                      placeholder="输入分组名"
                      className="w-24 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-[#C86019]/30"
                      style={{ borderColor: "var(--clr-border)", color: "var(--clr-text)" }}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={currentGroup}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") {
                          setCustomGroup(prev => ({ ...prev, [s.sampleName]: true }));
                          onGroupChange(s.sampleName, "");
                        } else {
                          onGroupChange(s.sampleName, e.target.value);
                        }
                      }}
                      className="w-28 px-2 py-1 text-xs border rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C86019]/30"
                      style={{
                        borderColor: "var(--clr-border)",
                        color: currentGroup ? "var(--clr-text)" : "var(--clr-text-faint)",
                        background: "white",
                      }}
                    >
                      <option value="">— 选择分组 —</option>
                      {allGroupOptions.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="__custom__">+ 自定义...</option>
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onDelete(s.sampleName, s.filePath)}
                    title="移除"
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                    style={{ color: "var(--clr-danger)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}

          {/* 添加样本行 */}
          <tr
            onClick={onAddSample}
            className="cursor-pointer hover:bg-[rgba(200,96,25,0.03)] transition-colors"
            style={{ borderBottom: "1px solid var(--clr-border)" }}
          >
            <td colSpan={9} className="px-3 py-2 text-center">
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--clr-text-faint)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                添加样本
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 汇总行 */}
      {samples.length > 0 && (
      <div className="px-3 py-2 text-xs flex items-center justify-between" style={{ background: "var(--clr-bg-alt)", color: "var(--clr-text-muted)" }}>
        <span>
          共 {samples.length} 个样本，{new Set(samples.map(s => s.filePath)).size} 个文件
        </span>
        <span>
          {samples.reduce((sum, s) => sum + s.cellCount, 0).toLocaleString()} 细胞
        </span>
      </div>
      )}
    </div>
  );
}
