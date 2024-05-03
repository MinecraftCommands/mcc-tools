import PatchNotes from "~/components/java/patch-notes";

export default function SelectedPatchNotes({
  params: { version },
}: {
  params: { version: string };
}) {
  return <PatchNotes version={version} />;
}
