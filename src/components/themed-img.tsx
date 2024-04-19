"use client";

import { Skeleton } from "~/components/ui/skeleton";

import { useTheme } from "next-themes";

import type { FC, SVGProps } from "react";
type Img = FC<SVGProps<SVGElement>>;

export function ThemedImg({
  className,
  light,
  dark,
}: {
  className?: string;
  light: Img;
  dark: Img;
}) {
  const { resolvedTheme } = useTheme();

  const LogoEl = (() => {
    switch (resolvedTheme) {
      case "light":
        return light;
      case "dark":
        return dark;
      default:
        // TODO: Figure out how to avoid the skeleton showing at all
        return Skeleton;
    }
  })();

  return <LogoEl className={className} />;
}
