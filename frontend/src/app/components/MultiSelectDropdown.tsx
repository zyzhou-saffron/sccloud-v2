"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";

interface MultiSelectDropdownProps {
  /** 可选项列表 */
  options: string[];
  /** 当前已选项 */
  selected: string[];
  /** 选中变化回调 */
  onChange: (selected: string[]) => void;
  /** 选项显示标签（默认直接显示 value） */
  renderLabel?: (value: string) => string;
  /** 触发按钮的占位文字 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 多选下拉菜单组件 — 自定义弹出面板，
 * 样式对齐 ProjectSelector 的下拉风格。
 */
export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  renderLabel = (v) => v,
  placeholder = "请选择…",
  disabled = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /** 点击外部关闭 */
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, handleClickOutside]);

  /** toggle 某个选项 */
  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  /** 触发按钮显示文本 — 始终为 placeholder */

  return (
    <div ref={ref} className="relative" style={{ minWidth: 140 }}>
      {/* 触发按钮 — 始终显示 placeholder，已选内容由外部渲染 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm border rounded transition-colors text-left disabled:opacity-50"
        style={{
          borderColor: open ? "var(--clr-amber)" : "var(--clr-border)",
          background: "#fff",
          color: "var(--clr-text-faint)",
        }}
      >
        <span className="truncate">{placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 下拉面板 */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full border rounded shadow-lg overflow-hidden animate-fade-in"
          style={{
            background: "#fff",
            borderColor: "var(--clr-border)",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--clr-text-faint)" }}>
              暂无可选项
            </div>
          ) : (
            options.map((opt) => {
              const isActive = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-stone-50 transition-colors text-left"
                  style={{ color: isActive ? "var(--clr-amber-dark)" : "var(--clr-text)" }}
                >
                  <span>{renderLabel(opt)}</span>
                  {isActive && (
                    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0" style={{ color: "var(--clr-green, #22c55e)" }}>
                      <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
