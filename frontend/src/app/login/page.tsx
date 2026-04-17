"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * 登录页面 — ComputaBio 暖色学术风格
 * 白色卡片 + 暖色输入框 + burnt amber 按钮
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      // 存储 JWT — 刷新页面不丢失 (解决 BUG-T2)
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      localStorage.setItem("username", data.username);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <main className="flex-1 flex items-center justify-center p-4" style={{ background: "var(--clr-bg)" }}>
        <div className="w-full max-w-md animate-fade-in">
          <div className="card p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "var(--font-serif)", color: "var(--clr-dark-deep)", letterSpacing: '-0.01em' }}>scCloud</h1>
            <p className="text-sm" style={{ color: "var(--clr-text-muted)" }}>登录以继续分析</p>
            <div className="w-16 h-0.5 mx-auto mt-3" style={{ background: "linear-gradient(90deg, #C86019, #FFD42A)" }} />
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>用户名</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                required
                className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                style={{
                  borderColor: "var(--clr-border)",
                  color: "var(--clr-text)",
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--clr-text-muted)" }}>密码</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                required
                className="w-full px-4 py-2.5 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                style={{
                  borderColor: "var(--clr-border)",
                  color: "var(--clr-text)",
                }}
              />
            </div>

            {error && (
              <div className="callout callout-danger text-sm">
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 text-white font-semibold rounded-lg text-sm transition-all duration-300 shadow-md disabled:opacity-50"
              style={{ background: loading ? "var(--clr-dark-light)" : "var(--clr-amber)" }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite" }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  登录中...
                </span>
              ) : "登录"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <Link href="/register" className="text-sm transition-colors" style={{ color: "var(--clr-text-faint)" }}>
              还没有账号？<span style={{ color: "var(--clr-amber)" }}>注册新账号</span>
            </Link>
          </div>
        </div>
      </div>
      </main>
    </>
  );
}
