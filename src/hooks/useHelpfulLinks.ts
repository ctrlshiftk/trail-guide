"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listHelpful,
  removeHelpful,
  toggleHelpful,
  type HelpfulLink,
} from "@/lib/helpful";
import type { SearchResult } from "@/lib/search";

const HELPFUL_EVENT = "trail-guide:helpful-changed";

function notifyHelpfulChanged(links: HelpfulLink[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HELPFUL_EVENT, { detail: links }),
  );
}

export function useHelpfulLinks() {
  const [links, setLinks] = useState<HelpfulLink[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLinks(listHelpful());
    setReady(true);

    function onChanged(event: Event) {
      const custom = event as CustomEvent<HelpfulLink[]>;
      if (Array.isArray(custom.detail)) {
        setLinks(custom.detail);
        return;
      }
      setLinks(listHelpful());
    }

    function onStorage(event: StorageEvent) {
      if (event.key === "trail-guide:helpful") {
        setLinks(listHelpful());
      }
    }

    window.addEventListener(HELPFUL_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HELPFUL_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(
    (result: Pick<SearchResult, "url" | "label" | "site">) => {
      const next = toggleHelpful(result);
      setLinks(next);
      notifyHelpfulChanged(next);
    },
    [],
  );

  const remove = useCallback((url: string) => {
    const next = removeHelpful(url);
    setLinks(next);
    notifyHelpfulChanged(next);
  }, []);

  const has = useCallback(
    (url: string) => links.some((link) => link.url === url),
    [links],
  );

  return { links, ready, toggle, remove, has };
}
