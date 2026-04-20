"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { guestLogin, saveAuthData } from "./lib/api";
import AuthModal from "./components/AuthModal";

/**
 * scCloud v2 Landing Page — 编辑式暖色学术设计
 *
 * 设计语言: Claude-inspired terracotta editorial
 * 排版: Playfair Display (display) + DM Sans (body) + Noto Serif SC (中文)
 * 布局: 左对齐 Hero + 交错卡片 + 水平时间轴 + 深色 CTA 块
 */

/* ===== 功能卡片数据 ===== */
const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6M9 14l2 2 4-4" />
      </svg>
    ),
    title: "智能质控",
    desc: "自动识别低质量细胞，精准过滤线粒体比例、基因数与 UMI 阈值",
    large: true,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
    title: "标准化与降维",
    desc: "SCTransform + PCA/UMAP/tSNE 高维数据可视化",
    large: false,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </svg>
    ),
    title: "聚类与注释",
    desc: "Harmony 批次校正 + Louvain 聚类 + SingleR 自动注释",
    large: false,
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 3v18h18M7 16l4-8 4 4 4-6" />
      </svg>
    ),
    title: "差异表达与富集",
    desc: "Wilcoxon 差异基因 + GO/KEGG/GSEA 通路分析，直出 publication-ready 图表",
    large: true,
  },
];

/* ===== 流水线步骤 ===== */
const PIPELINE = [
  { label: "质控", sub: "QC", num: "01" },
  { label: "标准化", sub: "SCTransform", num: "02" },
  { label: "降维", sub: "PCA / UMAP", num: "03" },
  { label: "聚类", sub: "Harmony", num: "04" },
  { label: "差异基因", sub: "FindMarkers", num: "05" },
  { label: "通路富集", sub: "GO / KEGG", num: "06" },
  { label: "可视化", sub: "Violin / Dot", num: "07" },
  { label: "注释", sub: "SingleR", num: "08" },
];

/* ===== 抽象细胞粒子配置 ===== */
const CELLS = [
  { size: 120, x: "10%", y: "20%", delay: 0, color: "rgba(194,105,61,0.08)", dur: 10 },
  { size: 80, x: "65%", y: "10%", delay: 2, color: "rgba(255,212,42,0.07)", dur: 12 },
  { size: 60, x: "80%", y: "55%", delay: 1, color: "rgba(194,105,61,0.06)", dur: 14 },
  { size: 100, x: "40%", y: "60%", delay: 3, color: "rgba(232,168,130,0.08)", dur: 11 },
  { size: 45, x: "25%", y: "75%", delay: 4, color: "rgba(255,212,42,0.05)", dur: 13 },
  { size: 70, x: "75%", y: "80%", delay: 1.5, color: "rgba(194,105,61,0.05)", dur: 15 },
];

export default function LandingPage() {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [startLoading, setStartLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  /* Scroll observer for navbar shadow + reveal animations */
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /* IntersectionObserver for scroll-triggered reveals */
  const revealCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(revealCallback, {
      threshold: 0.15,
      rootMargin: "0px 0px -40px 0px",
    });
    document.querySelectorAll(".reveal").forEach((el) => {
      observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, [revealCallback]);

  /* 点击"开始分析": 已有 token → 直接进, 否则创建 guest */
  const handleStart = async () => {
    const existing = localStorage.getItem("access_token");
    if (existing) { router.push("/dashboard/analysis"); return; }
    setStartLoading(true);
    try {
      const data = await guestLogin();
      saveAuthData(data, true);
      router.push("/dashboard/analysis");
    } catch {
      setAuthTab("login");
      setAuthOpen(true);
    } finally {
      setStartLoading(false);
    }
  };

  const openLogin = () => { setAuthTab("login"); setAuthOpen(true); };

  return (
    <>
      <div className="noise-overlay min-h-screen flex flex-col" style={{ background: "var(--clr-bg)" }}>
        {/* ═══════ Navbar ═══════ */}
        <nav
          className="sticky top-0 z-50 transition-all duration-300"
          style={{
            background: scrolled ? "rgba(250,247,244,0.92)" : "transparent",
            backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
            boxShadow: scrolled ? "0 1px 12px rgba(45,41,38,0.06)" : "none",
          }}
        >
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #C2693D, #D4784A)", boxShadow: "0 2px 8px rgba(194,105,61,0.2)" }}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3" />
                  </svg>
                </div>
                <span
                  className="text-lg font-bold"
                  style={{ fontFamily: "var(--font-display)", color: "var(--clr-dark-deep)", letterSpacing: "-0.02em" }}
                >
                  scCloud
                </span>
              </div>
              {/* Separator */}
              <div className="hidden md:block w-px h-5" style={{ background: "var(--clr-border)" }} />
              {/* Nav links */}
              <div className="hidden md:flex items-center gap-5">
                {[
                  { label: "功能", href: "#features" },
                  { label: "流程", href: "#pipeline" },
                  { label: "技术栈", href: "#tech" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="text-[13px] font-medium transition-colors duration-200 hover:text-[var(--clr-amber)]"
                    style={{ color: "var(--clr-text-muted)" }}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={openLogin}
                className="text-[13px] font-medium transition-colors duration-200 hover:text-[var(--clr-amber)]"
                style={{ color: "var(--clr-text-muted)" }}
              >
                登录
              </button>
              <button
                onClick={handleStart}
                disabled={startLoading}
                className="px-5 py-2 text-[13px] font-semibold text-white rounded-full transition-all duration-300 disabled:opacity-60"
                style={{
                  background: "var(--clr-amber)",
                  boxShadow: "0 2px 12px rgba(194,105,61,0.25)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--clr-amber-light)";
                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(194,105,61,0.35)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--clr-amber)";
                  e.currentTarget.style.boxShadow = "0 2px 12px rgba(194,105,61,0.25)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {startLoading ? "准备中..." : "开始使用"}
              </button>
            </div>
          </div>
        </nav>

        {/* ═══════ Hero — 左文右图 ═══════ */}
        <section className="relative pt-20 pb-28 md:pt-28 md:pb-36 overflow-hidden">
          {/* Warm glow accents */}
          <div className="absolute top-[-100px] left-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(194,105,61,0.06) 0%, transparent 70%)" }} />
          <div className="absolute bottom-[-80px] right-[-60px] w-[400px] h-[400px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,212,42,0.04) 0%, transparent 70%)" }} />

          <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center relative z-10">
            {/* Left: Text */}
            <div>
              {/* Badge */}
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold mb-8 tracking-wide uppercase"
                style={{
                  background: "rgba(194,105,61,0.08)",
                  color: "var(--clr-amber)",
                  border: "1px solid rgba(194,105,61,0.12)",
                  animation: "fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) 0s both",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--clr-success)" }} />
                scCloud v2 · Open Source
              </div>

              {/* Title */}
              <h1
                className="text-[2.8rem] md:text-[3.5rem] lg:text-[4rem] font-bold leading-[1.1] mb-6"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--clr-dark-deep)",
                  letterSpacing: "-0.04em",
                  animation: "fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both",
                }}
              >
                从数据到发现，
                <br />
                <span className="gradient-text">单细胞分析</span>
                <br />
                云端平台
              </h1>

              {/* Gold divider */}
              <div
                className="w-16 h-[2px] mb-6"
                style={{
                  background: "linear-gradient(90deg, var(--clr-amber), var(--clr-gold))",
                  animation: "fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both",
                }}
              />

              {/* Subtitle */}
              <p
                className="text-base md:text-lg mb-10 max-w-md"
                style={{
                  fontFamily: "var(--font-sans)",
                  color: "var(--clr-text-muted)",
                  lineHeight: 1.8,
                  fontWeight: 400,
                  animation: "fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both",
                }}
              >
                上传 scRNA-seq 数据，获得 publication-ready 的可视化结果。
              </p>

              {/* CTA */}
              <div
                className="flex flex-wrap items-center gap-4"
                style={{ animation: "fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) 0.2s both" }}
              >
                <button
                  onClick={handleStart}
                  disabled={startLoading}
                  className="px-8 py-3 text-white font-semibold rounded-full text-sm transition-all duration-300 disabled:opacity-60"
                  style={{
                    background: "var(--clr-amber)",
                    boxShadow: "0 4px 20px rgba(194,105,61,0.3)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 30px rgba(194,105,61,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(194,105,61,0.3)";
                  }}
                >
                  {startLoading ? "准备分析环境..." : "立即体验"}
                </button>
                <a
                  href="#features"
                  className="text-sm font-medium transition-colors duration-200"
                  style={{ color: "var(--clr-text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--clr-amber)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--clr-text-muted)")}
                >
                  了解更多 ↓
                </a>
              </div>
            </div>

            {/* Right: Abstract cell visualization */}
            <div
              className="relative w-full h-[400px] md:h-[480px] hidden md:block"
              style={{ animation: "fadeIn 1s cubic-bezier(0.22,1,0.36,1) 0.3s both" }}
            >
              {CELLS.map((cell, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: cell.size,
                    height: cell.size,
                    left: cell.x,
                    top: cell.y,
                    background: `radial-gradient(circle at 35% 35%, ${cell.color.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 2.5})`)} , ${cell.color})`,
                    animation: `float ${cell.dur}s ease-in-out ${cell.delay}s infinite`,
                    border: `1px solid ${cell.color.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 1.5})`)}`,
                  }}
                />
              ))}
              {/* Center cluster - brighter */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 160,
                  height: 160,
                  left: "35%",
                  top: "30%",
                  background: "radial-gradient(circle at 40% 40%, rgba(194,105,61,0.12), rgba(255,212,42,0.05))",
                  animation: "pulse-soft 6s ease-in-out infinite",
                  border: "1px solid rgba(194,105,61,0.08)",
                  backdropFilter: "blur(2px)",
                }}
              />
            </div>
          </div>
        </section>

        {/* ═══════ Features — 交错卡片 ═══════ */}
        <section id="features" className="py-24" style={{ background: "var(--clr-bg-card)" }}>
          <div className="max-w-6xl mx-auto px-6">
            {/* Section header */}
            <div className="mb-16 reveal">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
                style={{ color: "var(--clr-amber)", fontFamily: "var(--font-sans)" }}
              >
                Core Features
              </p>
              <h2
                className="text-2xl md:text-3xl font-bold"
                style={{ fontFamily: "var(--font-display)", color: "var(--clr-dark-deep)", letterSpacing: "-0.03em" }}
              >
                一站式完成
              </h2>
            </div>

            {/* Bento grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`reveal group p-7 rounded-xl cursor-default transition-all duration-400 ${f.large ? "md:col-span-2" : ""}`}
                  style={{
                    background: "var(--clr-surface-warm)",
                    border: "1px solid transparent",
                    transitionDelay: `${i * 0.08}s`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(194,105,61,0.2)";
                    e.currentTarget.style.boxShadow = "var(--shadow-glow)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                    style={{ background: "rgba(194,105,61,0.08)", color: "var(--clr-amber)" }}
                  >
                    {f.icon}
                  </div>
                  <h3
                    className="text-[15px] font-bold mb-2"
                    style={{ fontFamily: "var(--font-sans)", color: "var(--clr-dark-deep)" }}
                  >
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--clr-text-muted)" }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ Pipeline — 水平时间轴 ═══════ */}
        <section id="pipeline" className="py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-16 reveal">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
                style={{ color: "var(--clr-amber)", fontFamily: "var(--font-sans)" }}
              >
                Analysis Pipeline
              </p>
              <h2
                className="text-2xl md:text-3xl font-bold"
                style={{ fontFamily: "var(--font-display)", color: "var(--clr-dark-deep)", letterSpacing: "-0.03em" }}
              >
                八步，从原始数据到生物学洞见
              </h2>
            </div>

            {/* Timeline */}
            <div className="reveal relative">
              {/* Connecting line */}
              <div
                className="hidden md:block absolute top-6 left-0 right-0 h-[2px]"
                style={{
                  background: "repeating-linear-gradient(90deg, var(--clr-border) 0, var(--clr-border) 6px, transparent 6px, transparent 12px)",
                }}
              />
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 md:gap-2">
                {PIPELINE.map((step, i) => (
                  <div
                    key={step.num}
                    className="group relative flex flex-col items-center text-center"
                    style={{ transitionDelay: `${i * 0.06}s` }}
                  >
                    {/* Node */}
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-all duration-300 relative z-10 group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, var(--clr-amber), ${i > 4 ? "var(--clr-gold)" : "var(--clr-amber-light)"})`,
                        boxShadow: "0 2px 8px rgba(194,105,61,0.2)",
                      }}
                    >
                      <span className="text-[11px] font-bold text-white" style={{ fontFamily: "var(--font-mono)" }}>
                        {step.num}
                      </span>
                    </div>
                    <div
                      className="text-[13px] font-bold mb-0.5"
                      style={{ fontFamily: "var(--font-sans)", color: "var(--clr-dark-deep)" }}
                    >
                      {step.label}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--clr-text-faint)", fontFamily: "var(--font-mono)" }}>
                      {step.sub}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ Footer ═══════ */}
        <footer className="py-8" style={{ borderTop: "1px solid var(--clr-border)" }}>
          <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center"
                style={{ background: "var(--clr-amber)" }}
              >
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5" />
                </svg>
              </div>
              <span className="text-xs font-medium" style={{ color: "var(--clr-text-faint)" }}>
                scCloud v2
              </span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--clr-text-faint)" }}>
              Next.js · FastAPI · R Engine · ComputaBio Palette
            </p>
          </div>
        </footer>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab={authTab} />
    </>
  );
}
