import type { SearchResult } from "@/lib/search";

export function SearchResults({
  results,
  query,
}: {
  results: SearchResult[];
  query: string;
}) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No links found for &ldquo;{query}&rdquo;
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {results.map((result) => (
        <li key={result.id}>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
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
                {result.title}
              </span>
              {result.description && result.description !== result.title && (
                <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                  {result.description}
                </span>
              )}
              <span className="mt-1 block truncate text-xs text-zinc-400 dark:text-zinc-500">
                {result.url}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
