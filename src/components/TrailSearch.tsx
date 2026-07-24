"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useHelpfulLinks } from "@/hooks/useHelpfulLinks";
import {
  RESOURCE_TYPES,
  formatResourceTypeLabels,
} from "@/lib/resource-types";
import type { ApproachValidation } from "@/lib/refine";
import type { SearchResult } from "@/lib/search";
import { SearchResults } from "./SearchResults";
import { SmoothHeight } from "./SmoothHeight";

const OVERLAY_EXIT_MS = 380;
const APPROACH_MOTION_MS = 420;
const VALIDATION_EXIT_MS = 320;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function summarizeQuery(text: string): string {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n").find((line) => line.trim()) ?? trimmed;
  const compact = firstLine.trim();

  if (trimmed.includes("\n") || trimmed.length > compact.length + 10) {
    return compact.length > 96 ? `${compact.slice(0, 96)}…` : `${compact}…`;
  }

  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

type FollowUpMode = "unsure" | "validate" | null;
type FollowUpPhase =
  | "idle"
  | "loading-question"
  | "answering"
  | "loading-result";

function assessmentLabel(assessment: ApproachValidation["assessment"]): string {
  switch (assessment) {
    case "correct":
      return "On the right track";
    case "partly-correct":
      return "Partly correct";
    case "incorrect":
      return "Needs rethinking";
  }
}

function assessmentStyles(
  assessment: ApproachValidation["assessment"],
): string {
  switch (assessment) {
    case "correct":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "partly-correct":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    case "incorrect":
      return "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
  }
}

type ResultTrail = {
  results: SearchResult[];
  /** How many entries at the front of `results` belong to the latest batch. */
  latestCount: number;
};

const EMPTY_RESULT_TRAIL: ResultTrail = { results: [], latestCount: 0 };

type ResultTrailAction =
  | { type: "replace"; results: SearchResult[] }
  | { type: "prepend"; incoming: SearchResult[] };

/** Newest batch first; drop older entries that share a URL with the new batch. */
function mergeIncomingResults(
  existing: SearchResult[],
  incoming: SearchResult[],
): SearchResult[] {
  const seen = new Set(incoming.map((result) => result.url));
  const older = existing.filter((result) => !seen.has(result.url));
  const stamped = incoming.map((result, index) => ({
    ...result,
    id: `${result.id}::${Date.now()}::${index}`,
  }));
  return [...stamped, ...older];
}

function resultTrailReducer(
  state: ResultTrail,
  action: ResultTrailAction,
): ResultTrail {
  switch (action.type) {
    case "replace":
      return {
        results: action.results,
        latestCount: action.results.length,
      };
    case "prepend": {
      if (action.incoming.length === 0) return state;
      return {
        results: mergeIncomingResults(state.results, action.incoming),
        latestCount: action.incoming.length,
      };
    }
  }
}

export function TrailSearch() {
  const queryInputRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [{ results, latestCount }, dispatchResultTrail] = useReducer(
    resultTrailReducer,
    EMPTY_RESULT_TRAIL,
  );
  const [hasSearched, setHasSearched] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<
    "closed" | "opening" | "open" | "closing"
  >("closed");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followUpMode, setFollowUpMode] = useState<FollowUpMode>(null);
  const [followUpPhase, setFollowUpPhase] = useState<FollowUpPhase>("idle");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [approachText, setApproachText] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [approachError, setApproachError] = useState<string | null>(null);
  const [isRefined, setIsRefined] = useState(false);
  const [validation, setValidation] = useState<ApproachValidation | null>(null);
  const [validationExiting, setValidationExiting] = useState(false);
  const [selectedResourceTypeIds, setSelectedResourceTypeIds] = useState<
    string[]
  >([]);
  const [submittedResourceTypeIds, setSubmittedResourceTypeIds] = useState<
    string[]
  >([]);
  const [portalReady, setPortalReady] = useState(false);
  const [approachMounted, setApproachMounted] = useState(false);
  const [approachVisible, setApproachVisible] = useState(false);
  const [showHelpful, setShowHelpful] = useState(false);
  const { links: helpfulLinks, remove: removeHelpfulLink } = useHelpfulLinks();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (helpfulLinks.length === 0) setShowHelpful(false);
  }, [helpfulLinks.length]);

  function toggleResourceType(resourceTypeId: string) {
    setSelectedResourceTypeIds((current) =>
      current.includes(resourceTypeId)
        ? current.filter((id) => id !== resourceTypeId)
        : [...current, resourceTypeId],
    );
  }

  function withResourceTypes<T extends Record<string, unknown>>(
    payload: T,
    resourceTypeIds = submittedResourceTypeIds,
  ) {
    return resourceTypeIds.length > 0
      ? { ...payload, resourceTypes: resourceTypeIds }
      : payload;
  }

  function resetUnsureFollowUp() {
    setFollowUpMode(null);
    setFollowUpPhase("idle");
    setFollowUpQuestion("");
    setFollowUpAnswer("");
    setFollowUpError(null);
  }

  function resetApproachPanel() {
    if (followUpMode === "validate" && followUpPhase === "loading-result") {
      return;
    }
    setApproachText("");
    setApproachError(null);
    if (followUpMode === "validate") {
      setFollowUpMode(null);
      setFollowUpPhase("idle");
    }
  }

  function startValidateApproach() {
    if (followUpPhase !== "idle" || isLoading) return;

    setFollowUpMode("validate");
    setFollowUpPhase("idle");
    setApproachText("");
    setApproachError(null);
    setValidation(null);
    setValidationExiting(false);
  }

  function applyFreshResults(next: SearchResult[]) {
    dispatchResultTrail({ type: "replace", results: next });
  }

  /** Prepend a new batch; primary list shows only that batch via latestCount. */
  function applyAccumulatedResults(incoming: SearchResult[]) {
    dispatchResultTrail({ type: "prepend", incoming });
  }

  function clearSession() {
    applyFreshResults([]);
    setError(null);
    setIsRefined(false);
    setValidation(null);
    setValidationExiting(false);
    resetUnsureFollowUp();
    setApproachText("");
    setApproachError(null);
    setApproachMounted(false);
    setApproachVisible(false);
  }

  function closeResultsOverlay() {
    if (followUpPhase === "loading-result" || isLoading) return;
    if (overlayPhase === "closing" || overlayPhase === "closed") return;
    setOverlayPhase("closing");
  }

  async function runSearch(searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed || isLoading) return;

    setSubmittedQuery(trimmed);
    setQuery(trimmed);
    setSubmittedResourceTypeIds([...selectedResourceTypeIds]);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setOverlayPhase((phase) => (phase === "closed" ? "opening" : "open"));
    applyFreshResults([]);
    setIsRefined(false);
    setValidation(null);
    setValidationExiting(false);
    resetUnsureFollowUp();
    setApproachText("");
    setApproachError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withResourceTypes({ query: trimmed }, selectedResourceTypeIds)),
      });

      const data: { results: SearchResult[]; error?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed");
      }

      applyFreshResults(data.results);
      if (data.error) {
        setError(data.error);
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Search failed. Try again.",
      );
      applyFreshResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function requestRefinementQuestion() {
    if (followUpPhase !== "idle" || isLoading) return;

    const hadValidation = validation !== null;

    setFollowUpMode("unsure");
    setFollowUpPhase("loading-question");
    setFollowUpError(null);
    // Keep the approach response visible while the question loads.

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withResourceTypes({
            action: "question",
            query: submittedQuery,
            previousResults: results,
          }),
        ),
      });

      const data: { question?: string; error?: string } = await response.json();

      if (!response.ok || !data.question) {
        throw new Error(data.error ?? "Could not get a follow-up question.");
      }

      if (hadValidation && !prefersReducedMotion()) {
        setValidationExiting(true);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, VALIDATION_EXIT_MS);
        });
      }

      setValidation(null);
      setValidationExiting(false);
      setFollowUpQuestion(data.question);
      setFollowUpPhase("answering");
    } catch (questionError) {
      setValidationExiting(false);
      setFollowUpError(
        questionError instanceof Error
          ? questionError.message
          : "Could not get a follow-up question.",
      );
      setFollowUpMode(null);
      setFollowUpPhase("idle");
    }
  }

  async function submitUnsureRefinement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const answer = followUpAnswer.trim();
    if (!answer || followUpPhase !== "answering" || followUpMode !== "unsure") {
      return;
    }

    setFollowUpError(null);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withResourceTypes({
            action: "refine",
            query: submittedQuery,
            question: followUpQuestion,
            answer,
            previousResults: results,
          }),
        ),
      });

      const data: { results: SearchResult[]; error?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Refined search failed");
      }

      applyAccumulatedResults(data.results);
      setIsRefined(true);
      resetUnsureFollowUp();

      if (data.error) {
        setError(data.error);
      }
    } catch (refineError) {
      setFollowUpError(
        refineError instanceof Error
          ? refineError.message
          : "Refined search failed. Try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function submitApproachValidation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const approach = approachText.trim();
    if (!approach || isLoading || followUpPhase === "loading-result") {
      return;
    }

    setFollowUpMode("validate");
    setFollowUpPhase("loading-result");
    setApproachError(null);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withResourceTypes({
            action: "validate",
            query: submittedQuery,
            approach,
            previousResults: results,
          }),
        ),
      });

      const data: {
        results: SearchResult[];
        validation?: ApproachValidation;
        error?: string;
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not evaluate your approach.");
      }

      applyAccumulatedResults(data.results);
      setValidation(data.validation ?? null);
      setValidationExiting(false);
      setIsRefined(true);
      setFollowUpMode(null);
      setFollowUpPhase("idle");
      setApproachText("");

      if (data.error) {
        setError(data.error);
      }
    } catch (validateError) {
      setApproachError(
        validateError instanceof Error
          ? validateError.message
          : "Could not evaluate your approach. Try again.",
      );
      setFollowUpMode("validate");
      setFollowUpPhase("idle");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runSearch(query);
    }
  }

  const showFollowUp =
    hasSearched &&
    !isLoading &&
    !error &&
    results.length > 0 &&
    followUpPhase !== "loading-result" &&
    followUpMode === null;

  const isApproachPanelOpen = followUpMode === "validate";

  const isApproachChecking =
    followUpMode === "validate" && followUpPhase === "loading-result";

  const overlayPresent = overlayPhase !== "closed";
  const overlayOpen = overlayPhase === "open";

  useLayoutEffect(() => {
    const textarea = queryInputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [query]);

  useEffect(() => {
    if (overlayPhase === "closed") {
      setApproachMounted(false);
      setApproachVisible(false);
    }
  }, [overlayPhase]);

  useEffect(() => {
    if (isApproachPanelOpen) {
      setApproachMounted(true);
      let frame2 = 0;
      const frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => setApproachVisible(true));
      });
      return () => {
        cancelAnimationFrame(frame1);
        cancelAnimationFrame(frame2);
      };
    }

    setApproachVisible(false);
    const timer = setTimeout(() => setApproachMounted(false), APPROACH_MOTION_MS);
    return () => clearTimeout(timer);
  }, [isApproachPanelOpen]);

  useEffect(() => {
    if (overlayPhase !== "opening") return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => setOverlayPhase("open"));
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [overlayPhase]);

  useEffect(() => {
    if (overlayPhase !== "closing") return;

    const timer = setTimeout(() => {
      setOverlayPhase("closed");
      setHasSearched(false);
      clearSession();
    }, OVERLAY_EXIT_MS);

    return () => clearTimeout(timer);
  }, [overlayPhase]);

  useEffect(() => {
    if (!overlayPresent) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (followUpPhase === "loading-result" || isLoading) return;
      if (overlayPhase === "closing") return;

      if (followUpMode === "unsure" && followUpPhase === "answering") {
        resetUnsureFollowUp();
        return;
      }

      if (followUpMode === "validate") {
        resetApproachPanel();
        return;
      }

      closeResultsOverlay();
    }

    document.addEventListener("keydown", handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [overlayPresent, overlayPhase, followUpPhase, followUpMode, isLoading]);

  const resourceTypeFilterLabel =
    submittedResourceTypeIds.length > 0
      ? formatResourceTypeLabels(submittedResourceTypeIds)
      : null;

  const resultsHeading = validation
    ? "Links to explore next"
    : isRefined
      ? "Refined links for"
      : "Links for";

  return (
    <div className="flex flex-col gap-10">
      <header className="space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Trail Guide
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          Build your own answers
        </h1>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Describe what you are stuck on and get links to relevant sources.
          No answers, just pointers.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <div className="relative">
          <label htmlFor="trail-search" className="sr-only">
            Describe your problem
          </label>
          <textarea
            ref={queryInputRef}
            id="trail-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your problem, question, or what you are trying to learn..."
            disabled={isLoading}
            rows={6}
            className="min-h-40 max-h-[min(24rem,50vh)] w-full resize-none overflow-y-auto rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-base leading-relaxed shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {RESOURCE_TYPES.map((type) => {
            const isSelected = selectedResourceTypeIds.includes(type.id);

            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={isSelected}
                title={type.intent}
                disabled={isLoading}
                onClick={() => toggleResourceType(type.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                }`}
              >
                {type.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Enter for a new line.{" "}
            <span className="whitespace-nowrap">⌘/Ctrl + Enter to search.</span>
          </p>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="rounded-2xl bg-emerald-700 px-8 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Find links
          </button>
        </div>
      </form>

      {helpfulLinks.length > 0 && (
        <section aria-labelledby="helpful-heading">
          <SmoothHeight>
            {!showHelpful ? (
              <button
                type="button"
                id="helpful-heading"
                aria-expanded={false}
                onClick={() => setShowHelpful(true)}
                className="group flex w-full items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-lg leading-none text-zinc-400 transition group-hover:text-emerald-600 dark:text-zinc-500 dark:group-hover:text-emerald-400"
                >
                  +
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-zinc-700 group-hover:text-emerald-800 dark:text-zinc-300 dark:group-hover:text-emerald-300">
                    Show {helpfulLinks.length} saved{" "}
                    {helpfulLinks.length === 1 ? "link" : "links"}
                  </span>
                  <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
                    Marked as helpful on this device
                  </span>
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="space-y-1">
                    <h2
                      id="helpful-heading"
                      className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                    >
                      Saved for later
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Links you marked as helpful. They stay on this device.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-expanded={true}
                    onClick={() => setShowHelpful(false)}
                    className="shrink-0 rounded-xl px-3 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Hide
                  </button>
                </div>
                <ul className="flex flex-col gap-3">
                  {helpfulLinks.map((link, index) => (
                    <li
                      key={link.url}
                      className="trail-drawer-expand relative"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={link.url}
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
                            {link.label}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-zinc-500 dark:text-zinc-400">
                            {link.site}
                          </span>
                        </span>
                      </a>
                      <button
                        type="button"
                        aria-label={`Remove ${link.label} from saved`}
                        title="Remove from saved"
                        onClick={() => removeHelpfulLink(link.url)}
                        className="absolute top-1/2 right-2.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                      >
                        <span aria-hidden className="text-xl leading-none">
                          ×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SmoothHeight>
        </section>
      )}

      {overlayPresent &&
        portalReady &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              aria-label="Close results"
              disabled={
                isLoading ||
                followUpPhase === "loading-result" ||
                overlayPhase === "closing"
              }
              onClick={closeResultsOverlay}
              className={`trail-overlay-backdrop fixed inset-0 bg-zinc-900/45 backdrop-blur-[3px] disabled:cursor-not-allowed${
                overlayOpen ? " is-open" : ""
              }`}
            />

            <div
              className={`trail-overlay-pair relative z-10 items-center${
                approachVisible && overlayOpen ? " has-approach" : ""
              }`}
              style={{ alignItems: "center" }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="results-title"
                className={`trail-window trail-links-panel relative flex max-h-[min(85dvh,52rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950${
                  overlayOpen ? " is-open" : ""
                }`}
              >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Trail Guide
                  </p>
                  <h2
                    id="results-title"
                    className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                  >
                    {resultsHeading}{" "}
                    {!validation && (
                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                        &ldquo;{summarizeQuery(submittedQuery)}&rdquo;
                        {resourceTypeFilterLabel && (
                          <>
                            {" "}
                            in{" "}
                            <span className="text-zinc-600 dark:text-zinc-300">
                              {resourceTypeFilterLabel}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </h2>
                </div>
                  <button
                    type="button"
                    aria-label="Close"
                    disabled={
                      isLoading ||
                      followUpPhase === "loading-result" ||
                      overlayPhase === "closing"
                    }
                    onClick={closeResultsOverlay}
                    className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  >
                    Esc
                  </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <SmoothHeight>
                  <div className="flex h-full flex-1 flex-col gap-5 px-5 py-5">
                    <div className="flex flex-col">
                      {isLoading &&
                        followUpMode === null &&
                        results.length === 0 && (
                          <p className="mb-5 text-sm text-zinc-400 dark:text-zinc-500">
                            Understanding and searching…
                          </p>
                        )}

                      {validation && (
                        <div
                          className={`trail-validation-slot${
                            validationExiting ? " is-exiting" : ""
                          }`}
                        >
                          <div className="trail-validation-clip">
                            <div
                              className={`rounded-2xl border px-4 py-4 ${assessmentStyles(validation.assessment)}${
                                validationExiting
                                  ? " trail-validation-fade"
                                  : ""
                              }`}
                            >
                              <p className="text-sm font-medium">
                                {assessmentLabel(validation.assessment)}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed">
                                {validation.feedback}
                              </p>
                              {validation.hints.length > 0 && (
                                <div className="mt-3">
                                  <p className="text-sm font-medium">
                                    Things to consider
                                  </p>
                                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                                    {validation.hints.map((hint) => (
                                      <li key={hint}>{hint}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {error ? (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {error}
                        </p>
                      ) : (
                        (!isLoading || results.length > 0) && (
                          <SearchResults
                            results={results}
                            latestCount={latestCount}
                            query={summarizeQuery(submittedQuery)}
                          />
                        )
                      )}
                    </div>

                    <div className="mt-auto space-y-5">
                      {(showFollowUp ||
                        followUpPhase === "loading-question") && (
                        <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
                          {showFollowUp ? (
                            <div className="relative grid gap-8 sm:grid-cols-2 sm:gap-0">
                              <div
                                aria-hidden
                                className="absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-zinc-200 dark:bg-zinc-800 sm:block"
                              />
                              <div className="flex flex-col items-center gap-3 text-center">
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                  None of these quite fit?
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void requestRefinementQuestion()}
                                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                                >
                                  I&apos;m still unsure
                                </button>
                              </div>
                              <div className="flex flex-col items-center gap-3 border-t border-zinc-200 pt-8 text-center sm:border-t-0 sm:pt-0 dark:border-zinc-800">
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                  Think you&apos;ve got it?
                                </p>
                                <button
                                  type="button"
                                  onClick={startValidateApproach}
                                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-300 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                                >
                                  Check if my approach is right
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex min-h-[5.5rem] flex-col items-center justify-center gap-2 text-center sm:min-h-[4.5rem]">
                              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                                Thinking of a question to narrow this down…
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {followUpError && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {followUpError}
                        </p>
                      )}

                      {followUpPhase === "answering" &&
                        followUpMode === "unsure" && (
                          <form
                            onSubmit={submitUnsureRefinement}
                            className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-900"
                          >
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                              {followUpQuestion}
                            </p>
                            <label htmlFor="follow-up-answer" className="sr-only">
                              Your answer
                            </label>
                            <input
                              id="follow-up-answer"
                              type="text"
                              value={followUpAnswer}
                              onChange={(event) =>
                                setFollowUpAnswer(event.target.value)
                              }
                              placeholder="Your answer…"
                              disabled={isLoading}
                              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
                            />
                            {isLoading ? (
                              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                                Finding better links…
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="submit"
                                  disabled={!followUpAnswer.trim()}
                                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                >
                                  Get refined links
                                </button>
                                <button
                                  type="button"
                                  onClick={resetUnsureFollowUp}
                                  className="rounded-xl px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </form>
                        )}
                    </div>
                  </div>
                </SmoothHeight>
              </div>
              </section>

              {approachMounted && (
                <div
                  className={`trail-approach-slot self-center${
                    approachVisible && overlayOpen ? " is-open" : ""
                  }`}
                  style={{ alignSelf: "center" }}
                >
                  <div className="trail-approach-slot-clip">
                    <aside
                      role="dialog"
                      aria-labelledby="approach-title"
                      aria-hidden={!approachVisible}
                      className={`trail-window trail-approach-panel relative flex max-h-[min(85dvh,52rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950${
                        approachVisible && overlayOpen ? " is-open" : ""
                      }`}
                    >
                      <SmoothHeight>
                        {isApproachChecking ? (
                          <div className="flex flex-col justify-center space-y-3 px-5 py-10 text-center">
                            <p
                              id="approach-title"
                              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                            >
                              Checking your approach…
                            </p>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              We&apos;ll tell you if you&apos;re on the right
                              track.
                            </p>
                          </div>
                        ) : (
                          <form
                            onSubmit={submitApproachValidation}
                            className="flex flex-col gap-4 px-5 py-5"
                          >
                            <div className="space-y-1">
                              <p
                                id="approach-title"
                                className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                              >
                                Check if your approach is right
                              </p>
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Describe what you think the answer is or how
                                you&apos;d solve it.
                              </p>
                            </div>
                            <label htmlFor="approach-input" className="sr-only">
                              Your approach
                            </label>
                            <textarea
                              id="approach-input"
                              value={approachText}
                              onChange={(event) =>
                                setApproachText(event.target.value)
                              }
                              placeholder="I think the issue is… / My plan is to…"
                              autoFocus={approachVisible}
                              disabled={isLoading || !isApproachPanelOpen}
                              rows={6}
                              className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
                            />
                            {approachError && (
                              <p className="text-sm text-red-600 dark:text-red-400">
                                {approachError}
                              </p>
                            )}
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={resetApproachPanel}
                                disabled={isLoading || !isApproachPanelOpen}
                                className="rounded-xl px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={
                                  isLoading ||
                                  !isApproachPanelOpen ||
                                  !approachText.trim()
                                }
                                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                              >
                                Check my approach
                              </button>
                            </div>
                          </form>
                        )}
                      </SmoothHeight>
                    </aside>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
