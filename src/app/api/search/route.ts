import { searchWeb } from "@/lib/search";

export async function POST(req: Request) {
  const { query }: { query?: string } = await req.json();

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        results: [],
        error: "Search requires a Google AI API key in .env.local.",
      },
      { status: 503 },
    );
  }

  const { results, error } = await searchWeb(query ?? "");

  return Response.json({ results, error });
}
