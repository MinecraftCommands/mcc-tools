import { unstable_cache } from "next/cache";

import { type LanguageRegistration } from "shiki";

// We don't need the fancy SuperJSON stuff here, so use unstable_cache directly
export const getMcfunctionTmLang = unstable_cache(
  async () => {
    const lang = await fetch(
      "https://github.com/MinecraftCommands/syntax-mcfunction/releases/latest/download/mcfunction.tmLanguage.json",
    );
    return (await lang.json()) as LanguageRegistration;
  },
  ["highlighting", "mcfunction"],
  { revalidate: 1 /* d */ * 24 /* h/d */ * 60 /* m/h */ * 60 /* s/m */ },
);

export const tagTmLang: LanguageRegistration = {
  name: "Mcfunction Resource Tag",
  scopeName: "source.tag",
  patterns: [
    {
      include: "#root",
    },
  ],
  repository: {
    root: {
      captures: {
        "0": {
          name: "entity.name.function.mcfunction",
        },
      },
      match: "#[a-z0-9._-]+(:[a-z0-9._-]+)?",
      name: "meta.resource-name",
    },
  },
};
