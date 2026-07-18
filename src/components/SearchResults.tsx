"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useHelpfulLinks } from "@/hooks/useHelpfulLinks";
import type { SearchResult } from "@/lib/search";
import { useSmoothHeightLock } from "./SmoothHeight";

const TRANSITION_MS = 720;
const STAGGER_MS = 55;
const EXPAND_STAGGER_MS = 50;
/** How long packing runs before new links start opening. */
const PACK_LEAD_MS = 160;
/** Reveal the drawer once the first packing card has mostly collapsed. */
const DRAWER_AFTER_PACK_MS = Math.round(TRANSITION_MS * 0.55);

function ResultLink({
  result,
  saved,
  onToggle,
}: {
  result: SearchResult;
  saved: boolean;
  onToggle: (result: SearchResult) => void;
}) {
  return (
    <div className="relative">
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        title={result.url}
        className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white py-3 pr-12 pl-4 no-underline transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
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
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? "Remove from helpful" : "Mark as helpful"}
        title={saved ? "Remove from helpful" : "Mark as helpful"}
        onClick={() => onToggle(result)}
        className={`absolute top-1/2 right-2.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg transition ${
          saved
            ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
            : "text-zinc-300 opacity-70 hover:bg-zinc-100 hover:text-zinc-600 hover:opacity-100 dark:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 3.5h8a.5.5 0 0 1 .5.5v12.2l-4.25-2.55a.5.5 0 0 0-.5 0L5.5 16.2V4a.5.5 0 0 1 .5-.5Z"
          />
        </svg>
      </button>
    </div>
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
    <div
      role="listitem"
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
    </div>
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
  const { has, toggle } = useHelpfulLinks();
  const heightLock = useSmoothHeightLock();
  const heightLockRef = useRef(heightLock);
  heightLockRef.current = heightLock;
  const [showOlder, setShowOlder] = useState(false);
  const [phase, setPhase] = useState<"idle" | "swap">("idle");
  const [packReady, setPackReady] = useState(false);
  const [enterReady, setEnterReady] = useState(false);
  const [packing, setPacking] = useState<SearchResult[]>([]);
  const [pendingLatest, setPendingLatest] = useState<SearchResult[]>([]);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [drawerReceiving, setDrawerReceiving] = useState(false);
  const [drawerEntering, setDrawerEntering] = useState(false);
  /** Hide a brand-new drawer until a packing card has freed space for it. */
  const [deferDrawer, setDeferDrawer] = useState(false);
  const [drawerSlotOpen, setDrawerSlotOpen] = useState(true);

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
      // Keep the panel from shrinking while links pack; drawer can still ride up.
      heightLock?.lock();
      setPhase("swap");
      setPackReady(false);
      setEnterReady(false);
      setPacking(packingItems);
      setPendingLatest(nextLatest);
      setEnteringIds(new Set(nextLatest.map((result) => result.id)));
      setDrawerReceiving(!drawerIsNew);
      setDrawerEntering(false);
      // New drawer waits until a packing card collapses so it can grow into that space.
      setDeferDrawer(drawerIsNew);
      setDrawerSlotOpen(!drawerIsNew);

      const packDuration =
        TRANSITION_MS + packingItems.length * STAGGER_MS;
      const enterDuration =
        TRANSITION_MS + nextLatest.length * STAGGER_MS;

      later(() => {
        setPhase("idle");
        setPackReady(false);
        setEnterReady(false);
        setPacking([]);
        setPendingLatest([]);
        setDrawerReceiving(false);
        setDrawerEntering(false);
        setDeferDrawer(false);
        setDrawerSlotOpen(true);
        setEnteringIds(new Set());
        // Release after new links are in so the window can ease to final height.
        heightLock?.unlock();
      }, Math.max(packDuration, PACK_LEAD_MS + enterDuration) + 40);
    } else {
      heightLock?.unlock();
      setPhase("idle");
      setPackReady(false);
      setEnterReady(false);
      setPacking([]);
      setPendingLatest([]);
      setDrawerReceiving(false);
      setDeferDrawer(false);
      setDrawerSlotOpen(true);
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

  // Double rAF so the pack closed transition actually animates.
  useLayoutEffect(() => {
    if (phase !== "swap" || packReady) return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setPackReady(true));
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [phase, packReady]);

  // Short beat after packing starts, then reveal the new batch.
  useLayoutEffect(() => {
    if (phase !== "swap" || !packReady || enterReady) return;
    later(() => setEnterReady(true), PACK_LEAD_MS);
  }, [phase, packReady, enterReady]);

  // After the first packing card collapses, mount the drawer closed, then open it.
  useLayoutEffect(() => {
    if (phase !== "swap" || !packReady || !deferDrawer) return;

    later(() => {
      setDeferDrawer(false);
      setDrawerSlotOpen(false);
      setDrawerEntering(true);
      setDrawerReceiving(true);
    }, DRAWER_AFTER_PACK_MS);
  }, [phase, packReady, deferDrawer]);

  useLayoutEffect(() => {
    if (deferDrawer || drawerSlotOpen || !hasOlder || showOlder) return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setDrawerSlotOpen(true));
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [deferDrawer, drawerSlotOpen, hasOlder, showOlder]);

  useLayoutEffect(() => {
    if (!drawerEntering) return;
    later(() => setDrawerEntering(false), 560);
  }, [drawerEntering]);

  useEffect(
    () => () => {
      clearTimers();
      heightLockRef.current?.unlock();
    },
    [],
  );

  if (results.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No links found for &ldquo;{query}&rdquo;
      </p>
    );
  }

  const shownLatest = phase === "swap" ? pendingLatest : latest;
  const showDrawer = hasOlder && !showOlder && !deferDrawer;
  const latestOpen = phase === "swap" ? enterReady : true;
  const packingOpen = phase === "swap" ? !packReady : false;

  function renderLink(result: SearchResult, options: {
    open: boolean;
    staggerIndex: number;
    tone: "idle" | "enter" | "pack" | "appear";
    key?: string;
  }) {
    return (
      <LinkSlot
        key={options.key ?? result.id}
        open={options.open}
        staggerIndex={options.staggerIndex}
        tone={options.tone}
      >
        <ResultLink
          result={result}
          saved={has(result.url)}
          onToggle={toggle}
        />
      </LinkSlot>
    );
  }

  return (
    <div role="list" className="flex flex-col">
      {phase === "swap" ? (
        <div className="trail-swap-crossfade">
          <div className="trail-swap-layer trail-swap-layer-enter">
            {shownLatest.map((result, index) =>
              renderLink(result, {
                open: latestOpen,
                staggerIndex: index,
                tone: "enter",
              }),
            )}
          </div>
          <div className="trail-swap-layer trail-swap-layer-pack" aria-hidden>
            {packing.map((result, index) =>
              renderLink(result, {
                open: packingOpen,
                staggerIndex: index,
                tone: "pack",
                key: `packing-${result.id}`,
              }),
            )}
          </div>
        </div>
      ) : (
        shownLatest.map((result, index) =>
          renderLink(result, {
            open: true,
            staggerIndex: index,
            tone: enteringIds.has(result.id) ? "appear" : "idle",
          }),
        )
      )}

      {showDrawer && (
        <LinkSlot
          open={drawerSlotOpen}
          staggerIndex={0}
          tone={drawerEntering ? "enter" : "idle"}
        >
          <div className={drawerReceiving ? "trail-drawer-receive" : ""}>
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
          </div>
        </LinkSlot>
      )}

      {hasOlder && showOlder && (
        <>
          {older.map((result, index) => (
            <div
              key={result.id}
              role="listitem"
              className="trail-drawer-expand pb-3"
              style={{ animationDelay: `${index * EXPAND_STAGGER_MS}ms` }}
            >
              <ResultLink
                result={result}
                saved={has(result.url)}
                onToggle={toggle}
              />
            </div>
          ))}
          <div
            role="listitem"
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
          </div>
        </>
      )}
    </div>
  );
}
