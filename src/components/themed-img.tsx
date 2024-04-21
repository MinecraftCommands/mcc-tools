"use client";

import { Skeleton } from "~/components/ui/skeleton";

import { useTheme } from "next-themes";

import { useEffect, useState, type FC, type SVGProps } from "react";
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
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const LogoEl = (() => {
    // TODO: Figure out how to avoid the skeleton showing at all
    if (!mounted) {
      return Skeleton;
    }

    switch (resolvedTheme) {
      case "light":
        return light;
      case "dark":
        return dark;
      default:
        return Skeleton;
    }
  })();

  return <LogoEl className={className} />;
}
