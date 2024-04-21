"use client";

import Link from "next/link";
import * as React from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "~/components/ui/navigation-menu";
import { Logo } from "~/components/logo";
import { ModeToggle } from "~/components/mode-toggle";
import { cn } from "~/lib/utils";

import { Roboto_Mono } from "next/font/google";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto_mono",
});

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex items-center">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link href="/" legacyBehavior passHref>
                <NavigationMenuLink
                  className={cn(
                    "flex items-center gap-2 font-robotoMono font-[300] dark:font-[250]",
                    robotoMono.variable,
                  )}
                >
                  <Logo />
                  <div>MCC Gadgets</div>
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <div className="ml-auto">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
