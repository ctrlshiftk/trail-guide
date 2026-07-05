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

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
    .map((chunk, index) => ({
      id: `grounding-${index}`,
      title: chunk.web?.title?.trim() || hostnameFromUrl(chunk.web!.uri!),
      url: chunk.web!.uri!,
      description: hostnameFromUrl(chunk.web!.uri!),
    }));
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
        return combined.slice(0, limit);
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
