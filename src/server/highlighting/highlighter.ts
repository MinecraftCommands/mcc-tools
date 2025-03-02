import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type CodeToHastOptionsCommon,
  type HighlighterGeneric,
  type LanguageRegistration,
  type SpecialLanguage,
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
        highlighter: highlighter,
      };
    })();
  }

  return _initPromise;
}

export type Language =
  | "mcfunction"
  | "resource-tag"
  | BundledLanguage
  | SpecialLanguage;

export type Scheme = "base" | "mantle" | "crust";

export interface HighlightOptions
  extends Omit<CodeToHastOptionsCommon<BundledLanguage>, "lang"> {
  scheme?: Scheme;
}

const colourMapping: Record<Scheme, HighlightOptions["colorReplacements"]> = {
  base: {},
  mantle: {
    "#eff1f5": "#e6e9ef",
    "#303446": "#292c3c",
    "#24273a": "#1e2030",
    "#1e1e2e": "#181825",
  },
  crust: {
    "#eff1f5": "#dce0e8",
    "#303446": "#232634",
    "#24273a": "#181926",
    "#1e1e2e": "#11111b",
  },
};

export function highlightToHtml(
  code: string,
  lang: Language,
  { colorReplacements, scheme = "crust", ...options }: HighlightOptions = {},
) {
  if (!highlightInfo) {
    throw new Error(
      "Must call and await initHighlighter() before trying to call highlightToHtml",
    );
  }

  const { mcfunctionTmLang, highlighter } = highlightInfo;

  const langMap: Partial<Record<Language, string>> = {
    mcfunction: mcfunctionTmLang.name,
    "resource-tag": tagTmLang.name,
  };

  return highlighter.codeToHtml(code, {
    lang: langMap[lang] ?? lang,
    themes,
    defaultColor: false,
    colorReplacements: {
      ...colourMapping[scheme],
      ...colorReplacements,
    },
    ...options,
  });
}
