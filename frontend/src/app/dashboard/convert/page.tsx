/**
 * scCloud v2 — 格式转换页面 (BUG-T4 修复)
 *
 * Phase 3 重写: 对接 POST /api/convert 后端接口
 *
 * 旧系统完全不支持格式转换，用户需手动使用
 * SeuratDisk::SaveH5Seurat() 等 R 命令。
 * 新系统实现一键转换: RDS ↔ H5AD ↔ H5Seurat ↔ 10X
 */
"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FORMATS = [
  { id: "rds", label: "RDS", desc: "R/Seurat 原生格式", ext: ".rds" },
  { id: "h5seurat", label: "H5Seurat", desc: "HDF5 Seurat 格式", ext: ".h5seurat" },
  { id: "h5ad", label: "H5AD", desc: "AnnData/Scanpy 格式", ext: ".h5ad" },
  { id: "10x", label: "10X Genomics", desc: "CellRanger 输出格式", ext: ".mtx" },
];

interface ConvertResult {
  task_id: string;
  status: string;
  output_path: string | null;
  error: string | null;
}

export default function ConvertPage() {
  const [inputFormat, setInputFormat] = useState("rds");
  const [outputFormat, setOutputFormat] = useState("h5ad");
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = async () => {
    if (!file) return;

    setConverting(true);
    setProgress(0);
    setResult(null);
    setError(null);

    try {
      const token = localStorage.getItem("access_token");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("input_format", inputFormat);
      formData.append("output_format", outputFormat);

      /* 模拟进度 — 后续通过 WebSocket 替换 */
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 90));
      }, 800);

      const res = await fetch(`${API}/api/convert`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`转换失败: ${text}`);
      }

      const data: ConvertResult = await res.json();
      setResult(data);
      setProgress(100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "转换失败";
      setError(msg);
      setProgress(0);
    } finally {
      setConverting(false);
    }
  };

  /* 清空文件大小显示 */
  const fileInfo = file
    ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
    : null;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">格式转换</h1>
        <p className="text-sm text-stone-500 mt-1">
          在 RDS、H5AD、H5Seurat、10X 格式之间转换
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Input Format */}
        <div className="glass-card p-6">
          <h3 className="font-semibold text-stone-200 mb-4">📥 输入格式</h3>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <label
                key={f.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                  inputFormat === f.id
                    ? "bg-amber-500/10 border border-amber-500/30"
                    : "hover:bg-stone-800/50 border border-transparent"
                }`}
              >
                <input
                  type="radio"
                  name="input"
                  value={f.id}
                  checked={inputFormat === f.id}
                  onChange={() => {
                    setInputFormat(f.id);
                    /* 如果输出和输入一样，自动切换 */
                    if (outputFormat === f.id) {
                      const alt = FORMATS.find((x) => x.id !== f.id);
                      if (alt) setOutputFormat(alt.id);
                    }
                  }}
                  className="accent-amber-500"
                />
                <div>
                  <div className="text-sm font-medium text-stone-200">{f.label}</div>
                  <div className="text-xs text-stone-500">{f.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-stone-400 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white file:text-xs file:cursor-pointer hover:file:bg-amber-500"
            />
            {fileInfo && (
              <p className="text-xs text-stone-600 mt-1">{fileInfo}</p>
            )}
          </div>
        </div>

        {/* Center: Arrow + Convert Button */}
        <div className="flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-4xl">→</div>
            <button
              onClick={handleConvert}
              disabled={!file || converting || inputFormat === outputFormat}
              className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-stone-700 disabled:to-stone-600 disabled:text-stone-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2"
            >
              {converting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  转换中...
                </>
              ) : (
                "开始转换"
              )}
            </button>

            {/* 进度条 */}
            {converting && (
              <div className="w-48 mx-auto">
                <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-stone-500 mt-1">{progress}%</p>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="p-3 bg-red-950/30 border border-red-800/30 rounded-lg max-w-xs mx-auto">
                <p className="text-xs text-red-400 break-all">{error}</p>
              </div>
            )}

            {/* 成功结果 */}
            {result && result.status === "completed" && (
              <div className="p-3 bg-green-950/20 border border-green-800/30 rounded-lg max-w-xs mx-auto">
                <p className="text-xs text-green-400 font-medium">✓ 转换完成</p>
                {result.output_path && (
                  <p className="text-[10px] text-stone-500 mt-1 break-all font-mono">
                    {result.output_path}
                  </p>
                )}
              </div>
            )}

            {result && result.status === "failed" && (
              <div className="p-3 bg-red-950/30 border border-red-800/30 rounded-lg max-w-xs mx-auto">
                <p className="text-xs text-red-400">✗ {result.error || "转换失败"}</p>
              </div>
            )}
          </div>
        </div>

        {/* Output Format */}
        <div className="glass-card p-6">
          <h3 className="font-semibold text-stone-200 mb-4">📤 输出格式</h3>
          <div className="space-y-2">
            {FORMATS.filter((f) => f.id !== inputFormat).map((f) => (
              <label
                key={f.id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                  outputFormat === f.id
                    ? "bg-amber-500/10 border border-amber-500/30"
                    : "hover:bg-stone-800/50 border border-transparent"
                }`}
              >
                <input
                  type="radio"
                  name="output"
                  value={f.id}
                  checked={outputFormat === f.id}
                  onChange={() => setOutputFormat(f.id)}
                  className="accent-amber-500"
                />
                <div>
                  <div className="text-sm font-medium text-stone-200">{f.label}</div>
                  <div className="text-xs text-stone-500">{f.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Conversion Matrix */}
      <div className="glass-card p-6">
        <h3 className="font-semibold text-stone-200 mb-4">支持的转换矩阵</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-700">
                <th className="text-left py-2 px-3 text-stone-400">输入 ↓ / 输出 →</th>
                <th className="py-2 px-3 text-stone-400">RDS</th>
                <th className="py-2 px-3 text-stone-400">H5Seurat</th>
                <th className="py-2 px-3 text-stone-400">H5AD</th>
                <th className="py-2 px-3 text-stone-400">10X</th>
              </tr>
            </thead>
            <tbody>
              {["RDS", "H5Seurat", "H5AD", "10X"].map((row) => (
                <tr key={row} className="border-b border-stone-800/50">
                  <td className="py-2 px-3 font-medium text-stone-300">{row}</td>
                  {["RDS", "H5Seurat", "H5AD", "10X"].map((col) => (
                    <td key={col} className="py-2 px-3 text-center">
                      {row === col ? (
                        <span className="text-stone-600">—</span>
                      ) : (
                        <span className="text-green-400">✓</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
