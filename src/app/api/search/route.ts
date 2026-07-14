import { askRefinementQuestion, refineSearch } from "@/lib/refine";
import type { SearchResult } from "@/lib/search";
import { searchWeb } from "@/lib/search";

type SearchRequest =
  | { action?: "search"; query?: string }
  | {
      action: "question";
      query?: string;
      previousResults?: SearchResult[];
    }
  | {
      action: "refine";
      query?: string;
      question?: string;
      answer?: string;
      previousResults?: SearchResult[];
    };

export async function POST(req: Request) {
  const body: SearchRequest = await req.json();

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
    );

    return Response.json({ results, error });
  }

  const { results, error } = await searchWeb(body.query ?? "");

  return Response.json({ results, error });
}
