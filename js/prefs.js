/**
 * User preferences: language + appearance theme (localStorage).
 */
const THEME_KEY = "subsaverph_theme";
const LANG_KEY = "subsaverph_lang";

export const THEMES = [
  { id: "dark", labelKey: "theme_dark" },
  { id: "light", labelKey: "theme_light" },
  { id: "system", labelKey: "theme_system" },
];

export const LANGUAGES = [
  { id: "en", label: "English", native: "English" },
  { id: "fil", label: "Filipino", native: "Filipino" },
];

const STRINGS = {
  en: {
    nav_home: "Home",
    nav_deals: "Deals",
    nav_search: "Search",
    nav_mission: "Mission",
    nav_checkout: "Checkout",
    nav_pay: "Pay",
    nav_cart: "Cart",
    nav_menu: "Menu",
    nav_prefs: "Settings",
    prefs_title: "Preferences",
    prefs_language: "Language",
    prefs_theme: "Appearance",
    prefs_theme_hint: "Choose light, dark, or match your device.",
    prefs_lang_hint: "UI language for menus and buttons.",
    theme_dark: "Dark",
    theme_light: "Light",
    theme_system: "System",
    search_placeholder: "Search SuperGrok, Netflix…",
    search_aria: "Search products",
    cart_title: "Cart",
    cart_close: "Close",
    cart_subtotal: "Subtotal",
    cart_save: "You save",
    cart_total: "Total",
    cart_checkout: "Checkout",
    cart_empty: "Cart empty",
    cart_find: "Find a plan",
    footer_shop: "Shop",
    footer_company: "Company",
    footer_legal: "Legal",
    footer_about_company: "About the company",
    footer_about: "About",
    footer_terms: "Terms of Use",
    footer_privacy: "Privacy Policy",
    footer_how: "How it works",
    footer_all_deals: "All deals",
    footer_contact: "Contact support",
    cta_search: "Open search",
    cta_browse: "Browse deals",
    eyebrow_platforms: "Platforms",
    eyebrow_catalog: "Catalog",
    view_all: "View all",
    page_deals: "All deals",
    page_search: "Search",
    page_results: "Results",
    page_how: "How it works",
    toast_theme: "Theme updated",
    toast_lang: "Language updated",
    toast_pay: "Pay in",
    meta_plans: "Active plans",
    meta_platforms: "Platforms",
    meta_currencies: "Currencies",
    currency_search: "Search currency (PHP, USD, euro…)",
  },
  fil: {
    nav_home: "Home",
    nav_deals: "Mga deal",
    nav_search: "Maghanap",
    nav_mission: "Misyon",
    nav_checkout: "Checkout",
    nav_pay: "Bayad",
    nav_cart: "Cart",
    nav_menu: "Menu",
    nav_prefs: "Mga setting",
    prefs_title: "Mga kagustuhan",
    prefs_language: "Wika",
    prefs_theme: "Hitsura",
    prefs_theme_hint: "Pumili ng light, dark, o ayon sa device.",
    prefs_lang_hint: "Wika ng menu at mga button.",
    theme_dark: "Madilim",
    theme_light: "Maliwanag",
    theme_system: "System",
    search_placeholder: "Maghanap ng SuperGrok, Netflix…",
    search_aria: "Maghanap ng produkto",
    cart_title: "Cart",
    cart_close: "Isara",
    cart_subtotal: "Subtotal",
    cart_save: "Natipid mo",
    cart_total: "Kabuuan",
    cart_checkout: "Checkout",
    cart_empty: "Walang laman ang cart",
    cart_find: "Maghanap ng plan",
    footer_shop: "Tindahan",
    footer_company: "Kumpanya",
    footer_legal: "Legal",
    footer_about_company: "Tungkol sa kumpanya",
    footer_about: "Tungkol",
    footer_terms: "Mga tuntunin",
    footer_privacy: "Privacy",
    footer_how: "Paano gumagana",
    footer_all_deals: "Lahat ng deal",
    footer_contact: "Makipag-ugnayan",
    cta_search: "Buksan ang search",
    cta_browse: "Tingnan ang deals",
    eyebrow_platforms: "Mga platform",
    eyebrow_catalog: "Katalogo",
    view_all: "Tingnan lahat",
    page_deals: "Lahat ng deal",
    page_search: "Maghanap",
    page_results: "Mga resulta",
    page_how: "Paano gumagana",
    toast_theme: "Na-update ang theme",
    toast_lang: "Na-update ang wika",
    toast_pay: "Magbayad sa",
    meta_plans: "Mga plan",
    meta_platforms: "Platform",
    meta_currencies: "Currency",
    currency_search: "Maghanap ng currency (PHP, USD…)",
  },
};

export function getThemePref() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function getLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "fil" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export function resolveTheme(pref = getThemePref()) {
  if (pref === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  }
  return pref === "light" ? "light" : "dark";
}

export function applyTheme(pref = getThemePref()) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-pref", pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#f4f4f5" : "#000000");
  // Logo mark background follows theme
  document.querySelectorAll("img.logo-mark").forEach((img) => {
    img.style.background = resolved === "light" ? "#fff" : "#000";
  });
  return resolved;
}

export function applyLang(lang = getLang()) {
  const code = lang === "fil" ? "fil" : "en";
  document.documentElement.lang = code === "fil" ? "fil" : "en";
  document.documentElement.setAttribute("data-lang", code);
  return code;
}

export function setThemePref(pref) {
  const v = pref === "light" || pref === "system" ? pref : "dark";
  try {
    localStorage.setItem(THEME_KEY, v);
  } catch {
    /* ignore */
  }
  applyTheme(v);
  window.dispatchEvent(new CustomEvent("prefs:theme", { detail: v }));
  return v;
}

export function setLang(lang) {
  const v = lang === "fil" ? "fil" : "en";
  try {
    localStorage.setItem(LANG_KEY, v);
  } catch {
    /* ignore */
  }
  applyLang(v);
  window.dispatchEvent(new CustomEvent("prefs:lang", { detail: v }));
  return v;
}

export function t(key, lang = getLang()) {
  const pack = STRINGS[lang] || STRINGS.en;
  return pack[key] || STRINGS.en[key] || key;
}

export function initPrefs() {
  applyTheme(getThemePref());
  applyLang(getLang());
  try {
    window
      .matchMedia("(prefers-color-scheme: light)")
      .addEventListener("change", () => {
        if (getThemePref() === "system") applyTheme("system");
      });
  } catch {
    /* ignore */
  }
}
