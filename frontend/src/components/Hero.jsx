import { motion } from "framer-motion";

const heroWords = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.58,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.08,
    },
  },
};

const word = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function FloatingWord({ children, className, direction = -1, delay = 0 }) {
  return (
    <motion.span variants={word} className="inline-block">
      <motion.span
        className={`inline-block motion-underline ${className}`}
        animate={{ y: [0, direction * 3, 0] }}
        whileHover={{ y: direction * 6, rotate: direction }}
        transition={{
          y: { duration: 2.8, delay, repeat: Infinity, ease: "easeInOut" },
          rotate: { type: "spring", stiffness: 260, damping: 18 },
        }}
      >
        {children}
      </motion.span>
    </motion.span>
  );
}

export default function Hero() {
  return (
    <header className="pt-20 sm:pt-28 pb-10 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3"
      >
        <span className="live-dot" aria-hidden="true" />
        <span className="label">Issue 01 · AI-assisted shopping</span>
        <motion.span
          className="h-px flex-1 bg-ink-200 origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
        />
        <span className="label tabular-nums">2026</span>
      </motion.div>

      <motion.h1
        variants={heroWords}
        initial="hidden"
        animate="show"
        className="mt-8 font-display text-[56px] leading-[0.95] sm:text-[88px] sm:leading-[0.92] text-ink-800"
      >
        <motion.span variants={word} className="inline-block">Tell us what you</motion.span>{" "}
        <FloatingWord className="italic text-forest-500" direction={-1}>
          need
        </FloatingWord>
        <motion.span variants={word} className="inline-block">
          .
        </motion.span>
        <br />
        <motion.span variants={word} className="inline-block">We'll bring back the</motion.span>{" "}
        <FloatingWord className="italic text-coral-500" direction={-1} delay={0.35}>
          good stuff
        </FloatingWord>
        <motion.span variants={word} className="inline-block">
          .
        </motion.span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="mt-6 max-w-xl text-ink-500 text-base sm:text-lg leading-relaxed"
      >
        A small, opinionated shopping companion. It reads your sentence,
        searches the live web, and writes back a short, honest pick — with
        real links, no affiliate fluff.
      </motion.p>
    </header>
  );
}
