import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

const steps = ["Fetching live price", "Reading the news", "Weighing sentiment", "Simulating outcomes"];

const LoadingState = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <motion.div
        className="relative mb-7 h-12 w-12"
        aria-hidden
      >
        <div className="absolute inset-0 rounded-full border-2 border-muted-foreground/15" />
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground/70"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-2.5 rounded-full bg-surface-2"
          animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
      <p className="text-headline text-foreground">Analyzing…</p>
      <p className="mt-1 text-footnote text-muted-foreground">This usually takes a few seconds</p>

      <motion.div
        className="mt-8 w-full max-w-sm space-y-2"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {steps.map((step, i) => (
          <motion.div
            key={step}
            variants={staggerItem}
            className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-breathe"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
            <span className="text-footnote text-muted-foreground">{step}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default LoadingState;
