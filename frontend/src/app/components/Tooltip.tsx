"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

/**
 * 磨玻璃悬浮提示组件
 * 使用 createPortal 渲染到 document.body，完全脱离父层级 stacking context，
 * 不受参数 card 或任何父容器 z-index 限制。
 * 通过 getBoundingClientRect() 计算真实屏幕坐标定位。
 */
export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // 确保只在客户端挂载后才渲染 portal
  useEffect(() => { setMounted(true); }, []);

  const parsedContent =
    typeof content === "string" ? content.replace(/\\n/g, "\n") : content;

  /** 计算气泡应出现的屏幕坐标（锚点中心正上方） */
  const updatePos = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      // 气泡底部对齐锚点顶部，再留 8px 间距 (用 CSS marginBottom 实现)
      top: rect.top + window.scrollY,
      left: rect.left + rect.width / 2 + window.scrollX,
    });
  }, []);

  const handleEnter = () => {
    updatePos();
    setVisible(true);
  };
  const handleLeave = () => setVisible(false);

  const bubble = mounted ? createPortal(
    <div
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        // 把气泡底边对齐到锚点顶边，上移 8px 间距
        transform: "translate(-50%, calc(-100% - 8px))",
        width: "max-content",
        maxWidth: 280,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.2s ease",
        zIndex: 99999,
      }}
    >
      {/* 内容面板 — 磨玻璃 */}
      <div
        style={{
          backgroundColor: "rgba(45, 41, 38, 0.80)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          color: "rgba(255, 255, 255, 0.95)",
          fontSize: 12,
          lineHeight: 1.65,
          padding: "10px 13px",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.30)",
          whiteSpace: "pre-wrap" as const,
          wordBreak: "break-word" as const,
        }}
      >
        {parsedContent}
      </div>

      {/* 底部三角箭头 */}
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid rgba(45, 41, 38, 0.80)",
        }}
      />
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* 锚点：问号图标 */}
      <div
        ref={anchorRef}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          flexShrink: 0,
          cursor: "help",
        }}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </div>

      {/* Portal 气泡（渲染到 body 最顶层） */}
      {bubble}
    </>
  );
}
