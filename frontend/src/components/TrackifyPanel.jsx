import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCircle2, ImageOff, Link, Loader2, Mail, RefreshCw, Target, Trash2, X, Plus, MessageSquare } from "lucide-react";

import { addTrackify, listTrackify, previewTrackify, removeTrackify, updateTrackifyTarget } from "../api.js";

function money(value) {
  if (value === null || value === undefined) return "Unavailable";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function statusFor(item) {
  if (item.last_checked_price !== null && item.last_checked_price <= item.target_price) {
    return { label: "Price Dropped", className: "text-forest-700 bg-forest-100 border-forest-200" };
  }
  return { label: "Tracking", className: "text-coral-700 bg-coral-400/10 border-coral-400/40" };
}

export default function TrackifyPanel({
  open,
  user,
  items = [],
  refreshTrackify,
  initialProduct,
  onClose,
  onAddToCompare,
  onStartCopilotChat,
}) {
  const [error, setError] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [currentPrice, setCurrentPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [editingTarget, setEditingTarget] = useState({});

  const stats = useMemo(() => {
    const dropped = items.filter((item) => item.last_checked_price !== null && item.last_checked_price <= item.target_price).length;
    return { total: items.length, tracking: items.length - dropped, dropped };
  }, [items]);

  useEffect(() => {
    if (!open || !user) return;
    setAlertEmail((current) => current || user.email || "");
    refreshTrackify().catch((err) => setError(err.message));
  }, [open, user?.id]);

  useEffect(() => {
    if (!open || !initialProduct?.url) return;
    async function loadInitialProduct() {
      setProductUrl(initialProduct.url);
      setPreview(null);
      setCurrentPrice("");
      setTargetPrice("");
      setAlertEmail(user?.email || "");
      setError("");
      setPreviewLoading(true);
      try {
        const data = await previewTrackify(initialProduct.url);
        if (data.current_price === null || data.current_price === undefined) {
          throw new Error("Current price is unavailable for this product.");
        }
        setPreview(data);
        setCurrentPrice(String(data.current_price ?? ""));
      } catch (err) {
        const fallbackPrice = initialProduct.current_price || "";
        setPreview({
          product_name: initialProduct.title,
          product_url: initialProduct.url,
          source: initialProduct.source || "Web",
          current_price: fallbackPrice || null,
          image: initialProduct.image || null,
        });
        setCurrentPrice(String(fallbackPrice));
        setError(err.message || "Could not read this product link.");
      } finally {
        setPreviewLoading(false);
      }
    }
    loadInitialProduct();
  }, [open, initialProduct?.url]);

  async function fetchPreview(e) {
    e?.preventDefault?.();
    setError("");
    setPreview(null);
    setCurrentPrice("");
    setTargetPrice("");
    setPreviewLoading(true);
    try {
      const parsed = new URL(productUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Paste a valid http or https product link.");
      }
      const data = await previewTrackify(productUrl.trim());
      if (data.current_price === null || data.current_price === undefined) {
        throw new Error("Current price is unavailable for this product.");
      }
      setPreview(data);
      setCurrentPrice(String(data.current_price ?? ""));
    } catch (err) {
      setError(err.message || "Could not read this product link.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function addProduct() {
    if (!preview) return;
    const numericTarget = Number(targetPrice);
    const numericCurrent = Number(currentPrice);
    const email = alertEmail.trim().toLowerCase();
    if (!Number.isFinite(numericCurrent) || numericCurrent <= 0) {
      setError("Enter a valid current price.");
      return;
    }
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError("Enter a valid target price.");
      return;
    }
    if (numericTarget > numericCurrent) {
      setError("Target price must be less than or equal to current price.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter the email address where the alert should be sent.");
      return;
    }
    setAddLoading(true);
    setError("");
    try {
      await addTrackify({
        product_url: preview.product_url,
        product_name: preview.product_name,
        current_price: numericCurrent,
        image: preview.image,
        source: preview.source,
        target_price: numericTarget,
        user_email: email,
      });
      setProductUrl("");
      setPreview(null);
      setCurrentPrice("");
      setTargetPrice("");
      setAlertEmail(user.email || "");
      await refreshTrackify();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddLoading(false);
    }
  }

  async function saveTarget(item) {
    const value = Number(editingTarget[item.id]);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid target price.");
      return;
    }
    if (item.last_checked_price !== null && value > item.last_checked_price) {
      setError("Target price must be less than or equal to current price.");
      return;
    }
    await updateTrackifyTarget(item.id, value);
    setEditingTarget((prev) => ({ ...prev, [item.id]: "" }));
    await refreshTrackify();
  }

  async function removeItem(id) {
    await removeTrackify(id);
    await refreshTrackify();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 modal-overlay backdrop-blur-[4px] flex justify-end"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-4xl bg-paper-50 shadow-lift border-l border-ink-200 overflow-auto"
      >
        <div className="sticky top-0 z-10 bg-paper-50/95 backdrop-blur border-b border-ink-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-forest-500 text-paper-50 flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </span>
            <div>
              <div className="font-display text-2xl text-ink-800">Trackify</div>
              <div className="label">Product price tracking</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section className="card p-5 shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <Link className="w-5 h-5 text-forest-600" />
              <div>
                <div className="font-display text-2xl text-ink-800">Add product</div>
                <div className="text-sm text-ink-500">Paste a product URL or use Trackify from a recommendation card.</div>
              </div>
            </div>
            <form onSubmit={fetchPreview} className="flex flex-col sm:flex-row gap-3">
              <input
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="Paste product link here"
                className="flex-1 rounded-2xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100"
              />
              <button className="btn-primary" disabled={previewLoading}>
                {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Fetch
              </button>
            </form>
            {error && <div className="mt-4 rounded-xl border border-coral-400/50 bg-coral-400/10 p-3 text-sm">{error}</div>}
            {preview && (
              <div className="mt-5 rounded-2xl border border-ink-200 bg-ink-100/40 p-4 flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-32 aspect-square rounded-xl bg-paper-50 border border-ink-200 overflow-hidden flex items-center justify-center">
                  {preview.image ? <img src={preview.image} alt={preview.product_name} className="w-full h-full object-cover" /> : <ImageOff className="w-7 h-7 text-ink-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="label">{preview.source || "Web"}</div>
                  <div className="mt-1 font-medium text-ink-800 line-clamp-2">{preview.product_name}</div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="label">Current price</span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={currentPrice}
                        onChange={(e) => setCurrentPrice(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-3 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100"
                      />
                      <span className="mt-1 block text-[11px] text-ink-400">Fetched automatically. You can edit if needed.</span>
                    </label>
                    <label className="block">
                      <span className="label">Target price</span>
                      <input type="number" min="1" step="0.01" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-3 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label">Alert email</span>
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-ink-200 bg-paper-50 px-3 py-3 focus-within:border-forest-400 focus-within:ring-4 focus-within:ring-forest-100">
                        <Mail className="w-4 h-4 text-forest-600 shrink-0" />
                        <input
                          type="email"
                          value={alertEmail}
                          onChange={(e) => setAlertEmail(e.target.value)}
                          placeholder="Enter email to receive price alert"
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </div>
                    </label>
                  </div>
                  <button onClick={addProduct} type="button" className="mt-4 btn-primary" disabled={addLoading}>
                    {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Track product
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-3 gap-3">
            {[
              ["Tracked", stats.total],
              ["Tracking", stats.tracking],
              ["Dropped", stats.dropped],
            ].map(([label, value]) => (
              <div key={label} className="card p-4">
                <div className="label">{label}</div>
                <div className="mt-1 font-display text-3xl text-ink-800">{value}</div>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="label">Tracked products</div>
              <button onClick={refreshTrackify} className="btn-ghost">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
            {!items.length ? (
              <div className="card p-5 text-sm text-ink-500">No tracked products yet.</div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const status = statusFor(item);
                  return (
                    <article key={item.id} className="card p-4">
                      <div className="flex gap-4">
                        <div className="w-20 h-20 rounded-xl bg-ink-100 border border-ink-200 overflow-hidden flex items-center justify-center shrink-0">
                          {item.image ? <img src={item.image} alt={item.product_name} className="w-full h-full object-cover" /> : <ImageOff className="w-6 h-6 text-ink-300" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="label">{item.source || "Web"}</div>
                              <a href={item.product_url} target="_blank" rel="noreferrer" className="font-medium text-ink-800 hover:text-forest-600 line-clamp-2">
                                {item.product_name}
                              </a>
                            </div>
                            <button onClick={() => removeItem(item.id)} className="btn-ghost" title="Remove">
                              <Trash2 className="w-4 h-4 text-coral-600" />
                            </button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-ink-500">
                            <span>Current: {money(item.last_checked_price)}</span>
                            <span>Target: {money(item.target_price)}</span>
                            <span>Alert: {item.user_email}</span>
                            <span>Alerts: {item.notification_count || 0}</span>
                            <span className={`rounded-full border px-2 py-0.5 ${status.className}`}>{status.label}</span>
                          </div>
                          <div className="mt-3 flex flex-col sm:flex-row gap-2">
                            <input type="number" min="1" step="0.01" value={editingTarget[item.id] ?? ""} onChange={(e) => setEditingTarget({ ...editingTarget, [item.id]: e.target.value })} placeholder="Update target price" className="flex-1 rounded-xl border border-ink-200 bg-paper-50 px-3 py-2 text-sm outline-none focus:border-forest-400" />
                            <button onClick={() => saveTarget(item)} className="btn-ghost">
                              <Target className="w-4 h-4 text-forest-600" />
                              Update target
                            </button>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-2 items-center">
                            <button
                              onClick={() => {
                                onAddToCompare(item);
                                onClose();
                              }}
                              className="btn-ghost py-1 px-2.5 text-xs text-coral-600 dark:text-coral-400 border border-coral-200 dark:border-coral-800/40 rounded-lg hover:bg-coral-50/50 dark:hover:bg-coral-950/20 flex items-center gap-1"
                              title="Compare this product side by side"
                            >
                              <Plus className="w-3 h-3" />
                              Compare
                            </button>
                            <button
                              onClick={() => {
                                onStartCopilotChat(`What is your analysis of this tracked product: "${item.product_name}"? Do you think the current price of $${item.last_checked_price ?? item.current_price ?? 'N/A'} is a good deal compared to my target price of $${item.target_price}?`);
                                onClose();
                              }}
                              className="btn-ghost py-1 px-2.5 text-xs text-forest-600 dark:text-forest-400 border border-forest-200 dark:border-forest-800/40 rounded-lg hover:bg-forest-50/50 dark:hover:bg-forest-950/20 flex items-center gap-1"
                              title="Discuss this product with Copilot"
                            >
                              <MessageSquare className="w-3 h-3" />
                              Ask Copilot
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
