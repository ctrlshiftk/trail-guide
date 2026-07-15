"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { ARCHIVES, formatArchiveLabels } from "@/lib/archives";
import type { ApproachValidation } from "@/lib/refine";
import type { SearchResult } from "@/lib/search";
import { SearchResults } from "./SearchResults";

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

export function TrailSearch() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [latestCount, setLatestCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
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
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [submittedArchiveIds, setSubmittedArchiveIds] = useState<string[]>([]);

  function toggleArchive(archiveId: string) {
    setSelectedArchiveIds((current) =>
      current.includes(archiveId)
        ? current.filter((id) => id !== archiveId)
        : [...current, archiveId],
    );
  }

  function withArchives<T extends Record<string, unknown>>(
    payload: T,
    archiveIds = submittedArchiveIds,
  ) {
    return archiveIds.length > 0 ? { ...payload, archives: archiveIds } : payload;
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
  }

  function applyFreshResults(next: SearchResult[]) {
    setResults(next);
    setLatestCount(next.length);
  }

  function applyAccumulatedResults(incoming: SearchResult[]) {
    if (incoming.length === 0) return;

    setResults((current) => mergeIncomingResults(current, incoming));
    setLatestCount(incoming.length);
  }

  function closeResultsOverlay() {
    if (followUpPhase === "loading-result" || isLoading) return;

    setHasSearched(false);
    applyFreshResults([]);
    setError(null);
    setIsRefined(false);
    setValidation(null);
    resetUnsureFollowUp();
    setApproachText("");
    setApproachError(null);
  }

  async function runSearch(searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed || isLoading) return;

    setSubmittedQuery(trimmed);
    setQuery(trimmed);
    setSubmittedArchiveIds([...selectedArchiveIds]);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    applyFreshResults([]);
    setIsRefined(false);
    setValidation(null);
    resetUnsureFollowUp();
    setApproachText("");
    setApproachError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withArchives({ query: trimmed }, selectedArchiveIds)),
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

    setFollowUpMode("unsure");
    setFollowUpPhase("loading-question");
    setFollowUpError(null);
    setValidation(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withArchives({
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

      setFollowUpQuestion(data.question);
      setFollowUpPhase("answering");
    } catch (questionError) {
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

    setFollowUpPhase("loading-result");
    setFollowUpError(null);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withArchives({
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
      setFollowUpPhase("answering");
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
          withArchives({
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

  useEffect(() => {
    if (!hasSearched) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (followUpPhase === "loading-result" || isLoading) return;

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
  }, [hasSearched, followUpPhase, followUpMode, isLoading]);

  const archiveFilterLabel =
    submittedArchiveIds.length > 0
      ? formatArchiveLabels(submittedArchiveIds)
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
          Describe your problem in detail and get links to relevant docs and
          references. No answers, just pointers.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <div className="relative">
          <label htmlFor="trail-search" className="sr-only">
            Describe your problem
          </label>
          <textarea
            id="trail-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your problem, error, or question..."
            disabled={isLoading}
            rows={6}
            className="min-h-40 w-full resize-y rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-base leading-relaxed shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {ARCHIVES.map((archive) => {
            const isSelected = selectedArchiveIds.includes(archive.id);

            return (
              <button
                key={archive.id}
                type="button"
                aria-pressed={isSelected}
                disabled={isLoading}
                onClick={() => toggleArchive(archive.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
                  isSelected
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                }`}
              >
                {archive.label}
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

      {hasSearched && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close results"
            disabled={isLoading || followUpPhase === "loading-result"}
            onClick={closeResultsOverlay}
            className="absolute inset-0 bg-zinc-900/45 backdrop-blur-[3px] transition disabled:cursor-not-allowed"
          />

          <div
            className={`relative flex w-full flex-col items-stretch gap-4 lg:flex-row lg:items-start ${
              isApproachPanelOpen
                ? "max-w-[calc(48rem+22rem+1rem)]"
                : "max-w-3xl"
            }`}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="results-title"
              className="relative flex max-h-[min(85dvh,52rem)] w-full max-w-3xl shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
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
                        {archiveFilterLabel && (
                          <>
                            {" "}
                            in{" "}
                            <span className="text-zinc-600 dark:text-zinc-300">
                              {archiveFilterLabel}
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
                  disabled={isLoading || followUpPhase === "loading-result"}
                  onClick={closeResultsOverlay}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                >
                  Esc
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                {isLoading && followUpPhase !== "loading-result" && (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">
                    Understanding and searching…
                  </p>
                )}

                {followUpPhase === "loading-result" &&
                  followUpMode === "unsure" && (
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                      Finding better links…
                    </p>
                  )}

                {validation && (
                  <div
                    className={`rounded-2xl border px-4 py-4 ${assessmentStyles(validation.assessment)}`}
                  >
                    <p className="text-sm font-medium">
                      {assessmentLabel(validation.assessment)}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">
                      {validation.feedback}
                    </p>
                    {validation.hints.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium">Things to consider</p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                          {validation.hints.map((hint) => (
                            <li key={hint}>{hint}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {error ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                ) : (
                  (!isLoading || followUpPhase === "loading-result") && (
                    <SearchResults
                      results={results}
                      latestCount={latestCount}
                      query={summarizeQuery(submittedQuery)}
                    />
                  )
                )}

                {showFollowUp && (
                  <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
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
                  </div>
                )}

                {followUpPhase === "loading-question" && (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">
                    Thinking of a question to narrow this down…
                  </p>
                )}

                {followUpError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {followUpError}
                  </p>
                )}

                {followUpPhase === "answering" && followUpMode === "unsure" && (
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
                      onChange={(event) => setFollowUpAnswer(event.target.value)}
                      placeholder="Your answer…"
                      disabled={isLoading}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={isLoading || !followUpAnswer.trim()}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        Get refined links
                      </button>
                      <button
                        type="button"
                        onClick={resetUnsureFollowUp}
                        disabled={isLoading}
                        className="rounded-xl px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>

            {isApproachPanelOpen && (
              <aside
                role="dialog"
                aria-labelledby="approach-title"
                className="relative w-full shrink-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 lg:w-[22rem]"
              >
                {isApproachChecking ? (
                  <div className="space-y-3 px-5 py-10 text-center">
                    <p
                      id="approach-title"
                      className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    >
                      Checking your approach…
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      We&apos;ll tell you if you&apos;re on the right track.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={submitApproachValidation}
                    className="flex h-full flex-col gap-4 px-5 py-5"
                  >
                    <div className="space-y-1">
                      <p
                        id="approach-title"
                        className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                      >
                        Check if your approach is right
                      </p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Describe what you think the answer is or how you&apos;d
                        solve it.
                      </p>
                    </div>
                    <label htmlFor="approach-input" className="sr-only">
                      Your approach
                    </label>
                    <textarea
                      id="approach-input"
                      value={approachText}
                      onChange={(event) => setApproachText(event.target.value)}
                      placeholder="I think the issue is… / My plan is to…"
                      autoFocus
                      disabled={isLoading}
                      rows={6}
                      className="w-full flex-1 resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900"
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
                        disabled={isLoading}
                        className="rounded-xl px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading || !approachText.trim()}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        Check my approach
                      </button>
                    </div>
                  </form>
                )}
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
