export type Archive = {
  id: string;
  label: string;
  domains: string[];
};

export const ARCHIVES: Archive[] = [
  {
    id: "docs",
    label: "Documentation",
    domains: [
      "developer.mozilla.org",
      "devdocs.io",
      "readthedocs.io",
      "docs.github.com",
    ],
  },
  {
    id: "stackoverflow",
    label: "Stack Overflow",
    domains: ["stackoverflow.com", "stackexchange.com"],
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    domains: ["wikipedia.org"],
  },
  {
    id: "reddit",
    label: "Reddit",
    domains: ["reddit.com"],
  },
  {
    id: "github",
    label: "GitHub",
    domains: ["github.com"],
  },
  {
    id: "youtube",
    label: "YouTube",
    domains: ["youtube.com", "youtu.be"],
  },
];

export function isValidArchiveId(id: string): boolean {
  return ARCHIVES.some((archive) => archive.id === id);
}

export function normalizeArchiveIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.filter(isValidArchiveId))];
}

export function getArchivesByIds(ids: string[]): Archive[] {
  const selected = new Set(ids);
  return ARCHIVES.filter((archive) => selected.has(archive.id));
}

export function urlMatchesArchives(url: string, archiveIds: string[]): boolean {
  if (archiveIds.length === 0) return true;

  const archives = getArchivesByIds(archiveIds);
  if (archives.length === 0) return true;

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    return archives.some((archive) =>
      archive.domains.some((domain) => {
        const normalizedDomain = domain.replace(/^www\./, "").toLowerCase();
        return (
          hostname === normalizedDomain ||
          hostname.endsWith(`.${normalizedDomain}`)
        );
      }),
    );
  } catch {
    return false;
  }
}

export function buildArchiveSearchConstraint(archiveIds: string[]): string {
  const archives = getArchivesByIds(archiveIds);
  if (archives.length === 0) return "";

  const archiveLines = archives
    .map(
      (archive) =>
        `- ${archive.label}: ${archive.domains.map((domain) => `site:${domain}`).join(" OR ")}`,
    )
    .join("\n");

  return `

Archive filter (STRICT):
The user selected specific archives. ONLY return links from these sources — every URL must be on an allowed domain.
${archiveLines}
Do not include results from other sites. Use site-restricted searches.`;
}

export function formatArchiveLabels(archiveIds: string[]): string {
  return getArchivesByIds(archiveIds)
    .map((archive) => archive.label)
    .join(", ");
}
