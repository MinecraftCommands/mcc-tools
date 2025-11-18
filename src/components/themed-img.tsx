import { type FC, type SVGProps } from "react";

type Img = FC<SVGProps<SVGElement>>;

export function ThemedImg({
  className,
  light: LightImg,
  dark: DarkImg,
}: {
  className?: string;
  light: Img;
  dark: Img;
}) {
  return (
    <>
      <div className="contents dark:hidden">
        <LightImg className={className} />
      </div>
      <div className="hidden dark:contents">
        <DarkImg className={className} />
      </div>
    </>
  );
}
