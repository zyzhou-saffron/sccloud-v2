/**
 * scCloud v2 — 项目选择器 + 管理弹窗
 * ComputaBio 暖色学术风格
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconFolder, IconChart, IconDNA } from "./Icons";
import {
  createProject,
  deleteProject,
  listProjects,
  type Project,
} from "../lib/api";

interface ProjectSelectorProps {
  selectedId: number | null;
  onSelect: (project: Project) => void;
}

export default function ProjectSelector({
  selectedId,
  onSelect,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSpecies, setNewSpecies] = useState("human");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false); setShowNew(false); setError(null); setDeletingId(null);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true); setError(null);
    try {
      const p = await createProject({ name: newName.trim(), description: newDesc || undefined, species: newSpecies });
      await fetchProjects();
      onSelect(p);
      setNewName(""); setNewDesc(""); setShowNew(false); setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id);
      await fetchProjects();
      if (id === selectedId) {
        const remaining = projects.filter((p) => p.id !== id);
        if (remaining.length > 0) onSelect(remaining[0]);
      }
      setDeletingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const selected = projects.find((p) => p.id === selectedId);
  const inputCls = "w-full px-3 py-2 bg-white border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#C86019]/30";

  return (
    <div className="relative" ref={panelRef}>
      {/* 选择器按钮 */}
      <button
        onClick={() => { setOpen(!open); setShowNew(false); setError(null); setDeletingId(null); }}
        className="flex items-center gap-3 px-4 py-2 card hover:shadow-md transition-all text-sm w-full"
      >
        <IconChart className="text-[#C86019]" />
        <span className="flex-1 text-left" style={{ color: "var(--clr-text)" }}>
          {loading ? "加载中..." : selected ? `${selected.name} (${selected.species})` : "选择项目..."}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--clr-text-faint)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {/* 弹出管理面板 */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-96 z-50 animate-fade-in rounded-lg overflow-hidden" style={{ background: "var(--clr-bg-card)", border: "1px solid var(--clr-border)", boxShadow: "var(--shadow-lg)" }}>
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)" }}>
            <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark)" }}>项目管理</h3>
            <button
              onClick={() => { setShowNew(!showNew); setError(null); }}
              className="text-xs px-3 py-1 rounded transition-colors"
              style={{ background: "rgba(200,96,25,0.1)", color: "var(--clr-amber)" }}
            >
              {showNew ? "取消" : "+ 新建"}
            </button>
          </div>

          {/* 新建项目表单 */}
          {showNew && (
            <div className="p-4 space-y-3" style={{ borderBottom: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)" }}>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: "var(--clr-text-muted)" }}>项目名称 *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例: PBMC_3k" className={inputCls} style={{ borderColor: "var(--clr-border)" }} autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] mb-1" style={{ color: "var(--clr-text-muted)" }}>物种</label>
                  <select value={newSpecies} onChange={(e) => setNewSpecies(e.target.value)} className={inputCls} style={{ borderColor: "var(--clr-border)" }}>
                    <option value="human">🧬 Human</option>
                    <option value="mouse">🐭 Mouse</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] mb-1" style={{ color: "var(--clr-text-muted)" }}>描述 (可选)</label>
                  <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="简短描述" className={inputCls} style={{ borderColor: "var(--clr-border)" }} />
                </div>
              </div>
              {error && <div className="callout callout-danger text-xs">{error}</div>}
              <button onClick={handleCreate} disabled={creating || !newName.trim()} className="w-full py-2 text-white text-sm font-medium rounded transition-colors disabled:opacity-40" style={{ background: "var(--clr-amber)" }}>
                {creating ? "创建中..." : "创建项目"}
              </button>
            </div>
          )}

          {/* 项目列表 */}
          <div className="max-h-72 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                <IconFolder size={32} className="mb-2 opacity-30" />
                <p className="text-xs" style={{ color: "var(--clr-text-muted)" }}>暂无项目</p>
                <p className="text-[10px] mt-1" style={{ color: "var(--clr-text-faint)" }}>点击上方「+ 新建」创建第一个项目</p>
              </div>
            ) : (
              projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors group"
                  style={{
                    borderBottom: "1px solid var(--clr-border)",
                    background: p.id === selectedId ? "rgba(200,96,25,0.04)" : undefined,
                  }}
                >
                  <button onClick={() => { onSelect(p); setOpen(false); }} className="flex-1 flex items-center gap-3 text-left">
                    <span className="text-stone-400"><IconDNA size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: p.id === selectedId ? "var(--clr-amber)" : "var(--clr-dark)" }}>{p.name}</div>
                      <div className="text-[10px] flex items-center gap-2" style={{ color: "var(--clr-text-faint)" }}>
                        <span>{new Date(p.created_at).toLocaleDateString("zh-CN")}</span>
                        {p.description && <><span>·</span><span className="truncate">{p.description}</span></>}
                      </div>
                    </div>
                    {p.id === selectedId && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[#2D8A56]"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </button>

                  {deletingId === p.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="text-[10px] px-2 py-1 rounded text-white" style={{ background: "var(--clr-danger)" }}>确认</button>
                      <button onClick={() => setDeletingId(null)} className="text-[10px] px-2 py-1 rounded" style={{ background: "var(--clr-bg-alt)", color: "var(--clr-text-muted)" }}>取消</button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setDeletingId(p.id); }} className="opacity-0 group-hover:opacity-100 transition-all text-xs p-1" style={{ color: "var(--clr-text-faint)" }} title="删除项目">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {projects.length > 0 && (
            <div className="px-4 py-2 text-[10px]" style={{ borderTop: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)", color: "var(--clr-text-faint)" }}>
              共 {projects.length} 个项目
            </div>
          )}
        </div>
      )}
    </div>
  );
}
