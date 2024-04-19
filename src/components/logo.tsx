"use client";

import LogoBlack from "public/logo_black.svg";
import LogoWhite from "public/logo_white.svg";

import { cn } from "~/lib/utils";
import { ThemedImg } from "~/components/themed-img";

export function Logo({ className }: { className?: string }) {
  return (
    <ThemedImg
      light={LogoBlack}
      dark={LogoWhite}
      className={cn("aspect-[49/62] h-auto w-8", className)}
    />
  );
}
