import { isAiMockEnabled, mockSearchResponse } from "@/lib/ai-mock";
import {
  askRefinementQuestion,
  refineSearch,
  validateApproach,
} from "@/lib/refine";
import { normalizeResourceTypeIds } from "@/lib/resource-types";
import type { SearchResult } from "@/lib/search";
import { searchWeb } from "@/lib/search";

type SearchRequestBase = {
  resourceTypes?: string[];
};

type SearchRequest =
  | (SearchRequestBase & { action?: "search"; query?: string })
  | (SearchRequestBase & {
      action: "question";
      query?: string;
      previousResults?: SearchResult[];
    })
  | (SearchRequestBase & {
      action: "refine";
      query?: string;
      question?: string;
      answer?: string;
      previousResults?: SearchResult[];
    })
  | (SearchRequestBase & {
      action: "validate";
      query?: string;
      approach?: string;
      previousResults?: SearchResult[];
    });

export async function POST(req: Request) {
  const body: SearchRequest = await req.json();
  const resourceTypeIds = normalizeResourceTypeIds(body.resourceTypes);
  const searchOptions = { resourceTypeIds };

  if (isAiMockEnabled()) {
    if (body.action === "question") {
      const query = body.query?.trim() ?? "";
      if (!query) {
        return Response.json(
          { error: "A problem description is required." },
          { status: 400 },
        );
      }

      const mock = await mockSearchResponse({
        action: "question",
        query,
        resourceTypeIds,
      });
      return Response.json(mock.body, { status: mock.status ?? 200 });
    }

    if (body.action === "refine") {
      const query = body.query?.trim() ?? "";
      const question = body.question?.trim() ?? "";
      const answer = body.answer?.trim() ?? "";

      if (!query || !question || !answer) {
        return Response.json(
          { error: "Problem, question, and answer are all required." },
          { status: 400 },
        );
      }

      const mock = await mockSearchResponse({
        action: "refine",
        query,
        question,
        answer,
        resourceTypeIds,
      });
      return Response.json(mock.body, { status: mock.status ?? 200 });
    }

    if (body.action === "validate") {
      const query = body.query?.trim() ?? "";
      const approach = body.approach?.trim() ?? "";

      if (!query || !approach) {
        return Response.json(
          { error: "Problem and approach are both required." },
          { status: 400 },
        );
      }

      const mock = await mockSearchResponse({
        action: "validate",
        query,
        approach,
        resourceTypeIds,
      });
      return Response.json(mock.body, { status: mock.status ?? 200 });
    }

    const mock = await mockSearchResponse({
      action: "search",
      query: body.query ?? "",
      resourceTypeIds,
    });
    return Response.json(mock.body, { status: mock.status ?? 200 });
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        results: [],
        error: "Search requires a Google AI API key in .env.local.",
      },
      { status: 503 },
    );
  }

  if (body.action === "question") {
    const query = body.query?.trim() ?? "";
    if (!query) {
      return Response.json(
        { error: "A problem description is required." },
        { status: 400 },
      );
    }

    const { question, error } = await askRefinementQuestion(
      query,
      body.previousResults ?? [],
    );

    if (error) {
      return Response.json({ error }, { status: error.includes("quota") ? 429 : 500 });
    }

    return Response.json({ question });
  }

  if (body.action === "refine") {
    const query = body.query?.trim() ?? "";
    const question = body.question?.trim() ?? "";
    const answer = body.answer?.trim() ?? "";

    if (!query || !question || !answer) {
      return Response.json(
        { error: "Problem, question, and answer are all required." },
        { status: 400 },
      );
    }

    const { results, error } = await refineSearch(
      query,
      question,
      answer,
      body.previousResults ?? [],
      searchOptions,
    );

    return Response.json({ results, error });
  }

  if (body.action === "validate") {
    const query = body.query?.trim() ?? "";
    const approach = body.approach?.trim() ?? "";

    if (!query || !approach) {
      return Response.json(
        { error: "Problem and approach are both required." },
        { status: 400 },
      );
    }

    const { results, error, validation } = await validateApproach(
      query,
      approach,
      body.previousResults ?? [],
      searchOptions,
    );

    return Response.json({ results, error, validation });
  }

  const { results, error } = await searchWeb(body.query ?? "", 5, searchOptions);

  return Response.json({ results, error });
}
