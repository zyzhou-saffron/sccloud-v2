/**
 * scCloud v2 — 格式转换页面 (暖白学术风格)
 * Tab 1: 单文件转换 (导入/导出)
 * Tab 2: 多样本 MTX 整合
 *
 * 设计: 三步走引导流程 (Step 1 → 2 → 3)
 */
"use client";

import { useState, useCallback } from "react";

/* ===== 格式定义 ===== */
const IMPORT_FORMATS = [
  { id: "h5ad", label: "H5AD", desc: "AnnData / Scanpy", ext: ".h5ad" },
  { id: "h5", label: "10X H5", desc: "CellRanger HDF5", ext: ".h5" },
  { id: "csv", label: "CSV", desc: "逗号分隔表达矩阵", ext: ".csv" },
  { id: "tsv", label: "TSV/TXT", desc: "制表符分隔矩阵", ext: ".tsv,.txt" },
  { id: "rds", label: "RDS", desc: "R/Seurat 对象", ext: ".rds" },
];

const EXPORT_FORMATS = [
  { id: "h5ad", label: "H5AD", desc: "AnnData / Scanpy" },
  { id: "h5seurat", label: "H5Seurat", desc: "HDF5 Seurat" },
];

/* ===== 接口类型 ===== */
interface ConvertResult {
  status: string;
  cells?: number;
  genes?: number;
  file_size_mb?: number;
  download_url?: string;
  output_path?: string;
  n_samples?: number;
}

/* ===== 样本条目 ===== */
interface SampleEntry {
  id: string;
  name: string;
  file: File | null;
}

/* ===== 步骤锚点组件 ===== */
function StepAnchor({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ background: "linear-gradient(135deg, var(--clr-amber-dark), var(--clr-amber))" }}
      >
        {step}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--clr-text)" }}>{title}</p>
        {subtitle && <p className="text-xs" style={{ color: "var(--clr-text-faint)" }}>{subtitle}</p>}
      </div>
    </div>
  );
}

/* ===== 带认证下载 ===== */
async function authDownload(url: string, filename: string) {
  const token = localStorage.getItem("access_token");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("下载失败");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ConvertPage() {
  const [tab, setTab] = useState<"single" | "mtx">("single");

  // ===== 单文件状态 =====
  const [direction, setDirection] = useState<"import" | "export">("import");
  const [file, setFile] = useState<File | null>(null);
  const [inputFormat, setInputFormat] = useState("h5ad");
  const [outputFormat, setOutputFormat] = useState("h5ad");
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ===== MTX 整合状态 =====
  const [samples, setSamples] = useState<SampleEntry[]>([
    { id: "s1", name: "Sample1", file: null },
    { id: "s2", name: "Sample2", file: null },
  ]);
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<ConvertResult | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  /* ===== 单文件转换 ===== */
  const handleConvert = useCallback(async () => {
    if (!file) return;
    setConverting(true);
    setResult(null);
    setError(null);

    try {
      const token = localStorage.getItem("access_token");

      // Step 1: 上传文件
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/convert/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`上传失败: ${await uploadRes.text()}`);
      const uploadData = await uploadRes.json();

      // Step 2: 调用转换
      const convertRes = await fetch("/api/convert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          direction,
          input_path: uploadData.path,
          input_format: direction === "import" ? inputFormat : undefined,
          output_format: direction === "export" ? outputFormat : undefined,
        }),
      });
      if (!convertRes.ok) throw new Error(`转换失败: ${await convertRes.text()}`);
      const data: ConvertResult = await convertRes.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "转换失败");
    } finally {
      setConverting(false);
    }
  }, [file, direction, inputFormat, outputFormat]);

  /* ===== MTX 整合 ===== */
  const handleMerge = useCallback(async () => {
    const validSamples = samples.filter((s) => s.file && s.name.trim());
    if (validSamples.length < 1) return;
    setMerging(true);
    setMergeResult(null);
    setMergeError(null);

    try {
      const token = localStorage.getItem("access_token");
      const formData = new FormData();
      validSamples.forEach((s) => {
        formData.append("sample_names", s.name);
        formData.append("files", s.file!);
      });

      const res = await fetch("/api/convert/mtx-merge", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error(`整合失败: ${await res.text()}`);
      const data: ConvertResult = await res.json();
      setMergeResult(data);
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "整合失败");
    } finally {
      setMerging(false);
    }
  }, [samples]);

  const addSample = () => {
    const id = `s${Date.now()}`;
    setSamples((prev) => [
      ...prev,
      { id, name: `Sample${prev.length + 1}`, file: null },
    ]);
  };

  const removeSample = (id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  };

  const fileInfo = file
    ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
    : null;

  /* ===== 渲染 ===== */
  return (
    <div className="animate-fade-in space-y-5">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--clr-text)" }}>
          格式转换
        </h1>
        <p className="text-xs mt-1" style={{ color: "var(--clr-text-faint)" }}>
          在 RDS、H5AD、H5、CSV/TSV 之间转换，或整合多样本 10X 数据
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--clr-border)" }}>
        {(
          [
            ["single", "单文件转换"],
            ["mtx", "多样本 MTX 整合"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all"
            style={{
              background: tab === key ? "white" : "transparent",
              color: tab === key ? "var(--clr-amber-dark)" : "var(--clr-text-faint)",
              boxShadow: tab === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ===== Tab 1: 单文件转换 ===== */}
      {tab === "single" && (
        <div className="space-y-4">
          {/* Step 1: 方向选择 */}
          <div className="p-5 rounded-xl" style={{ background: "var(--clr-card)", border: "1px solid var(--clr-border)" }}>
            <StepAnchor step={1} title="选择转换方向" />
            <div className="flex gap-3">
              {(
                [
                  ["import", "导入 → RDS", "将其他格式转为 Seurat RDS"],
                  ["export", "RDS → 导出", "将 RDS 导出为其他格式"],
                ] as const
              ).map(([dir, title, desc]) => (
                <button
                  key={dir}
                  onClick={() => { setDirection(dir); setResult(null); setError(null); }}
                  className="flex-1 p-4 rounded-lg text-left transition-all"
                  style={{
                    background: direction === dir ? "var(--clr-gold-soft)" : "var(--clr-bg)",
                    border: `1.5px solid ${direction === dir ? "var(--clr-amber)" : "var(--clr-border)"}`,
                  }}
                >
                  <div className="text-sm font-semibold" style={{ color: direction === dir ? "var(--clr-amber-dark)" : "var(--clr-text)" }}>{title}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--clr-text-faint)" }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Step 2: 上传 + 格式选择 */}
            <div className="p-5 rounded-xl" style={{ background: "var(--clr-card)", border: "1px solid var(--clr-border)" }}>
              <StepAnchor
                step={2}
                title={direction === "import" ? "上传源文件并选择格式" : "上传 RDS 并选择导出格式"}
              />

              {/* 文件上传 */}
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg cursor-pointer transition-all hover:border-[var(--clr-amber)]" style={{ border: "2px dashed var(--clr-border)", background: "var(--clr-bg)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--clr-amber)" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-xs" style={{ color: "var(--clr-text-faint)" }}>
                  点击或拖拽上传
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept={direction === "import" ? ".h5ad,.h5,.csv,.tsv,.txt,.rds" : ".rds"}
                  onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setError(null); }}
                />
              </label>
              {fileInfo && (
                <p className="text-xs mt-2 font-mono" style={{ color: "var(--clr-text-faint)" }}>{fileInfo}</p>
              )}

              {/* 格式选择 */}
              <div className="mt-4">
                <p className="card-label mb-2">
                  {direction === "import" ? "输入格式" : "输出格式"}
                </p>
                <div className="space-y-1.5">
                  {(direction === "import" ? IMPORT_FORMATS : EXPORT_FORMATS).map((f) => {
                    const selected = direction === "import" ? inputFormat === f.id : outputFormat === f.id;
                    return (
                      <label
                        key={f.id}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all"
                        style={{
                          background: selected ? "var(--clr-gold-soft)" : "transparent",
                          border: `1px solid ${selected ? "var(--clr-amber)" : "transparent"}`,
                        }}
                      >
                        <input
                          type="radio"
                          name="format"
                          checked={selected}
                          onChange={() => direction === "import" ? setInputFormat(f.id) : setOutputFormat(f.id)}
                          className="accent-[var(--clr-amber)]"
                        />
                        <div>
                          <span className="text-sm font-medium" style={{ color: "var(--clr-text)" }}>{f.label}</span>
                          <span className="text-xs ml-2" style={{ color: "var(--clr-text-faint)" }}>{f.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 3: 转换按钮 + 结果 */}
            <div className="p-5 rounded-xl flex flex-col" style={{ background: "var(--clr-card)", border: "1px solid var(--clr-border)" }}>
              <StepAnchor step={3} title="执行转换" />

              <button
                onClick={handleConvert}
                disabled={!file || converting}
                className="w-full py-3 rounded-lg font-semibold text-sm text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, var(--clr-amber-dark), var(--clr-amber))" }}
              >
                {converting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    转换中...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /></svg>
                    开始转换
                  </>
                )}
              </button>

              {/* 错误 */}
              {error && (
                <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", color: "#b91c1c" }}>
                  {error}
                </div>
              )}

              {/* 成功 */}
              {result && result.status === "success" && (
                <div className="mt-4 p-4 rounded-lg space-y-2" style={{ background: "rgba(22,163,74,0.05)", border: "1px solid rgba(22,163,74,0.15)" }}>
                  <p className="text-sm font-semibold" style={{ color: "#15803d" }}>转换完成</p>
                  <div className="text-xs space-y-1" style={{ color: "var(--clr-text-faint)" }}>
                    {result.cells != null && <p>细胞数: <strong style={{ color: "var(--clr-text)" }}>{result.cells.toLocaleString()}</strong></p>}
                    {result.genes != null && <p>基因数: <strong style={{ color: "var(--clr-text)" }}>{result.genes.toLocaleString()}</strong></p>}
                    {result.file_size_mb != null && <p>文件大小: <strong style={{ color: "var(--clr-text)" }}>{result.file_size_mb} MB</strong></p>}
                  </div>
                  {result.download_url && (
                    <button
                      onClick={() => authDownload(result.download_url!, `converted_${file?.name || "output"}.rds`)}
                      className="mt-2 w-full py-2 rounded-lg text-sm font-medium text-white transition-all"
                      style={{ background: "linear-gradient(135deg, #15803d, #22c55e)" }}
                    >
                      下载转换结果
                    </button>
                  )}
                </div>
              )}

              {/* 说明 */}
              <div className="mt-auto pt-4">
                <div className="p-3 rounded-lg text-xs" style={{ background: "var(--clr-bg)", color: "var(--clr-text-faint)" }}>
                  <p className="font-medium mb-1" style={{ color: "var(--clr-text-muted)" }}>支持的转换</p>
                  <p>导入: H5AD / 10X H5 / CSV / TSV → Seurat RDS</p>
                  <p>导出: RDS → H5AD / H5Seurat</p>
                  <p className="mt-1">转换后的 RDS 可直接用于分析流程</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Tab 2: 多样本 MTX 整合 ===== */}
      {tab === "mtx" && (
        <div className="space-y-4">
          {/* 说明 */}
          <div className="p-4 rounded-xl text-xs" style={{ background: "var(--clr-gold-soft)", border: "1px solid rgba(200,96,25,0.15)", color: "var(--clr-amber-dark)" }}>
            <p className="font-semibold mb-1">使用说明</p>
            <p>每个样本上传一个 ZIP 压缩包，包含 10X CellRanger 输出的 3 个文件：</p>
            <p className="font-mono mt-1">matrix.mtx.gz、features.tsv.gz、barcodes.tsv.gz</p>
          </div>

          {/* Step 1: 样本列表 */}
          <div className="p-5 rounded-xl" style={{ background: "var(--clr-card)", border: "1px solid var(--clr-border)" }}>
            <StepAnchor step={1} title="添加样本" subtitle="为每个样本命名并上传对应的 ZIP 包" />
            <div className="space-y-3" style={{ maxHeight: "400px", overflowY: "auto" }}>
              {samples.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--clr-bg)", border: "1px solid var(--clr-border)" }}>
                  <span className="text-xs font-mono w-6 text-center" style={{ color: "var(--clr-text-faint)" }}>#{idx + 1}</span>
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => setSamples((prev) => prev.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))}
                    className="text-sm px-2 py-1 rounded border w-32"
                    style={{ borderColor: "var(--clr-border)", color: "var(--clr-text)", background: "white" }}
                    placeholder="样本名"
                  />
                  <label className="flex-1 flex items-center gap-2 text-xs cursor-pointer" style={{ color: s.file ? "#15803d" : "var(--clr-text-faint)" }}>
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setSamples((prev) => prev.map((x) => x.id === s.id ? { ...x, file: f } : x));
                      }}
                    />
                    {s.file ? `${s.file.name} (${(s.file.size / 1024 / 1024).toFixed(1)}MB)` : "点击上传 ZIP"}
                  </label>
                  {samples.length > 1 && (
                    <button
                      onClick={() => removeSample(s.id)}
                      className="text-xs px-2 py-1 rounded transition-colors"
                      style={{ color: "var(--clr-text-faint)" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addSample}
              className="mt-3 w-full py-2 rounded-lg text-sm font-medium transition-all"
              style={{ border: "1px dashed var(--clr-amber)", color: "var(--clr-amber-dark)", background: "transparent" }}
            >
              + 添加样本
            </button>
          </div>

          {/* Step 2: 整合按钮 */}
          <div className="p-5 rounded-xl" style={{ background: "var(--clr-card)", border: "1px solid var(--clr-border)" }}>
            <StepAnchor step={2} title="执行整合" subtitle={`已选 ${samples.filter((s) => s.file).length} / ${samples.length} 个样本`} />
            <button
              onClick={handleMerge}
              disabled={merging || samples.filter((s) => s.file).length < 1}
              className="w-full py-3 rounded-lg font-semibold text-sm text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, var(--clr-amber-dark), var(--clr-amber))" }}
            >
              {merging ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  整合中...
                </>
              ) : (
                `开始整合 (${samples.filter((s) => s.file).length} 个样本)`
              )}
            </button>
          </div>

          {/* 整合错误 */}
          {mergeError && (
            <div className="p-3 rounded-lg text-xs" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", color: "#b91c1c" }}>
              {mergeError}
            </div>
          )}

          {/* 整合结果 */}
          {mergeResult && mergeResult.status === "success" && (
            <div className="p-4 rounded-xl space-y-2" style={{ background: "rgba(22,163,74,0.05)", border: "1px solid rgba(22,163,74,0.15)" }}>
              <p className="text-sm font-semibold" style={{ color: "#15803d" }}>整合完成</p>
              <div className="text-xs space-y-1" style={{ color: "var(--clr-text-faint)" }}>
                <p>样本数: <strong style={{ color: "var(--clr-text)" }}>{mergeResult.n_samples}</strong></p>
                {mergeResult.cells != null && <p>总细胞数: <strong style={{ color: "var(--clr-text)" }}>{mergeResult.cells.toLocaleString()}</strong></p>}
                {mergeResult.genes != null && <p>总基因数: <strong style={{ color: "var(--clr-text)" }}>{mergeResult.genes.toLocaleString()}</strong></p>}
                {mergeResult.file_size_mb != null && <p>文件大小: <strong style={{ color: "var(--clr-text)" }}>{mergeResult.file_size_mb} MB</strong></p>}
              </div>
              {mergeResult.download_url && (
                <button
                  onClick={() => authDownload(mergeResult.download_url!, `merged_${samples.length}samples.rds`)}
                  className="mt-2 w-full py-2 rounded-lg text-sm font-medium text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #15803d, #22c55e)" }}
                >
                  下载整合 RDS
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
