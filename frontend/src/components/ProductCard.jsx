import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, BellRing, Check, ImageOff, Plus, Star } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

const BRANDS = [
  "ASUS", "Acer", "HP", "Dell", "Lenovo", "Apple", "Samsung", "Sony", "LG", "Realme",
  "OnePlus", "Xiaomi", "Redmi", "Poco", "Motorola", "Nokia", "iQOO", "Vivo", "Oppo",
  "Nothing", "Google", "Microsoft", "Razer", "MSI", "Gigabyte", "Bosch", "Philips",
  "Panasonic", "Whirlpool", "Godrej", "Bajaj", "Havells", "Dyson", "Bose", "JBL",
  "Sennheiser", "Jabra", "Anker", "Logitech", "Corsair", "HyperX", "SteelSeries",
  "Canon", "Nikon", "Fujifilm", "GoPro", "DJI", "Epson", "Brother", "Zebronics",
  "boat", "boAt", "Skullcandy", "Marshall", "Fitbit", "Garmin", "Fossil", "Noise",
  "Fire-Boltt", "Amazfit", "Reebok", "Adidas", "Nike", "Puma", "Casio", "Titan",
  "Victus", "Vivobook", "ZenBook", "IdeaPad", "ThinkPad", "Inspiron", "XPS", "Spectre",
];

function extractBrand(title) {
  if (!title) return null;

  for (const b of BRANDS) {
    if (new RegExp(`\\b${b}\\b`, "i").test(title)) {
      return b.toUpperCase() === b ? b : b.charAt(0).toUpperCase() + b.slice(1);
    }
  }

  return null;
}

function cleanTitle(title) {
  if (!title) return "";

  return String(title)
    .replace(/\s*[|\-–—]\s*(amazon|flipkart|myntra|snapdeal|croma|reliance digital|tata cliq|meesho|shopclues|paytm mall|jiomart|ebay|walmart|bestbuy|newegg|b&h|bhphotovideo|costco|target|notebookcheck|gsmarena|91mobiles|smartprix|gadgets360|techradar|tomsguide|pcmag|rtings|which|expert reviews|techspot|versus|gizbot|digit|indianexpress|hindustantimes|economictimes|livemint|yourstory|ndtv gadgets)[^|\-–—]*/gi, "")
    .replace(/\s*[|\-–—]\s*buy online.*$/gi, "")
    .replace(/\s*[|\-–—]\s*best price.*$/gi, "")
    .replace(/\s*[|\-–—]\s*\d+ ratings?.*$/gi, "")
    .replace(/\s*\(online\).*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parsePriceValue(price) {
  if (!price) return null;

  const match = String(price).replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/);
  return match ? Number(match[0]) : null;
}

// Main fix: supports all common image field names
function getProductImage(rec) {
  if (!rec) return "";

  const image =
    rec.image ||
    rec.imageUrl ||
    rec.image_url ||
    rec.thumbnail ||
    rec.thumbnailUrl ||
    rec.thumbnail_url ||
    rec.product_image ||
    rec.productImage ||
    rec.img ||
    rec.photo ||
    rec.picture ||
    rec.media?.image ||
    rec.media?.thumbnail ||
    rec.images?.[0] ||
    rec.imageLinks?.[0] ||
    rec.product?.image ||
    rec.product?.thumbnail ||
    "";

  if (!image) return "";

  if (typeof image === "string") return image;

  if (typeof image === "object") {
    return image.url || image.src || image.link || "";
  }

  return "";
}


function proxiedImageUrl(url) {
  if (!url) return "";
  if (/^(data|blob):/i.test(url) || url.startsWith("/")) return url;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function fallbackImageUrl(source) {
  if (!source) return "";
  const domain = String(source).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : "";
}
function ProductImage({ rec, displayTitle, brand, source, className = "" }) {
  const imageUrl = getProductImage(rec);
  const candidates = useMemo(
    () => [proxiedImageUrl(imageUrl), fallbackImageUrl(source)].filter(Boolean),
    [imageUrl, source]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const activeImage = candidates[candidateIndex] || "";

  useEffect(() => {
    setCandidateIndex(0);
  }, [imageUrl, source]);

  if (!activeImage) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-ink-50 text-ink-300 ${className}`}>
        <ImageOff className="w-8 h-8" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      key={activeImage}
      src={activeImage}
      alt={displayTitle || brand || source || "Product image"}
      loading="lazy"
      onError={() => setCandidateIndex((current) => current + 1)}
      className={`w-full h-full object-contain ${className}`}
    />
  );
}

function StarRating({ score }) {
  const raw = Math.round((score || 0) * 5 * 10) / 10;
  const stars = Math.min(5, Math.max(0, raw));
  const full = Math.floor(stars);
  const half = stars - full >= 0.4;
  const reviews = Math.round((score || 0) * 8400 + 120);

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            className={`w-3 h-3 ${
              i < full
                ? "fill-amber-400 text-amber-400"
                : i === full && half
                ? "fill-amber-200 text-amber-300"
                : "text-ink-300"
            }`}
          />
        ))}
      </div>

      <span className="text-[11px] text-blue-600 hover:underline cursor-pointer">
        {reviews.toLocaleString()}
      </span>
    </div>
  );
}

// ── Product Grid Card ──────────────────────────────────────────────────────────

export default function ProductCard({
  rec,
  index = 0,
  selected = false,
  onToggleCompare,
  onOpenTrackify,
}) {
  const {
    title,
    url,
    source,
    snippet,
    price,
    score,
    reason,
  } = rec || {};

  const currentPrice = useMemo(() => parsePriceValue(price), [price]);
  const displayTitle = useMemo(() => cleanTitle(title), [title]);
  const brand = useMemo(() => extractBrand(displayTitle), [displayTitle]);
  const imageUrl = getProductImage(rec);

  const productUrl = url || "#";

  return (
    <motion.article
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      className="card group/card flex flex-col overflow-hidden hover:shadow-lift transition-shadow"
    >
      {/* Image area */}
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative bg-white border-b border-ink-100 overflow-hidden"
        style={{ aspectRatio: "1 / 1" }}
      >
        <ProductImage
          rec={rec}
          displayTitle={displayTitle}
          brand={brand}
          source={source}
          className="p-4 transition-transform duration-500 group-hover/card:scale-[1.05]"
        />

        {/* Score badge */}
        <div className="absolute top-2 right-2">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-ink-800/80 text-white">
            {Math.round((score || 0) * 100)}% match
          </span>
        </div>

        {/* Action buttons */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.preventDefault();
              onOpenTrackify?.({
                title: displayTitle,
                url: productUrl,
                source: source || "Web",
                image: imageUrl,
                current_price: currentPrice,
              });
            }}
            title="Track price"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-white border border-ink-200 shadow text-ink-500 hover:text-forest-600"
          >
            <BellRing className="w-3.5 h-3.5" />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.preventDefault();
              onToggleCompare?.();
            }}
            title={selected ? "Remove from compare" : "Add to compare"}
            className={`w-7 h-7 rounded-full flex items-center justify-center border shadow transition ${
              selected
                ? "bg-forest-500 border-forest-500 text-white"
                : "bg-white border-ink-200 text-ink-500 hover:text-ink-900"
            }`}
          >
            {selected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </motion.button>
        </div>
      </a>

      {/* Details */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {brand && (
          <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">
            {brand}
          </span>
        )}

        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] leading-snug text-ink-800 hover:text-blue-700 line-clamp-2 font-medium"
        >
          {displayTitle || "Untitled Product"}
        </a>

        <StarRating score={score} />

        {price ? (
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-lg font-bold text-ink-900">{price}</span>
          </div>
        ) : (
          <span className="text-xs text-ink-400">Price not listed</span>
        )}

        {(reason || snippet) && (
          <p className="text-[11.5px] text-ink-500 line-clamp-2 leading-relaxed mt-0.5">
            {reason || snippet}
          </p>
        )}

        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-2 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
        >
          View on {source || "web"}
          <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
    </motion.article>
  );
}

// ── Pick Card ──────────────────────────────────────────────────────────────────

export function PickCard({
  rec,
  rank = 0,
  selected = false,
  onToggleCompare,
  onOpenTrackify,
}) {
  const {
    title,
    url,
    source,
    price,
    score,
    reason,
  } = rec || {};

  const currentPrice = useMemo(() => parsePriceValue(price), [price]);
  const displayTitle = useMemo(() => cleanTitle(title), [title]);
  const brand = useMemo(() => extractBrand(displayTitle), [displayTitle]);
  const imageUrl = getProductImage(rec);

  const productUrl = url || "#";

  const labels = ["Best Pick", "Runner Up", "3rd Place"];
  const accentColors = [
    "border-forest-400 bg-forest-50/60",
    "border-ink-300 bg-ink-100/50",
    "border-coral-400/50 bg-coral-400/5",
  ];

  return (
    <motion.article
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.07 }}
      className={`card flex gap-4 p-4 border-l-4 hover:shadow-lift transition-shadow ${
        accentColors[rank] || "border-ink-200"
      }`}
    >
      {/* Image */}
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 w-[100px] h-[100px] bg-white rounded-lg border border-ink-200 flex items-center justify-center overflow-hidden"
      >
        <ProductImage
          rec={rec}
          displayTitle={displayTitle}
          brand={brand}
          source={source}
          className="p-2"
        />
      </a>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-500">#{rank + 1}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-800 text-white">
            {labels[rank] || `#${rank + 1}`}
          </span>
        </div>

        {brand && (
          <span className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide">
            {brand}
          </span>
        )}

        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sm leading-snug text-ink-800 hover:text-blue-700 hover:underline line-clamp-2"
        >
          {displayTitle || "Untitled Product"}
        </a>

        <StarRating score={score} />

        {price && <span className="text-base font-bold text-ink-900">{price}</span>}

        {reason && (
          <p className="text-[12px] text-ink-600 leading-relaxed border-l-2 border-forest-400 pl-2 mt-0.5 italic">
            {reason}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex flex-col items-center gap-2 pt-1">
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-500 hover:text-blue-600 transition-colors"
        >
          <ArrowUpRight className="w-4 h-4" />
        </a>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() =>
            onOpenTrackify?.({
              title: displayTitle,
              url: productUrl,
              source: source || "Web",
              image: imageUrl,
              current_price: currentPrice,
            })
          }
          className="w-7 h-7 rounded-full border bg-white border-ink-200 flex items-center justify-center text-ink-500 hover:text-forest-600 transition"
        >
          <BellRing className="w-3.5 h-3.5" />
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => onToggleCompare?.()}
          className={`w-7 h-7 rounded-full border flex items-center justify-center transition ${
            selected
              ? "bg-forest-500 border-forest-500 text-white"
              : "bg-white border-ink-200 text-ink-500 hover:text-ink-900"
          }`}
        >
          {selected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </motion.button>
      </div>
    </motion.article>
  );
}