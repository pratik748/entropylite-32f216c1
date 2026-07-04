import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  tabKey: string;
}

/**
 * iOS-style contextual transition: the incoming view rises 10px and settles
 * on a spring while the outgoing view slips away. Transform + opacity only,
 * fully GPU-composited — no blur, no 3D, no layout thrash.
 */
const PageTransition = ({ children, tabKey }: PageTransitionProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.995 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 320, damping: 32, mass: 0.9 },
        }}
        exit={{
          opacity: 0,
          y: reduceMotion ? 0 : -6,
          transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
        }}
        style={{ willChange: "transform, opacity" }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransition;
