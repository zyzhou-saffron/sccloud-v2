/**
 * scCloud v2 — 任务进度追踪组件
 *
 * 使用 useRef 而非闭包变量管理 done 状态，防止 React StrictMode 双重挂载导致的死锁。
 * 优先使用轮询（WebSocket 未启用时），每 2 秒检查一次任务状态。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { connectTaskWS, getTask, type Task } from "../lib/api";

interface ProgressTrackerProps {
  taskId: string | null;
  stepLabel: string;
  onComplete?: (task: Task) => void;
  onError?: (error: string) => void;
}

export default function ProgressTracker({
  taskId,
  stepLabel,
  onComplete,
  onError,
}: ProgressTrackerProps) {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("等待开始...");
  const [status, setStatus] = useState<Task["status"]>("pending");

  // 用 ref 持有回调，避免 stale closure 问题
  const onCompleteRef = useRef(onComplete);
  const onErrorRef    = useRef(onError);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const wsRef   = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // doneRef 用 ref 确保跨 effect 清理时仍能正确读写
  const doneRef = useRef(false);

  useEffect(() => {
    if (!taskId) return;

    // 每次 taskId 变化时完整重置
    doneRef.current = false;
    setProgress(0);
    setMessage("正在连接...");
    setStatus("pending");

    const fireDone = async (task?: Task) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setStatus("completed");
      setMessage("✅ 分析完成");
      setProgress(100);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      wsRef.current?.close();
      const t = task ?? await getTask(taskId).catch(() => null);
      // 即使 getTask 失败，也必须通知父组件任务完成，
      // 否则 ResultViewer 会永远卡在 "正在执行" 转圈。
      onCompleteRef.current?.(t ?? { id: taskId, status: "completed", progress: 100 } as Task);
    };

    const fireError = (msg: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setStatus("failed");
      setMessage(`❌ ${msg}`);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      wsRef.current?.close();
      onErrorRef.current?.(msg);
    };

    // 先立即检查一次当前状态（避免已完成任务显示 pending）
    getTask(taskId).then((task) => {
      if (doneRef.current) return;
      setStatus(task.status);
      setProgress(task.progress ?? 0);
      if (task.status === "completed") fireDone(task);
      else if (task.status === "failed") fireError(task.error_msg || "任务失败");
      else if (task.status === "running") setMessage(`正在执行 ${stepLabel}... (${task.progress}%)`);
    }).catch(() => { /* 忽略初始检查错误 */ });

    // 尝试 WebSocket 连接
    try {
      const ws = connectTaskWS(
        taskId,
        (data) => {
          if (doneRef.current) return;
          setProgress(data.progress);
          setMessage(data.message || `进度 ${data.progress}%`);
          if (data.progress > 0) setStatus("running");
        },
        () => fireDone(),
        () => { /* WS 错误时静默降级到轮询，不锁死 doneRef */ }
      );
      wsRef.current = ws;
    } catch {
      /* WebSocket 不可用，退回轮询 */
    }

    // 轮询备选：每 2 秒检查一次
    pollRef.current = setInterval(async () => {
      if (doneRef.current) { clearInterval(pollRef.current!); return; }
      try {
        const task = await getTask(taskId);
        if (doneRef.current) return;
        setStatus(task.status);
        setProgress(task.progress ?? 0);
        if (task.status === "running") setMessage(`正在执行 ${stepLabel}... (${task.progress}%)`);
        else if (task.status === "completed") await fireDone(task);
        else if (task.status === "failed") fireError(task.error_msg || "任务失败");
      } catch { /* 忽略轮询错误 */ }
    }, 2000);

    return () => {
      doneRef.current = true; // 组件卸载时阻止所有后续回调
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      wsRef.current?.close();
    };
  }, [taskId, stepLabel]);

  if (!taskId) return null;
  if (status === "completed" || status === "failed") return null;

  const barColor = {
    pending:   "bg-[#E0DCD6]",
    running:   "bg-gradient-to-r from-[#C86019] to-[#E07828]",
    completed: "bg-[#2D8A56]",
    failed:    "bg-[#B85450]",
    cancelled: "bg-[#E0DCD6]",
  }[status];

  const dotColor = {
    pending:   "bg-[#999]",
    running:   "bg-[#C86019] animate-pulse",
    completed: "bg-[#2D8A56]",
    failed:    "bg-[#B85450]",
    cancelled: "bg-[#999]",
  }[status];

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
          <span className="text-sm font-medium" style={{ color: "var(--clr-dark)" }}>{stepLabel}</span>
        </div>
        <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--clr-text-muted)" }}>
          {progress}%
        </span>
      </div>

      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--clr-border)" }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>

      <p className="text-xs" style={{ color: "var(--clr-text-muted)" }}>{message}</p>
    </div>
  );
}
