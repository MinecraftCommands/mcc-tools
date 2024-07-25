import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import Link from "next/link";
import { cn } from "~/lib/utils";

export default function VersionLink({
  versionName,
  versionLink = versionName,
  title,
  shortText,
  className = "px-3 py-1",
}: {
  versionName: string;
  versionLink?: string;
  title: string;
  shortText: string;
  className?: string;
}) {
  const url = `/java/changelog/${versionLink}`;

  return (
    <HoverCard closeDelay={0}>
      <HoverCardTrigger asChild>
        {/*TODO: Unhardcode this to show the currently selected page.*/}
        <Link
          href={url}
          className={cn(
            "inline-block w-full hover:bg-foreground/10",
            { "bg-foreground/15 underline": versionName == "1.20.6" },
            className,
          )}
        >
          {versionName}
        </Link>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent className="prose prose-sm w-80 dark:prose-invert">
          <h2>{title}</h2>
          <p>{shortText}...</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
