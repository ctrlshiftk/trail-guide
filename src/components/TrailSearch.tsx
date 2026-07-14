"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
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

type RefinementPhase = "idle" | "loading-question" | "answering" | "loading-refine";

export function TrailSearch() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refinementPhase, setRefinementPhase] =
    useState<RefinementPhase>("idle");
  const [refinementQuestion, setRefinementQuestion] = useState("");
  const [refinementAnswer, setRefinementAnswer] = useState("");
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [isRefined, setIsRefined] = useState(false);

  function resetRefinement() {
    setRefinementPhase("idle");
    setRefinementQuestion("");
    setRefinementAnswer("");
    setRefinementError(null);
    setIsRefined(false);
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
    resetRefinement();

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
    if (refinementPhase !== "idle" || isLoading) return;

    setRefinementPhase("loading-question");
    setRefinementError(null);

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

      setRefinementQuestion(data.question);
      setRefinementPhase("answering");
    } catch (questionError) {
      setRefinementError(
        questionError instanceof Error
          ? questionError.message
          : "Could not get a follow-up question.",
      );
      setRefinementPhase("idle");
    }
  }

  async function submitRefinement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const answer = refinementAnswer.trim();
    if (!answer || refinementPhase !== "answering") return;

    setRefinementPhase("loading-refine");
    setRefinementError(null);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          query: submittedQuery,
          question: refinementQuestion,
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
      setRefinementPhase("idle");
      setRefinementQuestion("");
      setRefinementAnswer("");

      if (data.error) {
        setError(data.error);
      }
    } catch (refineError) {
      setRefinementError(
        refineError instanceof Error
          ? refineError.message
          : "Refined search failed. Try again.",
      );
      setRefinementPhase("answering");
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

  const showRefinement =
    hasSearched &&
    !isLoading &&
    !error &&
    results.length > 0 &&
    refinementPhase !== "loading-refine";

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
              {isRefined ? "Refined links for" : "Links for"} &ldquo;
              {summarizeQuery(submittedQuery)}&rdquo;
            </p>
            {isLoading && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                {refinementPhase === "loading-refine"
                  ? "Finding better links…"
                  : "Understanding and searching…"}
              </p>
            )}
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            (!isLoading || refinementPhase === "loading-refine") && (
              <SearchResults
                results={results}
                query={summarizeQuery(submittedQuery)}
              />
            )
          )}

          {showRefinement && refinementPhase === "idle" && (
            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
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
          )}

          {refinementPhase === "loading-question" && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              Thinking of a question to narrow this down…
            </p>
          )}

          {refinementError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {refinementError}
            </p>
          )}

          {refinementPhase === "answering" && (
            <form
              onSubmit={submitRefinement}
              className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
            >
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {refinementQuestion}
              </p>
              <label htmlFor="refinement-answer" className="sr-only">
                Your answer
              </label>
              <input
                id="refinement-answer"
                type="text"
                value={refinementAnswer}
                onChange={(event) => setRefinementAnswer(event.target.value)}
                placeholder="Your answer…"
                disabled={isLoading}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isLoading || !refinementAnswer.trim()}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  Get refined links
                </button>
                <button
                  type="button"
                  onClick={resetRefinement}
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
    </div>
  );
}
