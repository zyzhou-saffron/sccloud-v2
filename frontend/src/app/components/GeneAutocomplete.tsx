"use client";

/**
 * GeneAutocomplete — 基因名称自动补全输入组件
 *
 * 功能：
 * - 用户输入时实时匹配可用基因列表
 * - 下拉显示匹配结果（最多 20 条）
 * - 支持键盘上下导航 + Enter 选中
 * - 已选基因以 tag 形式展示，可单击移除
 * - 输入为空或无匹配时显示提示
 */

import React, { useState, useRef, useEffect, useCallback } from "react";

interface GeneAutocompleteProps {
  /** 全部可用基因列表 */
  allGenes: string[];
  /** 已选中的基因列表 */
  selected: string[];
  /** 选中列表变更回调 */
  onChange: (genes: string[]) => void;
  /** 基因列表是否正在加载 */
  loading?: boolean;
  /** 占位符文本 */
  placeholder?: string;
}

const MAX_SUGGESTIONS = 20;

export default function GeneAutocomplete({
  allGenes,
  selected,
  onChange,
  loading = false,
  placeholder = "输入基因名搜索…",
}: GeneAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 模糊匹配：前缀优先，然后包含
  const suggestions = useCallback(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    const selectedSet = new Set(selected.map((s) => s.toUpperCase()));
    // 前缀匹配
    const prefixMatches: string[] = [];
    // 包含匹配
    const containsMatches: string[] = [];

    for (const g of allGenes) {
      if (selectedSet.has(g.toUpperCase())) continue;
      const upper = g.toUpperCase();
      if (upper.startsWith(q)) {
        prefixMatches.push(g);
      } else if (upper.includes(q)) {
        containsMatches.push(g);
      }
      if (prefixMatches.length + containsMatches.length >= MAX_SUGGESTIONS) break;
    }
    return [...prefixMatches, ...containsMatches].slice(0, MAX_SUGGESTIONS);
  }, [query, allGenes, selected]);

  const matches = suggestions();

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 高亮索引保持在范围内
  useEffect(() => {
    setHighlightIdx(-1);
  }, [query]);

  // 滚动到高亮项
  useEffect(() => {
    if (listRef.current && highlightIdx >= 0) {
      const el = listRef.current.children[highlightIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  const addGene = (gene: string) => {
    if (!selected.includes(gene)) {
      onChange([...selected, gene]);
    }
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeGene = (gene: string) => {
    onChange(selected.filter((g) => g !== gene));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < matches.length) {
        addGene(matches[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && selected.length > 0) {
      // 空输入时 Backspace 删除最后一个已选基因
      removeGene(selected[selected.length - 1]);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* 已选基因 tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map((gene) => (
            <span
              key={gene}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full cursor-pointer transition-colors hover:opacity-80"
              style={{
                background: "rgba(200,96,25,0.1)",
                color: "var(--clr-amber-dark)",
                border: "1px solid rgba(200,96,25,0.25)",
              }}
              onClick={() => removeGene(gene)}
              title={`点击移除 ${gene}`}
            >
              {gene}
              <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0 opacity-60">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? "正在加载基因列表…" : placeholder}
          disabled={loading}
          className="w-full px-3 py-1.5 text-sm border rounded bg-white transition-colors focus:outline-none focus:ring-1"
          style={{
            borderColor: "var(--clr-border)",
            color: "var(--clr-text)",
          }}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--clr-border)", borderTopColor: "var(--clr-amber)" }}
            />
          </div>
        )}
      </div>

      {/* 下拉建议列表 */}
      {open && query.trim() && (
        <div
          className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto"
          style={{ borderColor: "var(--clr-border)" }}
        >
          {matches.length > 0 ? (
            <ul ref={listRef} className="py-1">
              {matches.map((gene, idx) => {
                // 高亮匹配部分
                const q = query.trim().toUpperCase();
                const matchIdx = gene.toUpperCase().indexOf(q);
                const before = gene.slice(0, matchIdx);
                const match = gene.slice(matchIdx, matchIdx + q.length);
                const after = gene.slice(matchIdx + q.length);

                return (
                  <li
                    key={gene}
                    className="px-3 py-1.5 text-sm cursor-pointer transition-colors"
                    style={{
                      background: idx === highlightIdx ? "rgba(200,96,25,0.08)" : "transparent",
                      color: "var(--clr-text)",
                    }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onClick={() => addGene(gene)}
                  >
                    {before}
                    <strong style={{ color: "var(--clr-amber)" }}>{match}</strong>
                    {after}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              className="px-3 py-3 text-xs text-center"
              style={{ color: "var(--clr-text-faint)" }}
            >
              未找到匹配基因 &quot;{query.trim()}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
