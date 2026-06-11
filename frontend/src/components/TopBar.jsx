import { AnimatePresence, motion } from "framer-motion";
import { BellRing, History, Layers, MessageCircle, Moon, Sun, UserCircle } from "lucide-react";

export default function TopBar({
  providers,
  history,
  onPickHistory,
  compareCount,
  onOpenCompare,
  onOpenTrackify,
  trackifyCount,
  onOpenCopilot,
  copilotActive,
  user,
  onOpenProfile,
  theme,
  onToggleTheme,
}) {
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.36, ease: "easeOut" }}
      className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 backdrop-blur bg-paper-50/80 border-b border-ink-200/60 shadow-soft"
    >
      <div className="max-w-6xl mx-auto flex items-center gap-4">
        <div className="flex items-center gap-2">
          <motion.img
            src="/lumen-logo.svg"
            alt="LuMen"
            className="w-10 h-10 rounded-xl border border-ink-200 bg-paper-50 shadow-soft"
            whileHover={{ rotate: -2, scale: 1.04 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          />
          <div className="leading-tight">
            <span className="font-display text-xl sm:text-2xl leading-none">
              <span className="text-ink-800">Lu</span><span className="text-forest-500">M</span><span className="text-coral-500">en</span>
            </span>
            <span className="hidden sm:block label">Smart Shopping Reader</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">


          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          <HistoryButton history={history} onPick={onPickHistory} />

          <button
            onClick={onOpenCopilot}
            className={`btn-ghost relative ${copilotActive ? "text-forest-600 dark:text-forest-400 bg-forest-50/50 dark:bg-forest-950/20 font-medium" : ""}`}
            title="AI Copilot"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Copilot</span>
          </button>

          <button
            onClick={onOpenCompare}
            disabled={!compareCount}
            className="btn-ghost relative disabled:opacity-40 disabled:cursor-not-allowed"
            title="Compare picks"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Compare</span>
            <AnimatePresence>
              {compareCount > 0 && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-coral-500 text-paper-50 text-[10px] font-medium"
                >
                  {compareCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={onOpenTrackify}
            className="btn-ghost relative"
            title="Trackify"
          >
            <BellRing className="w-4 h-4" />
            <span className="hidden sm:inline">Trackify</span>
            <AnimatePresence>
              {trackifyCount > 0 && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-forest-500 text-paper-50 text-[10px] font-medium"
                >
                  {trackifyCount}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <button
            onClick={onOpenProfile}
            className="btn-ghost"
            title={user ? "Open profile" : "Sign in"}
          >
            <UserCircle className="w-4 h-4" />
            <span className="hidden sm:inline">{user ? user.name : "Profile"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`theme-toggle ${isDark ? "is-dark" : ""}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
    >
      <span className="theme-toggle__thumb" />
      <span className={`theme-toggle__icon ${!isDark ? "is-active" : ""}`}>
        <Sun className="w-3.5 h-3.5" />
      </span>
      <span className={`theme-toggle__icon ${isDark ? "is-active" : ""}`}>
        <Moon className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

function HistoryButton({ history, onPick }) {
  if (!history?.length) return null;
  return (
    <details className="relative group">
      <summary className="btn-ghost list-none cursor-pointer select-none">
        <History className="w-4 h-4" />
        <span className="hidden sm:inline">Recent</span>
      </summary>
      <div className="absolute right-0 mt-2 w-80 card shadow-soft p-2 origin-top-right">
        <div className="px-3 py-2 label">Recent searches</div>
        <ul className="max-h-72 overflow-auto">
          {history.map((q) => (
            <li key={q}>
              <button
                onClick={() => onPick(q)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-ink-100 text-sm text-ink-700"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
