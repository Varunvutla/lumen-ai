import { motion } from "framer-motion";

function Pills({ label, items, tone = "default" }) {
  if (!items || items.length === 0) return null;
  const toneCls =
    tone === "danger"
      ? "border-coral-400/40 text-coral-600 bg-coral-400/10"
      : tone === "good"
      ? "border-forest-300/60 text-forest-600 bg-forest-100/60"
      : "border-ink-200 text-ink-600 bg-paper-100";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label shrink-0">{label}</span>
      {items.map((it) => (
        <span key={it} className={`text-xs px-2 py-0.5 rounded-full border ${toneCls}`}>
          {it}
        </span>
      ))}
    </div>
  );
}

export default function SummaryPanel({ query, summary, intent }) {
  if (!summary && !intent) return null;
  const budget = intent?.budget_max
    ? `${intent.budget_currency || "$"}${intent.budget_max}`
    : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid grid-cols-12 gap-6 mb-10"
    >
      <aside className="col-span-12 md:col-span-4">
        <div className="label">The brief</div>
        <p className="mt-3 font-display text-2xl italic text-ink-800 leading-tight">
          “{query}”
        </p>
        <div className="mt-5 space-y-3">
          <Pills label="Must have" items={intent?.must_have} tone="good" />
          <Pills label="Nice to have" items={intent?.nice_to_have} />
          <Pills label="Avoid" items={intent?.avoid} tone="danger" />
          {budget && <Pills label="Budget" items={[budget]} />}
          {intent?.use_case && <Pills label="Use case" items={[intent.use_case]} />}
        </div>
      </aside>

      <div className="col-span-12 md:col-span-8">
        <div className="label">The read</div>
        <p className="mt-3 text-ink-700 text-[17px] leading-[1.7]">{summary}</p>
      </div>
    </motion.section>
  );
}
