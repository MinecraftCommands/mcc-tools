import type { ClassValue } from "clsx";
import LogoCircle from "public/logo_circle.svg";

import { cn } from "~/lib/utils";

export function Logo({ className }: { className?: ClassValue }) {
  return <LogoCircle className={cn("aspect-1 h-auto w-8", className)} />;
}
