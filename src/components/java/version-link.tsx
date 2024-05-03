import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import Link from "next/link";

export default function VersionLink({
  versionName,
  versionLink = versionName,
  title,
  shortText,
}: {
  versionName: string;
  versionLink?: string;
  title: string;
  shortText: string;
}) {
  const url = `/java/changelog/${versionLink}`;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Link href={url}>{versionName}</Link>
      </HoverCardTrigger>
      <HoverCardContent className="prose prose-sm dark:prose-invert">
        <h2>{title}</h2>
        <p>{shortText}...</p>
      </HoverCardContent>
    </HoverCard>
  );
}
