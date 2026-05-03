/**
 * Pipeline 全流程执行视图
 * 风格与单步分析保持一致
 */
"use client";

import React, { useEffect, useState } from "react";
import { getPipeline, type Pipeline, type PipelineTask } from "../../../lib/pipeline-api";
import ProgressTracker from "../../../components/ProgressTracker";
import ResultViewer from "../../../components/ResultViewer";
import type { Task } from "../../../lib/api";

const STEPS = [
  { id: "qc", num: 1, label: "数据预处理", apiStep: "qc" },
  { id: "normalize", num: 2, label: "数据标准化", apiStep: "normalize" },
  { id: "reduce", num: 3, label: "数据降维", apiStep: "reduce" },
  { id: "cluster", num: 4, label: "批次聚类", apiStep: "cluster" },
  { id: "markers", num: 5, label: "差异基因", apiStep: "markers" },
  { id: "annotate", num: 6, label: "细胞注释", apiStep: "annotate" },
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

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getPipeline(token, pipelineId);
        setPipeline(data);
        setLoading(false);

        if (data.status === "running" || data.status === "pending") {
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
    return (
      <div className="card p-4" style={{ textAlign: "center", color: "var(--clr-text-muted)" }}>
        <div className="text-xs">加载 Pipeline 状态中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="card p-4 border"
        style={{
          borderColor: "var(--clr-danger)",
          background: "rgba(220, 53, 69, 0.05)",
        }}
      >
        <div className="text-xs font-semibold" style={{ color: "var(--clr-danger)" }}>
          ❌ 错误
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--clr-text-muted)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="card p-4" style={{ color: "var(--clr-text-muted)" }}>
        <div className="text-xs">Pipeline 未找到</div>
      </div>
    );
  }

  const statusLabel = {
    pending: "待执行",
    running: "运行中",
    completed: "已完成",
    failed: "已失败",
    cancelled: "已取消",
  }[pipeline.status] || "未知";

  const statusStyle = {
    pending: { bg: "rgba(128,128,128,0.1)", color: "var(--clr-text-muted)" },
    running: { bg: "rgba(200, 96, 25, 0.1)", color: "var(--clr-amber)" },
    completed: { bg: "rgba(45,138,86,0.1)", color: "var(--clr-success)" },
    failed: { bg: "rgba(220,53,69,0.1)", color: "var(--clr-danger)" },
    cancelled: { bg: "rgba(128,128,128,0.1)", color: "var(--clr-text-muted)" },
  }[pipeline.status] || {};

  const taskMap = new Map(pipeline.tasks.map((t) => [t.step, t]));

  return (
    <div className="animate-fade-in space-y-3">
      {/* 状态胶囊 */}
      <div
        className="card px-4 py-3 flex items-center justify-between text-sm font-semibold"
        style={{
          background: statusStyle.bg,
          color: statusStyle.color,
          borderColor: "var(--clr-border)",
        }}
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
          const isPending = !task || task.status === "pending";

          let stepStatusLabel = "○ 待执行";
          let stepBgColor = "rgba(200,200,200,0.05)";

          if (isRunning) {
            stepStatusLabel = "⟳ 运行中";
            stepBgColor = "rgba(200, 96, 25, 0.08)";
          } else if (isCompleted) {
            stepStatusLabel = "✓ 完成";
            stepBgColor = "rgba(45,138,86,0.05)";
          } else if (isFailed) {
            stepStatusLabel = "✗ 失败";
            stepBgColor = "rgba(220,53,69,0.05)";
          }

          return (
            <div
              key={step.id}
              className="card border transition-all"
              style={{
                borderColor: "var(--clr-border)",
                background: isRunning ? "var(--clr-bg)" : stepBgColor,
              }}
            >
              {/* Step 头部 */}
              <div
                className="px-4 py-3 flex justify-between items-center cursor-pointer"
                onClick={() => {
                  if (isCompleted) {
                    setExpandedStep(expandedStep === step.id ? null : step.id);
                  }
                }}
                style={{
                  background: stepBgColor,
                  borderRadius: expandedStep === step.id ? "6px 6px 0 0" : "6px",
                }}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="section-num" style={{ minWidth: "20px" }}>
                    {step.num}
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: "var(--clr-text)" }}>
                      {step.label}
                    </div>
                    <div className="text-xs" style={{ color: "var(--clr-text-muted)" }}>
                      {stepStatusLabel}
                    </div>
                  </div>
                </div>

                {isCompleted && (
                  <button
                    className="px-2.5 py-1 text-xs rounded border transition-all hover:shadow-sm"
                    style={{
                      borderColor: "var(--clr-border)",
                      background: "var(--clr-bg-alt)",
                      color: "var(--clr-text-muted)",
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

              {/* 运行中：ProgressTracker */}
              {isRunning && task && (
                <div
                  className="px-4 py-3 border-t"
                  style={{ borderColor: "var(--clr-border)" }}
                >
                  <ProgressTracker
                    taskId={task.id}
                    onMessage={() => {}}
                    onProgress={() => {}}
                    onComplete={() => {
                      getPipeline(token, pipelineId)
                        .then(setPipeline)
                        .catch(() => {});
                    }}
                  />
                </div>
              )}

              {/* 已完成且展开：ResultViewer */}
              {isCompleted && expandedStep === step.id && task && (
                <div
                  className="px-4 py-3 border-t space-y-3"
                  style={{ borderColor: "var(--clr-border)" }}
                >
                  <ResultViewer
                    stepId={step.id}
                    task={{
                      id: task.id,
                      step: task.step,
                      status: task.status,
                      params: {},
                      progress: 100,
                      result_path: task.result_path,
                      result: null,
                      project_id: pipeline.project_id,
                    } as Task}
                    token={token}
                  />
                </div>
              )}

              {/* 失败：错误信息 */}
              {isFailed && (
                <div
                  className="px-4 py-2 border-t text-xs"
                  style={{
                    borderColor: "var(--clr-border)",
                    color: "var(--clr-danger)",
                  }}
                >
                  ❌ {task.error_msg || "未知错误"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
