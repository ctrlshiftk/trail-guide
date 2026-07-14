"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
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

export function TrailSearch() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followUpMode, setFollowUpMode] = useState<FollowUpMode>(null);
  const [followUpPhase, setFollowUpPhase] = useState<FollowUpPhase>("idle");
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [isRefined, setIsRefined] = useState(false);
  const [validation, setValidation] = useState<ApproachValidation | null>(null);

  function resetFollowUp() {
    setFollowUpMode(null);
    setFollowUpPhase("idle");
    setFollowUpQuestion("");
    setFollowUpAnswer("");
    setFollowUpError(null);
    setIsRefined(false);
    setValidation(null);
  }

  async function runSearch(searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed || isLoading) return;

    setSubmittedQuery(trimmed);
    setQuery(trimmed);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);
    resetFollowUp();

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      const data: { results: SearchResult[]; error?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed");
      }

      setResults(data.results);
      if (data.error) {
        setError(data.error);
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Search failed. Try again.",
      );
      setResults([]);
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
        body: JSON.stringify({
          action: "question",
          query: submittedQuery,
          previousResults: results,
        }),
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

  function startValidateApproach() {
    if (followUpPhase !== "idle" || isLoading) return;

    setFollowUpMode("validate");
    setFollowUpPhase("answering");
    setFollowUpAnswer("");
    setFollowUpError(null);
    setValidation(null);
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
        body: JSON.stringify({
          action: "refine",
          query: submittedQuery,
          question: followUpQuestion,
          answer,
          previousResults: results,
        }),
      });

      const data: { results: SearchResult[]; error?: string } =
        await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Refined search failed");
      }

      setResults(data.results);
      setIsRefined(true);
      setFollowUpMode(null);
      setFollowUpPhase("idle");
      setFollowUpQuestion("");
      setFollowUpAnswer("");

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

    const approach = followUpAnswer.trim();
    if (
      !approach ||
      followUpPhase !== "answering" ||
      followUpMode !== "validate"
    ) {
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
        body: JSON.stringify({
          action: "validate",
          query: submittedQuery,
          approach,
          previousResults: results,
        }),
      });

      const data: {
        results: SearchResult[];
        validation?: ApproachValidation;
        error?: string;
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not evaluate your approach.");
      }

      setResults(data.results);
      setValidation(data.validation ?? null);
      setIsRefined(true);
      setFollowUpMode(null);
      setFollowUpPhase("idle");
      setFollowUpAnswer("");

      if (data.error) {
        setError(data.error);
      }
    } catch (validateError) {
      setFollowUpError(
        validateError instanceof Error
          ? validateError.message
          : "Could not evaluate your approach. Try again.",
      );
      setFollowUpPhase("answering");
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
    followUpPhase !== "loading-result";

  const isValidateModalOpen =
    followUpMode === "validate" &&
    (followUpPhase === "answering" || followUpPhase === "loading-result");

  useEffect(() => {
    if (!isValidateModalOpen) return;

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && followUpPhase !== "loading-result") {
        resetFollowUp();
      }
    }

    document.addEventListener("keydown", handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isValidateModalOpen, followUpPhase]);

  const resultsHeading = validation
    ? "Links to explore next"
    : isRefined
      ? "Refined links for"
      : "Links for";

  return (
    <div className="flex flex-col gap-8">
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
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {resultsHeading}{" "}
              {!validation && (
                <>
                  &ldquo;{summarizeQuery(submittedQuery)}&rdquo;
                </>
              )}
            </p>
            {isLoading && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                {followUpPhase === "loading-result"
                  ? followUpMode === "validate"
                    ? "Checking your approach…"
                    : "Finding better links…"
                  : "Understanding and searching…"}
              </p>
            )}
          </div>

          {validation && (
            <div
              className={`rounded-2xl border px-4 py-4 ${assessmentStyles(validation.assessment)}`}
            >
              <p className="text-sm font-medium">
                {assessmentLabel(validation.assessment)}
              </p>
              <p className="mt-2 text-sm leading-relaxed">{validation.feedback}</p>
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
                query={summarizeQuery(submittedQuery)}
              />
            )
          )}

          {showFollowUp && followUpPhase === "idle" && (
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
                <div className="flex flex-col items-center gap-3 border-t border-zinc-200 pt-8 text-center sm:border-t-0 sm:pt-0">
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

          {followUpError && followUpMode !== "validate" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {followUpError}
            </p>
          )}

          {followUpPhase === "answering" && followUpMode === "unsure" && (
            <form
              onSubmit={submitUnsureRefinement}
              className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
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
                  onClick={resetFollowUp}
                  disabled={isLoading}
                  className="rounded-xl px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

        </section>
      )}

      {isValidateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            disabled={followUpPhase === "loading-result"}
            onClick={resetFollowUp}
            className="absolute inset-0 bg-zinc-900/50 backdrop-blur-[2px] transition disabled:cursor-not-allowed"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="validate-approach-title"
            className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:p-6"
          >
            {followUpPhase === "loading-result" ? (
              <div className="space-y-3 py-6 text-center">
                <p
                  id="validate-approach-title"
                  className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Checking your approach…
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  We&apos;ll tell you if you&apos;re on the right track — without
                  giving away the solution.
                </p>
              </div>
            ) : (
              <form onSubmit={submitApproachValidation} className="space-y-4">
                <div className="space-y-1">
                  <p
                    id="validate-approach-title"
                    className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                  >
                    Check if your approach is right
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Describe what you think the answer is or how you&apos;d solve
                    it. We&apos;ll tell you if you&apos;re on the right track —
                    without giving away the solution.
                  </p>
                </div>
                <label htmlFor="approach-input" className="sr-only">
                  Your approach
                </label>
                <textarea
                  id="approach-input"
                  value={followUpAnswer}
                  onChange={(event) => setFollowUpAnswer(event.target.value)}
                  placeholder="I think the issue is… / My plan is to…"
                  autoFocus
                  rows={4}
                  className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 dark:border-zinc-800 dark:bg-zinc-900"
                />
                {followUpError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {followUpError}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetFollowUp}
                    className="rounded-xl px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!followUpAnswer.trim()}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    Check my approach
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
