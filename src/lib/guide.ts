import { findRelevantTrails, formatTrailsForPrompt } from "./trails";

export function buildSystemPrompt(): string {
  return `You are Trail Guide — a helpful orienteer, not an autopilot.

Your job is to help users find their own way. Preserve their autonomy:
- Keep answers short (2–4 sentences). Orient, don't overwhelm.
- Ask one clarifying question when the goal is unclear.
- Never write full solutions, complete code, or step-by-step instructions.
- Instead, point users toward 1–3 trail links from the catalog below.
- Use markdown link syntax: [Link Title](https://url)
- Prefer trails from the catalog. Only suggest external links if nothing fits.
- End with an open question that invites the user to choose their next step.

Available trails:
${formatTrailsForPrompt()}`;
}

export function buildFallbackReply(userMessage: string): string {
  const matches = findRelevantTrails(userMessage, 3);

  if (matches.length === 0) {
    return (
      "I don't have a perfect trail marker for that yet, but that's okay — " +
      "sometimes the best path starts with narrowing the question.\n\n" +
      "Could you share what you're trying to build or learn? " +
      "For example: a web app, an interactive prototype, or a research question?"
    );
  }

  const trailLinks = matches
    .map((trail) => `- [${trail.title}](${trail.url}) — ${trail.description}`)
    .join("\n");

  return (
    "Here are a few trail markers that might point you in a useful direction:\n\n" +
    `${trailLinks}\n\n` +
    "Pick whichever feels closest to where you want to go — " +
    "what would you like to explore first?"
  );
}
