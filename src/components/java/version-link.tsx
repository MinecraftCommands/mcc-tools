"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "~/components/ui/hover-card";
import Link from "next/link";
import { cn } from "~/lib/utils";
import {
  BASE_ASSET_URL,
} from "~/server/java/versions";
import type { ClassValue } from "clsx";

export default function VersionLink({
  version,
  className = "px-3 py-1",
  selected
}: {
  version: VersionEntry;
  className?: ClassValue;
  selected: boolean;
}) {
  const url = `/java/changelog/${version.url}`;
  return (
    <HoverCard closeDelay={0} openDelay={0}>
      <HoverCardTrigger asChild>
        <Link
          href={url}
          className={cn(
            "inline-block w-full text-subtext1 hover:bg-surface1 version-label",
            { "bg-surface0 underline": selected },
            className,
          )}
          prefetch={false}
        >
          {version.name}
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
              backgroundImage: `url(${BASE_ASSET_URL + version.image.url})`,
            }}
          />
          <h2>{version.title}</h2>
          <p>{version.description}…</p>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}

export interface VersionEntry {
  name: string;
  url: string;
  title: string;
  description: string;
  image: { title: string; url: string; };
}

export interface ReleaseVersionEntry extends VersionEntry {
  nonReleaseVersions: VersionEntry[];
  isLatest: boolean;
}
