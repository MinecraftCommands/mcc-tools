import "react";

declare module "react" {
  interface CSSProperties {
    "--viewport-height"?: string;
  }
}
