"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { IconBeaker, IconConvert, IconGear } from "../components/Icons";

/**
 * 仪表盘布局 — ComputaBio 暖色学术风格
 * 深色顶栏 + 暖白内容区
 */

const NAV_ITEMS = [
  { href: "/dashboard/analysis", label: "分析流程", Icon: IconBeaker },
  { href: "/dashboard/convert", label: "格式转换", Icon: IconConvert },
  { href: "/dashboard/settings", label: "设置", Icon: IconGear },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const name = localStorage.getItem("username");
    if (!token) {
      router.push("/login");
      return;
    }
    setUsername(name || "用户");
    if (pathname === "/dashboard") {
      router.replace("/dashboard/analysis");
    }
  }, [router, pathname]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--clr-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50"
        style={{ background: "var(--clr-dark)", borderBottom: "3px solid var(--clr-amber)" }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm"
              style={{ background: "linear-gradient(135deg, #C86019, #E07828)" }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
              </svg>
            </div>
            <span className="font-bold text-white/90 group-hover:text-[#FFD42A] transition-colors">
              scCloud
            </span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all duration-200 ${
                    active
                      ? "text-[#FFD42A] bg-white/10"
                      : "text-white/60 hover:text-white/90 hover:bg-white/5"
                  }`}
                >
                  <item.Icon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/50">
              <span className="text-white/70">{username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded border border-white/20 text-white/50 hover:text-red-300 hover:border-red-400/50 transition-colors"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
