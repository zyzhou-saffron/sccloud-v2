/**
 * Pipeline 全流程参数表单
 * 6 个可折叠参数面板，风格与单步分析完全一致
 */
"use client";

import React, { useRef, useState } from "react";
import { createPipeline } from "../../../lib/pipeline-api";
import { IconUpload, IconQuestion } from "../../../components/Icons";
import Tooltip from "../../../components/Tooltip";

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

const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  qc: { max_mt_ratio: 20, min_features: 200, max_features: 5000, umi_min_pct: 0, umi_max_pct: 1 },
  normalize: {},
  reduce: { method: "umap", n_pcs: 30, group_by: "Sample" },
  cluster: { method: "harmony", resolution: 0.5, n_dims: 30, group_by: "Sample" },
  markers: { cluster: "All", min_pct: 0.1, logfc_threshold: 0.25, p_val_adj: 0.05, test_use: "wilcox", only_pos: true, ntop: 5 },
  annotate: { mode: "auto", group_by: "Sample" },
};

export default function PipelineForm({ projectId, token, onSubmit, hasUploadedFile = false, uploadedFile = null, onFileUpload }: PipelineFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [params, setParams] = useState<Record<string, Record<string, unknown>>>(
    JSON.parse(JSON.stringify(DEFAULT_PARAMS))
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ===== 输入样式（与单步分析 page.tsx 保持一致） ===== */
  const inputCls = "w-full px-3 py-2 bg-white border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#C86019]/30 transition-colors";
  const inputStyle: React.CSSProperties = { borderColor: "var(--clr-border)", color: "var(--clr-text)" };
  const selectCls = inputCls + " cursor-pointer";
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: "32px",
  };

  const updateStepParam = (stepId: string, key: string, value: unknown) => {
    setParams(prev => ({ ...prev, [stepId]: { ...prev[stepId], [key]: value } }));
  };

  const toggleCollapse = (stepId: string) => {
    setCollapsed(prev => ({ ...prev, [stepId]: !prev[stepId] }));
  };

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
        params,
      };

      const response = await createPipeline(token, data);
      onSubmit(response.pipeline_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pipeline");
      setLoading(false);
    }
  };

  /* ===== 渲染每个步骤的参数面板 ===== */
  const renderStepParams = (stepId: string) => {
    const p = params[stepId] || {};

    switch (stepId) {
      case "qc":
        return (
          <>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>最大线粒体基因比例 (%)</span>
                <Tooltip content="变量: max_mt_ratio\n\n设定细胞内线粒体基因表达占比的最大阈值。\n线粒体占比居高(如>10~20%)通常标志着由于膜破裂导致的胞质转录本大规模流失，细胞处于濒死受损状态。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="range" min="0" max="100" value={p.max_mt_ratio as number} onChange={(e) => updateStepParam(stepId, "max_mt_ratio", Number(e.target.value))} className="w-full accent-[#C86019]" />
              <div className="text-xs text-right" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>{p.max_mt_ratio as number}%</div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>最小表达基因数</span>
                <Tooltip content="变量: min_features\n\n细胞必须检测到的最小独特基因数量(Features)。\n基因数过少通常意味着由于测序深度不足、细胞破裂或该液滴中根本没有包裹有效细胞(空泡液滴)，用于基础质控。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.min_features as number} onChange={(e) => updateStepParam(stepId, "min_features", Number(e.target.value))} min={1} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>最大表达基因数</span>
                <Tooltip content="变量: max_features\n\n细胞内检测到的最大独特基因数量。\n基因数过高往往是因为一个液滴内包裹了两个或多个细胞(双细胞/多细胞混合物)，导致检测到的基因种类异常偏多，剔除它们可避免产生混合伪类群。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.max_features as number} onChange={(e) => updateStepParam(stepId, "max_features", Number(e.target.value))} min={1} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>nUMI 底部过滤分位数</span>
                <Tooltip content="变量: umi_min_pct\n\n基于全群细胞UMI总数(nCount_RNA)分布计算下限截取分位。0 意味着不裁选，0.05 代表去除总体 UMI 最小的那 5% 的低质量游离碎片。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.umi_min_pct as number} onChange={(e) => updateStepParam(stepId, "umi_min_pct", Number(e.target.value))} min={0} max={1} step={0.01} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>nUMI 顶部过滤分位数</span>
                <Tooltip content="变量: umi_max_pct\n\n基于全群细胞UMI总数分布计算上限截取分位。1 意味着不裁选，0.95 代表去除总体 UMI 极高极异常的那 5% 的双细胞复合体。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.umi_max_pct as number} onChange={(e) => updateStepParam(stepId, "umi_max_pct", Number(e.target.value))} min={0} max={1} step={0.01} className={inputCls} style={inputStyle} />
            </div>
          </>
        );

      case "normalize":
        return (
          <p className="text-[10px]" style={{ color: "var(--clr-text-faint)" }}>
            使用 SCTransform + glmGamPoi 方法进行标准化。
          </p>
        );

      case "reduce":
        return (
          <>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>降维方法</span>
                <Tooltip content="变量: method\n\n在高维基因空间内降维映射的算法。\nUMAP / t-SNE 注重局部近邻结构的非线性拓扑保留，适合可视化；PCA 则是寻找全局方差最大的线性组合，常作为前置步骤计算。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <select value={p.method as string} onChange={(e) => updateStepParam(stepId, "method", e.target.value)} className={selectCls} style={selectStyle}>
                <option value="umap">UMAP</option><option value="tsne">t-SNE</option><option value="pca">PCA</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>PCA 维度</span>
                <Tooltip content="变量: n_pcs\n\n参与下游降维和聚类的主成分(Principal Components)数量。\n截取前列的主要维度可去除背景技术噪音(Dropout/技术变异)，保留起主要作用的生物学异质性。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.n_pcs as number} onChange={(e) => updateStepParam(stepId, "n_pcs", Number(e.target.value))} min={2} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>分组方式</label>
              <div className="flex gap-4">
                {["Sample", "Group"].map((v) => (
                  <label key={v} className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: "var(--clr-text)" }}>
                    <input type="radio" name="pipeline_group_by" value={v} checked={p.group_by === v} onChange={() => updateStepParam(stepId, "group_by", v)} className="accent-[#C86019]" />
                    {v === "Sample" ? "样本" : "处理组"}
                  </label>
                ))}
              </div>
            </div>
          </>
        );

      case "cluster":
        return (
          <>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>校正方法</span>
                <Tooltip content="变量: method\n\nHarmony 是目前最流行的单细胞批次校正算法，速度快、效果好。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <select value={p.method as string} onChange={(e) => updateStepParam(stepId, "method", e.target.value)} className={selectCls} style={selectStyle}>
                <option value="harmony">Harmony</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>降维维度</span>
                <Tooltip content="变量: n_dims\n\nPCA/Harmony 使用的维度数，通常 20~30 维。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.n_dims as number} onChange={(e) => updateStepParam(stepId, "n_dims", Number(e.target.value))} min={2} max={50} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>批次校正分组</span>
                <Tooltip content="变量: group_by\n\n指定按哪个元数据字段进行批次校正。通常选 Sample（样本）或 group（处理组）。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <div className="flex gap-4">
                {["Sample", "group"].map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--clr-text)" }}>
                    <input type="radio" name="pipeline_cluster_group_by" value={v} checked={(p.group_by ?? "Sample") === v} onChange={() => updateStepParam(stepId, "group_by", v)} className="accent-[#C86019]" />
                    {v === "Sample" ? "样本" : "处理组"}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>聚类分辨率</span>
                <Tooltip content="变量: resolution\n\n决定 SNN 图聚类敏感度。数值越大细胞亚群越细密（0.8+）；数值越小划分越粗放（0.2）。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="range" min="0" max="2" step="0.01" value={p.resolution as number} onChange={(e) => updateStepParam(stepId, "resolution", Number(e.target.value))} className="w-full accent-[#C86019]" />
              <div className="flex justify-between text-[10px]" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>
                <span>0</span><span style={{ color: "var(--clr-amber)", fontWeight: 600 }}>{p.resolution as number}</span><span>2</span>
              </div>
            </div>
          </>
        );

      case "markers":
        return (
          <>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>最小细胞比例</span>
                <Tooltip content="变量: min_pct\n\n设定只在各对比组内最少 x% 分数的细胞中表达的基因才会参与统计检验。这极大提高了运算速度，屏蔽了纯属技术噪音的散发基因。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.min_pct as number} onChange={(e) => updateStepParam(stepId, "min_pct", Number(e.target.value))} min={0} max={1} step={0.01} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>log2FC 阈值</span>
                <Tooltip content="变量: logfc_threshold\n\n两簇间平均基因表达量差异(以2为底的对数折叠变化)。差异绝对值必须超过此限制才被定性为差异表达基因(DEG)。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.logfc_threshold as number} onChange={(e) => updateStepParam(stepId, "logfc_threshold", Number(e.target.value))} step={0.05} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>P value 阈值 (p_val_adj)</span>
                <Tooltip content="变量: p_val_adj\n\n经 Bonferroni 校正后的 P 值阈值。只有 p_val_adj 低于此值的基因才被视为显著差异表达基因 (DEG)。默认: 0.05。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.p_val_adj as number ?? 0.05} onChange={(e) => updateStepParam(stepId, "p_val_adj", Number(e.target.value))} step={0.01} min={0} max={1} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>检验方法</label>
              <select value={p.test_use as string} onChange={(e) => updateStepParam(stepId, "test_use", e.target.value)} className={selectCls} style={selectStyle}>
                <option value="wilcox">Wilcoxon</option><option value="t">t-test</option><option value="bimod">Bimod</option><option value="roc">ROC</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>Top 基因数 (ntop)</span>
                <Tooltip content="变量: ntop\n\n决定在「热图」和「点图」中提取每个簇的前多少个最显著基因进行展示（默认: 5）。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <input type="number" value={p.ntop as number ?? 5} onChange={(e) => updateStepParam(stepId, "ntop", Number(e.target.value))} min={1} max={50} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>仅正向差异 (only_pos)</span>
                <Tooltip content="变量: only_pos\n\n若为 TRUE，则只返回上调基因(avg_log2FC > 0)。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <select value={String(p.only_pos ?? true)} onChange={(e) => updateStepParam(stepId, "only_pos", e.target.value === "true")} className={selectCls} style={selectStyle}>
                <option value="true">TRUE（仅上调）</option>
                <option value="false">FALSE（上下调均返回）</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>
                <span>分析聚类</span>
                <Tooltip content="变量: cluster\n\n全流程模式下固定使用 All（所有聚类），运行前无法获知具体聚类列表。">
                  <IconQuestion size={14} className="text-stone-400 hover:text-[#C86019] transition-colors" />
                </Tooltip>
              </label>
              <div
                className="px-3 py-2 rounded text-xs border"
                style={{ borderColor: "var(--clr-border)", background: "var(--clr-bg-alt)", color: "var(--clr-text-muted)" }}
              >
                All（所有聚类）— 全流程模式固定使用全部聚类
              </div>
            </div>
          </>
        );

      case "annotate":
        return (
          <>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>注释方式</label>
              <div className="flex gap-4">
                {[{ v: "auto", l: "自动注释" }, { v: "manual", l: "手动注释" }].map(({ v, l }) => (
                  <label key={v} className="flex items-center gap-1 text-sm cursor-pointer" style={{ color: "var(--clr-text)" }}>
                    <input type="radio" name="pipeline_anno_mode" value={v} checked={p.mode === v} onChange={() => updateStepParam(stepId, "mode", v)} className="accent-[#C86019]" /> {l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>分组方式</label>
              <select value={p.group_by as string} onChange={(e) => updateStepParam(stepId, "group_by", e.target.value)} className={selectCls} style={selectStyle}>
                <option value="Sample">Sample</option><option value="Group">Group</option><option value="CellType">CellType</option>
              </select>
            </div>
          </>
        );

      default:
        return null;
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
          配置参数后依次执行全部 6 步，无需手动干预。
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
          {error}
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
          onClick={() => fileInputRef.current?.click()}
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

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 6 步参数面板 */}
        {STEPS_CONFIG.map((step) => {
          const isCollapsed = collapsed[step.id];
          return (
            <div
              key={step.id}
              className="card overflow-hidden"
              style={{ borderColor: "var(--clr-border)" }}
            >
              {/* 步骤标题栏（可点击折叠） */}
              <button
                type="button"
                onClick={() => toggleCollapse(step.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-stone-50"
                style={{ background: "rgba(200, 96, 25, 0.02)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: "var(--clr-amber-dark)", fontFamily: "var(--font-mono)" }}>
                    {step.label}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--clr-text-muted)" }}>
                    {step.desc}
                  </span>
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className="transition-transform duration-200"
                  style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", color: "var(--clr-text-muted)" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* 参数内容 */}
              {!isCollapsed && (
                <div className="px-4 py-3 space-y-3 border-t" style={{ borderColor: "var(--clr-border)" }}>
                  {renderStepParams(step.id)}
                </div>
              )}
            </div>
          );
        })}

        {/* 提示 */}
        <div
          className="px-3 py-2 rounded text-xs border border-dashed"
          style={{
            borderColor: "var(--clr-border)",
            color: "var(--clr-text-muted)",
          }}
        >
          将使用以上配置的参数依次执行全部分析步骤。
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
