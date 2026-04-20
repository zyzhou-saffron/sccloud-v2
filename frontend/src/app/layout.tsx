import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "scCloud — 单细胞分析平台",
  description: "scCloud v2 单细胞 RNA-seq 在线分析平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <head>
        {/* Google Fonts: Noto Serif SC + JetBrains Mono */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@400;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F8F6F3] text-[#2C2C2C] antialiased"
            style={{ fontFamily: "var(--font-sans)" }}>
        {children}
      </body>
    </html>
  );
}
