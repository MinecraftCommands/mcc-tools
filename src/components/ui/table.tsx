import * as React from "react";

import { cn, type WithCn } from "~/lib/utils";

function Table({ className, ...props }: WithCn<React.ComponentProps<"table">>) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  ...props
}: WithCn<React.ComponentProps<"thead">>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({
  className,
  ...props
}: WithCn<React.ComponentProps<"tbody">>) {
  return (
    <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  );
}

function TableFooter({
  className,
  ...props
}: WithCn<React.ComponentProps<"tfoot">>) {
  return (
    <tfoot
      className={cn(
        "border-t bg-surface2 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: WithCn<React.ComponentProps<"tr">>) {
  return (
    <tr
      className={cn(
        "border-b transition-colors hover:bg-surface2 data-[state=selected]:bg-surface1",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  ...props
}: WithCn<React.ComponentProps<"th">>) {
  return (
    <th
      className={cn(
        "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  ...props
}: WithCn<React.ComponentProps<"td">>) {
  return (
    <td
      className={cn(
        "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: WithCn<React.ComponentProps<"caption">>) {
  return (
    <caption
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
