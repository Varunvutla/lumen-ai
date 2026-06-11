import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Bot, User, Loader2, ArrowUpRight, Search, Plus, Check, BellRing } from "lucide-react";
import { copilotChat } from "../api.js";

export default function CopilotPanel({
  open,
  onClose,
  searchContext,
  compareList = [],
  trackedList = [],
  onToggleCompare,
  onOpenTrackify,
  initialPrompt,
  setInitialPrompt,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Reset chat when search context changes (new search)
  useEffect(() => {
    const products = searchContext?.products || [];
    if (searchContext?.query && products.length > 0) {
      // Build a product-oriented welcome naming the actual results
      const top = products.slice(0, 3);
      const lines = top
        .map((p, i) => `${i + 1}. **${p.title}**${p.price ? ` — ${p.price}` : ""}`)
        .join("\n");
      const more = products.length > 3 ? `\n…and ${products.length - 3} more.` : "";
      setMessages([
        {
          role: "assistant",
          content: `Here's what I found for **${searchContext.query}**:\n\n${lines}${more}\n\nAsk me anything about these — specs, comparisons, or alternatives.`,
          id: "welcome",
        },
      ]);
      setError(null);
    } else if (searchContext?.query) {
      setMessages([
        {
          role: "assistant",
          content: `I see you searched for **${searchContext.query}**, but no products came back. Tell me more about what you need and I'll help you find it.`,
          id: "welcome",
        },
      ]);
      setError(null);
    } else {
      setMessages([
        {
          role: "assistant",
          content: "Hi! I'm your LuMen shopping assistant. Tell me what you're looking for and I'll help you find the best options.",
          id: "welcome-empty",
        },
      ]);
    }
  }, [searchContext?.query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    if (!text || loading) return;
    setError(null);

    const userMsg = { role: "user", content: text, id: Date.now() };
    const nextMessages = [...messages.filter((m) => m.id !== "welcome" && m.id !== "welcome-empty"), userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));
      const res = await copilotChat({
        messages: apiMessages,
        context: searchContext || null,
        compare_items: compareList.map((it) => ({
          title: it.title,
          url: it.url,
          price: it.price,
          source: it.source,
        })),
        tracked_items: trackedList.map((it) => ({
          id: it.id,
          product_name: it.product_name,
          product_url: it.product_url,
          current_price: it.last_checked_price,
          target_price: it.target_price,
          source: it.source,
        })),
      });

      const assistantMsg = {
        role: "assistant",
        content: res.reply,
        id: Date.now() + 1,
        searchQuery: res.search_query,
        newProducts: res.new_products,
        action: res.action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  };

  // Handle initial preloaded prompt from other components
  useEffect(() => {
    if (open && initialPrompt) {
      const promptText = initialPrompt;
      setInitialPrompt(null);
      setTimeout(() => {
        sendMessage(promptText);
      }, 300);
    }
  }, [open, initialPrompt]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="copilot-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 modal-overlay backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            key="copilot-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 h-full z-50 w-full sm:w-[420px] flex flex-col border-l border-ink-200/80 shadow-lift bg-paper-50"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-paper-50/95 backdrop-blur border-b border-ink-200 px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--coral-500)))" }}
                >
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-2xl text-ink-800">Copilot</div>
                  <div className="label truncate">
                    {searchContext?.query ? `Context: "${searchContext.query}"` : "AI Shopping Assistant"}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="btn-ghost p-1.5" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  compareList={compareList}
                  trackedList={trackedList}
                  onToggleCompare={onToggleCompare}
                  onOpenTrackify={onOpenTrackify}
                  searchContext={searchContext}
                />
              ))}

              {loading && (
                <div className="flex gap-2 items-start">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--coral-500)))" }}
                  >
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="card px-3 py-2 flex items-center gap-2 text-sm text-ink-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Thinking…
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-coral-600 text-center px-2">{error}</div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Suggested starters (when no real messages yet) */}
            {messages.length <= 1 && searchContext?.products?.length > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
                {buildStarters(searchContext.products).map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-forest-200 text-forest-600 hover:bg-forest-50/50 transition-colors bg-paper-50/50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-ink-200 shrink-0 flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about battery life, gaming, price…"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-ink-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-forest-500/40 transition-shadow"
                style={{ maxHeight: 100 }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--coral-500)))" }}
                title="Send"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function MessageBubble({
  msg,
  compareList = [],
  trackedList = [],
  onToggleCompare,
  onOpenTrackify,
  searchContext,
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 items-start ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          isUser ? "bg-ink-200" : ""
        }`}
        style={!isUser ? { background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--coral-500)))" } : {}}
      >
        {isUser ? <User className="w-3.5 h-3.5 text-ink-600" /> : <Bot className="w-3.5 h-3.5 text-white" />}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "text-white rounded-tr-sm"
              : "card rounded-tl-sm text-ink-800"
          }`}
          style={isUser ? { background: "linear-gradient(135deg, rgb(var(--user-bubble-start)), rgb(var(--user-bubble-end)))" } : {}}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
        />

        {/* Show searched indicator */}
        {msg.action === "searched" && msg.searchQuery && (
          <div className="flex items-center gap-1 text-[10px] text-ink-400">
            <Search className="w-3 h-3" />
            Searched: {msg.searchQuery}
          </div>
        )}

        {/* New products found */}
        {msg.newProducts?.length > 0 && (
          <div className="w-full space-y-1.5 mt-1">
            {msg.newProducts.slice(0, 3).map((p, i) => {
              const isCompared = compareList.some((c) => c.url === p.url);
              const isTracked = trackedList.some((t) => t.product_url === p.url);

              const handleCompareClick = (e) => {
                e.preventDefault();
                onToggleCompare({
                  title: p.title,
                  url: p.url,
                  price: p.price || null,
                  image: p.image || null,
                  source: p.source || "Web",
                });
              };

              const handleTrackClick = (e) => {
                e.preventDefault();
                const fullProduct = searchContext?.products?.find((item) => item.url === p.url) || p;
                onOpenTrackify({
                  title: fullProduct.title,
                  url: fullProduct.url,
                  source: fullProduct.source || "Web",
                  image: fullProduct.image || null,
                  current_price: fullProduct.price || null,
                });
              };

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 card px-3 py-1.5 hover:bg-ink-100 transition-colors group relative"
                >
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-xs text-ink-700 hover:text-forest-600 dark:hover:text-forest-400 truncate mr-1 font-medium"
                  >
                    {p.title}
                  </a>
                  
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={handleTrackClick}
                      title={isTracked ? "Price alerts active" : "Track price"}
                      className={`p-1 rounded-md transition ${
                        isTracked ? "text-forest-600 bg-forest-100" : "text-ink-400 hover:text-forest-600 hover:bg-ink-200"
                      }`}
                    >
                      <BellRing className="w-3 h-3" />
                    </button>
                    <button
                      onClick={handleCompareClick}
                      title={isCompared ? "Remove from Compare" : "Add to Compare"}
                      className={`p-1 rounded-md transition ${
                        isCompared ? "text-coral-600 bg-coral-500/10" : "text-ink-400 hover:text-coral-500 hover:bg-ink-200"
                      }`}
                    >
                      {isCompared ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    </button>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-200 transition"
                      title="Open Link"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Short product name for chips: first 3-4 words of the title
function shortName(title) {
  if (!title) return "";
  return title.split(/\s+/).slice(0, 3).join(" ");
}

// Build suggestion chips from the actual products in context
function buildStarters(products) {
  const chips = [];
  if (products.length >= 2) {
    chips.push(`Compare ${shortName(products[0].title)} vs ${shortName(products[1].title)}`);
  }
  if (products[0]) {
    chips.push(`Tell me more about ${shortName(products[0].title)}`);
  }
  chips.push("Which is the best value?");
  return chips.slice(0, 3);
}

// Minimal markdown renderer: bold, inline code
function renderMarkdown(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code class='font-mono text-[11px] bg-ink-100 px-1 rounded'>$1</code>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}
