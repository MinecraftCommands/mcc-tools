"use client";

import { useCallback, useEffect, useState } from "react";
import useResizeObserver from "@react-hook/resize-observer";

export default function CssVars({ children }: { children: React.ReactNode }) {
  const height = useViewportHeight();

  return <div style={{ "--viewport-height": height }}>{children}</div>;
}

function useViewportHeight() {
  const [height, setHeight] = useState("100vh");
  const updateHeight = useCallback(
    () => setHeight(`${document.documentElement.clientHeight}px`),
    [],
  );

  useResizeObserver(
    typeof window !== "undefined" ? document.documentElement : null,
    updateHeight,
  );

  useEffect(() => {
    window.addEventListener("resize", updateHeight);
    updateHeight();
    return () => window.removeEventListener("resize", updateHeight);
  }, [updateHeight]);

  return height;
}
