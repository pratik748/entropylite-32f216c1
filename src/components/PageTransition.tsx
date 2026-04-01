import { motion, AnimatePresence } from "framer-motion";
import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  tabKey: string;
}

const bookOpen = {
  initial: {
    opacity: 0,
    rotateY: -12,
    scaleX: 0.92,
    transformOrigin: "left center",
    filter: "blur(4px)",
  },
  animate: {
    opacity: 1,
    rotateY: 0,
    scaleX: 1,
    transformOrigin: "left center",
    filter: "blur(0px)",
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    rotateY: 8,
    scaleX: 0.96,
    transformOrigin: "right center",
    filter: "blur(3px)",
    transition: {
      duration: 0.25,
      ease: [0.4, 0, 1, 1],
    },
  },
};

const PageTransition = ({ children, tabKey }: PageTransitionProps) => (
  <AnimatePresence mode="wait">
    <motion.div
      key={tabKey}
      variants={bookOpen}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{ perspective: 1200, willChange: "transform, opacity, filter" }}
      className="h-full"
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

export default PageTransition;
