import { urlMatchesArchives } from "./archives";
import type { ApproachValidation } from "./refine";
import type { SearchResult } from "./search";

const MOCK_DELAY_MS = 700;

const FIXTURE_RESULTS: SearchResult[] = [
  {
    id: "mock-1",
    label: "Using the Fetch API",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    site: "developer.mozilla.org",
  },
  {
    id: "mock-2",
    label: "How to handle async errors in JavaScript",
    url: "https://stackoverflow.com/questions/28714298/how-to-catch-error-in-async-await",
    site: "stackoverflow.com",
  },
  {
    id: "mock-3",
    label: "REST (representational state transfer)",
    url: "https://en.wikipedia.org/wiki/REST",
    site: "en.wikipedia.org",
  },
  {
    id: "mock-4",
    label: "vercel/ai — Vercel AI SDK",
    url: "https://github.com/vercel/ai",
    site: "github.com",
  },
  {
    id: "mock-5",
    label: "JavaScript Promises in 100 Seconds",
    url: "https://www.youtube.com/watch?v=RvYYCGs45L4",
    site: "youtube.com",
  },
];

const FIXTURE_REFINED_RESULTS: SearchResult[] = [
  {
    id: "mock-r1",
    label: "Promise rejection events",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#promise_rejection_events",
    site: "developer.mozilla.org",
  },
  {
    id: "mock-r2",
    label: "Try/catch with async functions",
    url: "https://stackoverflow.com/questions/44607420/try-catch-with-async-await",
    site: "stackoverflow.com",
  },
  {
    id: "mock-r3",
    label: "Error handling — Node.js docs",
    url: "https://nodejs.org/en/learn/getting-started/error-handling",
    site: "nodejs.org",
  },
];

const FIXTURE_QUESTION =
  "Are you stuck on setup and configuration, or on a runtime error once it runs?";

const VALIDATIONS: Record<
  ApproachValidation["assessment"],
  ApproachValidation
> = {
  correct: {
    assessment: "correct",
    feedback:
      "That approach matches how this problem is usually solved. The links below can help you confirm the details.",
    hints: [
      "Double-check edge cases like empty input.",
      "Verify the library version matches the docs you follow.",
    ],
  },
  "partly-correct": {
    assessment: "partly-correct",
    feedback:
      "You are on the right track, but a few details may still trip you up. Use the hints and links to tighten the approach.",
    hints: [
      "Consider what happens on network failure.",
      "Make sure you are not mixing sync and async error handling.",
    ],
  },
  incorrect: {
    assessment: "incorrect",
    feedback:
      "This approach is unlikely to fix the issue as described. The links below point at more suitable patterns.",
    hints: [
      "Re-read the error message for the exact failure point.",
      "Check whether you need a different API than the one you planned.",
    ],
  },
};

export function isAiMockEnabled(): boolean {
  return process.env.AI_MOCK === "1" || process.env.AI_MOCK === "true";
}

async function delay(ms = MOCK_DELAY_MS): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function filterByArchives(
  results: SearchResult[],
  archiveIds: string[],
): SearchResult[] {
  if (archiveIds.length === 0) return results;
  return results.filter((result) => urlMatchesArchives(result.url, archiveIds));
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
  archiveIds: string[];
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
    const results = filterByArchives(FIXTURE_REFINED_RESULTS, input.archiveIds);
    return { body: { results, validation } };
  }

  if (scenario === "empty") {
    return { body: { results: [] } };
  }

  const source =
    input.action === "refine" ? FIXTURE_REFINED_RESULTS : FIXTURE_RESULTS;
  const results = filterByArchives(source, input.archiveIds);

  if (results.length === 0) {
    return {
      body: {
        results: [],
        error:
          input.archiveIds.length > 0
            ? "No mock links matched the selected archives. Try different archives or clear them."
            : undefined,
      },
    };
  }

  return { body: { results } };
}
