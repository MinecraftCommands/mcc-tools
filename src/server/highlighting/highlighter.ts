import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type CodeToHastOptionsCommon,
  type HighlighterGeneric,
  type LanguageRegistration,
} from "shiki";
import { getMcfunctionTmLang, tagTmLang } from "./mcfunction";
import { flavorEntries } from "@catppuccin/palette";

const themes = Object.fromEntries(
  flavorEntries.map(([theme, _]) => [theme, `catppuccin-${theme}`]),
);

let _initPromise: Promise<void> | undefined;
let highlightInfo:
  | {
      mcfunctionTmLang: LanguageRegistration;
      highlighter: HighlighterGeneric<BundledLanguage, BundledTheme>;
    }
  | undefined;

export function initHighlighter() {
  if (!_initPromise) {
    _initPromise = (async () => {
      const mcfunctionTmLang = await getMcfunctionTmLang();
      const highlighter = await createHighlighter({
        langs: [mcfunctionTmLang, tagTmLang],
        themes: Object.values(themes),
      });
      highlightInfo = {
        mcfunctionTmLang,
        highlighter,
      };
    })();
  }

  return _initPromise;
}

export function highlightMcfunctionToHtml(
  code: string,
  options: Omit<CodeToHastOptionsCommon<BundledLanguage>, "lang"> = {},
): string {
  if (!highlightInfo) {
    throw new Error(
      "Must call and await initHighlighter() before trying to call highlightMcfunctionToHtml",
    );
  }

  const { mcfunctionTmLang, highlighter } = highlightInfo;

  return highlighter.codeToHtml(code, {
    lang: mcfunctionTmLang.name,
    themes,
    defaultColor: false,
    ...options,
  });
}

export function highlightResourceTagToHtml(
  code: string,
  options: Omit<CodeToHastOptionsCommon<BundledLanguage>, "lang"> = {},
) {
  if (!highlightInfo) {
    throw new Error(
      "Must call and await initHighlighter() before trying to call highlightResourceTagToHtml",
    );
  }

  const { highlighter } = highlightInfo;

  return highlighter.codeToHtml(code, {
    lang: tagTmLang.name,
    themes,
    defaultColor: false,
    ...options,
  });
}
