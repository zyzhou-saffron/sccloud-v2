/**
 * Pipeline 全流程视图 — 最小化版本
 *
 * 功能：
 * 1. 显示 Pipeline 整体状态
 * 2. 列出 8 个步骤的执行进度
 * 3. 对已完成步骤展示结果（复用 ResultViewer）
 */
"use client";

import React, { useEffect, useState } from "react";
import { getPipeline, type Pipeline, type PipelineTask } from "../../../lib/pipeline-api";
import ProgressTracker from "../../../components/ProgressTracker";
import ResultViewer from "../../../components/ResultViewer";
import type { Task } from "../../../lib/api";

const STEPS = [
  { id: "qc", label: "数据预处理", apiStep: "qc" },
  { id: "normalize", label: "数据标准化", apiStep: "normalize" },
  { id: "reduce", label: "数据降维", apiStep: "reduce" },
  { id: "cluster", label: "批次聚类", apiStep: "cluster" },
  { id: "markers", label: "差异基因", apiStep: "markers" },
  { id: "enrich", label: "通路富集", apiStep: "enrich" },
  { id: "marker_expr", label: "Marker 表达", apiStep: "marker_expr" },
  { id: "annotate", label: "细胞注释", apiStep: "annotate" },
];

interface PipelineViewProps {
  pipelineId: string;
  token: string;
}

export default function PipelineView({ pipelineId, token }: PipelineViewProps) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // 轮询 Pipeline 状态
  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getPipeline(token, pipelineId);
        setPipeline(data);
        setLoading(false);

        // 如果仍在运行，继续轮询
        if (data.status === "running") {
          setPollInterval(
            setTimeout(fetch, 2000) as unknown as NodeJS.Timeout
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    fetch();

    return () => {
      if (pollInterval) clearTimeout(pollInterval);
    };
  }, [pipelineId, token]);

  if (loading) {
    return <div className="callout text-xs">加载 Pipeline 状态中...</div>;
  }

  if (error) {
    return (
      <div className="callout callout-danger text-xs">
        <p className="font-semibold">❌ 错误</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!pipeline) {
    return <div className="callout text-xs">Pipeline 未找到</div>;
  }

  // 根据状态显示胶囊
  const statusLabel = {
    pending: "待执行",
    running: "运行中",
    completed: "已完成",
    failed: "已失败",
    cancelled: "已取消",
  }[pipeline.status] || "未知";

  const statusStyle = {
    pending: { background: "rgba(128,128,128,0.1)", color: "var(--clr-text-muted)" },
    running: { background: "rgba(255,215,0,0.1)", color: "var(--clr-amber)" },
    completed: { background: "rgba(144,238,144,0.1)", color: "var(--clr-text)" },
    failed: { background: "rgba(255,99,71,0.1)", color: "var(--clr-text)" },
    cancelled: { background: "rgba(128,128,128,0.1)", color: "var(--clr-text-muted)" },
  }[pipeline.status] || {};

  // 构建 Task 映射
  const taskMap = new Map(pipeline.tasks.map((t) => [t.step, t]));

  return (
    <div className="space-y-4">
      {/* 顶部状态胶囊 */}
      <div
        className="px-4 py-3 rounded-lg text-sm font-semibold flex justify-between items-center"
        style={statusStyle}
      >
        <span>Pipeline 状态: {statusLabel}</span>
        {pipeline.error_msg && (
          <span className="text-xs" style={{ color: "var(--clr-text-muted)" }}>
            {pipeline.error_msg}
          </span>
        )}
      </div>

      {/* 步骤列表 */}
      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          const task = taskMap.get(step.id);
          const isRunning = pipeline.current_step === step.id;
          const isCompleted = task?.status === "completed";
          const isFailed = task?.status === "failed";
          const isWaiting = !task || task.status === "pending";

          let stepStatus = "待执行";
          let stepBgColor = "rgba(200,200,200,0.1)";

          if (isRunning) {
            stepStatus = "运行中...";
            stepBgColor = "rgba(255,215,0,0.1)";
          } else if (isCompleted) {
            stepStatus = "✓ 完成";
            stepBgColor = "rgba(144,238,144,0.1)";
          } else if (isFailed) {
            stepStatus = "✗ 失败";
            stepBgColor = "rgba(255,99,71,0.1)";
          }

          return (
            <div
              key={step.id}
              className="rounded-lg border transition-all"
              style={{
                borderColor: "var(--clr-border)",
                background: isRunning ? "rgba(255,255,255,0.6)" : undefined,
              }}
            >
              {/* Step 头部 */}
              <div
                className="px-4 py-3 flex justify-between items-center cursor-pointer"
                style={{ background: stepBgColor }}
                onClick={() => {
                  if (isCompleted) {
                    setExpandedStep(expandedStep === step.id ? null : step.id);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">
                    Step {idx + 1}. {step.label}
                  </span>
                  <span className="text-xs" style={{ color: "var(--clr-text-muted)" }}>
                    {stepStatus}
                  </span>
                </div>

                {isCompleted && (
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      border: "1px solid var(--clr-border)",
                      background: "var(--clr-bg-alt)",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedStep(expandedStep === step.id ? null : step.id);
                    }}
                  >
                    {expandedStep === step.id ? "隐藏结果" : "查看结果"}
                  </button>
                )}
              </div>

              {/* 运行中：显示 ProgressTracker */}
              {isRunning && task && (
                <div className="px-4 py-3 border-t" style={{ borderColor: "var(--clr-border)" }}>
                  <ProgressTracker
                    taskId={task.id}
                    // 模拟 task 对象来自 ResultViewer 的参数
                    onMessage={(msg) => console.log(msg)}
                    onProgress={(pct) => console.log(`Progress: ${pct}%`)}
                    onComplete={() => {
                      // 刷新 Pipeline 状态
                      getPipeline(token, pipelineId).then(setPipeline).catch(setError);
                    }}
                  />
                </div>
              )}

              {/* 已完成且展开：显示结果 */}
              {isCompleted && expandedStep === step.id && task && (
                <div className="px-4 py-3 border-t space-y-3" style={{ borderColor: "var(--clr-border)" }}>
                  <ResultViewer
                    stepId={step.id}
                    task={{
                      id: task.id,
                      step: task.step,
                      status: task.status,
                      params: {},
                      progress: 100,
                      result_path: task.result_path,
                      result: null, // ResultViewer 会根据 result_path 重新 fetch
                      project_id: pipeline.project_id,
                    } as Task}
                    token={token}
                  />
                </div>
              )}

              {/* 失败：显示错误信息 */}
              {isFailed && (
                <div className="px-4 py-3 border-t text-xs" style={{ borderColor: "var(--clr-border)", color: "var(--clr-text-muted)" }}>
                  错误: {task.error_msg || "未知错误"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
