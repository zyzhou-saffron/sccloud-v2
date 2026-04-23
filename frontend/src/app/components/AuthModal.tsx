"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAuthData, upgradeGuest } from "../lib/api";

/**
 * AuthModal — 登录/注册/游客升级 二合一模态框
 *
 * 登录和注册共享同一个弹窗，通过 Tab 切换。
 * 游客升级模式：当 `upgradeMode=true` 时，只显示注册表单，
 * 调用 `/api/auth/upgrade` 而非 `/api/auth/register`。
 */

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** 默认选中的 Tab */
  defaultTab?: "login" | "register";
  /** 游客升级模式 — 跳过登录 Tab，直接显示注册 */
  upgradeMode?: boolean;
}

export default function AuthModal({
  open,
  onClose,
  defaultTab = "login",
  upgradeMode = false,
}: AuthModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">(
    upgradeMode ? "register" : defaultTab
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setLoading(false);
  };

  const handleTabSwitch = (t: "login" | "register") => {
    setTab(t);
    setError("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "登录失败");
      }
      const data = await res.json();
      saveAuthData(data, false);
      resetForm();
      onClose();
      router.push("/dashboard/analysis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码长度至少 6 位");
      return;
    }

    setLoading(true);
    try {
      let data;
      if (upgradeMode) {
        // 游客升级
        data = await upgradeGuest(username, password);
      } else {
        // 全新注册
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || "注册失败");
        }
        data = await res.json();
      }
      saveAuthData(data, false);
      resetForm();
      onClose();
      router.push("/dashboard/analysis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  // 共享的输入框样式
  const inputStyle: React.CSSProperties = {
    borderColor: "var(--clr-border)",
    color: "var(--clr-text)",
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: "rgba(30,27,24,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Card */}
      <div
        className="w-full max-w-md mx-4 relative"
        style={{ animation: "fadeUp 0.3s ease-out forwards" }}
      >
        <div className="card p-8">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--clr-text-faint)" }}
            aria-label="关闭"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <h2
              className="text-[22px] font-bold transition-all duration-300"
              style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark-deep)" }}
            >
              {tab === "login" ? "scCloud" : upgradeMode ? "注册正式账号" : "注册"}
            </h2>
            <div
              className="w-12 h-[3px] mx-auto mt-3 mb-2 rounded-full"
              style={{ background: "linear-gradient(90deg, #C86019, #FFD42A)" }}
            />
            {tab === "register" && (
              <p className="text-[13px] mt-3" style={{ color: "var(--clr-text-muted)", animation: "fadeIn 0.3s ease-in-out" }}>
                注册后保留您所有的分析数据，并解锁更多项目
              </p>
            )}
          </div>

          {/* Tabs — always shown so users can switch to login */}
          {(
            <div className="flex mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid var(--clr-border)" }}>
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTabSwitch(t)}
                  className="flex-1 py-2 text-sm font-medium transition-all duration-200"
                  style={{
                    background: tab === t ? "var(--clr-amber)" : "transparent",
                    color: tab === t ? "#fff" : "var(--clr-text-muted)",
                  }}
                >
                  {t === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>
          )}

          {/* Login Form */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--clr-text-muted)" }}>用户名</label>
                <input
                  type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="输入用户名" required
                  className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--clr-text-muted)" }}>密码</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码" required
                  className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={inputStyle}
                />
              </div>
              {error && <div className="callout callout-danger text-sm">{error}</div>}
              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 text-white font-semibold rounded-lg text-sm transition-all duration-300 shadow-md disabled:opacity-50"
                style={{ background: loading ? "var(--clr-dark-light)" : "var(--clr-amber)" }}
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          )}

          {/* Register Form */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--clr-text-muted)" }}>用户名</label>
                <input
                  type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="字母、数字、下划线" required
                  className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--clr-text-muted)" }}>密码</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位" required
                  className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--clr-text-muted)" }}>确认密码</label>
                <input
                  type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码" required
                  className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={inputStyle}
                />
              </div>
              {error && <div className="callout callout-danger text-sm">{error}</div>}
              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 text-white font-semibold rounded-lg text-sm transition-all duration-300 shadow-md disabled:opacity-50"
                style={{ background: loading ? "var(--clr-dark-light)" : "var(--clr-amber)" }}
              >
                {loading ? "注册中..." : upgradeMode ? "注册并保留数据" : "注册"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
