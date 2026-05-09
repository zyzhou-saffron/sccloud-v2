/**
 * Pipeline 全流程执行视图 — 双面板布局
 * 左侧：步骤导航目录（sticky 固定）
 * 右侧：结果展示区（固定高度，内部滚动）
 */
"use client";

import React, { useEffect, useState } from "react";
import { getPipeline, type Pipeline, type PipelineTask } from "../../../lib/pipeline-api";
import ProgressTracker from "../../../components/ProgressTracker";
import ResultViewer from "../../../components/ResultViewer";
import type { Task } from "../../../lib/api";
import {
  IconMicroscope, IconBarChart, IconAxis, IconCluster,
  IconTestTube, IconTag,
} from "../../../components/Icons";

const STEPS = [
  { id: "preprocess", num: 1, label: "数据预处理与标准化", desc: "质控过滤 · SCTransform", Icon: IconMicroscope, subSteps: ["qc", "normalize"] },
  { id: "reduce_cluster", num: 2, label: "降维与聚类", desc: "PCA · Harmony · UMAP", Icon: IconAxis, subSteps: ["reduce", "cluster"] },
  { id: "annotate", num: 3, label: "细胞注释", desc: "SingleR/手动", Icon: IconTag, subSteps: ["annotate"] },
  { id: "markers", num: 4, label: "差异基因", desc: "FindMarkers", Icon: IconTestTube, subSteps: ["markers"] },
];

const STATUS_DOT: Record<string, string> = {
  pending: "bg-[#999]",
  running: "bg-[#C86019] animate-pulse",
  completed: "bg-[#2D8A56]",
  failed: "bg-[#B85450]",
};

interface PipelineViewProps {
  pipelineId: string;
  token: string;
}

export default function PipelineView({ pipelineId, token }: PipelineViewProps) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string>("qc");
  // 降维与聚类步骤内的子 tab：默认显示聚类结果
  const [reduceClusterTab, setReduceClusterTab] = useState<"cluster" | "reduce">("cluster");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const fetch = async () => {
      try {
        const data = await getPipeline(token, pipelineId);
        setPipeline(data);
        setLoading(false);

        // 自动选中：运行中步骤 > 最后一个已完成步骤 > 第一个步骤
        if (data.status === "running" && data.current_step) {
          const runningStep = STEPS.find(s => s.subSteps.includes(data.current_step!));
          if (runningStep) setActiveStep(runningStep.id);
        } else {
          const lastCompleted = [...STEPS].reverse().find(s => {
            return s.subSteps.some(id => {
              const t = data.tasks.find(tt => tt.step === id);
              return t?.status === "completed";
            });
          });
          if (lastCompleted) setActiveStep(lastCompleted.id);
        }

        if (data.status === "running" || data.status === "pending") {
          timer = setTimeout(fetch, 2000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    fetch();
    return () => clearTimeout(timer);
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
      <div className="card p-4 border" style={{ borderColor: "var(--clr-danger)", background: "rgba(220, 53, 69, 0.05)" }}>
        <div className="text-xs font-semibold" style={{ color: "var(--clr-danger)" }}>错误</div>
        <div className="text-xs mt-1" style={{ color: "var(--clr-text-muted)" }}>{error}</div>
      </div>
    );
  }

  if (!pipeline) {
    return <div className="card p-4" style={{ color: "var(--clr-text-muted)" }}><div className="text-xs">Pipeline 未找到</div></div>;
  }

  const statusLabel = { pending: "待执行", running: "运行中", completed: "已完成", failed: "已失败", cancelled: "已取消" }[pipeline.status] || "未知";
  const statusStyle = {
    pending:   { bg: "rgba(128,128,128,0.1)", color: "var(--clr-text-muted)" },
    running:   { bg: "rgba(200, 96, 25, 0.1)", color: "var(--clr-amber)" },
    completed: { bg: "rgba(45,138,86,0.1)", color: "#2D8A56" },
    failed:    { bg: "rgba(220,53,69,0.1)", color: "var(--clr-danger)" },
    cancelled: { bg: "rgba(128,128,128,0.1)", color: "var(--clr-text-muted)" },
  }[pipeline.status] || {};

  const taskMap = new Map(pipeline.tasks.map(t => [t.step, t]));
  const activeStepDef = STEPS.find(s => s.id === activeStep)!;

  // 组合步骤状态：优先级 running > failed > pending > completed
  const getStepStatus = (stepId: string) => {
    const step = STEPS.find(s => s.id === stepId)!;
    const subSteps = step.subSteps;
    const statuses = subSteps.map(id => {
      if (pipeline.current_step === id) return "running";
      return taskMap.get(id)?.status || "pending";
    });
    if (statuses.includes("running")) return "running";
    if (statuses.includes("failed")) return "failed";
    if (statuses.includes("pending")) return "pending";
    return "completed";
  };

  // 降维与聚类步骤的子 tab 状态
  const clusterTask = taskMap.get("cluster");
  const reduceTask = taskMap.get("reduce");
  const clusterStatus = (() => {
    if (pipeline.current_step === "cluster") return "running";
    return clusterTask?.status || "pending";
  })();
  const reduceStatus = (() => {
    if (pipeline.current_step === "reduce") return "running";
    return reduceTask?.status || "pending";
  })();
  const rcCurrentTask = reduceClusterTab === "cluster" ? clusterTask : reduceTask;
  const rcCurrentStatus = reduceClusterTab === "cluster" ? clusterStatus : reduceStatus;

  return (
    <div className="animate-fade-in space-y-3">
      {/* 顶部栏：返回 + 状态 */}
      <div className="flex items-center justify-between">
        <button
          className="px-3 py-1 text-sm rounded"
          style={{ border: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)", cursor: "pointer" }}
          onClick={() => window.dispatchEvent(new CustomEvent("pipeline-back"))}
        >
          ← 返回参数设置
        </button>
        <div
          className="px-4 py-1.5 rounded text-sm font-semibold"
          style={{ background: statusStyle.bg, color: statusStyle.color }}
        >
          Pipeline 状态: {statusLabel}
        </div>
      </div>

      {/* 运行中提示 */}
      {pipeline.status === "running" && (
        <div className="w-full rounded-lg border px-4 py-3" style={{ borderColor: "#fcd34d", background: "rgba(251,191,36,0.08)" }}>
          <div className="flex items-start gap-3 text-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <span className="text-xs" style={{ color: "#92400e" }}>
              任务正在后台运行，刷新页面不会中断分析。完成后可在此查看结果并下载。
            </span>
          </div>
        </div>
      )}

      {/* 双面板布局 */}
      <div className="flex gap-6" style={{ height: "70vh" }}>
        {/* ── 左侧导航（复用单步分析侧边栏样式） ── */}
        <div className="w-56 shrink-0 space-y-1">
          {STEPS.map((step) => {
            const st = getStepStatus(step.id);
            const isActive = activeStep === step.id;
            const dotCls = STATUS_DOT[st] || STATUS_DOT.pending;
            const isClickable = st === "completed" || st === "running" || st === "failed";

            return (
              <button
                key={step.id}
                onClick={() => isClickable && setActiveStep(step.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm text-left transition-all duration-200"
                style={
                  isActive
                    ? { borderLeft: "3px solid var(--clr-amber)", color: "var(--clr-amber-dark)", background: "rgba(200,96,25,0.06)", fontWeight: 600 }
                    : { borderLeft: "3px solid transparent", color: isClickable ? "var(--clr-text-muted)" : "var(--clr-text-faint)", opacity: isClickable ? 1 : 0.5, cursor: isClickable ? "pointer" : "default" }
                }
              >
                <step.Icon size={18} className={isActive ? "text-[#C86019]" : "text-[#999]"} />
                <div className="flex-1 min-w-0">
                  <div>{step.num}. {step.label}</div>
                  <div className="text-xs" style={{ color: "var(--clr-text-faint)" }}>
                    {step.desc}
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
              </button>
            );
          })}
        </div>

        {/* ── 右侧内容区 ── */}
        <div className="flex-1 min-w-0 h-full">
          <div
            className="rounded-lg border overflow-hidden h-full flex flex-col"
            style={{ borderColor: "var(--clr-border)", background: "var(--clr-bg-card)" }}
          >
            {/* 内容区头部 */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--clr-border)", background: "var(--clr-bg-alt)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--clr-text)" }}>
                  {activeStepDef.num}. {activeStepDef.label}
                </span>
                {(() => {
                  const st = getStepStatus(activeStep);
                  const label = { completed: "已完成", running: "运行中", failed: "已失败", pending: "待执行" }[st] || "";
                  const color = { completed: "#2D8A56", running: "var(--clr-amber)", failed: "var(--clr-danger)", pending: "var(--clr-text-muted)" }[st] || "";
                  return <span className="text-xs" style={{ color }}>{label}</span>;
                })()}
              </div>
              {pipeline.error_msg && activeStepDef.subSteps.includes(pipeline.error_step || "") && (
                <span className="text-xs" style={{ color: "var(--clr-danger)" }}>{pipeline.error_msg}</span>
              )}
            </div>

            {/* 内容区主体 */}
            <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-6">
              {/* 降维与聚类步骤：tab 切换 */}
              {activeStep === "reduce_cluster" && (
                <div className="space-y-4">
                  {/* Tab 栏 */}
                  <div className="flex gap-1 p-0.5 rounded" style={{ background: "var(--clr-bg-alt)" }}>
                    {[
                      { key: "cluster" as const, label: "批次聚类", status: clusterStatus },
                      { key: "reduce" as const, label: "数据降维", status: reduceStatus },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setReduceClusterTab(tab.key)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs transition-all duration-200"
                        style={reduceClusterTab === tab.key
                          ? { background: "var(--clr-bg-card)", color: "var(--clr-amber-dark)", fontWeight: 600, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
                          : { color: "var(--clr-text-muted)", cursor: "pointer" }
                        }
                      >
                        {tab.label}
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[tab.status] || STATUS_DOT.pending}`} />
                      </button>
                    ))}
                  </div>

                  {/* Tab 内容 */}
                  {rcCurrentStatus === "running" && rcCurrentTask && (
                    <ProgressTracker
                      taskId={rcCurrentTask.id}
                      onMessage={() => {}}
                      onProgress={() => {}}
                      onComplete={() => { getPipeline(token, pipelineId).then(setPipeline).catch(() => {}); }}
                    />
                  )}

                  {rcCurrentStatus === "completed" && rcCurrentTask && (
                    <ResultViewer
                      stepId={reduceClusterTab}
                      task={{
                        id: rcCurrentTask.id,
                        step: rcCurrentTask.step,
                        status: rcCurrentTask.status,
                        params: {},
                        progress: 100,
                        result_path: rcCurrentTask.result_path,
                        result: null,
                        project_id: pipeline.project_id,
                      } as Task}
                      token={token}
                    />
                  )}

                  {rcCurrentStatus === "failed" && rcCurrentTask && (
                    <div className="text-center py-8">
                      <div className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: "#FFF3F3", color: "var(--clr-danger)" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </div>
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--clr-danger)" }}>{reduceClusterTab === "cluster" ? "批次聚类" : "数据降维"}执行失败</p>
                      <div className="text-xs" style={{ color: "var(--clr-text-muted)" }}>{rcCurrentTask.error_msg || "未知错误"}</div>
                    </div>
                  )}

                  {rcCurrentStatus === "pending" && (
                    <div className="text-center py-8" style={{ color: "var(--clr-text-faint)" }}>
                      <p className="text-xs">等待执行</p>
                    </div>
                  )}
                </div>
              )}

              {/* 其他步骤：按 subSteps 顺序展示 */}
              {activeStep !== "reduce_cluster" && activeStepDef.subSteps.map((subId) => {
                const subTask = taskMap.get(subId);
                const subLabel = { qc: "数据预处理", normalize: "数据标准化" }[subId] || subId;
                const subStatus = (() => {
                  if (pipeline.current_step === subId) return "running";
                  return subTask?.status || "pending";
                })();

                return (
                  <div key={subId}>
                    {activeStepDef.subSteps.length > 1 && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold" style={{ color: "var(--clr-amber-dark)" }}>{subLabel}</span>
                        <span className="text-[10px]" style={{ color: { completed: "#2D8A56", running: "var(--clr-amber)", failed: "var(--clr-danger)", pending: "var(--clr-text-muted)" }[subStatus] || "" }}>
                          {{ completed: "已完成", running: "运行中", failed: "已失败", pending: "待执行" }[subStatus] || ""}
                        </span>
                      </div>
                    )}

                    {/* 运行中 */}
                    {subStatus === "running" && subTask && (
                      <ProgressTracker
                        taskId={subTask.id}
                        onMessage={() => {}}
                        onProgress={() => {}}
                        onComplete={() => { getPipeline(token, pipelineId).then(setPipeline).catch(() => {}); }}
                      />
                    )}

                    {/* 已完成 */}
                    {subStatus === "completed" && subTask && (
                      <ResultViewer
                        stepId={subId}
                        task={{
                          id: subTask.id,
                          step: subTask.step,
                          status: subTask.status,
                          params: {},
                          progress: 100,
                          result_path: subTask.result_path,
                          result: null,
                          project_id: pipeline.project_id,
                        } as Task}
                        token={token}
                      />
                    )}

                    {/* 失败 */}
                    {subStatus === "failed" && subTask && (
                      <div className="text-center py-8">
                        <div className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: "#FFF3F3", color: "var(--clr-danger)" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </div>
                        <p className="text-xs font-medium mb-1" style={{ color: "var(--clr-danger)" }}>{subLabel}执行失败</p>
                        <div className="text-xs" style={{ color: "var(--clr-text-muted)" }}>{subTask.error_msg || "未知错误"}</div>
                      </div>
                    )}

                    {/* 待执行 */}
                    {subStatus === "pending" && (
                      <div className="text-center py-8" style={{ color: "var(--clr-text-faint)" }}>
                        <p className="text-xs">等待执行</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
