import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import {
  buildApproachSearchPrompt,
  buildApproachValidationPrompt,
  buildRefinementQuestionPrompt,
  buildRefinedSearchPrompt,
} from "./guide";
import {
  type SearchResult,
  type SearchWebResult,
  searchWebWithPrompt,
} from "./search";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

const refinementQuestionSchema = z.object({
  question: z.string(),
});

const approachValidationSchema = z.object({
  assessment: z.enum(["correct", "partly-correct", "incorrect"]),
  feedback: z.string(),
  hints: z.array(z.string()),
});

export type ApproachValidation = z.infer<typeof approachValidationSchema>;

export type ValidateApproachResult = SearchWebResult & {
  validation?: ApproachValidation;
};

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|rate limit|resource exhausted/i.test(message);
}

export async function askRefinementQuestion(
  originalQuery: string,
  previousResults: SearchResult[],
): Promise<{ question?: string; error?: string }> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { error: "Search requires a Google AI API key in .env.local." };
  }

  for (const modelId of GEMINI_MODELS) {
    try {
      const { object } = await generateObject({
        model: google(modelId),
        system:
          "You help users narrow down what kind of resources they need. Ask one focused question only.",
        prompt: buildRefinementQuestionPrompt(originalQuery, previousResults),
        schema: refinementQuestionSchema,
      });

      const question = object.question.trim();
      if (question) {
        return { question };
      }
    } catch (error) {
      if (isQuotaError(error)) {
        return {
          error:
            "Google AI quota exceeded. Try again later or check usage at aistudio.google.com.",
        };
      }
      continue;
    }
  }

  return { error: "Could not generate a follow-up question. Try again." };
}

export async function refineSearch(
  originalQuery: string,
  question: string,
  answer: string,
  previousResults: SearchResult[],
): Promise<SearchWebResult> {
  const prompt = buildRefinedSearchPrompt(
    originalQuery,
    question,
    answer,
    previousResults,
  );

  return searchWebWithPrompt(prompt);
}

export async function validateApproach(
  originalQuery: string,
  userApproach: string,
  previousResults: SearchResult[],
): Promise<ValidateApproachResult> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      results: [],
      error: "Search requires a Google AI API key in .env.local.",
    };
  }

  let validation: ApproachValidation | undefined;

  for (const modelId of GEMINI_MODELS) {
    try {
      const { object } = await generateObject({
        model: google(modelId),
        system:
          "You evaluate whether a user's technical approach is on the right track. Never reveal the full correct answer.",
        prompt: buildApproachValidationPrompt(
          originalQuery,
          userApproach,
          previousResults,
        ),
        schema: approachValidationSchema,
      });

      validation = {
        assessment: object.assessment,
        feedback: object.feedback.trim(),
        hints: object.hints.map((hint) => hint.trim()).filter(Boolean),
      };
      break;
    } catch (error) {
      if (isQuotaError(error)) {
        return {
          results: [],
          error:
            "Google AI quota exceeded. Try again later or check usage at aistudio.google.com.",
        };
      }
      continue;
    }
  }

  if (!validation) {
    return { error: "Could not evaluate your approach. Try again.", results: [] };
  }

  const searchPrompt = buildApproachSearchPrompt(
    originalQuery,
    userApproach,
    validation.assessment,
    validation.feedback,
    validation.hints,
    previousResults,
  );

  const { results, error } = await searchWebWithPrompt(searchPrompt);

  return { results, error, validation };
}
