"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Eases its height whenever children resize (forms, lists, banners, etc.).
 */
export function SmoothHeight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [transition, setTransition] = useState(false);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measure = () => Math.ceil(inner.getBoundingClientRect().height);

    setHeight(measure());
    const enable = requestAnimationFrame(() => {
      if (!prefersReducedMotion()) setTransition(true);
    });

    const observer = new ResizeObserver(() => {
      setHeight(measure());
    });
    observer.observe(inner);

    return () => {
      cancelAnimationFrame(enable);
      observer.disconnect();
    };
  }, []);

  const style: CSSProperties = {
    height: height === undefined ? "auto" : height,
    overflow: "hidden",
    transition: transition
      ? "height 420ms cubic-bezier(0.33, 0.1, 0.2, 1)"
      : undefined,
  };

  return (
    <div className={className} style={style}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
