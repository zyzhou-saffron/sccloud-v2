/**
 * Pipeline 全流程参数表单
 * 风格与单步分析保持一致
 */
"use client";

import React, { useRef, useState } from "react";
import { createPipeline } from "../../../lib/pipeline-api";
import { IconUpload } from "../../../components/Icons";

interface PipelineFormProps {
  projectId: number;
  token: string;
  onSubmit: (pipelineId: string) => void;
  hasUploadedFile?: boolean;
  uploadedFile?: { name: string; path: string } | null;
  onFileUpload?: (file: { name: string; path: string }) => void;
}

const STEPS_CONFIG = [
  { id: "qc", label: "Step 1: 数据预处理", desc: "质控过滤" },
  { id: "normalize", label: "Step 2: 数据标准化", desc: "SCTransform" },
  { id: "reduce", label: "Step 3: 数据降维", desc: "PCA/UMAP/tSNE" },
  { id: "cluster", label: "Step 4: 批次聚类", desc: "Harmony 校正" },
  { id: "markers", label: "Step 5: 差异基因", desc: "FindMarkers" },
  { id: "annotate", label: "Step 6: 细胞注释", desc: "SingleR 自动注释" },
];

export default function PipelineForm({ projectId, token, onSubmit, hasUploadedFile = false, uploadedFile = null, onFileUpload }: PipelineFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    const CHUNK = 5 * 1024 * 1024;
    setUploadProgress(0);
    setError(null);

    try {
      // 1. 初始化
      const initForm = new FormData();
      initForm.append("filename", file.name);
      initForm.append("file_size", String(file.size));
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: initForm,
      });
      if (!initRes.ok) throw new Error("初始化上传失败");
      const { upload_id } = await initRes.json() as { upload_id: string };

      // 2. 分片上传
      const totalChunks = Math.ceil(file.size / CHUNK);
      for (let i = 0; i < totalChunks; i++) {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        const chunkForm = new FormData();
        chunkForm.append("upload_id", upload_id);
        chunkForm.append("chunk_index", String(i));
        chunkForm.append("chunk", blob, file.name);
        const chunkRes = await fetch("/api/upload/chunk", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: chunkForm,
        });
        if (!chunkRes.ok) throw new Error(`分片 ${i + 1} 上传失败`);
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 95));
      }

      // 3. 合并
      const completeForm = new FormData();
      completeForm.append("upload_id", upload_id);
      completeForm.append("project_id", String(projectId));
      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: completeForm,
      });
      if (!completeRes.ok) throw new Error("合并文件失败");
      const { path: filePath } = await completeRes.json() as { path: string };

      setUploadProgress(100);
      onFileUpload?.({ name: file.name, path: filePath });
      setTimeout(() => setUploadProgress(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
      setUploadProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasUploadedFile && !uploadedFile) {
      setError("请先上传 .rds 数据文件");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = {
        project_id: projectId,
        params: {
          qc: {
            max_mt_ratio: 20,
            min_features: 200,
            max_features: 5000,
            umi_min_pct: 0,
            umi_max_pct: 1,
          },
          normalize: {
            method: "log",
          },
          reduce: {
            method: "umap",
            n_pcs: 30,
            group_by: "Sample",
          },
          cluster: {
            resolution: 0.5,
          },
          markers: {
            cluster: "All",
          },
          annotate: {
            anno_type: "自动注释",
          },
        },
      };

      const response = await createPipeline(token, data);
      onSubmit(response.pipeline_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pipeline");
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* 标题 */}
      <div className="mb-4">
        <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark-deep)" }}>
          全流程一键分析
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--clr-text-muted)" }}>
          依次执行全部 6 步，无需手动干预。完成一步后自动启动下一步。
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div
          className="mb-4 px-3 py-2 rounded text-xs border"
          style={{
            borderColor: "var(--clr-danger)",
            background: "rgba(220, 53, 69, 0.05)",
            color: "var(--clr-danger)",
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* 文件上传区域（如果还没有上传文件） */}
      {!uploadedFile && !hasUploadedFile && (
        <div
          className="card p-6 border-2 border-dashed text-center mb-6"
          style={{
            borderColor: "var(--clr-amber)",
            background: "rgba(200,96,25,0.03)",
            cursor: "pointer",
          }}
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <IconUpload size={32} className="mx-auto mb-3 text-[#C86019]" />
          <div className="text-sm font-semibold mb-1" style={{ color: "var(--clr-amber-dark)" }}>
            点击上传或拖拽文件
          </div>
          <div className="text-xs" style={{ color: "var(--clr-text-muted)" }}>
            支持: .rds, .h5seurat, .h5ad, .rdata
          </div>

          {/* 上传进度 */}
          {uploadProgress !== null && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs" style={{ color: "var(--clr-amber-dark)" }}>
                <span>上传中...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full" style={{ background: "var(--clr-border)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: "var(--clr-amber)" }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 已上传文件显示 */}
      {(uploadedFile || hasUploadedFile) && (
        <div
          className="card p-4 mb-6 border"
          style={{
            borderColor: "#2D8A56",
            background: "rgba(45,138,86,0.05)",
          }}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2D8A56" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span className="text-sm" style={{ color: "#2D8A56" }}>
              已选择: {uploadedFile?.name || "数据文件"}
            </span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".rds,.h5seurat,.h5ad,.rdata"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
          e.target.value = '';
        }}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 步骤概览 */}
        <div
          className="card p-4"
          style={{
            background: "rgba(200, 96, 25, 0.02)",
            borderColor: "var(--clr-border)",
          }}
        >
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--clr-amber-dark)" }}>
            📋 执行步骤
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STEPS_CONFIG.map((step) => (
              <div
                key={step.id}
                className="px-2 py-1.5 rounded text-xs border"
                style={{
                  borderColor: "var(--clr-border)",
                  background: "var(--clr-bg-alt)",
                }}
              >
                <div className="font-medium" style={{ color: "var(--clr-text)" }}>
                  {step.label}
                </div>
                <div style={{ color: "var(--clr-text-muted)" }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 默认参数提示 */}
        <div
          className="px-3 py-2 rounded text-xs border border-dashed"
          style={{
            borderColor: "var(--clr-border)",
            color: "var(--clr-text-muted)",
          }}
        >
          💡 将使用推荐的默认参数。如需自定义参数，请使用"单步分析"模式逐步调整。
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 rounded font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            background: loading ? "var(--clr-text-muted)" : "var(--clr-amber)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeDasharray="15.7" opacity="0.3" />
                <circle cx="12" cy="12" r="10" strokeDasharray="15.7" />
              </svg>
              启动中...
            </>
          ) : (
            <>
              🚀 开始全流程分析
            </>
          )}
        </button>
      </form>
    </div>
  );
}
