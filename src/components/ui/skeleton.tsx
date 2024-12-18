import { cn, type WithCn } from "~/lib/utils";

function Skeleton({
  className,
  ...props
}: WithCn<React.HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  );
}

export { Skeleton };
