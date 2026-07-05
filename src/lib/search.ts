import { google, type GoogleProviderMetadata } from "@ai-sdk/google";
import { generateText } from "ai";
import { buildSearchSystemPrompt } from "./guide";

export type SearchResult = {
  id: string;
  title: string;
  url: string;
  description: string;
};

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

async function resolveResultUrls(results: SearchResult[]): Promise<SearchResult[]> {
  return Promise.all(
    results.map(async (result) => {
      const url = await resolveRedirectUrl(result.url);
      const hostname = hostnameFromUrl(url);
      const title =
        result.title &&
        !result.title.includes("vertexaisearch.cloud.google.com") &&
        result.title !== hostnameFromUrl(result.url)
          ? result.title
          : hostname;

      return {
        ...result,
        url,
        title,
        description: hostname,
      };
    }),
  );
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
): SearchResult[] {
  return sources
    .filter(
      (source): source is { sourceType: "url"; id: string; url: string; title?: string } =>
        source.sourceType === "url" && typeof source.url === "string",
    )
    .map((source, index) => ({
      id: source.id || `source-${index}`,
      title: source.title?.trim() || hostnameFromUrl(source.url),
      url: source.url,
      description: hostnameFromUrl(source.url),
    }));
}

function groundingToResults(
  metadata: GoogleProviderMetadata | undefined,
): SearchResult[] {
  const chunks = metadata?.groundingMetadata?.groundingChunks ?? [];

  return chunks
    .filter((chunk) => chunk.web?.uri)
    .map((chunk, index) => {
      const uri = chunk.web!.uri!;
      const title = chunk.web?.title?.trim();

      return {
        id: `grounding-${index}`,
        title: title || hostnameFromUrl(uri),
        url: uri,
        description: title || hostnameFromUrl(uri),
      };
    });
}

async function searchWithGemini(
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  for (const modelId of GEMINI_MODELS) {
    try {
      const result = await generateText({
        model: google(modelId),
        system: buildSearchSystemPrompt(),
        prompt: query,
        tools: {
          google_search: google.tools.googleSearch({}),
        },
      });

      const metadata = result.providerMetadata?.google as
        | GoogleProviderMetadata
        | undefined;

      const combined = dedupeResults([
        ...sourcesToResults(result.sources),
        ...groundingToResults(metadata),
      ]);

      if (combined.length > 0) {
        const resolved = await resolveResultUrls(combined.slice(0, limit));
        return dedupeResults(resolved);
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
