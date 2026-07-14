export function buildProblemAnalysisPrompt(): string {
  return `You analyze technical problems before any web search happens.

Read the user's full description carefully — including long explanations and code blocks.

Identify:
- what they are trying to accomplish
- what is blocking them (errors, confusion, missing knowledge)
- the technologies, libraries, and platforms involved

Then write 2-4 focused web search queries that would find docs, references, or tutorials for THIS specific situation — not generic keyword dumps.

Do not solve the problem. Do not write an answer. Only analyze and plan searches.`;
}

export function buildSearchSystemPrompt(): string {
  return `You are a web search assistant. Use Google Search to find highly relevant online resources.

You receive a problem analysis and the user's full description (which may include code).

Rules:
- Understand the situation first, then search for resources that match the actual need.
- Prefer official docs, authoritative references, and pages that address the specific error or task.
- Find 3-5 links. Do not answer the question or write summaries.
- Keep your text response empty.`;
}

export function buildSearchPrompt(
  originalQuery: string,
  plan: {
    goal: string;
    blockers: string[];
    technologies: string[];
    searchQueries: string[];
  },
): string {
  const blockers =
    plan.blockers.length > 0
      ? plan.blockers.map((item) => `- ${item}`).join("\n")
      : "- See full description below";

  const searches = plan.searchQueries.map((item) => `- ${item}`).join("\n");

  return `Find web resources for this specific situation.

Goal:
${plan.goal}

Blockers:
${blockers}

Technologies:
${plan.technologies.join(", ") || "See description"}

Search angles to explore:
${searches}

Full problem description:
${originalQuery}`;
}

export function buildRefinementQuestionPrompt(
  originalQuery: string,
  previousResults: Array<{ label: string; site: string; url: string }>,
): string {
  const links =
    previousResults.length > 0
      ? previousResults
          .map((result) => `- ${result.label} (${result.site})`)
          .join("\n")
      : "- (none)";

  return `The user described a problem and received these links, but is still unsure which direction to take.

Original problem:
${originalQuery}

Links already shown:
${links}

Ask exactly ONE short, directed question that helps narrow what they need next.
The question should be answerable in a sentence or two.
Do not suggest links. Do not answer the problem.`;
}

export function buildRefinedSearchPrompt(
  originalQuery: string,
  question: string,
  answer: string,
  previousResults: Array<{ label: string; site: string; url: string }>,
): string {
  const links =
    previousResults.length > 0
      ? previousResults
          .map((result) => `- ${result.label} (${result.site})`)
          .join("\n")
      : "- (none)";

  return `Find better, more specific web resources.

Original problem:
${originalQuery}

Links already shown (user wants something more fitting):
${links}

Follow-up question:
${question}

User's answer:
${answer}

Search for resources that match this clarified need. Prefer links different from or more specific than those already shown.`;
}
