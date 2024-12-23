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
import { ThemePicker } from "~/components/theme-picker";
import { cn } from "~/lib/utils";

import { Roboto_Mono } from "next/font/google";
import { usePathname } from "next/navigation";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto_mono",
});

type NavItemProps = {
  title: string;
  href?: string;
  activeWhen?: RegExp;
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
        activeWhen: /^\/java\/changelog/,
      },
    ],
  },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-header w-full items-center border-b border-border/40 bg-crust p-2 backdrop-blur supports-[backdrop-filter]:bg-crust/60">
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-2 pr-4 font-robotoMono font-[300] text-text dark:font-[250]",
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
        <ThemePicker />
      </div>
    </header>
  );
}

function NavGroup({ name, items }: NavGroupProps) {
  const pathname = usePathname();

  let anyChildActive = false;
  const children = items.map((item) => {
    const activeWhen = item.activeWhen;
    const active = activeWhen
      ? activeWhen.test(pathname)
      : pathname === item.href;
    anyChildActive ||= active;

    return <NavItem key={item.title} {...item} active={active} />;
  });

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger
        className={cn(
          {
            "bg-surface0": anyChildActive,
          },
          "text-text focus:bg-surface0",
        )}
      >
        {name}
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-[400px] gap-3 bg-crust p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
          {children}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}

function NavItem({
  title,
  href,
  description,
  active,
}: Omit<NavItemProps, "activeWhen"> & { active: boolean }) {
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
      <NavigationMenuLink asChild active={active}>
        <Link
          className={cn(
            className,
            "select-none rounded-md text-text no-underline outline-none transition-colors hover:bg-surface0 focus:bg-surface0 data-[active]:[&:not(:hover)]:bg-mantle",
          )}
          href={href}
        >
          {content}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
