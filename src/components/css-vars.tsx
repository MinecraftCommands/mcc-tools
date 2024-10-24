"use client";

import { useCallback, useEffect, useState } from "react";
import useResizeObserver from "@react-hook/resize-observer";

export default function CssVars({ children }: { children: React.ReactNode }) {
  const height = useViewportHeight();

  return <div style={{ "--viewport-height": height }}>{children}</div>;
}

/**
 * Custom hook that returns the current height of the viewport.
 *
 * Necessary because 100vh doesn't take into account scroll bars.
 *
 * @return {string} The height of the viewport in pixels or "100vh" on the server.
 */
function useViewportHeight(): string {
  const [height, setHeight] = useState("100vh");
  const updateHeight = useCallback(
    () => setHeight(`${document.documentElement.clientHeight}px`),
    [],
  );

  // Track resizes including changes to whether the scroll bars exist or not
  // Misses manual vertical window resizes
  useResizeObserver(
    typeof window !== "undefined" ? document.documentElement : null,
    updateHeight,
  );

  // Track manual resizes of the window
  // Misses changes to whether the scroll bars exist or not
  useEffect(() => {
    window.addEventListener("resize", updateHeight);
    updateHeight();
    return () => window.removeEventListener("resize", updateHeight);
  }, [updateHeight]);

  return height;
}
