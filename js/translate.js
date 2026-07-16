/**
 * Full-page translation layer.
 * 1) Offline UI strings via prefs t()
 * 2) Free MyMemory API for remaining English text (cached in localStorage)
 */
import { getLang, t } from "./prefs.js";

const CACHE_KEY = "subsaverph_tx_cache_v2";
const MAX_Q = 420;

/** Map our lang ids → MyMemory/Google-style codes */
const LANG_MAP = {
  en: "en",
  fil: "tl", // Tagalog
  ceb: "ceb",
  es: "es",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ja: "ja",
  ko: "ko",
  vi: "vi",
  th: "th",
  id: "id",
  ms: "ms",
  hi: "hi",
  ar: "ar",
  fr: "fr",
  de: "de",
  pt: "pt",
  "pt-BR": "pt-BR",
  ru: "ru",
  it: "it",
  nl: "nl",
  tr: "tr",
  pl: "pl",
  uk: "uk",
  ro: "ro",
  sv: "sv",
  fi: "fi",
  no: "no",
  da: "da",
  el: "el",
  he: "he",
  bn: "bn",
  ta: "ta",
  ur: "ur",
  fa: "fa",
  sw: "sw",
};

let cache = loadCache();
let queue = Promise.resolve();
let translating = false;

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveCache() {
  try {
    // Cap cache size
    const keys = Object.keys(cache);
    if (keys.length > 2500) {
      keys.slice(0, keys.length - 2000).forEach((k) => delete cache[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}

export function mapLang(code) {
  return LANG_MAP[code] || code || "en";
}

function cacheKey(lang, text) {
  return `${lang}::${text}`;
}

function isMostlyEnglish(text) {
  // Skip pure numbers/currency/symbols
  if (!/[A-Za-z]{2,}/.test(text)) return false;
  // If already has substantial non-latin, leave it
  if (/[\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F]/.test(text)) {
    return false;
  }
  return true;
}

export async function translateText(text, lang = getLang()) {
  const raw = String(text || "").trim();
  if (!raw || lang === "en") return text;
  if (!isMostlyEnglish(raw)) return text;

  const key = cacheKey(lang, raw);
  if (cache[key]) return cache[key];

  const target = mapLang(lang);
  let translated = raw;

  try {
    // MyMemory free endpoint (CORS-friendly)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      raw.slice(0, MAX_Q)
    )}&langpair=en|${encodeURIComponent(target)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const out = data?.responseData?.translatedText;
      if (out && typeof out === "string" && out.trim()) {
        // Avoid "INVALID SOURCE LANGUAGE" style errors
        if (!/INVALID|QUERY LENGTH|MYMEMORY WARNING/i.test(out)) {
          translated = out;
        }
      }
    }
  } catch {
    /* keep English */
  }

  cache[key] = translated;
  saveCache();
  return translated;
}

function collectTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "CODE") {
        return NodeFilter.FILTER_REJECT;
      }
      if (p.closest("[data-no-i18n], .logo, .mono-box, .mono, [data-fx-label]")) {
        return NodeFilter.FILTER_REJECT;
      }
      const t = node.nodeValue;
      if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
      if (t.trim().length < 2) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

async function translateAttr(el, attr, lang) {
  const v = el.getAttribute(attr);
  if (!v || !v.trim()) return;
  if (el.hasAttribute(`data-i18n-${attr === "placeholder" ? "placeholder" : "aria"}`)) {
    // already handled by offline t() when present
  }
  if (!isMostlyEnglish(v)) return;
  const tx = await translateText(v, lang);
  if (tx && tx !== v) el.setAttribute(attr, tx);
}

/**
 * Translate visible English copy under root into current language.
 */
export async function translateDom(root = document.body, lang = getLang()) {
  if (!root || lang === "en") return { count: 0 };
  if (translating) {
    // chain
  }

  translating = true;
  document.documentElement.classList.add("is-translating");

  try {
    const nodes = collectTextNodes(root);
    // Unique strings first
    const unique = [...new Set(nodes.map((n) => n.nodeValue.trim()))];

    // Translate uniques with mild concurrency
    const map = new Map();
    const concurrency = 3;
    let i = 0;
    async function worker() {
      while (i < unique.length) {
        const idx = i++;
        const s = unique[idx];
        map.set(s, await translateText(s, lang));
        // small delay to reduce rate limits
        await new Promise((r) => setTimeout(r, 40));
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    nodes.forEach((node) => {
      const original = node.nodeValue;
      const trimmed = original.trim();
      const tx = map.get(trimmed);
      if (!tx || tx === trimmed) return;
      // preserve surrounding whitespace
      const lead = original.match(/^\s*/)?.[0] || "";
      const trail = original.match(/\s*$/)?.[0] || "";
      node.nodeValue = lead + tx + trail;
    });

    // attributes
    root.querySelectorAll("[placeholder]").forEach((el) => {
      /* fire and forget sequential later */
    });
    const attrs = [...root.querySelectorAll("[placeholder], [aria-label], [title]")];
    for (const el of attrs) {
      if (el.hasAttribute("placeholder")) await translateAttr(el, "placeholder", lang);
      if (el.hasAttribute("aria-label")) await translateAttr(el, "aria-label", lang);
      if (el.hasAttribute("title") && el.getAttribute("title").length < 80) {
        await translateAttr(el, "title", lang);
      }
    }

    document.documentElement.setAttribute("data-translated", lang);
    return { count: unique.length };
  } finally {
    translating = false;
    document.documentElement.classList.remove("is-translating");
  }
}

/** Queue translations so rapid language switches don't race */
export function queueTranslateDom(root, lang) {
  queue = queue.then(() => translateDom(root, lang)).catch(() => {});
  return queue;
}

export function clearTranslationCache() {
  cache = {};
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
