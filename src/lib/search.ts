import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import {
  buildProblemAnalysisPrompt,
  buildSearchPrompt,
  buildSearchSystemPrompt,
} from "./guide";

export type SearchResult = {
  id: string;
  label: string;
  url: string;
  site: string;
};

export type SearchWebResult = {
  results: SearchResult[];
  error?: string;
};

type RawSearchResult = {
  id: string;
  url: string;
  site: string;
  hint: string;
};

const problemPlanSchema = z.object({
  goal: z.string(),
  blockers: z.array(z.string()),
  technologies: z.array(z.string()),
  searchQueries: z.array(z.string()).min(1).max(4),
});

type ProblemPlan = z.infer<typeof problemPlanSchema>;

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function labelFromPath(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts.at(-1);
    if (!last) return `Resource on ${hostnameFromUrl(url)}`;

    const readable = decodeURIComponent(last)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return readable;
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

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|rate limit|resource exhausted/i.test(message);
}

function needsDetailedAnalysis(query: string): boolean {
  return query.includes("\n") || query.length > 280;
}

function toSearchResults(results: RawSearchResult[]): SearchResult[] {
  return results.map((result) => ({
    id: result.id,
    label: result.hint || labelFromPath(result.url),
    url: result.url,
    site: result.site,
  }));
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function isHostnameLikeHint(hint: string | undefined, url: string): boolean {
  if (!hint) return true;

  const normalized = hint.toLowerCase().replace(/^www\./, "");
  const hostname = hostnameFromUrl(url).toLowerCase();

  return (
    normalized === hostname ||
    normalized.endsWith(`.${hostname}`) ||
    hostname.endsWith(normalized)
  );
}

function sourcesToResults(
  sources: Array<{
    sourceType: string;
    id: string;
    url?: string;
    title?: string;
  }>,
): RawSearchResult[] {
  return sources
    .filter(
      (source): source is { sourceType: "url"; id: string; url: string; title?: string } =>
        source.sourceType === "url" && typeof source.url === "string",
    )
    .map((source, index) => ({
      id: source.id || `source-${index}`,
      url: source.url,
      site: hostnameFromUrl(source.url),
      hint: source.title?.trim() || "",
    }));
}

function groundingToResults(
  metadata: GoogleProviderMetadata | undefined,
): RawSearchResult[] {
  const chunks = metadata?.groundingMetadata?.groundingChunks ?? [];

  return chunks
    .filter((chunk) => chunk.web?.uri)
    .map((chunk, index) => {
      const uri = chunk.web!.uri!;

      return {
        id: `grounding-${index}`,
        url: uri,
        site: hostnameFromUrl(uri),
        hint: chunk.web?.title?.trim() || "",
      };
    });
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

async function enrichResult(result: RawSearchResult): Promise<RawSearchResult> {
  const url = await resolveRedirectUrl(result.url);
  const hint = !isHostnameLikeHint(result.hint, url) ? result.hint : "";

  return {
    ...result,
    url,
    site: hostnameFromUrl(url),
    hint,
  };
}

function dedupeResults<T extends { url: string }>(results: T[]): T[] {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
  try {
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
    const sourceResults = sourcesToResults(result.sources);
    const combined = dedupeResults([...groundingResults, ...sourceResults]);

    if (combined.length === 0) {
      return [];
    }

    const enriched = await Promise.all(
      combined.slice(0, limit).map((item) => enrichResult(item)),
    );

    return toSearchResults(dedupeResults(enriched));
  } catch (error) {
    throw error;
  }
}

async function searchWithGemini(
  query: string,
  limit: number,
): Promise<SearchWebResult> {
  let sawQuotaError = false;

  for (const modelId of GEMINI_MODELS) {
    try {
      const plan = needsDetailedAnalysis(query)
        ? await analyzeProblem(query, modelId)
        : null;
      const searchPrompt = plan ? buildSearchPrompt(query, plan) : query;

      const results = await collectGroundedResults(
        searchPrompt,
        modelId,
        limit,
      );

      if (results.length > 0) {
        return { results };
      }

      if (plan && searchPrompt !== query) {
        const fallbackResults = await collectGroundedResults(
          query,
          modelId,
          limit,
        );
        if (fallbackResults.length > 0) {
          return { results: fallbackResults };
        }
      }
    } catch (error) {
      if (isQuotaError(error)) {
        sawQuotaError = true;
      }
      continue;
    }
  }

  if (sawQuotaError) {
    return {
      results: [],
      error:
        "Google AI quota exceeded. Each search uses API credits — try again later or check usage at aistudio.google.com.",
    };
  }

  return { results: [] };
}

export async function searchWebWithPrompt(
  prompt: string,
  limit = 5,
): Promise<SearchWebResult> {
  const trimmed = prompt.trim();
  if (!trimmed) return { results: [] };

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      results: [],
      error: "Search requires a Google AI API key in .env.local.",
    };
  }

  let sawQuotaError = false;

  for (const modelId of GEMINI_MODELS) {
    try {
      const results = await collectGroundedResults(trimmed, modelId, limit);
      if (results.length > 0) {
        return { results };
      }
    } catch (error) {
      if (isQuotaError(error)) {
        sawQuotaError = true;
      }
      continue;
    }
  }

  if (sawQuotaError) {
    return {
      results: [],
      error:
        "Google AI quota exceeded. Each search uses API credits — try again later or check usage at aistudio.google.com.",
    };
  }

  return { results: [] };
}

export async function searchWeb(
  query: string,
  limit = 5,
): Promise<SearchWebResult> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [] };

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      results: [],
      error: "Search requires a Google AI API key in .env.local.",
    };
  }

  return searchWithGemini(trimmed, limit);
}
