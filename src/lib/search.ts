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

    // #region agent log
    fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0963ce",
      },
      body: JSON.stringify({
        sessionId: "0963ce",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "search.ts:analyzeProblem-ok",
        message: "problem analysis succeeded",
        data: { model: modelId, searchQueryCount: object.searchQueries.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return object;
  } catch (error) {
    // #region agent log
    fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0963ce",
      },
      body: JSON.stringify({
        sessionId: "0963ce",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "search.ts:analyzeProblem-error",
        message: "problem analysis failed",
        data: {
          model: modelId,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 200) : String(error),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

    // #region agent log
    fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0963ce",
      },
      body: JSON.stringify({
        sessionId: "0963ce",
        runId: "pre-fix",
        hypothesisId: "C",
        location: "search.ts:collectGroundedResults",
        message: "grounded search completed",
        data: {
          model: modelId,
          groundingCount: groundingResults.length,
          sourceCount: sourceResults.length,
          combinedCount: combined.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (combined.length === 0) {
      return [];
    }

    const enriched = await Promise.all(
      combined.slice(0, limit).map((item) => enrichResult(item)),
    );

    return toSearchResults(dedupeResults(enriched));
  } catch (error) {
    // #region agent log
    fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0963ce",
      },
      body: JSON.stringify({
        sessionId: "0963ce",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "search.ts:collectGroundedResults-error",
        message: "grounded search failed",
        data: {
          model: modelId,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 200) : String(error),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

      // #region agent log
      fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "0963ce",
        },
        body: JSON.stringify({
          sessionId: "0963ce",
          runId: "post-fix",
          hypothesisId: "A",
          location: "search.ts:searchWithGemini-model-error",
          message: "model attempt failed",
          data: {
            model: modelId,
            isQuotaError: isQuotaError(error),
            errorMessage:
              error instanceof Error ? error.message.slice(0, 200) : String(error),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      continue;
    }
  }

  if (sawQuotaError) {
    // #region agent log
    fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0963ce",
      },
      body: JSON.stringify({
        sessionId: "0963ce",
        runId: "post-fix",
        hypothesisId: "A",
        location: "search.ts:searchWithGemini-quota",
        message: "returning quota error to client",
        data: { queryPreview: query.slice(0, 80) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return {
      results: [],
      error:
        "Google AI quota exceeded. Each search uses API credits — try again later or check usage at aistudio.google.com.",
    };
  }

  // #region agent log
  fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "0963ce",
    },
    body: JSON.stringify({
      sessionId: "0963ce",
      runId: "post-fix",
      hypothesisId: "E",
      location: "search.ts:searchWithGemini-empty",
      message: "all models returned no results",
      data: { queryPreview: query.slice(0, 80) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return { results: [] };
}

export async function searchWeb(
  query: string,
  limit = 5,
): Promise<SearchWebResult> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [] };

  const hasApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  // #region agent log
  fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "0963ce",
    },
    body: JSON.stringify({
      sessionId: "0963ce",
      runId: "post-fix",
      hypothesisId: "E",
      location: "search.ts:searchWeb-entry",
      message: "search started",
      data: {
        hasApiKey,
        queryLength: trimmed.length,
        needsAnalysis: needsDetailedAnalysis(trimmed),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!hasApiKey) {
    return { results: [], error: "Search requires a Google AI API key in .env.local." };
  }

  const outcome = await searchWithGemini(trimmed, limit);

  // #region agent log
  fetch("http://127.0.0.1:7890/ingest/3025649c-e972-49ee-a0d0-7bc16abdb313", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "0963ce",
    },
    body: JSON.stringify({
      sessionId: "0963ce",
      runId: "post-fix",
      hypothesisId: "E",
      location: "search.ts:searchWeb-exit",
      message: "search finished",
      data: {
        resultCount: outcome.results.length,
        hasError: Boolean(outcome.error),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return outcome;
}
