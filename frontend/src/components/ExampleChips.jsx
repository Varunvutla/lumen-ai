import { motion } from "framer-motion";

const EXAMPLES = [
  "Quiet headphones for long flights, under $250",
  "A lightweight laptop for college, ₹70k budget",
  "Running shoes for flat feet, marathon training",
  "Espresso machine for beginners, under $400",
  "Low-profile wireless mechanical keyboard",
  "Smartwatch with great battery life, hiking",
];

export default function ExampleChips({ onPick, disabled }) {
  return (
    <div className="mt-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="label">Try one</span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex, i) => (
          <motion.button
            key={ex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            disabled={disabled}
            onClick={() => onPick(ex)}
            className="chip disabled:opacity-50"
          >
            {ex}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
