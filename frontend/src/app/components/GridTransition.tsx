'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Grid Frosted-Glass Transition — Canvas 高性能版
 *
 * 性能优化：
 * - 旧版: 600+ <motion.div> × backdrop-filter:blur → 每帧 600 次高斯卷积 → <5fps
 * - 新版: 1 个 Canvas + 1 个 backdrop-filter div → 每帧 1 次卷积 → 60fps
 *
 * 视觉效果：
 * - 覆盖阶段: 从左上→右下逐格出现半透明暗色方块 + 全屏毛玻璃渐入
 * - 揭幕阶段: 同方向逐格消失 + 毛玻璃渐出
 */
const SQUARE_SIZE = 50;
const DELAY_FACTOR = 0.012;   // 相邻方块延迟（秒）
const SQUARE_DURATION = 0.30; // 每个方块的渐显时长（秒）
const GAP = 1;                // 方块间隙（像素），0 = 无间隙

interface GridTransitionProps {
  isActive: boolean;
  onCovered?: () => void;
  color?: string;
  revealOnMount?: boolean;
}

export default function GridTransition({
  isActive,
  onCovered,
  color: _color,
  revealOnMount = false,
}: GridTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blurRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const coveredRef = useRef(false);
  const modeRef = useRef<'idle' | 'covering' | 'revealing'>('idle');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // 窗口尺寸监听
  useEffect(() => {
    const update = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const cols = Math.ceil(dimensions.width / SQUARE_SIZE);
  const rows = Math.ceil(dimensions.height / SQUARE_SIZE);
  const maxDiag = cols + rows - 2;
  const totalDuration = maxDiag * DELAY_FACTOR + SQUARE_DURATION;

  /** 核心渲染循环 */
  const runAnimation = useCallback(
    (mode: 'covering' | 'revealing') => {
      const canvas = canvasRef.current;
      const blur = blurRef.current;
      if (!canvas || !blur) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      modeRef.current = mode;
      startRef.current = performance.now() / 1000;
      coveredRef.current = false;

      const loop = () => {
        const elapsed = performance.now() / 1000 - startRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let maxAlpha = 0;
        const isCovering = modeRef.current === 'covering';

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const diag = x + y;
            const delay = diag * DELAY_FACTOR;
            // 0→1 的进度
            const t = Math.max(0, Math.min(1, (elapsed - delay) / SQUARE_DURATION));
            const alpha = isCovering ? t : 1 - t;

            if (alpha > 0.005) {
              maxAlpha = Math.max(maxAlpha, alpha);
              // 半透明暗色方块
              ctx.fillStyle = `rgba(10, 10, 10, ${0.82 * alpha})`;
              ctx.fillRect(
                x * SQUARE_SIZE + GAP,
                y * SQUARE_SIZE + GAP,
                SQUARE_SIZE - GAP * 2,
                SQUARE_SIZE - GAP * 2,
              );
            }
          }
        }

        // 毛玻璃层跟随最大 alpha 同步变化
        blur.style.opacity = String(maxAlpha * 0.6);

        // 覆盖完成回调
        if (isCovering && !coveredRef.current && elapsed >= totalDuration) {
          coveredRef.current = true;
          onCovered?.();
        }

        // 动画未结束则继续
        if (elapsed < totalDuration + 0.15) {
          animRef.current = requestAnimationFrame(loop);
        } else {
          // 动画结束后清理
          if (!isCovering) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            blur.style.opacity = '0';
          }
        }
      };

      animRef.current = requestAnimationFrame(loop);
    },
    [cols, rows, totalDuration, onCovered],
  );

  /** 触发动画 */
  useEffect(() => {
    if (dimensions.width === 0) return;

    if (revealOnMount) {
      // 登录页挂载时：先画满屏 → 延迟后开始揭幕
      const canvas = canvasRef.current;
      const blur = blurRef.current;
      if (canvas && blur) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(10, 10, 10, 0.82)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          blur.style.opacity = '0.6';
        }
      }
      const t = setTimeout(() => runAnimation('revealing'), 80);
      return () => {
        clearTimeout(t);
        if (animRef.current) cancelAnimationFrame(animRef.current);
      };
    }

    if (isActive) {
      runAnimation('covering');
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isActive, revealOnMount, dimensions, runAnimation]);

  if (dimensions.width === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* 单层毛玻璃（性能关键：全屏仅 1 次 blur 计算） */}
      <div
        ref={blurRef}
        style={{
          position: 'absolute',
          inset: 0,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          opacity: 0,
          willChange: 'opacity',
        }}
      />
      {/* Canvas 绘制网格动画 */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ position: 'absolute', inset: 0 }}
      />
    </div>,
    document.body,
  );
}
