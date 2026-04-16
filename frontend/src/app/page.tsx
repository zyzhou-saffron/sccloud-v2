import Link from "next/link";
import TransitionLink from "./components/TransitionLink";

/**
 * scCloud v2 首页 — ComputaBio 暖色学术风格
 * Hero 区域: 深色渐变 + 金色光晕
 */
export default function HomePage() {
  return (
    <main className="flex-1 flex flex-col">
      {/* Hero Section */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1E1B18 0%, #2D2926 40%, #9E4C13 100%)",
        }}
      >
        {/* Gold glow */}
        <div
          className="absolute top-[-30%] right-[-10%] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(255,212,42,0.12) 0%, transparent 70%)",
          }}
        />
        {/* Bottom accent bar */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{
            background: "linear-gradient(90deg, #C86019, #FFD42A, #C86019)",
          }}
        />

        <div className="relative z-10 text-center px-6 animate-fade-in">
          {/* Logo */}
          <div className="mb-6">
            <h1 className="text-white text-5xl font-bold mb-2" style={{ fontFamily: "var(--font-serif)", letterSpacing: '-0.02em' }}>
              scCloud
            </h1>
            <p className="text-white/65 text-lg">单细胞 RNA-seq 在线分析平台</p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <TransitionLink
              href="/login"
              className="block w-64 mx-auto px-6 py-3 bg-[#C86019] hover:bg-[#E07828] text-white font-semibold rounded-lg transition-all duration-300 shadow-lg"
            >
              登录
            </TransitionLink>
            <Link
              href="/register"
              className="block w-64 mx-auto px-6 py-3 border border-white/20 hover:border-[#FFD42A]/50 text-white/80 hover:text-[#FFD42A] rounded-lg transition-all duration-300"
            >
              注册新账号
            </Link>
          </div>

          <p className="mt-12 text-xs text-white/30">
            scCloud v2 · Next.js + FastAPI + R · ComputaBio Palette
          </p>
        </div>
      </div>
    </main>
  );
}
