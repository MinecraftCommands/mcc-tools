import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import Link from "next/link";
import {cn} from "~/lib/utils";

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
    <HoverCard closeDelay={0}>
      <HoverCardTrigger asChild>
        {/*TODO: Unhardcode this to show the currently selected page.*/}
        <Link href={url} className={cn('w-full inline-block hover:bg-foreground/10 p-1 px-3',
          {'bg-foreground/15 underline': versionName == '1.20.6'})}>{versionName}</Link>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent className="prose prose-sm dark:prose-invert w-80">
          <h2>{title}</h2>
          <p>{shortText}...</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
