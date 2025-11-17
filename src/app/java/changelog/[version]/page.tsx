import type { Metadata } from "next";

import { BASE_ASSET_URL, getPartialVersion } from "~/server/java/versions";

import PatchNotes from "~/components/java/patch-notes";

type Props = {
  params: Promise<{ version: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { version } = await props.params;

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
      publishedTime: partialVersion.date.toISOString(),
      siteName: "MCC Gadgets",
    },
  };
}

export default async function SelectedPatchNotes(props: Props) {
  const { version } = await props.params;

  return <PatchNotes version={version} />;
}
