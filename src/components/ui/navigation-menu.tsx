import * as React from "react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";

import { cn, type WithCn } from "~/lib/utils";
import { useWrappedRef } from "~/lib/refs";
import { ChevronDown } from "lucide-react";

function NavigationMenu({
  className,
  children,
  ...props
}: WithCn<React.ComponentProps<typeof NavigationMenuPrimitive.Root>>) {
  return (
    <NavigationMenuPrimitive.Root
      className={cn(
        "relative z-10 flex max-w-max flex-1 items-center justify-center",
        className,
      )}
      {...props}
    >
      {children}
      <NavigationMenuViewport />
    </NavigationMenuPrimitive.Root>
  );
}

function NavigationMenuList({
  className,
  ...props
}: WithCn<React.ComponentProps<typeof NavigationMenuPrimitive.List>>) {
  return (
    <NavigationMenuPrimitive.List
      className={cn(
        "group flex flex-1 list-none items-center justify-center space-x-1",
        className,
      )}
      {...props}
    />
  );
}

const NavigationMenuItem = NavigationMenuPrimitive.Item;

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-surface1 focus:bg-surface1 disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-surface1 data-[active]:bg-surface1",
);

function NavigationMenuTrigger({
  ref,
  className,
  children,
  onClick,
  ...props
}: WithCn<React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>>) {
  // TODO: Determine if there's a better way to detect the change to open
  const [preventClick, setPreventClick] = React.useState(false);
  const { setRef, refValue } = useWrappedRef(ref);

  React.useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLElement &&
          mutation.target.dataset.state === "open"
        ) {
          setPreventClick(true);
          setTimeout(() => setPreventClick(false), 300);
        }
      }
    });
    if (refValue.current) {
      observer.observe(refValue.current, { attributeFilter: ["data-state"] });
    }

    return () => observer.disconnect();
  }, [refValue]);

  return (
    <NavigationMenuPrimitive.Trigger
      ref={setRef}
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
      onClick={(e) => {
        if (preventClick) {
          e.preventDefault();
        } else {
          onClick?.(e);
        }
      }}
    >
      {children}{" "}
      <ChevronDown
        className="relative top-[1px] ml-1 h-3 w-3 transition duration-300 group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  );
}

function NavigationMenuContent({
  className,
  ...props
}: WithCn<React.ComponentProps<typeof NavigationMenuPrimitive.Content>>) {
  return (
    <NavigationMenuPrimitive.Content
      className={cn(
        "left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto ",
        className,
      )}
      {...props}
    />
  );
}

const NavigationMenuLink = NavigationMenuPrimitive.Link;

function NavigationMenuViewport({
  className,
  ...props
}: WithCn<React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>>) {
  return (
    <div className="absolute left-0 top-full flex justify-center">
      <NavigationMenuPrimitive.Viewport
        className={cn(
          "origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function NavigationMenuIndicator({
  className,
  ...props
}: WithCn<React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>>) {
  return (
    <NavigationMenuPrimitive.Indicator
      className={cn(
        "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",
        className,
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  );
}

export {
  navigationMenuTriggerStyle,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
};
