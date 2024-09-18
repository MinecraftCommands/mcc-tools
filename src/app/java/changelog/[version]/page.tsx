import type { Metadata } from "next";
import PatchNotes from "~/components/java/patch-notes";
import { BASE_ASSET_URL, getPartialVersion } from "~/server/java/versions";

type Props = {
  params: { version: string };
};

export async function generateMetadata({
  params: { version },
}: Props): Promise<Metadata> {
  const maybePartialVersion = await getPartialVersion(version);
  if (!maybePartialVersion.success) {
    return {
      title: `Error Getting Java ${version}`,
    };
  }

  const partialVersion = maybePartialVersion.data;

  return {
    title: `${partialVersion.title} Changelog`,
    description: partialVersion.shortText + "…",
    openGraph: {
      type: "article",
      authors: "Mojang",
      images: BASE_ASSET_URL + partialVersion.image.url,
      publishedTime:
        // The Next.JS caching ends up actually giving a string rather than the properly transformed Date
        typeof partialVersion.date == "string"
          ? partialVersion.date
          : partialVersion.date.toISOString(),
      siteName: "MCC Gadgets",
    },
  };
}

export default function SelectedPatchNotes({ params: { version } }: Props) {
  return <PatchNotes version={version} />;
}
