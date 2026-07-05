"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { FormEvent, useMemo, useState } from "react";
import { MessageContent } from "./MessageContent";

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

const SUGGESTIONS = [
  "I want to build an interactive web prototype",
  "How do I get started with React?",
  "I need help with user research for my project",
];

export function TrailChat() {
  const [input, setInput] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    await sendMessage({ text });
  }

  async function handleSuggestion(text: string) {
    if (isLoading) return;
    await sendMessage({ text });
  }

  return (
    <div className="flex h-full min-h-[32rem] flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-6 py-8">
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Trail Guide
              </p>
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                Where would you like to go?
              </h2>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Ask a question and I&apos;ll point you toward useful trails —
                links, docs, and next steps — so you can explore at your own
                pace.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const text = getMessageText(message);
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {text}
                    </p>
                  ) : (
                    <MessageContent content={text} />
                  )}
                </div>
              </div>
            );
          })
        )}

        {isLoading && messages.at(-1)?.role === "user" && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              Reading the map…
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="px-5 pb-2 text-sm text-red-600 dark:text-red-400">
          {error.message}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask where to go next…"
            disabled={isLoading}
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
