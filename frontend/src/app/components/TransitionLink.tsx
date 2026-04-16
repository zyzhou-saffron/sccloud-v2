'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import GridTransition from './GridTransition';

interface TransitionLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string; // Wrapper class name
  color?: string; // Transition color
}

export default function TransitionLink({ 
  href, 
  children, 
  className = "",
  color = '#c86019' 
}: TransitionLinkProps) {
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isTransitioning) return;
    setIsTransitioning(true);
  }, [isTransitioning]);

  const handleCovered = useCallback(() => {
    // When the screen is fully covered, navigate to the next page
    router.push(href);
  }, [router, href]);

  return (
    <>
      <div onClick={handleClick} className={`cursor-pointer ${className}`}>
        {children}
      </div>
      
      {/* GridTransition will live in the portal/fixed layer once triggered */}
      {isTransitioning && (
        <GridTransition
          isActive={isTransitioning}
          onCovered={handleCovered}
          color={color}
        />
      )}
    </>
  );
}
