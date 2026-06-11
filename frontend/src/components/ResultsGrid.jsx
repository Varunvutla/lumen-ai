import { motion } from "framer-motion";
import { Award } from "lucide-react";
import ProductCard, { PickCard } from "./ProductCard.jsx";

export default function ResultsGrid({ results, compareSet, onToggleCompare, onOpenTrackify }) {
  if (!results || results.length === 0) return null;

  // Top 3 by score become the "picks"
  const sorted = [...results].sort((a, b) => (b.score || 0) - (a.score || 0));
  const picks = sorted.slice(0, 3);

  return (
    <div className="space-y-12">

      {/* ── Product grid (Amazon-style) ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <span className="label">Results</span>
          <span className="h-px flex-1 bg-ink-200" />
          <span className="label tabular-nums">{results.length} products</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {results.map((rec, i) => (
            <ProductCard
              key={`${rec.url}-${i}`}
              rec={rec}
              index={i}
              selected={compareSet?.has(rec.url)}
              onToggleCompare={() => onToggleCompare(rec)}
              onOpenTrackify={onOpenTrackify}
            />
          ))}
        </div>
      </section>

      {/* ── LuMen Picks ── */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-5"
        >
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-sm text-ink-700">LuMen Picks</span>
          </div>
          <span className="h-px flex-1 bg-ink-200" />
          <span className="label">AI-ranked top choices with reasoning</span>
        </motion.div>

        <div className="flex flex-col gap-4">
          {picks.map((rec, i) => (
            <PickCard
              key={`pick-${rec.url}-${i}`}
              rec={rec}
              rank={i}
              selected={compareSet?.has(rec.url)}
              onToggleCompare={() => onToggleCompare(rec)}
              onOpenTrackify={onOpenTrackify}
            />
          ))}
        </div>
      </section>

    </div>
  );
}
