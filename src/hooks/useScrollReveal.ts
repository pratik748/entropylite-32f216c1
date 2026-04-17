import { useEffect, useRef } from "react";

/**
 * Adds `is-visible` class to elements with `.reveal` inside the container
 * once they enter the viewport. Respects prefers-reduced-motion.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: IntersectionObserverInit = { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));

    if (reduce) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, options);

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
