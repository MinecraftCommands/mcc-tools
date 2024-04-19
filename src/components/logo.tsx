"use client";

import { Skeleton } from "~/components/ui/skeleton";
import LogoBlack from "public/logo_black.svg";
import LogoWhite from "public/logo_white.svg";

import { useTheme } from "next-themes";
import { cn } from "~/lib/utils";

export function Logo({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();

  const LogoEl = (() => {
    switch (resolvedTheme) {
      case "light":
        return LogoBlack;
      case "dark":
        return LogoWhite;
      default:
        // TODO: Figure out how to avoid the skeleton showing at all
        return Skeleton;
    }
  })();

  return <LogoEl className={cn("aspect-[49/62] h-auto w-8", className)} />;
}
