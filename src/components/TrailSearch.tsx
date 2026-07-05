"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import type { SearchResult } from "@/lib/search";
import { SearchResults } from "./SearchResults";

const SUGGESTIONS = [
  "more-than-human design",
  "Nintendo DS graphics library",
  "react hooks",
  "ecosystem mapping",
  "creative coding",
];

function summarizeQuery(text: string): string {
  const trimmed = text.trim();
  const firstLine = trimmed.split("\n").find((line) => line.trim()) ?? trimmed;
  const compact = firstLine.trim();

  if (trimmed.includes("\n") || trimmed.length > compact.length + 10) {
    return compact.length > 96 ? `${compact.slice(0, 96)}…` : `${compact}…`;
  }

  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

export function TrailSearch() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed || isLoading) return;

    setSubmittedQuery(trimmed);
    setQuery(trimmed);
    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

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
            placeholder="Describe your problem, error, or question — paste code if helpful…"
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

      {!hasSearched && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void runSearch(suggestion)}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {hasSearched && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Links for &ldquo;{summarizeQuery(submittedQuery)}&rdquo;
            </p>
            {isLoading && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                Understanding and searching…
              </p>
            )}
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : (
            !isLoading && (
              <SearchResults
                results={results}
                query={summarizeQuery(submittedQuery)}
              />
            )
          )}
        </section>
      )}
    </div>
  );
}
