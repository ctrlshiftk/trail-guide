function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(html: string, tag: string): string | undefined {
  const match = html.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function extractMeta(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return undefined;
}

export async function fetchPageMeta(
  url: string,
): Promise<{ title?: string; description?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "TrailGuide/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      return {};
    }

    const html = (await response.text()).slice(0, 120_000);

    const title =
      extractTag(html, "title") ||
      extractMeta(html, "og:title") ||
      extractMeta(html, "twitter:title");

    const description =
      extractMeta(html, "description") ||
      extractMeta(html, "og:description") ||
      extractMeta(html, "twitter:description");

    return { title, description };
  } catch {
    return {};
  }
}
