import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowUpRight,
  Trash2,
  Sparkles,
  Loader2,
  Trophy,
  Check,
  Minus,
  Award,
  AlertTriangle,
  RotateCcw,
  BellRing,
} from "lucide-react";
import { compare as runCompare } from "../api.js";

export default function CompareDrawer({
  open,
  items,
  query,
  health,
  onClose,
  onRemove,
  onClear,
  onStartCopilotChat,
  onOpenTrackify,
}) {
  const [deep, setDeep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canDeep = !!health?.firecrawl_enabled;

  // Reset when items change or drawer closes.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [items, open]);

  const analyze = async () => {
    if (items.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runCompare({
        query: query || "compare these products",
        items,
        deep: deep && canDeep,
      });
      setResult(res);
    } catch (e) {
      setError(e.message || "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 modal-overlay backdrop-blur-[3px]"
        >
          <motion.aside
            key="panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute inset-2 sm:inset-6 bg-paper-50 border border-ink-200 rounded-2xl shadow-lift flex flex-col overflow-hidden"
          >
            <Header
              count={items.length}
              hasResult={!!result}
              loading={loading}
              deep={deep}
              setDeep={setDeep}
              canDeep={canDeep}
              onAnalyze={analyze}
              onClear={onClear}
              onClose={onClose}
              onReset={() => setResult(null)}
              onStartCopilotChat={onStartCopilotChat}
              items={items}
            />

            <div className="flex-1 overflow-auto">
              {error && (
                <div className="m-5 card border-coral-400/50 bg-coral-400/10 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-coral-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-ink-700">{error}</div>
                </div>
              )}

              {loading && <LoadingPanel deep={deep && canDeep} />}

              {!loading && !result && (
                <PinnedList items={items} onRemove={onRemove} onOpenTrackify={onOpenTrackify} onClose={onClose} />
              )}

              {!loading && result && (
                <ResultPanel result={result} items={items} />
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Header({
  count,
  hasResult,
  loading,
  deep,
  setDeep,
  canDeep,
  onAnalyze,
  onClear,
  onClose,
  onReset,
  onStartCopilotChat,
  items,
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-5 border-b border-ink-200 bg-paper-50/95 backdrop-blur sticky top-0 z-10">
      <div>
        <div className="label">Side by side</div>
        <h2 className="font-display text-3xl italic text-ink-800 mt-0.5">Compare</h2>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <label
          title={canDeep ? "Scrape product pages with Firecrawl" : "Set FIRECRAWL_API_KEY to enable"}
          className={`hidden sm:inline-flex items-center gap-2 chip cursor-pointer ${
            canDeep ? "" : "opacity-60 cursor-not-allowed"
          }`}
        >
          <input
            type="checkbox"
            checked={deep}
            disabled={!canDeep || loading || hasResult}
            onChange={(e) => setDeep(e.target.checked)}
            className="accent-forest-500"
          />
          Deep grounding
        </label>

        {hasResult ? (
          <button onClick={onReset} className="btn-ghost" title="Back to list">
            <RotateCcw className="w-4 h-4" /> Re-analyze
          </button>
        ) : (
          <button
            onClick={onAnalyze}
            disabled={loading || count < 2}
            className="btn-primary"
            title={count < 2 ? "Pin at least two picks" : "Run comparison"}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analyze
          </button>
        )}

        {count >= 2 && !loading && (
          <button
            onClick={() => {
              const titles = items.map((it) => it.title).join(" vs ");
              onStartCopilotChat(`Analyze and compare these products: ${titles}. Which one should I buy and why?`);
              onClose();
            }}
            className="btn-ghost flex items-center gap-1.5 border border-forest-200 dark:border-forest-800/40 text-forest-600 dark:text-forest-400 hover:bg-forest-50/50 dark:hover:bg-forest-950/20"
            title="Discuss this comparison with Copilot"
          >
            <Sparkles className="w-4 h-4 text-forest-500 dark:text-forest-400" />
            Ask Copilot
          </button>
        )}

        {!hasResult && count > 0 && (
          <button onClick={onClear} className="btn-ghost" title="Clear all">
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <button onClick={onClose} className="btn-ghost" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function PinnedList({ items, onRemove, onOpenTrackify, onClose }) {
  if (items.length === 0) {
    return (
      <div className="m-8 max-w-xl">
        <p className="font-display italic text-2xl text-ink-700">
          Nothing pinned yet.
        </p>
        <p className="mt-2 text-ink-500 text-sm">
          Tap the <span className="font-mono">+</span> on any pick in the
          results to drop it here. Pin two or more, then hit Analyze.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="label mb-3">Pinned ({items.length})</div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((it) => (
          <article
            key={it.url}
            className="card p-3 flex gap-3 hover:shadow-soft transition"
          >
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-ink-100 shrink-0">
              {it.image && (
                <img
                  src={it.image}
                  alt={it.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="label truncate">{it.source}</span>
                {it.price && (
                  <span className="text-[11px] px-2 py-0.5 bg-ink-800 text-paper-50 rounded-full">
                    {it.price}
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg text-ink-800 leading-tight mt-1 line-clamp-2">
                {it.title}
              </h3>
              <div className="mt-2 flex items-center gap-2.5">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs inline-flex items-center gap-1 text-ink-700 hover:text-forest-600"
                >
                  Open <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => {
                    const match = it.price ? String(it.price).replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/) : null;
                    const numericPrice = match ? Number(match[0]) : null;
                    onOpenTrackify({
                      title: it.title,
                      url: it.url,
                      source: it.source || "Web",
                      image: it.image || null,
                      current_price: numericPrice,
                    });
                    onClose();
                  }}
                  className="text-xs text-ink-400 hover:text-forest-600 flex items-center gap-0.5"
                  title="Track this product price"
                >
                  <BellRing className="w-3 h-3" /> Track
                </button>
                <button
                  onClick={() => onRemove(it)}
                  className="text-xs text-ink-400 hover:text-coral-500"
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function LoadingPanel({ deep }) {
  return (
    <div className="p-8 max-w-2xl">
      <div className="label mb-3">Working</div>
      <ol className="space-y-2 font-display italic text-2xl text-ink-700 leading-snug">
        <li>Reading each product…</li>
        {deep && <li>Scraping product pages…</li>}
        <li>Lining up shared specs…</li>
        <li>Picking pros, cons, and a winner…</li>
      </ol>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="h-32 shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({ result, items }) {
  const winnerIdx = result.verdict?.winner_index ?? 0;
  return (
    <div className="p-5 sm:p-8 space-y-10">
      <Verdict result={result} items={items} />
      <SpecMatrix matrix={result.matrix} items={items} winnerIdx={winnerIdx} />
      <ProsConsRow analyses={result.analyses} winnerIdx={winnerIdx} />
      <Footnote grounded={result.grounded} providers={result.providers} />
    </div>
  );
}

function Verdict({ result, items }) {
  const winner = items[result.verdict.winner_index] || items[0];
  return (
    <section className="card p-6 sm:p-7 bg-forest-100/40 border-forest-200">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-forest-600" />
        <span className="label text-forest-700">Verdict</span>
      </div>
      <h3 className="mt-3 font-display text-3xl sm:text-4xl italic text-ink-800 leading-tight">
        {result.verdict.headline}
      </h3>
      <p className="mt-4 text-ink-700 text-[15px] leading-[1.7] max-w-3xl">
        {result.verdict.explanation}
      </p>
      <div className="mt-5 flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-ink-100 shrink-0">
          {winner?.image && (
            <img
              src={winner.image}
              alt={winner.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-ink-500">Top pick</div>
          <div className="font-display text-xl text-ink-800 truncate">
            {winner?.title}
          </div>
        </div>
        <a
          href={winner?.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto btn-primary"
        >
          Open <ArrowUpRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}

function SpecMatrix({ matrix, items, winnerIdx }) {
  if (!matrix?.length) return null;
  const cols = items.length;

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="label">Spec matrix</span>
        <span className="h-px flex-1 bg-ink-200" />
        <span className="label tabular-nums">{matrix.length} attributes</span>
      </div>

      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <div className="min-w-[680px] grid" style={{ gridTemplateColumns: `220px repeat(${cols}, minmax(160px, 1fr))` }}>
          {/* Column headers */}
          <div />
          {items.map((it, i) => (
            <div
              key={it.url}
              className={`px-3 py-3 border-b border-ink-200 text-left ${
                i === winnerIdx ? "bg-forest-100/50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] tabular-nums text-ink-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {i === winnerIdx && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-label text-forest-700">
                    <Trophy className="w-3 h-3" />
                    Winner
                  </span>
                )}
              </div>
              <div className="font-display text-base text-ink-800 leading-tight mt-1 line-clamp-2">
                {it.title}
              </div>
              <div className="text-[11px] text-ink-500 mt-0.5 truncate">
                {it.source}
                {it.price ? ` · ${it.price}` : ""}
              </div>
            </div>
          ))}

          {/* Rows */}
          {matrix.map((row, rIdx) => (
            <Row key={`${row.attribute}-${rIdx}`} row={row} cols={cols} striped={rIdx % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({ row, cols, striped }) {
  return (
    <>
      <div
        className={`px-3 py-3 border-b border-ink-200 text-sm text-ink-700 flex items-center ${
          striped ? "bg-paper-100/60" : ""
        }`}
      >
        <span className="font-medium">{row.attribute}</span>
      </div>
      {Array.from({ length: cols }).map((_, i) => {
        const cell = row.cells[i] || { value: "—", is_winner: false };
        const unknown = !cell.value || cell.value === "—";
        return (
          <div
            key={i}
            className={`px-3 py-3 border-b border-ink-200 text-sm flex items-center ${
              striped ? "bg-paper-100/60" : ""
            } ${cell.is_winner ? "bg-forest-100/60" : ""}`}
          >
            {cell.is_winner && (
              <Check className="w-3.5 h-3.5 text-forest-600 mr-1.5 shrink-0" />
            )}
            <span className={unknown ? "text-ink-300 italic" : "text-ink-800"}>
              {cell.value}
            </span>
            {cell.note && (
              <span className="ml-2 text-[11px] text-ink-400">· {cell.note}</span>
            )}
          </div>
        );
      })}
    </>
  );
}

function ProsConsRow({ analyses, winnerIdx }) {
  if (!analyses?.length) return null;
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="label">Pros & cons</span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {analyses.map((a, i) => (
          <article
            key={a.url}
            className={`card p-5 ${
              i === winnerIdx ? "border-forest-300/80 ring-1 ring-forest-300/60" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] tabular-nums text-ink-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              {a.award && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-label text-coral-600 bg-coral-400/10 border border-coral-400/30 rounded-full px-2 py-0.5">
                  <Award className="w-3 h-3" />
                  {a.award}
                </span>
              )}
            </div>
            <h4 className="mt-2 font-display text-xl text-ink-800 leading-tight line-clamp-2">
              {a.title}
            </h4>

            <div className="mt-4 space-y-1.5">
              {a.pros.map((p, k) => (
                <div key={`p-${k}`} className="flex items-start gap-2 text-sm text-ink-700">
                  <Check className="w-3.5 h-3.5 text-forest-600 mt-1 shrink-0" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {a.cons.map((c, k) => (
                <div key={`c-${k}`} className="flex items-start gap-2 text-sm text-ink-500">
                  <Minus className="w-3.5 h-3.5 text-coral-500 mt-1 shrink-0" />
                  <span>{c}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-ink-200/70 flex items-center justify-between">
              <span className="label truncate">listing</span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-ink-800 hover:text-forest-600"
              >
                Open <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footnote({ grounded, providers }) {
  return (
    <div className="text-[11px] text-ink-400 border-t border-ink-200 pt-4 flex flex-wrap items-center gap-3">
      <span>
        {grounded
          ? "Specs grounded with live page text via Firecrawl."
          : "Specs inferred from snippets; enable deep grounding for accuracy."}
      </span>
      <span className="ml-auto font-mono">
        {providers?.llm}
        {providers?.llm_model ? `/${providers.llm_model.split("/").pop()}` : ""}
      </span>
    </div>
  );
}
