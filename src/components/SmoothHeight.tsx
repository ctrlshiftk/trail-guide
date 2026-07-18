"use client";

import {
  createContext,
  useContext,
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

type HeightLock = {
  lock: () => void;
  unlock: () => void;
  locked: boolean;
};

const SmoothHeightLockContext = createContext<HeightLock | null>(null);

/** Prevent the nearest SmoothHeight parent from shrinking until unlock(). */
export function useSmoothHeightLock() {
  return useContext(SmoothHeightLockContext);
}

function measureContentHeight(inner: HTMLElement, locked: boolean) {
  if (!locked) {
    return Math.ceil(inner.getBoundingClientRect().height);
  }

  // While locked the inner box is stretched to the shell height, so measure the
  // natural section heights of the first child instead of the stretched box.
  const root = inner.firstElementChild as HTMLElement | null;
  if (!root) {
    return Math.ceil(inner.getBoundingClientRect().height);
  }

  const style = getComputedStyle(root);
  let total =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const gap = parseFloat(style.rowGap || style.gap) || 0;
  const sections = Array.from(root.children) as HTMLElement[];
  sections.forEach((section, index) => {
    total += section.getBoundingClientRect().height;
    if (index < sections.length - 1) total += gap;
  });
  return Math.ceil(total);
}

/**
 * Eases its height whenever children resize (forms, lists, banners, etc.).
 * Rapid intermediate sizes are coalesced so nested animations don't thrash.
 * Children can lock the height so intermediate shrinks are ignored.
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
  const [locked, setLocked] = useState(false);
  const heightRef = useRef<number | undefined>(undefined);
  const lockedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef(0);
  const commitRef = useRef<(next: number) => void>(() => {});

  // Stable identity so consumers can depend on the context without thrashing.
  const apiRef = useRef<HeightLock>({
    lock: () => {},
    unlock: () => {},
    locked: false,
  });

  function measure() {
    const inner = innerRef.current;
    if (!inner) return 0;
    return measureContentHeight(inner, lockedRef.current);
  }

  apiRef.current.lock = () => {
    // Floor to the content as it is now (after forms dismiss), then hold.
    const next = measure();
    lockedRef.current = true;
    if (next > 0) {
      heightRef.current = next;
      setHeight(next);
    }
    setLocked(true);
  };

  apiRef.current.unlock = () => {
    lockedRef.current = false;
    setLocked(false);
  };

  apiRef.current.locked = locked;

  // After unlock, remeasure once stretch styles are gone.
  const wasLockedRef = useRef(false);
  useLayoutEffect(() => {
    if (wasLockedRef.current && !locked) {
      commitRef.current(measure());
    }
    wasLockedRef.current = locked;
  }, [locked]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const commit = (next: number) => {
      if (
        lockedRef.current &&
        heightRef.current !== undefined &&
        next < heightRef.current - 0.5
      ) {
        return;
      }
      if (
        heightRef.current !== undefined &&
        Math.abs(heightRef.current - next) < 1
      ) {
        return;
      }
      heightRef.current = next;
      setHeight(next);
    };

    commitRef.current = commit;

    const schedule = () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      cancelAnimationFrame(frameRef.current);

      frameRef.current = requestAnimationFrame(() => {
        // Longer settle so pack/enter staggers coalesce into one height tween.
        settleTimerRef.current = setTimeout(() => {
          commit(measure());
        }, 120);
      });
    };

    const observer = new ResizeObserver(schedule);

    const watch = () => {
      observer.observe(inner);
      const root = inner.firstElementChild;
      if (!root) return;
      observer.observe(root);
      // Section boxes change during pack/enter even while the shell is locked.
      for (const child of Array.from(root.children)) {
        observer.observe(child);
      }
    };

    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(inner, { childList: true, subtree: true });

    commit(measure());
    const enable = requestAnimationFrame(() => {
      if (!prefersReducedMotion()) setTransition(true);
    });

    return () => {
      cancelAnimationFrame(enable);
      cancelAnimationFrame(frameRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      mutations.disconnect();
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

  const innerStyle: CSSProperties | undefined = locked
    ? { height: "100%", display: "flex", flexDirection: "column" }
    : undefined;

  return (
    <SmoothHeightLockContext.Provider value={apiRef.current}>
      <div className={className} style={style}>
        <div ref={innerRef} style={innerStyle}>
          {children}
        </div>
      </div>
    </SmoothHeightLockContext.Provider>
  );
}
