import { urlMatchesResourceTypes } from "./resource-types";
import type { ApproachValidation } from "./refine";
import type { SearchResult } from "./search";

const MOCK_DELAY_MS = 700;

const FIXTURE_RESULTS: SearchResult[] = [
  {
    id: "mock-1",
    label: "Attention Is All You Need",
    url: "https://arxiv.org/abs/1706.03762",
    site: "arxiv.org",
  },
  {
    id: "mock-2",
    label: "Introduction to Psychology — OpenStax",
    url: "https://openstax.org/details/books/psychology-2e",
    site: "openstax.org",
  },
  {
    id: "mock-3",
    label: "Using the Fetch API",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    site: "developer.mozilla.org",
  },
  {
    id: "mock-4",
    label: "How to design a simple experiment",
    url: "https://www.wikihow.com/Conduct-Scientific-Research",
    site: "wikihow.com",
  },
  {
    id: "mock-5",
    label: "Our World in Data — Research and data",
    url: "https://ourworldindata.org/",
    site: "ourworldindata.org",
  },
  {
    id: "mock-6",
    label: "The danger of a single story — TED",
    url: "https://www.ted.com/talks/chimamanda_ngozi_adichie_the_danger_of_a_single_story",
    site: "ted.com",
  },
];

const FIXTURE_REFINED_RESULTS: SearchResult[] = [
  {
    id: "mock-r1",
    label: "BERT: Pre-training of Deep Bidirectional Transformers",
    url: "https://arxiv.org/abs/1810.04805",
    site: "arxiv.org",
  },
  {
    id: "mock-r2",
    label: "Biology 2e — OpenStax",
    url: "https://openstax.org/details/books/biology-2e",
    site: "openstax.org",
  },
  {
    id: "mock-r3",
    label: "HTTP response status codes — MDN",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status",
    site: "developer.mozilla.org",
  },
  {
    id: "mock-r4",
    label: "World Bank Open Data",
    url: "https://data.worldbank.org/",
    site: "worldbank.org",
  },
  {
    id: "mock-r5",
    label: "JavaScript Promises in 100 Seconds",
    url: "https://www.youtube.com/watch?v=RvYYCGs45L4",
    site: "youtube.com",
  },
];

const FIXTURE_QUESTION =
  "Are you looking for foundational background, or for a specific method or result?";

const VALIDATIONS: Record<
  ApproachValidation["assessment"],
  ApproachValidation
> = {
  correct: {
    assessment: "correct",
    feedback:
      "That approach matches how this problem is usually solved. The links below can help you confirm the details.",
    hints: [
      "Double-check edge cases and assumptions.",
      "Cross-check claims against a primary source.",
    ],
  },
  "partly-correct": {
    assessment: "partly-correct",
    feedback:
      "You are on the right track, but a few details may still trip you up. Use the hints and links to tighten the approach.",
    hints: [
      "Consider what evidence would confirm or refute your approach.",
      "Make sure the source type matches the kind of answer you need.",
    ],
  },
  incorrect: {
    assessment: "incorrect",
    feedback:
      "This approach is unlikely to fix the issue as described. The links below point at more suitable patterns.",
    hints: [
      "Re-read the problem for the exact failure point or question.",
      "Check whether a different kind of source would help more.",
    ],
  },
};

export function isAiMockEnabled(): boolean {
  return process.env.AI_MOCK === "1" || process.env.AI_MOCK === "true";
}

async function delay(ms = MOCK_DELAY_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function filterByResourceTypes(
  results: SearchResult[],
  resourceTypeIds: string[],
): SearchResult[] {
  if (resourceTypeIds.length === 0) return results;
  return results.filter((result) =>
    urlMatchesResourceTypes(result.url, resourceTypeIds),
  );
}

function scenarioFromText(text: string): string {
  return text.trim().toLowerCase();
}

/** Explicit mock scenarios: type `mock:empty`, `mock:quota`, or `mock:error` as the query. */
function mockScenario(text: string): "empty" | "quota" | "error" | null {
  const match = scenarioFromText(text).match(/^mock:(empty|quota|error)\b/);
  return match ? (match[1] as "empty" | "quota" | "error") : null;
}

function pickValidation(approach: string): ApproachValidation {
  const text = scenarioFromText(approach);
  if (/\b(wrong|incorrect|bad)\b/.test(text)) return VALIDATIONS.incorrect;
  if (/\b(correct|right|good)\b/.test(text)) return VALIDATIONS.correct;
  return VALIDATIONS["partly-correct"];
}

export type MockSearchAction =
  | "search"
  | "question"
  | "refine"
  | "validate";

export type MockSearchInput = {
  action: MockSearchAction;
  query: string;
  question?: string;
  answer?: string;
  approach?: string;
  resourceTypeIds: string[];
};

export type MockSearchResponse = {
  status?: number;
  body: Record<string, unknown>;
};

/**
 * Fixture responses for UI work without calling Gemini.
 *
 * Query scenarios (type as the whole problem text):
 * - `mock:empty` → no results
 * - `mock:quota` → quota error
 * - `mock:error` → generic search error
 *
 * In “check my approach”, include `correct` or `wrong` to switch the banner.
 */
export async function mockSearchResponse(
  input: MockSearchInput,
): Promise<MockSearchResponse> {
  await delay();

  const scenario = mockScenario(input.query);

  if (scenario === "quota") {
    const message =
      "Search is temporarily unavailable because the AI quota was exceeded. Try again later.";
    if (input.action === "question") {
      return { status: 429, body: { error: message } };
    }
    return { body: { results: [], error: message } };
  }

  if (scenario === "error" && input.action === "search") {
    return {
      body: {
        results: [],
        error: "Mock error: something went wrong while searching.",
      },
    };
  }

  if (input.action === "question") {
    return { body: { question: FIXTURE_QUESTION } };
  }

  if (input.action === "validate") {
    const validation = pickValidation(input.approach ?? "");
    const results = filterByResourceTypes(
      FIXTURE_REFINED_RESULTS,
      input.resourceTypeIds,
    );
    return { body: { results, validation } };
  }

  if (scenario === "empty") {
    return { body: { results: [] } };
  }

  const source =
    input.action === "refine" ? FIXTURE_REFINED_RESULTS : FIXTURE_RESULTS;
  const results = filterByResourceTypes(source, input.resourceTypeIds);

  if (results.length === 0) {
    return {
      body: {
        results: [],
        error:
          input.resourceTypeIds.length > 0
            ? "No mock links matched the selected resource types. Try different types or clear them."
            : undefined,
      },
    };
  }

  return { body: { results } };
}
