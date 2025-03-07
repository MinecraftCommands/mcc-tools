import { type LanguageRegistration } from "shiki";

export const simpleIdentifierTmLang: LanguageRegistration = {
  name: "Simple identifier",
  scopeName: "source.id",
  patterns: [
    {
      include: "#root",
    },
  ],
  repository: {
    root: {
      captures: {
        "0": {
          name: "variable.other.mcfunction",
        },
      },
      match: "[a-zA-Z][a-zA-Z0-9._-]*",
      name: "meta.property_key",
    },
  },
};
