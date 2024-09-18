import PatchNotes from "~/components/java/patch-notes";

// HACK: Temporary hackfix to ensure the latest patch notes page always shows the latest
// For whatever reason this page does trigger ISR, but doesn't appear to update properly
// Or at least it appears so, maybe it just takes longer than expected to get the new page
// This needs to be investigated further, but it is difficult to do
export const dynamic = "force-dynamic";

export const metadata = {
  title: `Latest Java Changelog`,
  description: "See the latest changelog for Minecraft Java edition",
  openGraph: {
    type: "article",
    authors: "Mojang",
    siteName: "MCC Gadgets",
  },
};

export default async function LatestPatchNotes() {
  return <PatchNotes />;
}
