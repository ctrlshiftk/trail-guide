import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateText,
  type UIMessage,
} from "ai";
import { buildFallbackReply, buildSystemPrompt } from "@/lib/guide";
import { findRelevantTrails } from "@/lib/trails";

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

function getLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;

    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

function createFallbackResponse(messages: UIMessage[], text: string) {
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      const id = generateId();
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function buildGeminiFailureReply(userText: string, reason: string): string {
  const fallback = buildFallbackReply(userText);
  return (
    `${fallback}\n\n` +
    "_Note: AI suggestions are temporarily unavailable " +
    `(${reason}). Showing the closest trail markers from the catalog instead._`
  );
}

async function tryGeminiReply(messages: UIMessage[]): Promise<
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string }
> {
  let lastReason = "unknown error";

  for (const modelId of GEMINI_MODELS) {
    try {
      const result = await generateText({
        model: google(modelId),
        system: buildSystemPrompt(),
        messages: await convertToModelMessages(messages),
      });

      return { ok: true, text: result.text, model: modelId };
    } catch (error) {
      lastReason =
        error instanceof Error ? error.message.slice(0, 180) : String(error);

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
          hypothesisId: "C",
          location: "src/app/api/chat/route.ts:gemini-model-failure",
          message: "Gemini model attempt failed",
          data: {
            model: modelId,
            errorName: error instanceof Error ? error.name : "unknown",
            errorMessage: lastReason,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }
  }

  return { ok: false, reason: lastReason };
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const userText = getLastUserText(messages);
  const hasApiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const fallbackMatches = findRelevantTrails(userText, 3);

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
      location: "src/app/api/chat/route.ts:POST-entry",
      message: "chat request received",
      data: {
        hasApiKey,
        userTextPreview: userText.slice(0, 120),
        messageCount: messages.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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
      hypothesisId: "D",
      location: "src/app/api/chat/route.ts:fallback-matches",
      message: "keyword fallback trail matches",
      data: {
        matchIds: fallbackMatches.map((trail) => trail.id),
        matchTitles: fallbackMatches.map((trail) => trail.title),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
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
        location: "src/app/api/chat/route.ts:fallback-branch",
        message: "using keyword fallback (no API key)",
        data: { path: "fallback" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const reply = buildFallbackReply(userText);
    return createFallbackResponse(messages, reply);
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
      hypothesisId: "B",
      location: "src/app/api/chat/route.ts:gemini-branch",
      message: "attempting Gemini generateText",
      data: { path: "gemini", models: GEMINI_MODELS },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const geminiResult = await tryGeminiReply(messages);

  if (geminiResult.ok) {
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
        hypothesisId: "B",
        location: "src/app/api/chat/route.ts:gemini-success",
        message: "Gemini reply generated",
        data: {
          model: geminiResult.model,
          textPreview: geminiResult.text.slice(0, 120),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return createFallbackResponse(messages, geminiResult.text);
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
      hypothesisId: "C",
      location: "src/app/api/chat/route.ts:gemini-fallback",
      message: "all Gemini models failed, using catalog fallback",
      data: { reason: geminiResult.reason },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const reply = buildGeminiFailureReply(userText, geminiResult.reason);
  return createFallbackResponse(messages, reply);
}
