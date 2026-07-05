import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  buildProblemAnalysisPrompt,
  buildSearchPrompt,
  buildSearchSystemPrompt,
} from "./guide";
import { fetchPageMeta } from "./page-meta";

export type SearchResult = {
  id: string;
  title: string;
  url: string;
  description: string;
  site: string;
};

const problemPlanSchema = z.object({
  goal: z.string(),
  blockers: z.array(z.string()),
  technologies: z.array(z.string()),
  searchQueries: z.array(z.string()).min(1).max(4),
});

type ProblemPlan = z.infer<typeof problemPlanSchema>;

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function titleFromPath(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts.at(-1);
    if (!last) return hostnameFromUrl(url);

    return decodeURIComponent(last)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return hostnameFromUrl(url);
  }
}

function isGroundingRedirect(url: string): boolean {
  try {
    return new URL(url).hostname === GROUNDING_REDIRECT_HOST;
  } catch {
    return false;
  }
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function isHostnameLikeTitle(title: string | undefined, url: string): boolean {
  if (!title) return true;

  const normalized = title.toLowerCase().replace(/^www\./, "");
  const hostname = hostnameFromUrl(url).toLowerCase();

  return (
    normalized === hostname ||
    normalized.endsWith(`.${hostname}`) ||
    hostname.endsWith(normalized)
  );
}

function snippetsForChunks(
  metadata: GoogleProviderMetadata | undefined,
): Map<number, string> {
  const snippets = new Map<number, string>();
  const supports = metadata?.groundingMetadata?.groundingSupports ?? [];

  for (const support of supports) {
    const text = support.segment?.text?.trim();
    if (!text) continue;

    const indices =
      support.groundingChunkIndices ?? support.supportChunkIndices ?? [];

    for (const index of indices) {
      if (!snippets.has(index)) {
        snippets.set(index, text);
      }
    }
  }

  return snippets;
}

async function resolveRedirectUrl(url: string, maxHops = 5): Promise<string> {
  let current = url;

  for (let hop = 0; hop < maxHops; hop += 1) {
    if (!isGroundingRedirect(current)) {
      return current;
    }

    let nextUrl: string | null = null;

    for (const method of ["HEAD", "GET"] as const) {
      try {
        const response = await fetch(current, {
          method,
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "TrailGuide/1.0" },
        });

        const location = response.headers.get("location");
        if (location) {
          nextUrl = new URL(location, current).href;
          break;
        }

        if (!isRedirectStatus(response.status)) {
          break;
        }
      } catch {
        continue;
      }
    }

    if (!nextUrl || nextUrl === current) {
      return current;
    }

    current = nextUrl;
  }

  return current;
}

async function enrichResult(result: SearchResult): Promise<SearchResult> {
  const url = await resolveRedirectUrl(result.url);
  const site = hostnameFromUrl(url);
  const meta = await fetchPageMeta(url);

  const title =
    meta.title ||
    (!isHostnameLikeTitle(result.title, url) ? result.title : undefined) ||
    titleFromPath(url);

  const description =
    meta.description ||
    (result.description && result.description !== result.title
      ? result.description
      : undefined) ||
    `Resource on ${site}`;

  return {
    ...result,
    url,
    site,
    title,
    description,
  };
}

function dedupeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourcesToResults(
  sources: Array<{
    sourceType: string;
    id: string;
    url?: string;
    title?: string;
  }>,
  snippets: Map<number, string>,
  offset = 0,
): SearchResult[] {
  return sources
    .filter(
      (source): source is { sourceType: "url"; id: string; url: string; title?: string } =>
        source.sourceType === "url" && typeof source.url === "string",
    )
    .map((source, index) => {
      const snippet = snippets.get(offset + index);

      return {
        id: source.id || `source-${index}`,
        title: source.title?.trim() || hostnameFromUrl(source.url),
        url: source.url,
        description: snippet || "",
        site: hostnameFromUrl(source.url),
      };
    });
}

function groundingToResults(
  metadata: GoogleProviderMetadata | undefined,
): SearchResult[] {
  const chunks = metadata?.groundingMetadata?.groundingChunks ?? [];
  const snippets = snippetsForChunks(metadata);

  return chunks
    .filter((chunk) => chunk.web?.uri)
    .map((chunk, index) => {
      const uri = chunk.web!.uri!;
      const groundingTitle = chunk.web?.title?.trim();
      const snippet = snippets.get(index);

      return {
        id: `grounding-${index}`,
        title: groundingTitle || hostnameFromUrl(uri),
        url: uri,
        description: snippet || "",
        site: hostnameFromUrl(uri),
      };
    });
}

async function analyzeProblem(
  query: string,
  modelId: (typeof GEMINI_MODELS)[number],
): Promise<ProblemPlan | null> {
  try {
    const { object } = await generateObject({
      model: google(modelId),
      system: buildProblemAnalysisPrompt(),
      prompt: query,
      schema: problemPlanSchema,
    });

    return object;
  } catch {
    return null;
  }
}

async function collectGroundedResults(
  prompt: string,
  modelId: (typeof GEMINI_MODELS)[number],
  limit: number,
): Promise<SearchResult[]> {
  const result = await generateText({
    model: google(modelId),
    system: buildSearchSystemPrompt(),
    prompt,
    tools: {
      google_search: google.tools.googleSearch({}),
    },
  });

  const metadata = result.providerMetadata?.google as
    | GoogleProviderMetadata
    | undefined;

  const groundingResults = groundingToResults(metadata);
  const sourceResults = sourcesToResults(
    result.sources,
    snippetsForChunks(metadata),
    groundingResults.length,
  );

  const combined = dedupeResults([...groundingResults, ...sourceResults]);

  if (combined.length === 0) {
    return [];
  }

  const enriched = await Promise.all(
    combined.slice(0, limit).map((item) => enrichResult(item)),
  );

  return dedupeResults(enriched);
}

async function searchWithGemini(
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  for (const modelId of GEMINI_MODELS) {
    try {
      const plan = await analyzeProblem(query, modelId);
      const searchPrompt = plan
        ? buildSearchPrompt(query, plan)
        : query;

      const results = await collectGroundedResults(
        searchPrompt,
        modelId,
        limit,
      );

      if (results.length > 0) {
        return results;
      }

      if (plan && searchPrompt !== query) {
        const fallbackResults = await collectGroundedResults(
          query,
          modelId,
          limit,
        );
        if (fallbackResults.length > 0) {
          return fallbackResults;
        }
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function searchWeb(
  query: string,
  limit = 5,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return [];
  }

  return searchWithGemini(trimmed, limit);
}

export function formatUrlBreadcrumb(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean).slice(0, 4);

    if (parts.length === 0) {
      return host;
    }

    return [host, ...parts].join(" › ");
  } catch {
    return url;
  }
}
