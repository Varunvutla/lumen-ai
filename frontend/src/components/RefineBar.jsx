import { useState } from "react";
import { motion } from "framer-motion";
import { Wand2, ArrowRight } from "lucide-react";

const QUICK = [
  { label: "Cheaper", refine: "cheaper options" },
  { label: "Higher rated", refine: "higher rated and more reviewed" },
  { label: "Premium", refine: "premium / flagship picks" },
  { label: "Travel-friendly", refine: "lighter and more travel friendly" },
];

export default function RefineBar({ onRefine, disabled }) {
  const [text, setText] = useState("");

  const submit = (e) => {
    e?.preventDefault?.();
    if (!text.trim()) return;
    onRefine(text.trim());
    setText("");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="my-10 card p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-coral-500" />
        <span className="label">Refine</span>
      </div>
      <p className="mt-2 text-ink-600 text-sm">
        Not quite right? Nudge the search.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <motion.button
            key={q.label}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            disabled={disabled}
            onClick={() => onRefine(q.refine)}
            className="chip disabled:opacity-50"
          >
            {q.label}
          </motion.button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. lighter, with longer battery, ideally Sony or Bose"
          className="flex-1 bg-paper-100 rounded-full px-4 py-2.5 outline-none border border-ink-200/70 focus:border-ink-400 text-sm"
        />
        <button type="submit" disabled={disabled || !text.trim()} className="btn-primary">
          Refine <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </motion.section>
  );
}
