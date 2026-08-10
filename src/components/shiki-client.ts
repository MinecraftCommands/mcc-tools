"use client";

import { createHighlighter } from "shiki";
import { useEffect, useState } from "react";

export type CatppuccinFlavor = "latte" | "frappe" | "macchiato" | "mocha";

export type HighlighterInstance = Awaited<ReturnType<typeof createHighlighter>>;

let _highlighter: HighlighterInstance | undefined;
let _initPromise: Promise<HighlighterInstance> | undefined;

async function initHighlighter(): Promise<HighlighterInstance> {
  if (_highlighter) return _highlighter;
  _initPromise ??= createHighlighter({
    langs: ["java", "javascript", "json"],
    themes: [
      "catppuccin-latte",
      "catppuccin-frappe",
      "catppuccin-macchiato",
      "catppuccin-mocha",
    ],
  }).then((h) => {
    _highlighter = h;
    return h;
  });
  return _initPromise;
}

export function useCatppuccinTheme(): CatppuccinFlavor {
  const [theme, setTheme] = useState<CatppuccinFlavor>("mocha");

  useEffect(() => {
    const classList = document.documentElement.classList;
    for (const t of ["latte", "frappe", "macchiato", "mocha"] as CatppuccinFlavor[]) {
      if (classList.contains(t)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous detection of existing DOM state
        setTheme(t);
        return;
      }
    }
    // Default to mocha if nothing found
    setTheme("mocha");
  }, []);

  return theme;
}

export function useShiki(): HighlighterInstance | undefined {
  const [highlighter, setHighlighter] = useState<HighlighterInstance>();

  useEffect(() => {
    void initHighlighter().then(setHighlighter);
  }, []);

  return highlighter;
}

export function highlightCode(
  code: string,
  lang: string,
  highlighter: HighlighterInstance | undefined,
  theme: CatppuccinFlavor,
): string | null {
  if (!highlighter) return null;
  const themeMap: Record<CatppuccinFlavor, string> = {
    latte: "catppuccin-latte",
    frappe: "catppuccin-frappe",
    macchiato: "catppuccin-macchiato",
    mocha: "catppuccin-mocha",
  };
  return highlighter.codeToHtml(code, {
    lang,
    theme: themeMap[theme],
  });
}
