import { formatUrlBreadcrumb, type SearchResult } from "@/lib/search";

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
    <ul className="space-y-5">
      {results.map((result) => (
        <li key={result.id}>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            title={result.url}
            className="group block rounded-xl px-1 py-1 no-underline"
          >
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {result.site}
            </span>
            <span className="mt-0.5 block text-lg font-medium leading-snug text-emerald-800 group-hover:underline dark:text-emerald-300">
              {result.title}
            </span>
            <span className="mt-1 block truncate text-xs text-emerald-700/80 dark:text-emerald-400/80">
              {formatUrlBreadcrumb(result.url)}
            </span>
            {result.description && (
              <span className="mt-2 block line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {result.description}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
