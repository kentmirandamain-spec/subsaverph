/**
 * SubSaverPH product search
 * Strict product matching — only show products that actually match the query
 */

function tokens(q) {
  return String(q || "")
    .toLowerCase()
    .trim()
    .split(/[\s,+/|]+/)
    .filter(Boolean);
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Brand aliases → brand key used in catalog */
const BRAND_ALIASES = {
  grok: "xai",
  supergrok: "xai",
  xai: "xai",
  sg: "xai",
  canva: "canva",
  cv: "canva",
  capcut: "capcut",
  cc: "capcut",
  netflix: "netflix",
  nf: "netflix",
  youtube: "youtube",
  yt: "youtube",
  youtubepremium: "youtube",
};

/**
 * Score a deal against query.
 * Only product identity fields count (name, brand, monogram, category, tagline).
 * Description-only hits do NOT match — so search only returns real product matches.
 */
export function scoreDeal(deal, query) {
  const raw = String(query || "").trim();
  if (!raw) return 0;

  const q = norm(raw);
  const toks = tokens(raw);
  if (!toks.length) return 0;

  const name = norm(deal.name);
  const brand = norm(deal.brand);
  const monogram = norm(deal.monogram);
  const category = norm(deal.category);
  const tagline = norm(deal.tagline);
  const id = norm(deal.id).replace(/-/g, " ");

  // Exact product name
  if (name === q) return 1000;

  // Full query contained in product name (e.g. "supergrok 7" → SuperGrok 7 Days)
  if (name.includes(q) && q.length >= 2) return 800 + Math.min(50, q.length);

  // Product name starts with query
  if (name.startsWith(q) && q.length >= 2) return 700;

  // All tokens appear in product name
  if (toks.every((t) => name.includes(t))) {
    return 600 + toks.length * 10;
  }

  // Brand / monogram / id match (e.g. "Netflix", "SG", "canva")
  let brandHit = false;
  for (const t of toks) {
    const alias = BRAND_ALIASES[t] || BRAND_ALIASES[t.replace(/\s/g, "")];
    if (brand === t || brand.includes(t) || monogram === t || id.includes(t)) {
      brandHit = true;
    }
    if (alias && (brand === alias || brand.includes(alias) || id.includes(alias))) {
      brandHit = true;
    }
  }
  if (brandHit && toks.length === 1) {
    // single brand/monogram token → all products of that brand
    return 400;
  }
  if (brandHit && toks.every((t) => {
    const alias = BRAND_ALIASES[t];
    return (
      name.includes(t) ||
      brand.includes(t) ||
      monogram === t ||
      id.includes(t) ||
      (alias && (brand.includes(alias) || name.includes(alias) || id.includes(alias)))
    );
  })) {
    return 350;
  }

  // Category only (e.g. "Streaming", "AI", "Design")
  if (toks.length === 1 && (category === toks[0] || category.startsWith(toks[0]))) {
    return 250;
  }

  // Tagline strong hit only if every token also lands on name/brand/tagline
  if (toks.every((t) => name.includes(t) || brand.includes(t) || monogram === t || tagline.includes(t))) {
    // require at least one name or brand hit so random tagline words alone don't flood results
    const hasCore = toks.some((t) => name.includes(t) || brand.includes(t) || monogram === t);
    if (hasCore) return 200;
  }

  return 0;
}

/**
 * Search deals — only matching products.
 * Prefer tight name matches: if any product strongly matches by name,
 * drop weak brand/category-only hits so you only see the product you searched.
 */
export function searchDeals(deals, query, { limit = 50 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const ranked = [...deals]
    .map((d) => ({ deal: d, score: scoreDeal(d, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.deal.name.localeCompare(b.deal.name));

  if (!ranked.length) return [];

  const top = ranked[0].score;

  // Exact / near-exact product name → only those products
  if (top >= 700) {
    return ranked
      .filter((x) => x.score >= 700)
      .slice(0, limit)
      .map((x) => x.deal);
  }

  // Name-token matches → only name matches (not whole brand catalog)
  if (top >= 600) {
    return ranked
      .filter((x) => x.score >= 600)
      .slice(0, limit)
      .map((x) => x.deal);
  }

  // Brand / monogram / category → all matches at that tier
  return ranked.slice(0, limit).map((x) => x.deal);
}

export function suggestDeals(deals, query, limit = 6) {
  return searchDeals(deals, query, { limit });
}

/** Friendly label for brand chips in the search bar (one per brand, not each plan) */
function brandSearchLabel(brand) {
  if (!brand) return "";
  if (brand === "xAI" || /^xai$/i.test(brand)) return "SuperGrok";
  return brand;
}

/**
 * Popular search chips under the search bar.
 * One chip per brand (e.g. SuperGrok) — not every plan name.
 */
export function popularQueries(deals) {
  const brandLabels = [...new Set(
    (deals || []).map((d) => brandSearchLabel(d.brand)).filter(Boolean)
  )];
  // Preferred order; only include brands that exist in catalog
  const preferred = ["SuperGrok", "Netflix", "Canva", "CapCut", "YouTube"];
  const ordered = [
    ...preferred.filter((p) => brandLabels.some((b) => b.toLowerCase() === p.toLowerCase())),
    ...brandLabels.filter((b) => !preferred.some((p) => p.toLowerCase() === b.toLowerCase())),
  ];
  return [...new Set(ordered)].slice(0, 8);
}

export function highlightMatch(text, query) {
  const raw = String(text || "");
  const toks = tokens(query).filter((t) => t.length > 1);
  if (!toks.length) return escape(raw);
  let out = escape(raw);
  for (const t of toks) {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
