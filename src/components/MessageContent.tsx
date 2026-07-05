type MessageSegment =
  | { type: "text"; value: string }
  | { type: "link"; label: string; href: string };

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({
        type: "text",
        value: content.slice(lastIndex, index),
      });
    }

    segments.push({
      type: "link",
      label: match[1],
      href: match[2],
    });

    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: content }];
}

export function MessageContent({ content }: { content: string }) {
  const segments = parseMessageContent(content);

  return (
    <div className="space-y-3 whitespace-pre-wrap text-[15px] leading-relaxed">
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.value}</span>;
        }

        return (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group my-1 flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 no-underline transition hover:border-emerald-300 hover:bg-emerald-100/80 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/70"
          >
            <span
              aria-hidden
              className="mt-0.5 text-lg leading-none text-emerald-600 dark:text-emerald-400"
            >
              ↗
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-emerald-900 group-hover:underline dark:text-emerald-100">
                {segment.label}
              </span>
              <span className="mt-0.5 block truncate text-xs text-emerald-700/80 dark:text-emerald-300/70">
                {segment.href}
              </span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
