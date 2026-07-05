export type Trail = {
  id: string;
  title: string;
  description: string;
  url: string;
  tags: string[];
};

export const trails: Trail[] = [
  {
    id: "nextjs-docs",
    title: "Next.js Documentation",
    description: "Official guides for routing, data fetching, and deployment.",
    url: "https://nextjs.org/docs",
    tags: ["nextjs", "react", "web", "framework", "app router"],
  },
  {
    id: "react-docs",
    title: "React Documentation",
    description: "Learn components, hooks, and state management fundamentals.",
    url: "https://react.dev/learn",
    tags: ["react", "javascript", "frontend", "hooks", "components"],
  },
  {
    id: "mdn-web",
    title: "MDN Web Docs",
    description: "Authoritative reference for HTML, CSS, and JavaScript.",
    url: "https://developer.mozilla.org",
    tags: ["html", "css", "javascript", "web", "reference"],
  },
  {
    id: "tailwind-docs",
    title: "Tailwind CSS Docs",
    description: "Utility-first styling patterns and responsive design.",
    url: "https://tailwindcss.com/docs",
    tags: ["css", "tailwind", "design", "styling", "ui"],
  },
  {
    id: "vercel-ai-sdk",
    title: "Vercel AI SDK",
    description: "Build streaming AI chat interfaces in Next.js.",
    url: "https://ai-sdk.dev/docs",
    tags: ["ai", "chat", "llm", "streaming", "nextjs"],
  },
  {
    id: "openai-api",
    title: "OpenAI API Reference",
    description: "Models, prompts, and API usage for GPT integrations.",
    url: "https://platform.openai.com/docs",
    tags: ["ai", "openai", "llm", "api", "gpt"],
  },
  {
    id: "figma-learn",
    title: "Figma Learn",
    description: "Prototyping, design systems, and collaborative UI work.",
    url: "https://www.figma.com/resource-library/",
    tags: ["design", "ui", "ux", "prototype", "figma", "media"],
  },
  {
    id: "web-accessibility",
    title: "Web Accessibility (WAI)",
    description: "Inclusive design patterns and WCAG guidelines.",
    url: "https://www.w3.org/WAI/",
    tags: ["accessibility", "a11y", "ux", "inclusive", "design"],
  },
  {
    id: "github-docs",
    title: "GitHub Docs",
    description: "Version control, pull requests, and collaboration workflows.",
    url: "https://docs.github.com",
    tags: ["git", "github", "collaboration", "version control"],
  },
  {
    id: "typescript-handbook",
    title: "TypeScript Handbook",
    description: "Types, interfaces, and safer JavaScript patterns.",
    url: "https://www.typescriptlang.org/docs/handbook/",
    tags: ["typescript", "javascript", "types", "web"],
  },
  {
    id: "creative-coding",
    title: "p5.js Reference",
    description: "Creative coding for interactive media and visual sketches.",
    url: "https://p5js.org/reference/",
    tags: ["creative coding", "media", "interactive", "art", "p5", "canvas"],
  },
  {
    id: "user-research",
    title: "Nielsen Norman Group",
    description: "Evidence-based UX research and usability heuristics.",
    url: "https://www.nngroup.com/articles/",
    tags: ["ux", "research", "usability", "user testing", "design"],
  },
  {
    id: "more-than-human-design",
    title: "More-than-Human Centered Design",
    description:
      "Research and methods for designing with ecosystems, non-human actors, and multispecies worlds.",
    url: "https://www.morethanhumancentered.design/",
    tags: [
      "more-than-human",
      "multispecies",
      "ecosystem",
      "design",
      "research",
      "media",
      "posthuman",
    ],
  },
  {
    id: "ecosystem-mapping",
    title: "Ecosystem Mapping (IDEO)",
    description:
      "Map stakeholders and relationships in complex systems — useful for more-than-human and service design.",
    url: "https://designthinking.ideo.com/new-applications/ecosystem-mapping",
    tags: [
      "ecosystem",
      "mapping",
      "stakeholders",
      "systems",
      "design research",
      "service design",
    ],
  },
  {
    id: "multispecies-design",
    title: "Multispecies Design (A Peer-Reviewed Journal Article)",
    description:
      "Academic framing of design beyond the human, including ecological and interspecies perspectives.",
    url: "https://dl.designresearchsociety.org/cgi/viewcontent.cgi?article=2910&context=drs-conference-papers",
    tags: [
      "multispecies",
      "more-than-human",
      "ecology",
      "design theory",
      "research",
    ],
  },
];

export function formatTrailsForPrompt(trailList: Trail[] = trails): string {
  return trailList
    .map(
      (trail) =>
        `- [${trail.title}](${trail.url}): ${trail.description} (tags: ${trail.tags.join(", ")})`,
    )
    .join("\n");
}

export function findRelevantTrails(query: string, limit = 3): Trail[] {
  const normalized = query.toLowerCase();
  const terms = [
    ...new Set(
      normalized
        .split(/[\W_-]+/)
        .filter((term) => term.length > 2),
    ),
  ];

  const genericTerms = new Set(["design", "media", "web", "more", "than"]);

  const scored = trails.map((trail) => {
    const haystack = [
      trail.title,
      trail.description,
      trail.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (!haystack.includes(term)) continue;
      const weight = genericTerms.has(term) ? 1 : term.length;
      score += weight;
    }

    if (normalized.includes("more-than-human") || normalized.includes("more than human")) {
      if (trail.tags.some((tag) => tag.includes("more-than-human") || tag.includes("multispecies"))) {
        score += 8;
      }
    }

    if (normalized.includes("ecosystem")) {
      if (haystack.includes("ecosystem")) {
        score += 6;
      }
    }

    return { trail, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ trail }) => trail);
}
