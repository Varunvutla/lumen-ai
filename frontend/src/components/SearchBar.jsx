import { useState } from "react";
import { ArrowRight, Loader2, SlidersHorizontal, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SearchBar({ onSubmit, loading, value, onChange, locked, onRequireAuth }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [topK, setTopK] = useState(6);

  const submit = (e) => {
    e?.preventDefault?.();
    if (locked) {
      onRequireAuth?.();
      return;
    }
    if (!value.trim() || loading) return;
    onSubmit({
      query: value.trim(),
      top_k: Number(topK) || 6,
      max_price: maxPrice ? Number(maxPrice) : undefined,
    });
  };

  return (
    <motion.form
      onSubmit={submit}
      className="w-full max-w-3xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: 0.12, ease: "easeOut" }}
    >
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.18 }}
        className="card group/search relative overflow-hidden shadow-soft px-2 sm:px-3 py-2 flex items-center gap-2 focus-within:border-forest-300 focus-within:shadow-lift"
      >
        <motion.span
          className="hidden sm:flex items-center justify-center w-9 h-9 font-mono text-[11px] text-ink-400"
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          01
        </motion.span>
        <span className="hidden sm:block w-px h-6 bg-ink-200" />
        <span
          className="absolute inset-x-8 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-forest-500 via-coral-500 to-forest-500 transition-transform duration-500 group-focus-within/search:scale-x-100"
          aria-hidden="true"
        />
        <input
          autoFocus
          value={value}
          onFocus={() => {
            if (locked) onRequireAuth?.();
          }}
          onChange={(e) => {
            if (locked) {
              onRequireAuth?.();
              return;
            }
            onChange(e.target.value);
          }}
          placeholder="A quiet pair of headphones for long flights, under $250…"
          className="flex-1 bg-transparent outline-none py-3 text-ink-800 placeholder:text-ink-300 text-[15px]"
        />
        <button
          type="button"
          onClick={() => {
            if (locked) {
              onRequireAuth?.();
              return;
            }
            setShowAdvanced((v) => !v);
          }}
          className="hidden sm:inline-flex btn-ghost"
          title="Refine"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Options</span>
        </button>
        <motion.button
          type="submit"
          disabled={loading || (!locked && !value.trim())}
          className="btn-primary"
          whileTap={{ scale: 0.98 }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading
            </>
          ) : (
            <>
              Recommend
              <motion.span
                animate={{ x: value.trim() && !locked ? [0, 3, 0] : 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <ArrowRight className="w-4 h-4" />
              </motion.span>
            </>
          )}
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 card px-4 py-3 flex flex-wrap items-center gap-5 text-sm">
              <label className="flex items-center gap-2">
                <span className="label">Max price</span>
                <input
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="any"
                  className="w-24 bg-paper-100 rounded-md px-2 py-1 outline-none border border-ink-200/70 focus:border-ink-400"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="label">Results</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={topK}
                  onChange={(e) => setTopK(e.target.value)}
                  className="w-16 bg-paper-100 rounded-md px-2 py-1 outline-none border border-ink-200/70 focus:border-ink-400"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setMaxPrice("");
                  setTopK(6);
                }}
                className="ml-auto btn-ghost"
              >
                <X className="w-3.5 h-3.5" /> reset
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
