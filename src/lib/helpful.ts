import type { SearchResult } from "./search";

const STORAGE_KEY = "trail-guide:helpful";

export type HelpfulLink = {
  url: string;
  label: string;
  site: string;
  savedAt: number;
};

function readStore(): HelpfulLink[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is HelpfulLink =>
        !!item &&
        typeof item === "object" &&
        typeof (item as HelpfulLink).url === "string" &&
        typeof (item as HelpfulLink).label === "string" &&
        typeof (item as HelpfulLink).site === "string" &&
        typeof (item as HelpfulLink).savedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeStore(links: HelpfulLink[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function listHelpful(): HelpfulLink[] {
  return readStore().sort((a, b) => b.savedAt - a.savedAt);
}

export function isHelpful(url: string): boolean {
  return readStore().some((link) => link.url === url);
}

export function toggleHelpful(
  result: Pick<SearchResult, "url" | "label" | "site">,
): HelpfulLink[] {
  const current = readStore();
  const index = current.findIndex((link) => link.url === result.url);

  if (index >= 0) {
    current.splice(index, 1);
  } else {
    current.push({
      url: result.url,
      label: result.label,
      site: result.site,
      savedAt: Date.now(),
    });
  }

  writeStore(current);
  return listHelpful();
}

export function removeHelpful(url: string): HelpfulLink[] {
  writeStore(readStore().filter((link) => link.url !== url));
  return listHelpful();
}
