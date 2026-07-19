export type ResourceType = {
  id: string;
  label: string;
  /** Short intent for search prompts — what kind of source this filter means. */
  intent: string;
  domains: string[];
};

/**
 * Broad content-type filters (not specific websites).
 * Domains are the allowlist used for search constraints and result filtering.
 */
export const RESOURCE_TYPES: ResourceType[] = [
  {
    id: "papers",
    label: "Papers",
    intent: "peer-reviewed articles, preprints, and scholarly publications",
    domains: [
      "arxiv.org",
      "semanticscholar.org",
      "pubmed.ncbi.nlm.nih.gov",
      "ncbi.nlm.nih.gov",
      "europepmc.org",
      "biorxiv.org",
      "medrxiv.org",
      "dl.acm.org",
      "ieeexplore.ieee.org",
      "openreview.net",
      "paperswithcode.com",
      "ssrn.com",
      "jstor.org",
      "plos.org",
      "journals.plos.org",
      "nature.com",
      "science.org",
      "doi.org",
    ],
  },
  {
    id: "books",
    label: "Books",
    intent: "textbooks, handbooks, open books, and long-form chapters",
    domains: [
      "openstax.org",
      "open.umn.edu",
      "pressbooks.pub",
      "gutenberg.org",
      "standardbooks.org",
      "books.google.com",
      "archive.org",
      "oapen.org",
      "doabooks.org",
      "libretexts.org",
    ],
  },
  {
    id: "documentation",
    label: "Documentation",
    intent: "official docs, manuals, specifications, and reference guides",
    domains: [
      "developer.mozilla.org",
      "devdocs.io",
      "readthedocs.io",
      "docs.github.com",
      "w3.org",
      "ietf.org",
      "iso.org",
      "nist.gov",
      "who.int",
      "cdc.gov",
      "europa.eu",
    ],
  },
  {
    id: "tutorials",
    label: "Tutorials",
    intent: "step-by-step guides, how-tos, walkthroughs, and lab protocols",
    domains: [
      "khanacademy.org",
      "wikihow.com",
      "instructables.com",
      "protocols.io",
      "freecodecamp.org",
      "dev.to",
      "medium.com",
      "towardsdatascience.com",
      "realpython.com",
      "css-tricks.com",
      "geeksforgeeks.org",
    ],
  },
  {
    id: "data",
    label: "Data",
    intent: "datasets, open data portals, and research data repositories",
    domains: [
      "zenodo.org",
      "figshare.com",
      "osf.io",
      "kaggle.com",
      "data.gov",
      "data.europa.eu",
      "ourworldindata.org",
      "huggingface.co",
      "dataverse.harvard.edu",
      "worldbank.org",
      "data.world",
    ],
  },
  {
    id: "video",
    label: "Video",
    intent: "lectures, talks, and explanatory videos",
    domains: ["youtube.com", "youtu.be", "vimeo.com", "ted.com"],
  },
];

export function isValidResourceTypeId(id: string): boolean {
  return RESOURCE_TYPES.some((type) => type.id === id);
}

export function normalizeResourceTypeIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.filter(isValidResourceTypeId))];
}

export function getResourceTypesByIds(ids: string[]): ResourceType[] {
  const selected = new Set(ids);
  return RESOURCE_TYPES.filter((type) => selected.has(type.id));
}

export function urlMatchesResourceTypes(
  url: string,
  resourceTypeIds: string[],
): boolean {
  if (resourceTypeIds.length === 0) return true;

  const types = getResourceTypesByIds(resourceTypeIds);
  if (types.length === 0) return true;

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    return types.some((type) =>
      type.domains.some((domain) => {
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

export function buildResourceTypeSearchConstraint(
  resourceTypeIds: string[],
): string {
  const types = getResourceTypesByIds(resourceTypeIds);
  if (types.length === 0) return "";

  const typeLines = types
    .map(
      (type) =>
        `- ${type.label} (${type.intent}): ${type.domains.map((domain) => `site:${domain}`).join(" OR ")}`,
    )
    .join("\n");

  return `

Resource type filter (STRICT):
The user selected specific resource types. ONLY return links that match these types — every URL must be on an allowed domain for a selected type.
${typeLines}
Do not include results from other sites. Prefer site-restricted searches that match the selected types.`;
}

export function formatResourceTypeLabels(resourceTypeIds: string[]): string {
  return getResourceTypesByIds(resourceTypeIds)
    .map((type) => type.label)
    .join(", ");
}
