"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { IconBeaker, IconConvert, IconGear, IconUsers } from "../components/Icons";
import { isGuest } from "../lib/api";
import AuthModal from "../components/AuthModal";

/**
 * 仪表盘布局 — ComputaBio 暖色学术风格
 * 深色顶栏 + 暖白内容区
 * 支持游客模式: 显示"注册"按钮代替用户名
 */

const NAV_ITEMS = [
  { href: "/dashboard/analysis", label: "分析流程", Icon: IconBeaker },
  { href: "/dashboard/convert", label: "多样本整合", Icon: IconConvert },
  { href: "/dashboard/settings", label: "设置", Icon: IconGear },
];

const ADMIN_NAV_ITEM = { href: "/dashboard/admin", label: "用户管理", Icon: IconUsers };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState("");
  const [guest, setGuest] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [navItems, setNavItems] = useState(NAV_ITEMS);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const name = localStorage.getItem("username");
    if (!token) {
      router.push("/");
      return;
    }
    setUsername(name || "用户");
    setGuest(isGuest());
    const role = localStorage.getItem(role) || user;
    setNavItems(role === "admin" ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS);
    if (pathname === "/dashboard") {
      router.replace("/dashboard/analysis");
    }
  }, [router, pathname]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("username");
    localStorage.removeItem("is_guest");
    router.push("/");
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
          <Link href="/" className="flex items-center gap-2.5 group">
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
            {navItems.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href);
              const isSettings = item.href === "/dashboard/settings";
              const handleClick = (e: React.MouseEvent) => {
                if (guest && isSettings) {
                  e.preventDefault();
                  setAuthOpen(true);
                }
              };
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleClick}
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

          {/* User area */}
          <div className="flex items-center gap-4">
            {/* Common Icons for both modes */}
            <div className="flex items-center gap-3 text-white/70 mr-1">
              {/* Moon Icon */}
              <button className="hover:text-[#FFD42A] transition-colors cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              </button>
              {/* Lang Icon */}
              <button className="hover:text-[#FFD42A] transition-colors flex items-center justify-center text-[14px] font-bold cursor-pointer" style={{ fontFamily: "var(--font-sans)" }}>
                中
              </button>
              {/* GitHub Icon */}
              <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[#FFD42A] transition-colors cursor-pointer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
              </a>
            </div>

            {guest ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUpgradeOpen(true)}
                  className="px-5 py-1 text-[13px] font-medium rounded transition-all duration-200 cursor-pointer"
                  style={{ background: "rgba(200,96,25,0.1)", color: "var(--clr-amber)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(200,96,25,0.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(200,96,25,0.1)"; }}
                >
                  Login
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pl-2" style={{ borderLeft: "1px solid rgba(255,255,255,0.15)" }}>
                <span className="text-sm font-medium text-white/90">{username}</span>
                <button
                  onClick={handleLogout}
                  className="text-xs px-2.5 py-1 rounded border border-white/20 text-white/60 hover:text-red-300 hover:border-red-400/50 transition-colors"
                >
                  退出
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Guest banner */}
      {guest && (
        <div
          className="text-center py-2 text-xs"
          style={{
            background: "var(--clr-gold-soft)",
            color: "var(--clr-amber-dark)",
            borderBottom: "1px solid rgba(200,96,25,0.15)",
          }}
        >
          <span>🎉 当前只可以创建一个项目。</span>
          <button
            onClick={() => setUpgradeOpen(true)}
            className="ml-2 underline font-medium hover:text-[var(--clr-amber)] transition-colors"
            style={{ color: "var(--clr-amber-dark)" }}
          >
            注册以解锁更多
          </button>
        </div>
      )}



      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      {/* Auth Modal */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab="login"
      />
      {/* Upgrade Modal */}
      <AuthModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        upgradeMode={true}
      />
    </div>
  );
}
