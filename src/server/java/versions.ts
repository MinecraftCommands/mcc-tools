import { unstable_cache } from "next/cache";
import { type ZodError, z } from "zod";

const VERSION_MANIFEST_ENTRY_SCHEMA = z.object({
  title: z.string(),
  version: z.string(),
  type: z.union([z.enum(["snapshot", "release"]), z.string()]),
  image: z.object({
    title: z.string(),
    url: z.string(),
  }),
  id: z.string(),
  date: z
    .string()
    .datetime()
    .transform((d) => new Date(d)),
  contentPath: z.string(),
  shortText: z.string().transform((shortText) => {
    // HACK: This attempts to fix broken spacing that is in the API itself
    // Eventually it would be good to extract a better preview from the full article
    // This could easily break code snippets if they happen to be in the preview text, but that should be unlikely
    return shortText
      .replace(/([a-z])([A-Z])/g, "$1. $2")
      .replace(/([a-z][!.])([A-Z])/g, "$1 $2");
  }),
});

export type VersionManifestEntry = z.infer<
  typeof VERSION_MANIFEST_ENTRY_SCHEMA
>;

const VERSIONS_MANIFEST_SCHEMA = z.object({
  entries: z
    .array(VERSION_MANIFEST_ENTRY_SCHEMA)
    .nonempty({ message: "Must have at least 1 version" }),
});

export type VersionManifest = z.infer<typeof VERSIONS_MANIFEST_SCHEMA>;
export type VersionManifestZodError = ZodError<
  z.input<typeof VERSIONS_MANIFEST_SCHEMA>
>;

export const BASE_ASSET_URL = "https://launchercontent.mojang.com";
const BASE_URL = BASE_ASSET_URL + "/v2/";

export const getVersionManifest = unstable_cache(
  async (): Promise<
    | { success: true; data: VersionManifest }
    | {
        success: false;
        error: VersionManifestZodError;
      }
  > => {
    const versionsRes = await fetch(BASE_URL + "javaPatchNotes.json");
    const versions = VERSIONS_MANIFEST_SCHEMA.safeParse(
      await versionsRes.json(),
    );

    if (versions.success) {
      versions.data.entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    return versions;
  },
  ["java", "version_manifest"],
  { revalidate: 2 /* m */ * 60 /* s/m */ },
);

const PATCH_NOTE_SCHEMA = z.object({
  version: z.string(),
  body: z.string(),
});

export type PatchNote = VersionManifestEntry &
  z.infer<typeof PATCH_NOTE_SCHEMA>;
export type PatchNoteZodError = ZodError<z.input<typeof PATCH_NOTE_SCHEMA>>;

export enum PatchNotesError {
  VersionNotFound = "Version not found",
}

export type PatchNotesQuery = string | { latest: string[] | string | true };

export const getPatchNotes = unstable_cache(
  async (
    version: PatchNotesQuery = { latest: true },
  ): Promise<
    | { success: true; data: PatchNote }
    | {
        success: false;
        error: PatchNotesError | PatchNoteZodError | VersionManifestZodError;
      }
  > => {
    const versions = await getVersionManifest();
    if (!versions.success) return versions;

    let partialVersion;
    if (typeof version === "string") {
      partialVersion = versions.data.entries.find((v) => v.version === version);
    } else if (version.latest === true) {
      partialVersion = versions.data.entries[0];
    } else if (typeof version.latest === "string") {
      partialVersion = versions.data.entries.find(
        (v) => v.type === version.latest,
      );
    } else {
      const includes = version.latest.includes.bind(version.latest);
      partialVersion = versions.data.entries.find((v) => includes(v.type));
    }

    if (!partialVersion)
      return { success: false, error: PatchNotesError.VersionNotFound };

    const patchRes = await fetch(BASE_URL + partialVersion.contentPath);
    const patch = PATCH_NOTE_SCHEMA.safeParse(await patchRes.json());
    if (!patch.success) return patch;

    return {
      success: true,
      data: { ...partialVersion, ...patch.data },
    };
  },
  ["java", "patch_note"],
  { revalidate: 2 /* m */ * 60 /* s/m */ },
);
