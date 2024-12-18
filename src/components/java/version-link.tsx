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
import type { ClassValue } from "clsx";

export default function VersionLink({
  versionName,
  versionLink = versionName,
  data: { shortText, title, image },
  className = "px-3 py-1",
}: {
  versionName: string;
  versionLink?: string;
  data: VersionManifestEntry;
  className?: ClassValue;
}) {
  const url = `/java/changelog/${versionLink}`;
  const pathname = usePathname();
  const selected = url === pathname || url === pathname + "/";

  return (
    <HoverCard closeDelay={0} openDelay={0}>
      <HoverCardTrigger asChild>
        <Link
          href={url}
          className={cn(
            "inline-block w-full text-subtext1 hover:bg-surface1",
            { "bg-surface0 underline": selected },
            className,
          )}
          prefetch={false}
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
          <p className="text-text">{shortText}…</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
