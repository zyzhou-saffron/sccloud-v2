'use client';

import { motion } from 'motion/react';
import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * Grid Frosted-Glass Transition
 *
 * 改版说明：
 * - 方块大小统一，使用 opacity 动画替代 scale 缩放
 * - 覆盖阶段：从左上→右下逐格显现（毛玻璃 + 半透明黑）
 * - 揭幕阶段：同方向逐格消失（不反向）
 * - 每个方块带 backdrop-filter: blur 毛玻璃效果
 */
const SQUARE_SIZE = 50;
const DELAY_FACTOR = 0.012;

interface GridTransitionProps {
  isActive: boolean;
  onCovered?: () => void;
  color?: string;
  revealOnMount?: boolean;
}

export default function GridTransition({
  isActive,
  onCovered,
  color: _color,        // 保留接口兼容，但不再使用纯色
  revealOnMount = false
}: GridTransitionProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const cols = Math.ceil(dimensions.width / SQUARE_SIZE);
  const rows = Math.ceil(dimensions.height / SQUARE_SIZE);

  // Pre-compute grid cells only when dimensions change
  const cells = useMemo(
    () =>
      Array.from({ length: cols * rows }, (_, i) => ({
        x: i % cols,
        y: Math.floor(i / cols),
      })),
    [cols, rows]
  );

  // Fire onCovered once the covering wave reaches the last cell
  useEffect(() => {
    if (isActive && cols > 0 && rows > 0 && onCovered) {
      const maxDelay = (cols + rows) * DELAY_FACTOR + 0.35;
      const t = setTimeout(onCovered, maxDelay * 1000);
      return () => clearTimeout(t);
    }
  }, [isActive, cols, rows, onCovered]);

  if (dimensions.width === 0) return null;

  const variants = {
    initial: {
      opacity: 0,
    },
    covered: (c: { x: number; y: number }) => ({
      opacity: 1,
      transition: {
        delay: (c.x + c.y) * DELAY_FACTOR,
        duration: 0.35,
        ease: [0.4, 0, 0.2, 1],
      },
    }),
    // 揭幕：同方向逐格消失（不反向），和覆盖一致的左上→右下顺序
    revealed: (c: { x: number; y: number }) => ({
      opacity: 0,
      transition: {
        delay: (c.x + c.y) * DELAY_FACTOR,
        duration: 0.35,
        ease: [0.4, 0, 0.2, 1],
      },
    }),
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 pointer-events-none flex flex-wrap"
      style={{ width: cols * SQUARE_SIZE, height: rows * SQUARE_SIZE }}
    >
      {cells.map((cell, i) => (
        <motion.div
          key={i}
          custom={cell}
          initial={revealOnMount ? 'covered' : 'initial'}
          animate={isActive ? 'covered' : 'revealed'}
          variants={variants}
          style={{
            width: SQUARE_SIZE,
            height: SQUARE_SIZE,
            // 毛玻璃：半透明黑色 + 模糊背景
            backgroundColor: 'rgba(10, 10, 10, 0.72)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            willChange: 'opacity',
          }}
        />
      ))}
    </div>,
    document.body
  );
}
