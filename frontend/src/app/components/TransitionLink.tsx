'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

interface TransitionLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  color?: string;
}

/**
 * 路由跳转链接 — 直接导航，不再使用动画过渡。
 */
export default function TransitionLink({
  href,
  children,
  className = '',
}: TransitionLinkProps) {
  const router = useRouter();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      router.push(href);
    },
    [router, href],
  );

  return (
    <div onClick={handleClick} className={`cursor-pointer ${className}`}>
      {children}
    </div>
  );
}
