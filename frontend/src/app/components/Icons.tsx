/**
 * scCloud v2 — SVG 图标库
 * GitHub Octicons 风格: 单色描边线条图标
 * 所有图标统一 24x24 viewBox, currentColor 填充
 */

interface IconProps {
  className?: string;
  size?: number;
}

const defaultProps = { size: 16 };

/** 烧瓶 — 分析流程 */
export function IconBeaker({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M10 3v5.172a2 2 0 0 1-.586 1.414L5 14l1.5 5.5a2 2 0 0 0 1.93 1.5h7.14a2 2 0 0 0 1.93-1.5L19 14l-4.414-4.414A2 2 0 0 1 14 8.172V3" />
      <path d="M8 14h8" />
    </svg>
  );
}

/** 显微镜 — 数据预处理/QC */
export function IconMicroscope({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

/** 柱状图 — 数据标准化 */
export function IconBarChart({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" rx="1" />
      <rect x="10" y="5" width="4" height="16" rx="1" />
      <rect x="17" y="8" width="4" height="13" rx="1" />
    </svg>
  );
}

/** 坐标系 — 数据降维 */
export function IconAxis({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <circle cx="9" cy="14" r="1.5" />
      <circle cx="14" cy="9" r="1.5" />
      <circle cx="11" cy="11" r="1.5" />
      <circle cx="16" cy="14" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  );
}

/** 节点网络 — 批次聚类 */
export function IconCluster({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M12 7.5v3.5" />
      <path d="M8.5 15.5 11 12" />
      <path d="M15.5 15.5 13 12" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

/** 试管 — 差异基因 */
export function IconTestTube({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2v6.5a2 2 0 0 1-.8 1.6l-6.4 4.8A2 2 0 0 0 6.5 16.5v1a3.5 3.5 0 0 0 3.5 3.5h4a3.5 3.5 0 0 0 3.5-3.5v-1a2 2 0 0 0-.8-1.6L10.5 10V2" />
      <path d="M10.5 2h4" />
      <path d="M7 15h10" />
    </svg>
  );
}

/** 链环 — 通路富集 */
export function IconPathway({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** 波形 — Marker 表达 */
export function IconWaveform({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2l3-9 4 18 4-12 3 6h4" />
    </svg>
  );
}

/** 标签 — 细胞注释 */
export function IconTag({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l6.58-6.58a1 1 0 0 0 0-1.42L12 2Z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** 双向箭头 — 格式转换 */
export function IconConvert({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 6h18" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 18H3" />
    </svg>
  );
}

/** 齿轮 — 设置 */
export function IconGear({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

/** DNA — Human/基因 */
export function IconDNA({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 15c6.667-6 13.333 0 20-6" />
      <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993" />
      <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993" />
      <path d="M17 6H3" />
      <path d="M21 18H7" />
    </svg>
  );
}

/** 文件夹 — 项目 */
export function IconFolder({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

/** 图表 — 项目统计 */
export function IconChart({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 5 5-6" />
    </svg>
  );
}

/** 过滤器 — 过滤结果 */
export function IconFilter({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

/** 上升折线 — 趋势 */
export function IconTrend({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

/** 向上箭头 — 上传 */
export function IconUpload({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

/** 问号 — Tooltip 提示 */
export function IconQuestion({ className, size = defaultProps.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
