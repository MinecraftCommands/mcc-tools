"use client";

import Link from "next/link";
import * as React from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "~/components/ui/navigation-menu";
import { Logo } from "~/components/logo";
import { ModeToggle } from "~/components/mode-toggle";
import { cn } from "~/lib/utils";

import { Roboto_Mono } from "next/font/google";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto_mono",
});

type NavItemProps = {
  title: string;
  href?: string;
  description: string;
};

type NavGroupProps = {
  name: string;
  items: NavItemProps[];
};

const nav: NavGroupProps[] = [
  {
    name: "Articles",
    items: [
      {
        title: "Articles",
        description: "All about data/resource pack development",
      },
      {
        title: "Java Changelogs",
        href: "/java/changelog",
        description: "Check out how Java edition has changed across versions",
      },
    ],
  },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-header w-full items-center border-b border-border/40 bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-2 pr-4 font-robotoMono font-[300] dark:font-[250]",
                  robotoMono.variable,
                )}
              >
                <Logo />
                <div className="max-md:sr-only">MCC Gadgets</div>
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
          {nav.map((group) => (
            <NavGroup key={group.name} {...group} />
          ))}
        </NavigationMenuList>
      </NavigationMenu>
      <div className="ml-auto">
        <ModeToggle />
      </div>
    </header>
  );
}

function NavGroup({ name, items }: NavGroupProps) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger>{name}</NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
          {items.map((item) => (
            <NavItem key={item.title} {...item} />
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

function NavItem({ title, href, description }: NavItemProps) {
  const content = (
    <>
      <div className="text-sm font-medium leading-none">{title}</div>
      <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
        {description}
      </p>
    </>
  );

  const className = "block space-y-1 p-3 leading-none";
  if (!href) {
    return (
      <li>
        <div className={className}>{content}</div>
      </li>
    );
  }

  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          className={cn(
            className,
            "select-none rounded-md no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
          )}
          href={href}
        >
          {content}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
