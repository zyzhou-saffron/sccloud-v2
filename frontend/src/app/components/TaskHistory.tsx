/**
 * scCloud v2 — 任务历史组件
 * 显示当前项目的所有任务状态。
 * 刷新页面后任务状态不丢失 (BUG-T2 修复)。
 */
"use client";

import { useEffect, useState } from "react";
import { listTasks, type Task } from "../lib/api";

interface TaskHistoryProps {
  /** 项目 ID */
  projectId: number | null;
  /** 仅显示特定步骤 */
  step?: string;
  /** 点击任务时回调 */
  onSelect?: (task: Task) => void;
}

const STEP_LABELS: Record<string, string> = {
  qc: "数据预处理",
  normalize: "数据标准化",
  reduce: "数据降维",
  cluster: "批次聚类",
  markers: "差异基因",
  enrich: "通路富集",
  marker_expr: "Marker 表达",
  annotate: "细胞注释",
};

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  pending: { dot: "bg-[#999]", text: "text-[#999]" },
  running: { dot: "bg-[#C86019] animate-pulse", text: "text-[#C86019]" },
  completed: { dot: "bg-[#2D8A56]", text: "text-[#2D8A56]" },
  failed: { dot: "bg-[#B85450]", text: "text-[#B85450]" },
  cancelled: { dot: "bg-[#E0DCD6]", text: "text-[#999]" },
};

export default function TaskHistory({
  projectId,
  step,
  onSelect,
}: TaskHistoryProps) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!projectId) return;

    const fetchTasks = async () => {
      try {
        const data = await listTasks(projectId);
        let filtered = data.tasks;
        if (step) {
          filtered = filtered.filter((t) => t.step === step);
        }
        // 仅展示最新 20 条（其余由后端自动删除）
        setTasks(filtered.slice(0, 20));
      } catch {
        /* 后端不可用时忽略 */
      }
    };

    fetchTasks();
    /* 轮询刷新 — 每 5 秒 */
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [projectId, step]);

  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-wider font-medium" style={{ color: "var(--clr-text-muted)" }}>
          历史任务
        </h4>
        <span className="text-[10px]" style={{ color: "var(--clr-text-faint)" }}>
          {tasks.length}/20
        </span>
      </div>
      {tasks.map((task) => {
        const style = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
        return (
          <button
            key={task.id}
            onClick={() => onSelect?.(task)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors"
            style={{ background: "var(--clr-bg-alt)" }}
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate" style={{ color: "var(--clr-text)" }}>
                {STEP_LABELS[task.step] || task.step}
              </div>
              <div className="text-[10px]" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>
                {new Date(task.created_at + (!task.created_at.endsWith("Z") ? "Z" : "")).toLocaleString("zh-CN")}
              </div>
            </div>
            <span className={`text-[10px] font-mono shrink-0 ${style.text}`}>
              {task.status === "completed"
                ? "✓"
                : task.status === "failed"
                ? "✗"
                : task.status === "running"
                ? `${task.progress}%`
                : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
