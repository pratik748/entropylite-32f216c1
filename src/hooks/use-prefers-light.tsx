import { useEffect, useState } from "react";

/**
 * Tracks the device's system colour scheme. Returns `true` when the OS is set
 * to light — used by the public "lite mode" to swap chart colours that live in
 * JS (Recharts style props) rather than CSS, since those can't ride the
 * --pub-* variables the rest of the marketing site flips through.
 */
export function usePrefersLight(): boolean {
  const [light, setLight] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches,
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handle = (e: MediaQueryListEvent) => setLight(e.matches);
    setLight(mq.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  return light;
}
