"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SearchResult } from "@/lib/search";

const TRANSITION_MS = 720;
const STAGGER_MS = 55;
const EXPAND_STAGGER_MS = 50;

function ResultLink({ result }: { result: SearchResult }) {
  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      title={result.url}
      className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 no-underline transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
    >
      <span
        aria-hidden
        className="mt-0.5 text-lg leading-none text-emerald-600 dark:text-emerald-400"
      >
        ↗
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-zinc-900 group-hover:text-emerald-800 group-hover:underline dark:text-zinc-100 dark:group-hover:text-emerald-300">
          {result.label}
        </span>
        <span className="mt-0.5 block truncate text-sm text-zinc-500 dark:text-zinc-400">
          {result.site}
        </span>
      </span>
    </a>
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function LinkSlot({
  open,
  staggerIndex = 0,
  tone = "idle",
  children,
}: {
  open: boolean;
  staggerIndex?: number;
  tone?: "idle" | "enter" | "pack" | "appear";
  children: ReactNode;
}) {
  const delay = staggerIndex * STAGGER_MS;

  return (
    <li
      className={[
        "trail-slot grid min-h-0",
        open ? "trail-slot-open" : "trail-slot-closed",
        tone === "enter" ? "trail-slot-enter" : "",
        tone === "pack" ? "trail-slot-pack" : "",
        tone === "appear" ? "trail-slot-appear" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
      aria-hidden={tone === "pack" || !open ? true : undefined}
    >
      <div className="trail-slot-clip min-h-0 overflow-hidden">
        <div
          className="trail-slot-inner pb-3"
          style={{ transitionDelay: `${delay}ms`, animationDelay: `${delay}ms` }}
        >
          {children}
        </div>
      </div>
    </li>
  );
}

export function SearchResults({
  results,
  latestCount,
  query,
}: {
  results: SearchResult[];
  /** How many results at the front of the list are from the latest search. */
  latestCount: number;
  query: string;
}) {
  const [showOlder, setShowOlder] = useState(false);
  const [phase, setPhase] = useState<"idle" | "swap">("idle");
  const [swapReady, setSwapReady] = useState(false);
  const [packing, setPacking] = useState<SearchResult[]>([]);
  const [pendingLatest, setPendingLatest] = useState<SearchResult[]>([]);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [drawerReceiving, setDrawerReceiving] = useState(false);
  const [drawerEntering, setDrawerEntering] = useState(false);

  const prevLatestRef = useRef<SearchResult[]>([]);
  const prevHasOlderRef = useRef(false);
  const committedBatchKeyRef = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const visibleLatest = Math.min(Math.max(latestCount, 0), results.length);
  const latest = results.slice(0, visibleLatest);
  const older = results.slice(visibleLatest);
  const hasOlder = older.length > 0;
  const latestBatchKey = `${results[0]?.id ?? "none"}:${latestCount}:${results.length}`;

  function clearTimers() {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }

  function later(fn: () => void, ms: number) {
    const timer = setTimeout(fn, ms);
    timersRef.current.push(timer);
  }

  useLayoutEffect(() => {
    if (committedBatchKeyRef.current === latestBatchKey) {
      return;
    }

    const nextLatest = results.slice(
      0,
      Math.min(Math.max(latestCount, 0), results.length),
    );
    const nextOlder = results.slice(nextLatest.length);
    const nextOlderIds = new Set(nextOlder.map((result) => result.id));
    const packingItems = prevLatestRef.current.filter((result) =>
      nextOlderIds.has(result.id),
    );
    const reducedMotion = prefersReducedMotion();
    const drawerIsNew = nextOlder.length > 0 && !prevHasOlderRef.current;
    const isFirstCommit = committedBatchKeyRef.current === null;

    committedBatchKeyRef.current = latestBatchKey;
    clearTimers();
    setShowOlder(false);

    if (!isFirstCommit && packingItems.length > 0 && !reducedMotion) {
      // Crossfade heights: collapse old cards while expanding new ones so the
      // drawer doesn't snap upward when the previous batch disappears.
      setPhase("swap");
      setSwapReady(false);
      setPacking(packingItems);
      setPendingLatest(nextLatest);
      setEnteringIds(new Set(nextLatest.map((result) => result.id)));
      setDrawerReceiving(true);
      setDrawerEntering(drawerIsNew);

      const duration =
        TRANSITION_MS +
        Math.max(packingItems.length, nextLatest.length) * STAGGER_MS;

      later(() => {
        setPhase("idle");
        setSwapReady(false);
        setPacking([]);
        setPendingLatest([]);
        setDrawerReceiving(false);
        setDrawerEntering(false);
        setEnteringIds(new Set());
      }, duration + 40);
    } else {
      setPhase("idle");
      setSwapReady(false);
      setPacking([]);
      setPendingLatest([]);
      setDrawerReceiving(false);
      setDrawerEntering(drawerIsNew && !reducedMotion);
      setEnteringIds(
        reducedMotion || nextLatest.length === 0
          ? new Set()
          : new Set(nextLatest.map((result) => result.id)),
      );

      if (drawerIsNew && !reducedMotion) {
        later(() => setDrawerEntering(false), 480);
      }
      if (!reducedMotion && nextLatest.length > 0) {
        later(
          () => setEnteringIds(new Set()),
          520 + nextLatest.length * STAGGER_MS,
        );
      }
    }

    prevLatestRef.current = nextLatest;
    prevHasOlderRef.current = nextOlder.length > 0;
  }, [latestBatchKey, latestCount, results]);

  // Double rAF so the closed→open grid transition actually animates.
  useLayoutEffect(() => {
    if (phase !== "swap" || swapReady) return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setSwapReady(true));
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [phase, swapReady]);

  useEffect(() => clearTimers, []);

  if (results.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No links found for &ldquo;{query}&rdquo;
      </p>
    );
  }

  const shownLatest = phase === "swap" ? pendingLatest : latest;
  const showDrawer = hasOlder && !showOlder;
  const latestOpen = phase === "swap" ? swapReady : true;
  const packingOpen = phase === "swap" ? !swapReady : false;

  return (
    <ul className="flex flex-col">
      {shownLatest.map((result, index) => (
        <LinkSlot
          key={result.id}
          open={latestOpen}
          staggerIndex={index}
          tone={
            phase === "swap"
              ? "enter"
              : enteringIds.has(result.id)
                ? "appear"
                : "idle"
          }
        >
          <ResultLink result={result} />
        </LinkSlot>
      ))}

      {packing.map((result, index) => (
        <LinkSlot
          key={`packing-${result.id}`}
          open={packingOpen}
          staggerIndex={index}
          tone="pack"
        >
          <ResultLink result={result} />
        </LinkSlot>
      ))}

      {showDrawer && (
        <li
          className={[
            "pb-3",
            drawerEntering ? "trail-drawer-enter" : "",
            drawerReceiving ? "trail-drawer-receive" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            type="button"
            onClick={() => setShowOlder(true)}
            aria-expanded={false}
            className="group flex w-full items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-left transition-[border-color,background-color,transform] duration-500 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-lg leading-none text-zinc-400 transition group-hover:text-emerald-600 dark:text-zinc-500 dark:group-hover:text-emerald-400"
            >
              +
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-zinc-700 group-hover:text-emerald-800 dark:text-zinc-300 dark:group-hover:text-emerald-300">
                Show {older.length} earlier{" "}
                {older.length === 1 ? "link" : "links"}
              </span>
              <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
                From previous searches in this trail
              </span>
            </span>
          </button>
        </li>
      )}

      {hasOlder && showOlder && (
        <>
          {older.map((result, index) => (
            <li
              key={result.id}
              className="trail-drawer-expand pb-3"
              style={{ animationDelay: `${index * EXPAND_STAGGER_MS}ms` }}
            >
              <ResultLink result={result} />
            </li>
          ))}
          <li
            className="trail-drawer-expand pb-3"
            style={{
              animationDelay: `${older.length * EXPAND_STAGGER_MS}ms`,
            }}
          >
            <button
              type="button"
              onClick={() => setShowOlder(false)}
              aria-expanded={true}
              className="w-full rounded-xl px-4 py-2 text-left text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Show fewer
            </button>
          </li>
        </>
      )}
    </ul>
  );
}
