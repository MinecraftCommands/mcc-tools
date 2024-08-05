"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import Link from "next/link";
import { cn } from "~/lib/utils";
import { usePathname } from "next/navigation";
import {
  BASE_ASSET_URL,
  type VersionManifestEntry,
} from "~/server/java/versions";

export default function VersionLink({
  versionName,
  versionLink = versionName,
  data: { shortText, title, image },
  className = "px-3 py-1",
}: {
  versionName: string;
  versionLink?: string;
  data: VersionManifestEntry;
  className?: string;
}) {
  const url = `/java/changelog/${versionLink}`;
  const pathname = usePathname();
  const selected = url === pathname || url === pathname + "/";

  // HACK: This attempts to fix broken spacing that is in the API itself
  // Eventually it would be good to extract a better preview from the full article
  // This could easily break code snippets if they happen to be in the preview text, but that should be unlikely
  const repairedShortText = shortText
    .replace(/([a-z])([A-Z])/g, "$1. $2")
    .replace(/([a-z][!.])([A-Z])/g, "$1 $2");

  return (
    <HoverCard closeDelay={0} openDelay={0}>
      <HoverCardTrigger asChild>
        <Link
          href={url}
          className={cn(
            "inline-block w-full hover:bg-foreground/10",
            { "bg-foreground/15 underline": selected },
            className,
          )}
        >
          {versionName}
        </Link>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          side="right"
          className="prose prose-sm isolate w-80 dark:prose-invert"
        >
          <div
            className="absolute inset-0 -z-10 rounded-md bg-cover bg-center opacity-20"
            style={{
              backgroundImage: `url(${BASE_ASSET_URL + image.url})`,
            }}
          />
          <h2>{title}</h2>
          <p>{repairedShortText}…</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
