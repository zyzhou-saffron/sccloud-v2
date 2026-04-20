"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 旧注册页面 — 重定向到首页（兼容旧链接和书签）。
 */
export default function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return null;
}
