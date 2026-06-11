import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Lock } from "lucide-react";

import TopBar from "./components/TopBar.jsx";
import Hero from "./components/Hero.jsx";
import SearchBar from "./components/SearchBar.jsx";
import ExampleChips from "./components/ExampleChips.jsx";
import LoadingState from "./components/LoadingState.jsx";
import SummaryPanel from "./components/SummaryPanel.jsx";
import ResultsGrid from "./components/ResultsGrid.jsx";
import RefineBar from "./components/RefineBar.jsx";
import CompareDrawer from "./components/CompareDrawer.jsx";
import AuthModal from "./components/auth/AuthModal.jsx";
import TrackifyPanel from "./components/TrackifyPanel.jsx";
import CopilotPanel from "./components/CopilotPanel.jsx";
import { recommend, getHealth, getMe, listTrackify } from "./api.js";

const HISTORY_KEY = "lumen.history.v1";
const THEME_KEY = "lumen.theme.v1";
const MAX_HISTORY = 8;

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // ignore
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function ConfigWarning({ health }) {
  if (!health) return null;
  const missing = [];
  if (!health.llm_provider) missing.push("an LLM key (GROQ / OPENCODE / OPENAI / GEMINI / ANTHROPIC)");
  if (!health.search_provider) missing.push("a search key (TAVILY or SERPAPI)");
  if (!missing.length) return null;
  return (
    <div className="card border-coral-400/50 bg-coral-400/10 p-4 sm:p-5 flex items-start gap-3 max-w-3xl">
      <AlertTriangle className="w-5 h-5 text-coral-600 mt-0.5 shrink-0" />
      <div className="text-sm text-ink-700">
        Backend is missing <strong>{missing.join(" and ")}</strong>. Add to{" "}
        <code className="font-mono text-coral-700">backend/.env</code> and restart.
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(loadTheme);
  const [health, setHealth] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const [history, setHistory] = useState(loadHistory);
  const [compare, setCompare] = useState([]); // array of recs
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [trackifyOpen, setTrackifyOpen] = useState(false);
  const [trackifyInitialProduct, setTrackifyInitialProduct] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  // Track how many searches done — first one is free, second needs login
  const [chatCount, setChatCount] = useState(0);
  const [trackedItems, setTrackedItems] = useState([]);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState(null);

  const refreshTrackify = async () => {
    if (!user) return;
    try {
      const res = await listTrackify();
      setTrackedItems(res.items || []);
    } catch (err) {
      console.error("Failed to fetch Trackify items", err);
    }
  };

  useEffect(() => {
    if (user) {
      refreshTrackify();
    } else {
      setTrackedItems([]);
    }
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    if (localStorage.getItem("lumen.auth.token")) {
      getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem("lumen.auth.token"))
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  // NOTE: No auto-open of auth panel on load. User can freely browse the home page.

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const compareSet = useMemo(
    () => new Set(compare.map((c) => c.url)),
    [compare]
  );

  const pushHistory = (q) => {
    setHistory((prev) => {
      const next = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
      return next;
    });
  };

  const requireAuth = (isChatAction = false) => {
    if (user) return true;
    // First chat is free — allow it without login
    if (isChatAction && chatCount === 0) return true;
    // Second chat or any protected action → show auth
    setProfileOpen(true);
    return false;
  };

  const runQuery = async (payload) => {
    if (!requireAuth(true)) return;
    setLoading(true);
    setError(null);
    setData(null);
    setQuery(payload.query);
    try {
      const res = await recommend(payload);
      setData(res);
      pushHistory(payload.query);
      setChatCount((c) => c + 1);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onRefine = (instruction) => {
    if (!requireAuth()) return;
    if (!query) return;
    const refined = `${query}. Refine: ${instruction}`;
    runQuery({ query: refined, top_k: 6 });
  };

  const toggleCompare = (rec) => {
    if (!requireAuth()) return;
    setCompare((prev) => {
      const exists = prev.find((r) => r.url === rec.url);
      if (exists) return prev.filter((r) => r.url !== rec.url);
      return [...prev, rec].slice(0, 6);
    });
  };

  const clearCompare = () => setCompare([]);

  const openTrackify = (product = null) => {
    if (!requireAuth()) return;
    setTrackifyInitialProduct(product);
    setTrackifyOpen(true);
  };

  const startCopilotChat = (initialText) => {
    setCopilotInitialPrompt(initialText);
    setCopilotOpen(true);
  };

  const addToCompareFromTracked = (item) => {
    if (!requireAuth()) return;
    const mappedItem = {
      title: item.product_name,
      url: item.product_url,
      price: item.last_checked_price ? `$${item.last_checked_price}` : (item.current_price ? `$${item.current_price}` : "Price N/A"),
      image: item.image,
      source: item.source || "Web",
    };
    setCompare((prev) => {
      const exists = prev.find((r) => r.url === mappedItem.url);
      if (exists) return prev;
      return [...prev, mappedItem].slice(0, 6);
    });
    setDrawerOpen(true);
  };

  return (
    <div className="app-shell min-h-full">
      <TopBar
        providers={data?.providers || null}
        history={history}
        onPickHistory={(q) => {
          if (!requireAuth()) return;
          setQuery(q);
          runQuery({ query: q, top_k: 6 });
        }}
        compareCount={compare.length}
        onOpenCompare={() => {
          if (!requireAuth()) return;
          setDrawerOpen(true);
        }}
        onOpenTrackify={() => openTrackify(null)}
        trackifyCount={trackedItems.length}
        onOpenCopilot={() => setCopilotOpen(true)}
        copilotActive={copilotOpen}
        user={user}
        onOpenProfile={() => setProfileOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Hero />

        <div className="mt-2">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={runQuery}
            loading={loading}
            locked={false}
            onRequireAuth={() => requireAuth(false)}
          />
          <ExampleChips
            disabled={loading}
            onPick={(q) => {
              setQuery(q);
              runQuery({ query: q, top_k: 6 });
            }}
          />
        </div>

        <main className="mt-12 pb-24">
          <ConfigWarning health={health} />

          {/* Login-to-continue nudge — shows after first search if not logged in */}
          {!user && chatCount >= 1 && !loading && (
            <div
              className="mb-6 max-w-3xl rounded-2xl p-4 flex items-center justify-between gap-4"
              style={{
                background: "linear-gradient(135deg, rgb(var(--forest-500) / 0.08) 0%, rgb(var(--coral-500) / 0.08) 100%)",
                border: "1.5px solid rgb(var(--forest-300) / 0.25)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--coral-500)))" }}
                >
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-ink-800">
                    Login to continue searching
                  </div>
                  <div className="text-xs mt-0.5 text-ink-500">
                    You've used your free search. Sign in to unlock unlimited access.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setProfileOpen(true)}
                className="shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--forest-600)))",
                  boxShadow: "0 4px 12px rgb(var(--forest-500) / 0.25)",
                }}
              >
                Sign In / Sign Up
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <LoadingState />
              </motion.div>
            )}

            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="card border-coral-400/50 bg-coral-400/10 p-5 max-w-3xl flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-coral-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-ink-800">
                    Couldn't fetch recommendations
                  </div>
                  <div className="text-sm text-ink-600 mt-1">{error}</div>
                </div>
              </motion.div>
            )}

            {!loading && data && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <SummaryPanel
                  query={data.query}
                  summary={data.summary}
                  intent={data.intent}
                />
                {data.results?.length ? (
                  <>
                    <ResultsGrid
                      results={data.results}
                      compareSet={compareSet}
                      onToggleCompare={toggleCompare}
                      onOpenTrackify={openTrackify}
                    />
                    <RefineBar onRefine={onRefine} disabled={loading} />
                  </>
                ) : (
                  <div className="card p-6 text-center text-ink-500 max-w-3xl">
                    No live results found. Try rephrasing or relaxing the constraints.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="pb-12 border-t border-ink-200 pt-6 flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-400">
          <span className="font-display text-base text-ink-600">LuMen - Smart Shopping Reader</span>
          <span>Live web search · Real listings · Price tracking</span>
        </footer>
      </div>

      <CompareDrawer
        open={drawerOpen}
        items={compare}
        query={data?.query || query}
        health={health}
        onClose={() => setDrawerOpen(false)}
        onRemove={(it) => toggleCompare(it)}
        onClear={clearCompare}
        onStartCopilotChat={startCopilotChat}
        onOpenTrackify={openTrackify}
      />
      <AuthModal
        open={profileOpen}
        user={user}
        onClose={() => setProfileOpen(false)}
        onAuth={(nextUser) => {
          setUser(nextUser);
          setError(null);
          setProfileOpen(false);
        }}
        onLogout={() => {
          setUser(null);
          setData(null);
          setCompare([]);
          setTrackifyOpen(false);
          setTrackifyInitialProduct(null);
          setChatCount(0);
          setProfileOpen(false); // close panel, go back to home
        }}
      />
      <TrackifyPanel
        open={trackifyOpen}
        user={user}
        items={trackedItems}
        refreshTrackify={refreshTrackify}
        initialProduct={trackifyInitialProduct}
        onClose={() => setTrackifyOpen(false)}
        onAddToCompare={addToCompareFromTracked}
        onStartCopilotChat={startCopilotChat}
      />
      <CopilotPanel
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        compareList={compare}
        trackedList={trackedItems}
        onToggleCompare={toggleCompare}
        onOpenTrackify={openTrackify}
        initialPrompt={copilotInitialPrompt}
        setInitialPrompt={setCopilotInitialPrompt}
        searchContext={
          data
            ? {
                query: data.query,
                summary: data.summary,
                products: data.results?.map((r) => ({
                  title: r.title,
                  url: r.url,
                  price: r.price,
                  reason: r.reason,
                  source: r.source,
                  image: r.image,
                })),
              }
            : null
        }
      />
    </div>
  );
}
