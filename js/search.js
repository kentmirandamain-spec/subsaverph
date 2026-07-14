/**
 * SubSaverPH product search engine
 * Ranked full-text style search across catalog fields
 */

function tokens(q) {
  return String(q || "")
    .toLowerCase()
    .trim()
    .split(/[\s,+/|]+/)
    .filter(Boolean);
}

function haystack(deal) {
  const parts = [
    deal.name,
    deal.brand,
    deal.category,
    deal.tagline,
    deal.description,
    deal.monogram,
    deal.badge,
    deal.duration,
    deal.period,
    deal.stock,
    deal.delivery,
    deal.finePrint,
    ...(Array.isArray(deal.includes) ? deal.includes : []),
    String(deal.price ?? ""),
    deal.priceBase || "",
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Score a deal against query (higher = better). 0 = no match.
 */
export function scoreDeal(deal, query) {
  const toks = tokens(query);
  if (!toks.length) return 0;

  const name = String(deal.name || "").toLowerCase();
  const brand = String(deal.brand || "").toLowerCase();
  const category = String(deal.category || "").toLowerCase();
  const monogram = String(deal.monogram || "").toLowerCase();
  const tagline = String(deal.tagline || "").toLowerCase();
  const full = haystack(deal);

  let score = 0;
  for (const t of toks) {
    let hit = false;
    if (name === t) {
      score += 100;
      hit = true;
    } else if (name.startsWith(t)) {
      score += 70;
      hit = true;
    } else if (name.includes(t)) {
      score += 50;
      hit = true;
    }

    if (brand === t || brand.includes(t)) {
      score += 40;
      hit = true;
    }
    if (monogram === t) {
      score += 45;
      hit = true;
    }
    if (category.startsWith(t) || category.includes(t)) {
      score += 25;
      hit = true;
    }
    if (tagline.includes(t)) {
      score += 15;
      hit = true;
    }
    if (full.includes(t)) {
      score += 8;
      hit = true;
    }

    // aliases
    const aliases = {
      grok: ["xai", "supergrok", "sg"],
      supergrok: ["grok", "xai"],
      netflix: ["nf", "streaming"],
      youtube: ["yt", "music"],
      canva: ["cv", "design"],
      capcut: ["cc", "video", "edit"],
      ai: ["xai", "grok", "supergrok"],
    };
    for (const [key, list] of Object.entries(aliases)) {
      if (t === key || list.includes(t)) {
        if (full.includes(key) || list.some((a) => full.includes(a))) {
          score += 20;
          hit = true;
        }
      }
    }

    if (!hit) return 0; // require all tokens to match somewhere
  }

  // prefer active / higher discount slightly
  if (deal.badge) score += 3;
  if (deal.original > deal.price) {
    score += Math.min(10, Math.round((1 - deal.price / deal.original) * 10));
  }
  return score;
}

export function searchDeals(deals, query, { limit = 50 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  return [...deals]
    .map((d) => ({ deal: d, score: scoreDeal(d, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.deal.name.localeCompare(b.deal.name))
    .slice(0, limit)
    .map((x) => x.deal);
}

export function suggestDeals(deals, query, limit = 6) {
  return searchDeals(deals, query, { limit });
}

export function popularQueries(deals) {
  const brands = [...new Set(deals.map((d) => d.brand).filter(Boolean))];
  const cats = [...new Set(deals.map((d) => d.category).filter(Boolean))];
  const names = deals.slice(0, 4).map((d) => d.name.split(" ")[0]);
  const base = ["SuperGrok", "Netflix", "Canva", "CapCut", "YouTube", "AI", "Streaming"];
  return [...new Set([...base, ...brands, ...cats, ...names])].slice(0, 10);
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
