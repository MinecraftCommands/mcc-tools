"use client";

import RedditLight from "public/Reddit_Lockup.svg";
import RedditDark from "public/Reddit_Lockup_OnDark.svg";

import { cn } from "~/lib/utils";

import Link from "next/link";
import { ThemedImg } from "~/components/themed-img";

export function SubredditLink({ className }: { className?: string }) {
  return (
    <Link href="https://www.reddit.com/r/MinecraftCommands/" target="_blank">
      <ThemedImg
        light={RedditLight}
        dark={RedditDark}
        className={cn("aspect-[774/216] h-auto", className)}
      />
    </Link>
  );
}
