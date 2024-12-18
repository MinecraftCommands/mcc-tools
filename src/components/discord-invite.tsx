"use client";

import DiscordBlack from "public/discord_full_logo_black_RGB.svg";
import DiscordWhite from "public/discord_full_logo_white_RGB.svg";

import { cn } from "~/lib/utils";

import Link from "next/link";
import { ThemedImg } from "~/components/themed-img";
import type { ClassValue } from "clsx";

export function DiscordInvite({ className }: { className?: ClassValue }) {
  return (
    <Link href="https://discord.gg/QAFXFtZ" target="_blank">
      <ThemedImg
        light={DiscordBlack}
        dark={DiscordWhite}
        className={cn("aspect-[508.67/96.36] h-auto", className)}
      />
    </Link>
  );
}
