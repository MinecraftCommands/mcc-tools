"use client";

import { useSyncExternalStore } from "react";

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
  return useSyncExternalStore(
    subscribeToViewportSize,
    getViewportHeight,
    getServerViewportHeight,
  );
}

function subscribeToViewportSize(onResize: () => void) {
  // Assuming the visual viewport API is supported, as it is baseline widely available
  window.visualViewport?.addEventListener("resize", onResize);

  return () => {
    window.visualViewport?.removeEventListener("resize", onResize);
  };
}

function getViewportHeight() {
  return `${document.documentElement.clientHeight}px`;
}

function getServerViewportHeight() {
  return "100vh";
}
