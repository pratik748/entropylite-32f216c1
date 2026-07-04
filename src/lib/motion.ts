import type { Transition, Variants } from "framer-motion";

/**
 * Entropy motion system — Apple-calibre springs.
 *
 * Physics, not durations. Every interactive element shares these presets so
 * the whole product moves with one voice. All springs animate transform and
 * opacity only (GPU-composited, 120fps-capable).
 */

/** Standard UI response — buttons, toggles, selection. Crisp, no overshoot. */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 38,
  mass: 0.8,
};

/** Content arrival — cards, panels, sheets. Settles softly. */
export const springGentle: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  mass: 1,
};

/** Playful accents — badges, confirmations. A whisper of overshoot. */
export const springBouncy: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 24,
  mass: 0.9,
};

/** Layout morphs — segmented-control pills, shared-element moves. */
export const springLayout: Transition = {
  type: "spring",
  stiffness: 550,
  damping: 42,
  mass: 0.9,
};

/** Card / panel entrance: rises 12px and settles. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: springGentle },
};

/** Subtle zoom entrance for overlays and popovers. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: springGentle },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
};

/** Parent container that staggers children in, iOS-list style. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};

/** Child item for use inside `staggerContainer`. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: springGentle },
};

/** Tactile press feedback for any motion.button / motion.div. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: springSnappy,
} as const;

/** Slightly stronger press for small icon buttons. */
export const pressableIcon = {
  whileTap: { scale: 0.88 },
  transition: springSnappy,
} as const;
