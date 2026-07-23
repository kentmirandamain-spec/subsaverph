import {
  getCart,
  addDeal,
  setQty,
  removeItem,
  clearCart,
  cartCount,
  cartTotals,
  formatMoney,
  formatDealPrice,
  formatLinePrice,
  saveOrder,
  pctOff,
} from "./store.js";
import {
  loadRates,
  setCurrency,
  getCurrencyCode,
  populateCurrencySelect,
  getRatesInfo,
  CURRENCY_LIST,
  mountCurrencyPicker,
} from "./currency.js";
import {
  searchDeals,
  suggestDeals,
  popularQueries,
  highlightMatch,
} from "./search.js";
import {
  initPrefs,
  applyTheme,
  getThemePref,
  getLang,
  setThemePref,
  setLang,
  t,
  fillLanguageSelect,
  setAdminUiOverrides,
} from "./prefs.js";
import { queueTranslateDom } from "./translate.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Hard fallbacks so a failed catalog/import never blanks the store
if (!Array.isArray(window.DEALS)) window.DEALS = [];
if (!Array.isArray(window.BRANDS)) window.BRANDS = ["All"];
if (!Array.isArray(window.CATEGORIES)) window.CATEGORIES = ["All"];

const state = {
  view: "home",
  dealId: null,
  category: "All",
  brand: "All",
  sort: "savings",
  query: "",
  toastT: null,
  settings: {},
  live: false,
  paymentMode: "instant_demo",
  stripeEnabled: false,
  stripePublishableKey: "",
  paymongoEnabled: false,
  xenditEnabled: false,
  paypalEnabled: false,
  cryptoEnabled: false,
  liqpayEnabled: false,
  manualEwalletEnabled: false,
  ewalletProvider: "demo",
  paymentMethods: [],
};

function dealsList() {
  return Array.isArray(window.DEALS) ? window.DEALS : [];
}

/**
 * Real official brand logos (SVG marks / official wordmarks).
 * Used on product cards, services, and homepage slider.
 */
const OFFICIAL_BRAND_LOGO = {
  xAI: "/assets/products/logos/brand-xai-fixed.svg?v=reallogo1",
  Canva: "/assets/products/logos/brand-canva.png?v=reallogo1",
  CapCut: "/assets/products/logos/brand-capcut-official.svg?v=reallogo1",
  Netflix: "/assets/products/logos/brand-netflix-fixed.svg?v=reallogo1",
  YouTube: "/assets/products/logos/youtube-full.svg?v=reallogo1",
  Duolingo: "/assets/products/logos/brand-duolingo-fixed.svg?v=reallogo1",
  Spotify: "/assets/products/logos/brand-spotify-fixed.svg?v=reallogo1",
};
/**
 * Desktop: real brand logos for card media + hero slides (logo-fit).
 */
const OFFICIAL_BRAND_COVER = {
  xAI: "/assets/products/logos/brand-xai-fixed.svg?v=reallogo1",
  Canva: "/assets/products/logos/brand-canva.png?v=reallogo1",
  CapCut: "/assets/products/logos/brand-capcut-official.svg?v=reallogo1",
  YouTube: "/assets/products/logos/youtube-full.svg?v=reallogo1",
  Duolingo: "/assets/products/logos/brand-duolingo-fixed.svg?v=reallogo1",
  Netflix: "/assets/products/logos/brand-netflix-fixed.svg?v=reallogo1",
  Spotify: "/assets/products/logos/brand-spotify-fixed.svg?v=reallogo1",
};
const OFFICIAL_BRAND_SLIDE = {
  xAI: "/assets/products/logos/brand-xai-fixed.svg?v=reallogo1",
  Canva: "/assets/products/logos/brand-canva.png?v=reallogo1",
  CapCut: "/assets/products/logos/brand-capcut-official.svg?v=reallogo1",
  Netflix: "/assets/products/logos/brand-netflix-fixed.svg?v=reallogo1",
  YouTube: "/assets/products/logos/youtube-full.svg?v=reallogo1",
  Duolingo: "/assets/products/logos/brand-duolingo-fixed.svg?v=reallogo1",
  Spotify: "/assets/products/logos/brand-spotify-fixed.svg?v=reallogo1",
};

/**
 * Mobile official brand logos (Canva, CapCut, Duolingo, Grok).
 * Centered logo-fit on brand plates — not full-bleed photos.
 */
const MOBILE_OFFICIAL_LOGO = {
  xAI: "/assets/products/logos/brand-xai-fixed.svg?v=mlogo1",
  Canva: "/assets/products/logos/brand-canva.png?v=mlogo1",
  CapCut: "/assets/products/logos/brand-capcut-official.svg?v=mlogo1",
  Duolingo: "/assets/products/logos/brand-duolingo-fixed.svg?v=mlogo1",
};

/** Match storefront mobile layout (CSS max-width: 900px). */
function isMobileView() {
  try {
    return window.matchMedia("(max-width: 900px)").matches;
  } catch {
    return typeof window !== "undefined" && window.innerWidth <= 900;
  }
}

/** Official brand logo path (SVG mark). */
function productLogo(d) {
  if (!d) return "";
  if (isMobileView() && d.brand && MOBILE_OFFICIAL_LOGO[d.brand]) {
    return MOBILE_OFFICIAL_LOGO[d.brand];
  }
  if (d.brand && OFFICIAL_BRAND_LOGO[d.brand]) return OFFICIAL_BRAND_LOGO[d.brand];
  if (d.logo) return String(d.logo);
  const brand = String(d.brand || "").toLowerCase().replace(/\s+/g, "");
  if (brand) return `/assets/products/logos/brand-${brand === "xai" ? "xai" : brand}-fixed.svg?v=official3`;
  if (d.id) return `/assets/products/${d.id}.png`;
  return "";
}

/** True when path is a raster image (png/jpg), not SVG logo. */
function isProductPhoto(src) {
  if (!src) return false;
  const s = String(src);
  if (/\.svg(\?|$)/i.test(s)) return false;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(s);
}

/** Full-bleed covers off — official logos use logo-fit (including mobile). */
function brandUsesCover(brand) {
  return false;
}

/**
 * Card/detail image: mobile official logos for Canva/CapCut/Grok/Duolingo.
 */
function productImage(d) {
  if (!d) return "";
  if (isMobileView() && d.brand && MOBILE_OFFICIAL_LOGO[d.brand]) {
    return MOBILE_OFFICIAL_LOGO[d.brand];
  }
  if (d.brand && OFFICIAL_BRAND_LOGO[d.brand]) return OFFICIAL_BRAND_LOGO[d.brand];
  if (d.brand && OFFICIAL_BRAND_COVER[d.brand]) return OFFICIAL_BRAND_COVER[d.brand];
  if (d.logo) return String(d.logo);
  if (d.image) return String(d.image);
  return productLogo(d);
}

/** Homepage slider: mobile official logos for key brands. */
function productSlideImage(d) {
  if (!d) return "";
  if (isMobileView() && d.brand && MOBILE_OFFICIAL_LOGO[d.brand]) {
    return MOBILE_OFFICIAL_LOGO[d.brand];
  }
  if (d.brand && OFFICIAL_BRAND_SLIDE[d.brand]) return OFFICIAL_BRAND_SLIDE[d.brand];
  if (d.brand && OFFICIAL_BRAND_LOGO[d.brand]) return OFFICIAL_BRAND_LOGO[d.brand];
  if (d.imageSlide && isProductPhoto(d.imageSlide)) return String(d.imageSlide);
  return productImage(d) || productLogo(d);
}

function productBrandColor(d) {
  /* Brand-colored plates so official logos stay visible in cards / slider */
  const map = {
    xAI: "#000000",
    Canva: "#00c4cc",
    CapCut: "#000000",
    Netflix: "#000000",
    YouTube: "#ffffff",
    Duolingo: "#ffffff",
    Spotify: "#191414",
  };
  if (d?.brand && map[d.brand]) return map[d.brand];
  if (d && d.brandColor) return String(d.brandColor);
  return "#0a0e16";
}

/** Apply data-i18n labels across static chrome */
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  // Theme option labels
  const themeSel = $("#prefTheme");
  if (themeSel) {
    [...themeSel.options].forEach((opt) => {
      const map = { dark: "theme_dark", light: "theme_light", system: "theme_system" };
      if (map[opt.value]) opt.textContent = t(map[opt.value]);
    });
  }
}

function bindPrefsPanel() {
  const picker = $("#prefsPicker");
  const btn = $("#prefsBtn");
  const panel = $("#prefsPanel");
  const langSel = $("#prefLang");
  const themeSel = $("#prefTheme");
  if (!picker || !btn || !panel) return;
  if (picker.dataset.bound === "1") {
    // Refresh select values if already bound
    if (langSel) fillLanguageSelect(langSel);
    if (themeSel) themeSel.value = getThemePref();
    return;
  }
  picker.dataset.bound = "1";

  if (langSel) fillLanguageSelect(langSel);
  if (themeSel) themeSel.value = getThemePref();

  const close = () => {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    picker.classList.remove("open");
  };
  const open = () => {
    // Close currency picker if open
    document.querySelectorAll(".currency-picker.open").forEach((el) => {
      el.classList.remove("open");
      const p = el.querySelector("[data-fx-panel]");
      if (p) p.hidden = true;
    });
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    picker.classList.add("open");
    if (langSel) fillLanguageSelect(langSel);
    if (themeSel) themeSel.value = getThemePref();
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) open();
    else close();
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  langSel?.addEventListener("change", async () => {
    const val = langSel.value;
    setLang(val);
    applyI18n();
    render();
    toast(t("translating") || "Updating language…");
    await localizeFullPage();
    // Re-sync selects after re-render chrome
    const lang2 = $("#prefLang");
    if (lang2) {
      fillLanguageSelect(lang2);
      lang2.value = val;
    }
    toast(t("toast_lang") || "Language updated");
  });

  themeSel?.addEventListener("change", () => {
    const val = themeSel.value;
    setThemePref(val);
    applyTheme(val);
    // Force attribute on html for CSS
    document.documentElement.setAttribute("data-theme-pref", val);
    const resolved =
      val === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : val === "light"
          ? "light"
          : "dark";
    document.documentElement.setAttribute("data-theme", resolved);
    toast(t("toast_theme") || "Theme updated");
  });
}

/** Scroll the storefront to the very top (mobile-safe). */
function scrollPageToTop() {
  try {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.classList.remove("drawer-open", "nav-menu-open");
  } catch {
    /* ignore */
  }
  const jump = () => {
    try {
      window.scrollTo(0, 0);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      /* ignore */
    }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    const app = document.getElementById("app");
    if (app) app.scrollTop = 0;
  };
  jump();
  requestAnimationFrame(jump);
  // Mobile browsers often re-apply scroll after layout / keyboard / hash change
  setTimeout(jump, 40);
  setTimeout(jump, 180);
  setTimeout(jump, 400);
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "") || "home";
  // support #/search?q=netflix and #/search/netflix and #/deals?q=
  const [pathPart, queryPart] = hash.split("?");
  const [view, id] = pathPart.split("/");
  state.view = view || "home";
  state.dealId = id || null;

  const params = new URLSearchParams(queryPart || "");
  if (state.view === "home") {
    // Home always shows the full homepage (no leftover search)
    state.query = "";
    state.dealId = null;
  } else if (params.has("q")) {
    state.query = params.get("q") || "";
  } else if (view === "search" && id) {
    state.query = decodeURIComponent(id);
  } else if (view !== "search" && view !== "deals") {
    state.query = "";
  } else if (view === "search" && !params.has("q") && !id) {
    state.query = "";
  }

  render();
  syncGlobalSearchInput();
  // Always land at top after route change (checkout → success, etc.)
  scrollPageToTop();
}

/** Navigate to home and clear search — always show full homepage */
function goHome() {
  state.query = "";
  state.view = "home";
  state.dealId = null;
  state.category = "All";
  state.brand = "All";

  // Close mobile menu if open
  $("#navLinks")?.classList.remove("open");

  // Clear search box in header
  const g = $("#globalSearchInput");
  if (g) g.value = "";
  const suggest = $("#searchSuggest");
  if (suggest) {
    suggest.hidden = true;
    suggest.innerHTML = "";
  }

  const alreadyHome =
    location.hash === "#/home" ||
    location.hash === "#/" ||
    location.hash === "" ||
    location.hash === "#";

  if (alreadyHome) {
    // Same hash won't fire hashchange — force home view
    render();
    syncGlobalSearchInput();
  } else {
    location.hash = "#/home";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goSearch(q) {
  state.query = (q || "").trim();
  const encoded = encodeURIComponent(state.query);
  location.hash = state.query ? `#/search?q=${encoded}` : "#/search";
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(state.toastT);
  state.toastT = setTimeout(() => el.classList.remove("show"), 2200);
}

function updateBadge() {
  const n = cartCount();
  const b = $("#cartBadge");
  if (b) {
    b.textContent = n;
    b.hidden = n === 0;
  }
  const mb = $("#mobileCartBadge");
  if (mb) {
    mb.textContent = n > 9 ? "9+" : String(n);
    mb.hidden = n === 0;
  }
}

function syncMobileTabbar() {
  const bar = $("#mobileTabbar");
  if (!bar) return;
  const view = state.view || "home";
  const map = {
    home: "home",
    deals: "deals",
    deal: "deals",
    search: "search",
    checkout: "cart",
    support: "support",
    contact: "support",
  };
  const active = map[view] || "home";
  bar.querySelectorAll(".mobile-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.getAttribute("data-tab") === active);
  });
}

function ratesNote() {
  const info = getRatesInfo();
  const src =
    info.source === "live"
      ? t("live_fx")
      : info.source === "cache"
        ? t("cached_fx")
        : t("offline_fx");
  return `${src} · ${CURRENCY_LIST.length} ${t("currencies_word")} · ${t("pay_in")} ${getCurrencyCode()}`;
}

/** Content helper: translated string for non-English; admin settings for English when set */
function c(key, settingsKey) {
  const s = siteSettings();
  if (getLang() === "en" && settingsKey && s[settingsKey]) return String(s[settingsKey]);
  const translated = t(key);
  if (translated && translated !== key) return translated;
  if (settingsKey && s[settingsKey]) return String(s[settingsKey]);
  return translated || "";
}

async function localizeFullPage() {
  applyI18n();
  applySiteChrome();
  if (getLang() === "en") {
    document.documentElement.removeAttribute("data-translated");
    return;
  }
  // Translate remaining English on the page (products, legal, hero, etc.)
  await queueTranslateDom(document.body, getLang());
}

function openCart() {
  renderCart();
  $("#drawer")?.classList.add("open");
  $("#overlay")?.classList.add("open");
  document.body.style.overflow = "hidden";
  document.body.classList.add("drawer-open");
}

function closeCart() {
  $("#drawer")?.classList.remove("open");
  $("#overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  document.body.classList.remove("drawer-open");
}

function getDeal(id) {
  return dealsList().find((d) => d.id === id);
}

function off(d) {
  return pctOff(d.price, d.original);
}

function periodLabel(d) {
  if (d.period === "7 days") return t("per_7_days");
  if (d.period === "month") return t("per_month");
  return d.period ? ` / ${d.period}` : "";
}

/** True when inventory codes are known and none left */
function isSoldOut(d) {
  if (!d) return false;
  // stockLeft comes from live API (inventory). If missing, not treated as sold out.
  if (typeof d.stockLeft === "number") return d.stockLeft <= 0;
  return false;
}

function stockLabel(d) {
  if (isSoldOut(d)) return t("sold_out");
  if (typeof d.stockLeft === "number") {
    if (d.stockLeft <= 3) return t("only_left").replace("{n}", String(d.stockLeft));
    return t("n_in_stock").replace("{n}", String(d.stockLeft));
  }
  const raw = d.stock || "In stock";
  if (/sold out/i.test(raw)) return t("sold_out");
  if (/in stock/i.test(raw)) return t("in_stock");
  return raw;
}

function isWished(id) {
  try {
    const list = JSON.parse(localStorage.getItem("subsaverph_wish") || "[]");
    return Array.isArray(list) && list.includes(id);
  } catch {
    return false;
  }
}

function toggleWish(id) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem("subsaverph_wish") || "[]");
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  const on = list.includes(id);
  list = on ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem("subsaverph_wish", JSON.stringify(list));
  return !on;
}

function card(d, highlightQ = "") {
  const nameHtml = highlightQ ? highlightMatch(d.name, highlightQ) : escapeHtml(d.name);
  const soldOut = isSoldOut(d);
  const img = productImage(d);
  const bg = productBrandColor(d);
  const wished = isWished(d.id);
  const typeLabel = (d.category || "Plan").toUpperCase();
  const brandLabel = d.brand === "xAI" ? "SuperGrok" : d.brand || "";
  /* Official logos centered on brand color (mobile + desktop logo-fit) */
  const photo = isProductPhoto(img);
  const fillFrame = false;
  const logoFit = true;
  const photoFit = photo && !fillFrame;
  const saveHtml =
    !soldOut && d.original > d.price
      ? `<span class="price-compare">${formatDealPrice(d, "original")}</span>`
      : "";
  return `
    <article class="card product-card ${soldOut ? "sold-out" : ""}${fillFrame ? " product-card--cover" : ""}${logoFit ? " product-card--logo-fit" : ""}${photoFit ? " product-card--photo" : ""}${photo ? " product-card--has-photo" : ""}" data-product-id="${escapeAttr(d.id)}" data-brand="${escapeAttr(d.brand || "")}">
      <a class="product-card-media${fillFrame ? " product-card-media--cover" : photoFit ? " product-card-media--photo card-media--logo" : " card-media--logo"}${logoFit ? " product-card-media--logo-fit" : ""}${img ? " has-product-photo" : ""}" href="#/deal/${d.id}" style="--brand-bg:${escapeAttr(bg)}">
        ${
          img
            ? `<img class="product-img product-card-img${fillFrame ? " product-cover-img" : photoFit ? " product-photo-img" : " product-logo-img"}${logoFit ? " product-logo-img--fit" : ""}" src="${escapeAttr(img)}" alt="${escapeAttr(d.brand || d.name)}" loading="lazy" decoding="async" width="600" height="400" onerror="this.onerror=null;this.src='${escapeAttr(productLogo(d) || "")}'" />`
            : `<span class="product-monogram">${escapeHtml(d.monogram || "")}</span>`
        }
        ${
          soldOut
            ? `<span class="product-badge sold-out-badge">${escapeHtml(t("sold_out"))}</span>`
            : d.badge
              ? `<span class="product-badge">${escapeHtml(d.badge)}</span>`
              : !soldOut
                ? `<span class="product-badge">−${off(d)}%</span>`
                : ""
        }
      </a>
      <div class="product-card-body card-body">
        <div class="product-card-meta">
          <span class="listing-type">${escapeHtml(typeLabel)}</span>
          <span class="listing-delivery${soldOut ? " is-sold-out" : " delivery-instant"}">${escapeHtml(soldOut ? t("sold_out") : "Instant")}</span>
        </div>
        <a class="product-card-title" href="#/deal/${d.id}">${nameHtml}</a>
        <p class="listing-game">${escapeHtml(brandLabel)}</p>
        <div class="listing-footer">
          <div class="listing-price">
            ${saveHtml}
            <span class="price-now">${formatDealPrice(d, "price")}</span>
            <small class="price-code">${escapeHtml(getCurrencyCode())}</small>
          </div>
        </div>
        <div class="card-actions-row">
          ${
            soldOut
              ? `<button class="btn-outline btn-sm btn-add-cart sold-out-btn" type="button" disabled>${escapeHtml(t("sold_out"))}</button>`
              : `<button class="btn-outline btn-sm btn-add-cart" type="button" data-add="${escapeAttr(d.id)}">${escapeHtml(t("add_to_cart") || "ADD TO CART")}</button>`
          }
          <button class="btn-wish${wished ? " active" : ""}" type="button" data-wish="${escapeAttr(d.id)}" aria-label="Wishlist" title="Wishlist">${wished ? "♥" : "♡"}</button>
        </div>
      </div>
    </article>`;
}

function filtered() {
  let list = [...dealsList()];
  if (state.category !== "All") list = list.filter((d) => d.category === state.category);
  if (state.brand !== "All") list = list.filter((d) => d.brand === state.brand);
  if (state.query.trim()) {
    list = searchDeals(list, state.query, { limit: 100 });
  }
  if (!state.query.trim()) {
    switch (state.sort) {
      case "price":
        list.sort((a, b) => {
          const au = a.priceBase === "PHP" ? a.price / 56.5 : a.price;
          const bu = b.priceBase === "PHP" ? b.price / 56.5 : b.price;
          return au - bu;
        });
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        list.sort((a, b) => off(b) - off(a));
    }
  }
  return list;
}

function quickTagsHTML() {
  const tags = popularQueries(dealsList());
  return `
    <div class="search-tags" role="list">
      ${tags
        .map(
          (tag) =>
            `<button type="button" class="search-tag" data-q="${escapeHtml(tag)}" role="listitem">${escapeHtml(tag)}</button>`
        )
        .join("")}
    </div>`;
}

function searchBarHTML(placeholder = "Search SuperGrok, Netflix, Canva…") {
  return `
    <div class="product-search large search-bar-orbit">
      <span class="search-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      </span>
      <input
        id="productSearch"
        type="search"
        value="${escapeHtml(state.query)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
        aria-label="Search products"
      />
      ${state.query ? `<button type="button" class="search-clear" id="clearSearch" aria-label="Clear search">✕</button>` : ""}
      <button type="button" class="btn solid search-go" id="searchGo">${escapeHtml(t("cta_search") || "Search")}</button>
    </div>
    ${quickTagsHTML()}`;
}

function viewSearch() {
  const q = state.query.trim();
  const results = q ? searchDeals(dealsList(), q, { limit: 100 }) : [];
  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">Search</p>
        <h1 class="page-title">${q ? "Results" : "Find a plan"}</h1>
        <p class="muted">${q ? "Only products that match your search are shown." : "Search by product name, brand, or monogram (SG, NF, YT…)."}</p>
        ${searchBarHTML("Type a product name…")}
        ${
          q
            ? `<div class="search-meta">
                <strong>${results.length}</strong> product${results.length === 1 ? "" : "s"} matching
                “<span>${escapeHtml(q)}</span>”
                ${results.length ? "" : " — try SuperGrok, Netflix, or Canva"}
              </div>
              ${
                results.length
                  ? `<div class="grid search-grid${results.length === 1 ? " grid-single" : ""}">${results.map((d) => card(d, q)).join("")}</div>`
                  : `<div class="empty">No products matched “${escapeHtml(q)}”.<br/><button type="button" class="btn solid sm" data-q="SuperGrok" style="margin-top:16px">Try SuperGrok</button></div>`
              }`
            : `<div class="search-empty-hero">
                <p class="muted">Popular searches</p>
                ${quickTagsHTML()}
              </div>`
        }
      </div>
    </div>`;
}

function siteSettings() {
  return state.settings || {};
}

/** Convert admin plain-text body into simple legal HTML (safe escaped). */
function textToLegalHtml(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const blocks = text.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return "";
      // Bullet list if every line starts with • or -
      if (lines.every((l) => /^[•\-\*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${escapeHtml(l.replace(/^[•\-\*]\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      // Heading-like short line alone
      if (lines.length === 1 && lines[0].length < 60 && !/[.!?]$/.test(lines[0])) {
        return `<h2>${escapeHtml(lines[0])}</h2>`;
      }
      return `<p>${lines.map((l) => escapeHtml(l)).join("<br/>")}</p>`;
    })
    .join("\n");
}

function applySeoMeta() {
  const s = siteSettings();
  if (s.seoTitle) document.title = String(s.seoTitle);
  const setMeta = (selector, attr, val) => {
    if (!val) return;
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, String(val));
  };
  setMeta('meta[name="description"]', "content", s.seoDescription);
  setMeta('meta[property="og:title"]', "content", s.seoOgTitle || s.seoTitle);
  setMeta('meta[property="og:description"]', "content", s.seoOgDescription || s.seoDescription);
  setMeta('meta[name="twitter:title"]', "content", s.seoOgTitle || s.seoTitle);
  setMeta('meta[name="twitter:description"]', "content", s.seoOgDescription || s.seoDescription);
  setMeta('meta[name="keywords"]', "content", s.seoKeywords);
}

function applySiteChrome() {
  const s = siteSettings();
  try {
    applySeoMeta();
  } catch {
    /* ignore */
  }
  try {
    if (s.uiStrings && typeof s.uiStrings === "object") {
      setAdminUiOverrides(s.uiStrings);
    }
  } catch {
    /* ignore */
  }
  const setText = (sel, val) => {
    const el = document.querySelector(sel);
    if (el && val != null && String(val).length) el.textContent = val;
  };
  setText("#footerCompanyBlurb", c("footer_company_blurb", "footerCompanyBlurb"));
  setText("#footerDisclaimer", c("footer_disclaimer", "footerDisclaimer"));
  const year = new Date().getFullYear();
  setText("#footerCopyright", `© ${year} ${c("footer_copyright", "footerCopyright")}`);
  // Support links go to the Support page (bottom footer link only)
  document.querySelectorAll("a[data-support-email], a[data-support-link], a.js-go-support").forEach((a) => {
    a.setAttribute("href", "#/support");
    a.removeAttribute("target");
    a.classList.add("js-go-support");
    a.classList.remove("js-email-support");
  });
}

function heroTitleHtml() {
  const raw = c("hero_title", "heroTitle") || "Premium plans.\nLower cost.";
  const lines = String(raw)
    .replace(/\\n/g, "\n")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) {
    lines.push("Premium plans.", "Lower cost.");
  }
  const parts = lines.map((line, i) => {
    const isAccent = i === lines.length - 1 && lines.length > 1;
    if (isAccent) {
      return `<span class="hero-title-line hero-title-line--accent"><span class="hero-title-accent-text">${escapeHtml(line)}</span></span>`;
    }
    // Split "Premium plans." into word spans for polish when default-ish
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      return `<span class="hero-title-line hero-title-line--main">${words
        .map((w, wi) => `<span class="hero-title-word${wi === 0 ? " hero-title-word--lead" : ""}">${escapeHtml(w)}</span>`)
        .join(" ")}</span>`;
    }
    return `<span class="hero-title-line hero-title-line--main">${escapeHtml(line)}</span>`;
  });
  return `<span class="hero-title-stack">${parts.join("")}</span>`;
}

/**
 * Exact All deals / View all arrangement (shared by #/deals and homepage scroll).
 * Same filters, sort, search, and product grid.
 */
function dealsCatalogBlockHTML() {
  const list = filtered();
  return `
        <p class="eyebrow">${escapeHtml(t("eyebrow_catalog"))}</p>
        <h1 class="page-title">${escapeHtml(t("page_deals"))}</h1>
        <p class="muted">${list.length} plan${list.length === 1 ? "" : "s"} · currency <strong>${getCurrencyCode()}</strong></p>

        <div class="deals-search">
          ${searchBarHTML()}
        </div>

        <div class="toolbar">
          <div id="pageFxMount"></div>
          <select id="sortSelect" class="field-select" aria-label="Sort">
            <option value="savings" ${state.sort === "savings" ? "selected" : ""}>Highest savings</option>
            <option value="price" ${state.sort === "price" ? "selected" : ""}>Lowest price</option>
            <option value="name" ${state.sort === "name" ? "selected" : ""}>Name A–Z</option>
          </select>
        </div>
        <p class="rates" data-rates>${ratesNote()}</p>

        <div class="layout deals-layout">
          <aside class="filters deals-filters" aria-label="Filter deals">
            <div class="filter-group filter-group--service">
              <h3 class="filter-group-title">Service</h3>
              <div class="filter-group-options" role="radiogroup" aria-label="Service">
                ${(Array.isArray(window.BRANDS) ? window.BRANDS : ["All"])
                  .map(
                    (b) => `
                <label class="radio">
                  <input type="radio" name="brand" value="${b}" ${state.brand === b ? "checked" : ""} />
                  <span>${b === "All" ? "All services" : b === "xAI" ? "SuperGrok (xAI)" : b}</span>
                </label>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="filter-group filter-group--category">
              <h3 class="filter-group-title">Category</h3>
              <div class="filter-group-options" role="radiogroup" aria-label="Category">
                ${(Array.isArray(window.CATEGORIES) ? window.CATEGORIES : ["All"])
                  .map(
                    (cat) => `
                <label class="radio">
                  <input type="radio" name="cat" value="${cat}" ${state.category === cat ? "checked" : ""} />
                  <span>${cat}</span>
                </label>`
                  )
                  .join("")}
              </div>
            </div>
          </aside>
          <div class="deals-results">
            ${list.length ? `<div class="grid deals-grid">${list.map((d) => card(d, state.query)).join("")}</div>` : `<div class="empty">No plans match. Try another search.</div>`}
          </div>
        </div>`;
}

function viewHome() {
  const all = dealsList();
  const q = state.query.trim();
  const matches = q ? searchDeals(all, q, { limit: 100 }) : [];
  const brandSet = [...new Set(all.map((d) => d.brand).filter(Boolean))];
  const monoMap = {
    xAI: "SG",
    Canva: "CV",
    CapCut: "CC",
    Netflix: "NF",
    YouTube: "YT",
    Duolingo: "DU",
    Spotify: "SP",
  };
  const brands = brandSet.map((b) => ({
    key: b,
    mono: monoMap[b] || (b.slice(0, 2) || "XX").toUpperCase(),
    label: b === "xAI" ? "SuperGrok" : b,
  }));

  const catOrder = ["AI", "Design", "Video", "Streaming", "Learning"];
  const catSet = [...new Set(all.map((d) => d.category).filter(Boolean))];
  const catMono = {
    AI: "AI",
    Design: "DE",
    Video: "VI",
    Streaming: "ST",
    Learning: "LN",
  };
  const categories = catOrder
    .filter((c) => catSet.includes(c))
    .concat(catSet.filter((c) => !catOrder.includes(c)))
    .map((c) => ({
      key: c,
      mono: catMono[c] || (c.slice(0, 2) || "??").toUpperCase(),
      label: c,
      count: all.filter((d) => d.category === c).length,
    }));

  /* When searching: only matching products — no platforms / catalog / mission clutter */
  if (q) {
    const found =
      matches.length === 1
        ? t("product_found")
        : t("products_found");
    return `
    <div class="page page-search-only">
      <div class="page-inner">
        <p class="eyebrow">${escapeHtml(t("page_search"))}</p>
        <h1 class="page-title">${escapeHtml(t("search_results_title"))}</h1>
        <p class="muted">${escapeHtml(t("search_only_match"))} “<strong>${escapeHtml(q)}</strong>” ${escapeHtml(t("search_are_shown"))}</p>
        ${searchBarHTML(t("search_product_ph"))}
        <div class="search-meta">
          <strong>${matches.length}</strong> ${escapeHtml(found)}
          <button type="button" class="link" id="clearSearchLink" style="margin-left:16px">${escapeHtml(t("clear_search"))}</button>
        </div>
        ${
          matches.length
            ? `<div class="grid search-grid${matches.length === 1 ? " grid-single" : ""}">${matches.map((d) => card(d, q)).join("")}</div>`
            : `<div class="empty">${escapeHtml(t("no_products_matched"))} “${escapeHtml(q)}”.<br/>${escapeHtml(t("try_brands"))}</div>`
        }
      </div>
    </div>`;
  }

  const catBlurb = {
    AI: "Assistants & models",
    Design: "Creative tools",
    Video: "Editors & creators",
    Streaming: "Watch & listen",
    Learning: "Study & languages",
  };
  const catTone = {
    AI: "ai",
    Design: "design",
    Video: "video",
    Streaming: "stream",
    Learning: "learn",
  };
  /** Category icons — clearly related to each use case */
  const catSvgIcon = (key) => {
    const common =
      'class="hero-cat-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const icons = {
      /* AI: chip / neural node */
      AI: `<svg ${common}>
        <rect x="7" y="7" width="10" height="10" rx="2"/>
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>
        <circle cx="12" cy="12" r="2"/>
        <path d="M12 9.5v1M12 13.5v1M9.5 12h1M13.5 12h1"/>
      </svg>`,
      /* Design: pen tool + palette */
      Design: `<svg ${common}>
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5z"/>
      </svg>`,
      /* Video: film / clapper */
      Video: `<svg ${common}>
        <rect x="2" y="6" width="20" height="14" rx="2"/>
        <path d="M7 6V3M12 6V3M17 6V3"/>
        <path d="M2 10h20"/>
        <path d="M10 14l4 2.2-4 2.2V14z"/>
      </svg>`,
      /* Streaming: TV with play */
      Streaming: `<svg ${common}>
        <rect x="2" y="5" width="20" height="13" rx="2"/>
        <path d="M8 21h8"/>
        <path d="M12 18v3"/>
        <path d="M10 10.5l4 2.5-4 2.5v-5z"/>
      </svg>`,
      /* Learning: graduation cap */
      Learning: `<svg ${common}>
        <path d="M22 10L12 5 2 10l10 5 10-5z"/>
        <path d="M6 12v5c0 0 2.5 3 6 3s6-3 6-3v-5"/>
        <path d="M22 10v6"/>
      </svg>`,
      /* All: grid of apps */
      All: `<svg ${common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>`,
    };
    return icons[key] || icons.All;
  };

  /* One slide per brand so every brand logo appears in the carousel */
  const brandOrder = ["xAI", "Canva", "CapCut", "Netflix", "YouTube", "Duolingo", "Spotify"];
  const seenBrands = new Set();
  const slides = [];
  for (const brand of brandOrder) {
    const deal = all.find((d) => d.brand === brand);
    if (deal) {
      slides.push(deal);
      seenBrands.add(brand);
    }
  }
  for (const d of all) {
    if (d.brand && !seenBrands.has(d.brand)) {
      slides.push(d);
      seenBrands.add(d.brand);
    }
  }
  const sliderTrack =
    slides.length > 0
      ? slides
          .map((d, i) => {
            const slideSrc = productSlideImage(d) || "";
            const brandLabel = d.brand === "xAI" ? "SuperGrok" : d.brand || "";
            /* Mobile + desktop: official logos centered (logo-fit) */
            return `
            <article class="product-slide${i === 0 ? " is-active" : ""} product-slide--logo-fit" data-slide-index="${i}" data-brand="${escapeAttr(d.brand || "")}" ${i === 0 ? "" : "hidden"} style="--brand-bg:${escapeAttr(productBrandColor(d))}">
              <a class="product-slide-link product-slide-link--logo" href="#/deal/${escapeAttr(d.id)}" tabindex="${i === 0 ? "0" : "-1"}">
                <div class="product-slide-logo-wrap">
                  <img
                    class="product-img product-slide-img product-logo-img product-logo-img--fit"
                    src="${escapeAttr(slideSrc)}"
                    alt="${escapeAttr(brandLabel || d.name)}"
                    width="1280"
                    height="800"
                    loading="${i === 0 ? "eager" : "lazy"}"
                  />
                </div>
                <div class="product-slide-shade product-slide-shade--logo"></div>
                <div class="product-slide-brand-tag">${escapeHtml(brandLabel)}</div>
              </a>
            </article>`;
          })
          .join("")
      : "";

  return `
    <section class="hero hero--orbit hero--with-slider" aria-label="Featured storefront" id="homeHero">
      ${
        slides.length
          ? `
      <div class="product-slider product-slider--hero" id="productSlider" aria-roledescription="carousel" aria-label="Featured products">
        <div class="product-slider-stage">
          <div class="product-slider-track" id="productSliderTrack">
            ${sliderTrack}
          </div>
          <div class="product-slider-progress" aria-hidden="true">
            <div class="product-slider-progress-bar" id="productSliderProgress"></div>
          </div>
          <div class="product-slider-dots" id="productSliderDots" role="tablist" aria-label="Product slides">
            ${slides
              .map(
                (d, i) =>
                  `<button type="button" class="product-slider-dot${i === 0 ? " is-active" : ""}" role="tab" aria-selected="${i === 0 ? "true" : "false"}" aria-label="${escapeAttr(d.name)}" data-slide-to="${i}"></button>`
              )
              .join("")}
          </div>
        </div>
      </div>`
          : `<div class="hero-orbit-bg" aria-hidden="true">
        <div class="hero-orbit-glow"></div>
        <div class="hero-orbit-grid"></div>
        <div class="hero-orbit-vignette"></div>
      </div>`
      }

      <div class="hero-orbit-chrome">
        <div class="hero-orbit-main">
          <div class="hero-content">
            <p class="hero-badge">
              <span class="hero-badge-dot" aria-hidden="true"></span>
              ${escapeHtml(c("hero_eyebrow", "heroEyebrow") || "Live · PH digital store")}
            </p>
            <h1 class="display hero-title hero-title--pro">${heroTitleHtml()}</h1>
            <p class="lead hero-sub">${escapeHtml(c("hero_lead", "heroLead"))}</p>

            <div class="hero-search-wrap">
              ${searchBarHTML(t("search_placeholder"))}
            </div>

            <div class="hero-cats-block hero-cats-block--v4" id="home-categories">
              <div class="hero-cats-head hero-cats-head--v4">
                <p class="hero-cats-kicker">
                  <span class="hero-cats-kicker-line" aria-hidden="true"></span>
                  ${escapeHtml(t("categories_title") || "Categories")}
                  <span class="hero-cats-kicker-line" aria-hidden="true"></span>
                </p>
                <p class="hero-cats-lead">Pick a lane to shop prepaid plans</p>
              </div>
              <div class="hero-cat-board" role="list" aria-label="${escapeAttr(t("categories_title") || "Categories")}">
                ${categories
                  .map(
                    (cat, i) => `
                  <button type="button" class="hero-cat-box hero-cat-box--${escapeAttr(catTone[cat.key] || "default")}" data-category="${escapeAttr(cat.key)}" role="listitem">
                    <span class="hero-cat-box-mesh" aria-hidden="true"></span>
                    <span class="hero-cat-box-num">${String(i + 1).padStart(2, "0")}</span>
                    <span class="hero-cat-box-icon">${catSvgIcon(cat.key)}</span>
                    <span class="hero-cat-box-copy">
                      <span class="hero-cat-box-name">${escapeHtml(cat.label)}</span>
                      <span class="hero-cat-box-desc">${escapeHtml(catBlurb[cat.key] || cat.label)}</span>
                    </span>
                    <span class="hero-cat-box-foot">
                      <span class="hero-cat-box-count"><strong>${cat.count}</strong> ${escapeHtml(t("meta_plans") || "plans")}</span>
                      <span class="hero-cat-box-go" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
                      </span>
                    </span>
                  </button>`
                  )
                  .join("")}
                <button type="button" class="hero-cat-box hero-cat-box--all" data-category="All" role="listitem">
                  <span class="hero-cat-box-mesh" aria-hidden="true"></span>
                  <span class="hero-cat-box-num">${String(categories.length + 1).padStart(2, "0")}</span>
                  <span class="hero-cat-box-icon">${catSvgIcon("All")}</span>
                  <span class="hero-cat-box-copy">
                    <span class="hero-cat-box-name">${escapeHtml(t("all_deals") || "All deals")}</span>
                    <span class="hero-cat-box-desc">Browse the full catalog</span>
                  </span>
                  <span class="hero-cat-box-foot">
                    <span class="hero-cat-box-count"><strong>${all.length}</strong> ${escapeHtml(t("meta_plans") || "plans")}</span>
                    <span class="hero-cat-box-go" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div class="cta hero-cta">
              <a class="btn solid" href="#view-all-deals">${escapeHtml(t("cta_browse") || "Browse deals")}</a>
              <a class="btn btn-ghost-orbit" href="#/search">${escapeHtml(t("cta_search") || "Search")}</a>
            </div>

            <div class="meta hero-stats">
              <div><strong>${all.length}</strong><span>${escapeHtml(t("meta_plans"))}</span></div>
              <div><strong>${brands.length}</strong><span>${escapeHtml(t("meta_platforms"))}</span></div>
              <div><strong>${CURRENCY_LIST.length}+</strong><span>${escapeHtml(t("meta_currencies"))}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section home-view-all section-alt" id="view-all-deals">
      <div class="section-inner home-deals-inner">
        ${dealsCatalogBlockHTML()}
      </div>
    </section>`;
}

function viewDeals() {
  return `
    <div class="page">
      <div class="page-inner">
        ${dealsCatalogBlockHTML()}
      </div>
    </div>`;
}

function viewDeal() {
  const d = getDeal(state.dealId);
  if (!d) {
    return `<div class="page"><div class="page-inner empty"><h2>${escapeHtml(t("plan_not_found"))}</h2><a class="btn solid" href="#/deals">${escapeHtml(t("back"))}</a></div></div>`;
  }
  const isPhp = (d.priceBase || "USD") === "PHP";
  const yearly = d.period === "month" ? d.price * 12 : d.price;
  const yearlyWas = d.period === "month" ? d.original * 12 : d.original;
  const soldOut = isSoldOut(d);
  return `
    <div class="page">
      <div class="page-inner">
        <a href="#/deals" class="link">← ${escapeHtml(t("all_deals"))}</a>
        <div class="detail">
          <div class="detail-panel">
            ${
              productImage(d)
                ? (() => {
                    const src = productImage(d);
                    const photo = isProductPhoto(src);
                    const cover =
                      photo &&
                      (d.brand === "Canva" ||
                        d.brand === "CapCut" ||
                        /cover-/i.test(src));
                    const logoFit = !photo;
                    const photoFit = photo && !cover;
                    return `<div class="detail-product-img-wrap${cover ? " detail-product-img-wrap--cover" : photoFit ? " detail-product-img-wrap--photo" : " detail-product-img-wrap--logo"}${logoFit ? " detail-product-img-wrap--logo-fit" : ""}" style="--brand-bg:${escapeAttr(productBrandColor(d))}">
                    <img class="product-img detail-product-img${cover ? " product-cover-img" : photoFit ? " product-photo-img" : " product-logo-img"}${logoFit ? " product-logo-img--fit" : ""}" src="${escapeAttr(src)}" alt="${escapeAttr(d.brand || d.name)}" width="640" height="400" loading="eager" onerror="this.onerror=null;this.src='${escapeAttr(productLogo(d) || "")}'" />
                  </div>`;
                  })()
                : `<div class="mono-box lg">${escapeHtml(d.monogram)}</div>`
            }
            ${
              soldOut
                ? `<div class="save-big sold-out-big">${escapeHtml(t("sold_out"))}<span>${escapeHtml(t("no_codes_left"))}</span></div>`
                : `<div class="save-big">−${off(d)}%<span>${escapeHtml(t("versus_retail"))}</span></div>`
            }
            ${isPhp ? `<p class="php-tag">${escapeHtml(t("base_price_php"))}</p>` : ""}
            <ul class="list">
              ${d.includes.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
            </ul>
          </div>
          <div class="detail-info">
            <p class="cat">${escapeHtml(d.brand)} · ${escapeHtml(d.category)} · <span class="${soldOut ? "is-sold-out" : ""}">${escapeHtml(stockLabel(d))}</span></p>
            <h1>${escapeHtml(d.name)}</h1>
            <p class="detail-tagline">${escapeHtml(d.tagline)}</p>
            <p class="detail-meta">★ ${d.rating} · ${Number(d.reviews || 0).toLocaleString()} ${escapeHtml(t("reviews"))}</p>

            <div id="pageFxMount" style="margin-bottom:14px"></div>

            <div class="price-hero">
              <div>
                <strong>${formatDealPrice(d, "price")}</strong><span class="per">${periodLabel(d)}</span>
                <span class="was" style="display:block;margin-top:4px">${formatDealPrice(d, "original")} ${escapeHtml(t("retail"))}</span>
              </div>
              ${
                soldOut
                  ? `<div class="you-save sold-out-banner">${escapeHtml(t("sold_out"))}</div>`
                  : `<div class="you-save">${escapeHtml(t("save"))} ${formatDealPrice({ ...d, price: d.original - d.price, priceBase: d.priceBase }, "price")}</div>`
              }
            </div>
            <p class="muted" style="font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">
              ${escapeHtml(d.duration)} · ${escapeHtml(d.delivery)}
            </p>
            <p class="detail-desc">${escapeHtml(d.description)}</p>
            ${productExtraDetailsHtml(d)}
            ${
              d.period === "month"
                ? `<div class="compare">
              <div><span>${escapeHtml(t("yearly_deal") || "Yearly at deal rate")}</span><strong>${formatDealPrice({ ...d, price: yearly }, "price")}</strong></div>
              <div><span>${escapeHtml(t("yearly_retail") || "Yearly at retail")}</span><strong class="strike">${formatDealPrice({ ...d, price: yearlyWas }, "price")}</strong></div>
            </div>`
                : ""
            }
            <div class="buy">
              ${
                soldOut
                  ? `<button class="btn sold-out-btn" type="button" disabled>${escapeHtml(t("sold_out"))}</button>
                     <p class="muted" style="width:100%;margin:8px 0 0">${escapeHtml(t("pick_another"))}</p>`
                  : `<button class="btn solid" data-add="${d.id}">${escapeHtml(t("add_to_cart"))}</button>
                     <button class="btn" data-buy-now="${d.id}">${escapeHtml(t("buy_now"))}</button>`
              }
            </div>
            <p class="fine">${escapeHtml(d.finePrint)}</p>
            <p class="rates" data-rates style="margin-top:12px">${ratesNote()}</p>
          </div>
        </div>
      </div>
    </div>`;
}

/** Extra admin-edited product detail blocks */
function productExtraDetailsHtml(d) {
  const blocks = [];
  if (d.accountType) {
    blocks.push(
      `<div class="detail-extra-item"><span class="detail-extra-label">Account type</span><p>${escapeHtml(d.accountType)}</p></div>`
    );
  }
  if (d.validity) {
    blocks.push(
      `<div class="detail-extra-item"><span class="detail-extra-label">Validity</span><p>${escapeHtml(d.validity)}</p></div>`
    );
  }
  if (d.howToRedeem) {
    blocks.push(
      `<div class="detail-extra-item"><span class="detail-extra-label">How to use / redeem</span><p class="detail-extra-pre">${escapeHtml(d.howToRedeem)}</p></div>`
    );
  }
  if (d.importantNotes) {
    blocks.push(
      `<div class="detail-extra-item"><span class="detail-extra-label">Important notes</span><p class="detail-extra-pre">${escapeHtml(d.importantNotes)}</p></div>`
    );
  }
  const extras = Array.isArray(d.extraDetails)
    ? d.extraDetails
    : String(d.extraDetails || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
  if (extras.length) {
    blocks.push(
      `<div class="detail-extra-item"><span class="detail-extra-label">More details</span><ul class="detail-extra-list">${extras
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("")}</ul></div>`
    );
  }
  if (!blocks.length) return "";
  return `<div class="detail-extra">${blocks.join("")}</div>`;
}

function settingsLines(text, fallbackLines = []) {
  const raw = String(text || "").trim();
  if (!raw) return fallbackLines;
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^[\s•\-\*]+/, "").trim())
    .filter(Boolean);
}

function bulletsHtml(lines, listClass = "") {
  if (!lines.length) return "";
  const cls = listClass ? ` class="${escapeAttr(listClass)}"` : "";
  return `<ul${cls}>${lines.map((l) => `<li>${formatRuleLine(l)}</li>`).join("")}</ul>`;
}

/** Allow **bold** markers in admin text for rules */
function formatRuleLine(line) {
  const esc = escapeHtml(line);
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function viewLegalShell(eyebrow, title, updated, bodyHtml) {
  return `
    <div class="page">
      <div class="page-inner legal-page">
        <p class="eyebrow">${eyebrow}</p>
        <h1 class="page-title">${title}</h1>
        <p class="legal-updated muted">${escapeHtml(t("last_updated"))}: ${updated}</p>
        <div class="legal-body">
          ${bodyHtml}
        </div>
        <div class="legal-nav">
          <a href="#/about">${escapeHtml(t("footer_about"))}</a>
          <a href="#/support">Support</a>
          <a href="#/terms">${escapeHtml(t("footer_terms"))}</a>
          <a href="#/privacy">${escapeHtml(t("footer_privacy"))}</a>
          <a href="#/home">${escapeHtml(t("back_to_home"))}</a>
        </div>
      </div>
    </div>`;
}

function viewAbout() {
  const body = textToLegalHtml(c("about_body", "aboutBody"));
  return viewLegalShell(
    t("company"),
    escapeHtml(c("about_title", "aboutTitle")),
    escapeHtml(c("about_updated", "aboutUpdated")),
    body
  );
}

function viewTerms() {
  const body = textToLegalHtml(c("terms_body", "termsBody"));
  return viewLegalShell(
    t("legal"),
    escapeHtml(c("terms_title", "termsTitle")),
    escapeHtml(c("terms_updated", "termsUpdated")),
    body
  );
}

function viewPrivacy() {
  const body = textToLegalHtml(c("privacy_body", "privacyBody"));
  return viewLegalShell(
    t("legal"),
    escapeHtml(c("privacy_title", "privacyTitle")),
    escapeHtml(c("privacy_updated", "privacyUpdated")),
    body
  );
}

function supportEmailAddress() {
  const s = siteSettings();
  // Prefer settings; fall back to assembled parts so Cloudflare cannot obfuscate static HTML only
  const fromSettings = (s.supportEmail || s.footerSupport || "").trim();
  if (fromSettings && fromSettings.includes("@")) return fromSettings;
  return ["support", "subsaverph.com"].join("@");
}

/** Build Gmail web compose URL (opens Gmail in browser — what users expect). */
function gmailComposeUrl(opts = {}) {
  const email = supportEmailAddress();
  const subject = opts.subject || "SubSaverPH support request";
  let body =
    opts.body ||
    opts.message ||
    "Hi SubSaverPH Support,\n\nOrder ID (if any):\nProblem:\n\nThank you.";
  if (opts.orderId && !body.includes(opts.orderId)) {
    body = `Order ID: ${opts.orderId}\n\n${body}`;
  }
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: email,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** mailto: fallback for devices with a default mail app (Outlook, Apple Mail, etc.). */
function mailtoSupportUrl(opts = {}) {
  const email = supportEmailAddress();
  const subject = opts.subject || "SubSaverPH support request";
  let body =
    opts.body ||
    opts.message ||
    "Hi SubSaverPH Support,\n\nOrder ID (if any):\nProblem:\n\nThank you.";
  if (opts.orderId && !body.includes(opts.orderId)) {
    body = `Order ID: ${opts.orderId}\n\n${body}`;
  }
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Open Gmail compose.
 * Windows Chrome/Edge often block window.open(..., "noopener") or return null.
 * A real <a target="_blank"> click (or same-tab assign) is reliable.
 */
function openSupportMail(opts = {}) {
  const gmail = gmailComposeUrl(opts);
  const mail = mailtoSupportUrl(opts);

  // 1) Prefer a synthetic <a> click — keeps user gesture, works with popup blockers better
  try {
    const a = document.createElement("a");
    a.href = gmail;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-hidden", "true");
    a.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(a);
    a.click();
    // Remove after a tick so the click is fully processed
    setTimeout(() => {
      try {
        a.remove();
      } catch {
        /* ignore */
      }
    }, 100);
    try {
      toast("Opening Gmail…");
    } catch {
      /* ignore */
    }
    return false;
  } catch {
    /* fall through */
  }

  // 2) Same-tab Gmail (always works if popups are fully blocked)
  try {
    window.location.assign(gmail);
    return false;
  } catch {
    /* fall through */
  }

  // 3) Last resort: system mail client
  try {
    window.location.href = mail;
  } catch {
    /* ignore */
  }
  return false;
}

/** On-site support form page (no mail app required). */
function goSupportPage(opts = {}) {
  try {
    if (opts.orderId || opts.subject || opts.message) {
      sessionStorage.setItem(
        "subsaverph_support_draft",
        JSON.stringify({
          orderId: opts.orderId || "",
          subject: opts.subject || "",
          message: opts.message || "",
        })
      );
    }
  } catch {
    /* ignore */
  }
  try {
    document.body.style.overflow = "";
    $("#drawer")?.classList.remove("open");
    $("#overlay")?.classList.remove("open");
  } catch {
    /* ignore */
  }
  const hash = location.hash || "";
  const onSupport =
    hash.replace(/[?#].*$/, "") === "#/support" || hash.startsWith("#/support");
  if (onSupport) {
    state.view = "support";
    render();
    window.scrollTo(0, 0);
    return;
  }
  location.hash = "#/support";
  if ((location.hash || "").replace(/[?#].*$/, "") === "#/support" && state.view !== "support") {
    state.view = "support";
    render();
    window.scrollTo(0, 0);
  }
}

function viewSupport() {
  const email = supportEmailAddress();
  const s = siteSettings();
  let draft = { orderId: "", subject: "", message: "" };
  try {
    draft = { ...draft, ...JSON.parse(sessionStorage.getItem("subsaverph_support_draft") || "{}") };
  } catch {
    /* ignore */
  }
  // Also accept #/support?order=...
  try {
    const q = location.hash.includes("?")
      ? location.hash.slice(location.hash.indexOf("?") + 1)
      : "";
    const p = new URLSearchParams(q);
    if (p.get("order")) draft.orderId = p.get("order");
    if (p.get("subject")) draft.subject = p.get("subject");
  } catch {
    /* ignore */
  }
  const defaultTopics = [
    "Login not working",
    "Missing code or credentials",
    "Wrong product delivered",
    "Payment charged but no order",
    "Account expired early",
    "Refund request",
    "Order status question",
    "Payment / checkout problem",
    "Other",
  ];
  const topicLines = String(s.supportSubjectOptions || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const topics = topicLines.length ? topicLines : defaultTopics;
  const subjectOptions = [
    { value: "", label: "Select a topic…" },
    ...topics.map((topic) => ({ value: topic, label: topic })),
  ];
  const draftSubject = String(draft.subject || "").trim();
  const knownSubjects = new Set(subjectOptions.map((o) => o.value).filter(Boolean));
  // Prefill: match a known option, else default blank (user picks from list)
  const selectedSubject = knownSubjects.has(draftSubject) ? draftSubject : "";
  const subjectOptsHtml = subjectOptions
    .map((o) => {
      const sel = o.value === selectedSubject ? " selected" : "";
      return `<option value="${escapeAttr(o.value)}"${sel}>${escapeHtml(o.label)}</option>`;
    })
    .join("");

  const gmailHref = gmailComposeUrl({
    subject: draft.subject || "SubSaverPH support request",
    body: draft.message || "",
    orderId: draft.orderId || "",
  });
  const mailtoHref = mailtoSupportUrl({
    subject: draft.subject || "SubSaverPH support request",
    body: draft.message || "",
    orderId: draft.orderId || "",
  });
  return `
    <div class="page support-page-wrap">
      <div class="page-inner support-page">
        <header class="support-hero">
          <div class="support-hero-badge">${escapeHtml(s.supportPageBadge || "Help center")}</div>
          <h1 class="support-hero-title">${escapeHtml(s.supportPageTitle || "We're here to help")}</h1>
          <p class="support-hero-lead">
            ${escapeHtml(
              s.supportPageLead ||
                "Order issues, login problems, missing codes — reach us by email or send a message below. We reply to the address you provide."
            )}
          </p>
          <div class="support-hero-meta">
            <span class="support-pill">
              <span class="support-pill-dot" aria-hidden="true"></span>
              Usually replies within 24h
            </span>
            <span class="support-pill support-pill-mono">${escapeHtml(email)}</span>
          </div>
        </header>

        <div class="support-channels" role="list">
          <a class="support-channel" role="listitem" href="${escapeAttr(gmailHref)}" target="_blank" rel="noopener noreferrer">
            <span class="support-channel-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z"/><path d="m5 7 7 5 7-5"/></svg>
            </span>
            <span class="support-channel-body">
              <span class="support-channel-title">Email with Gmail</span>
              <span class="support-channel-desc">Opens Gmail compose with our address ready</span>
            </span>
            <span class="support-channel-arrow" aria-hidden="true">→</span>
          </a>
          <a class="support-channel" role="listitem" href="${escapeAttr(mailtoHref)}">
            <span class="support-channel-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
            </span>
            <span class="support-channel-body">
              <span class="support-channel-title">Open email app</span>
              <span class="support-channel-desc">Outlook, Apple Mail, or your default app</span>
            </span>
            <span class="support-channel-arrow" aria-hidden="true">→</span>
          </a>
          <button type="button" class="support-channel" role="listitem" data-copy-support-email>
            <span class="support-channel-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
            </span>
            <span class="support-channel-body">
              <span class="support-channel-title">Copy email address</span>
              <span class="support-channel-desc">${escapeHtml(email)}</span>
            </span>
            <span class="support-channel-arrow" aria-hidden="true">⧉</span>
          </button>
        </div>

        <div class="support-layout">
          <section class="support-panel support-panel-form">
            <div class="support-panel-head">
              <h2 class="support-panel-title">${escapeHtml(s.supportFormTitle || "Send a message")}</h2>
              <p class="support-panel-sub">${escapeHtml(
                s.supportFormSub || "No email app needed — we get this in our inbox and reply by email."
              )}</p>
            </div>
            <form class="support-form" id="supportForm" novalidate>
              <div class="support-form-grid">
                <label class="support-field">Your name
                  <input name="name" type="text" autocomplete="name" placeholder="Juan Dela Cruz" />
                </label>
                <label class="support-field">Your email
                  <input name="email" type="email" required autocomplete="email" placeholder="you@gmail.com" />
                </label>
              </div>
              <div class="support-form-grid">
                <label class="support-field">Order ID
                  <input name="orderId" type="text" placeholder="e.g. PHA480BA604A" value="${escapeAttr(draft.orderId || "")}" />
                </label>
                <label class="support-field">Subject
                  <select name="subject" id="supportSubject" class="support-select" required>
                    ${subjectOptsHtml}
                  </select>
                </label>
              </div>
              <label class="support-field">Message
                <textarea name="message" required rows="5" placeholder="Tell us what happened, and include any error text if you can…">${escapeHtml(draft.message || "")}</textarea>
              </label>
              <p class="err support-form-status" id="supportFormErr"></p>
              <p class="ok support-form-status" id="supportFormOk"></p>
              <div class="support-form-actions">
                <button type="submit" class="btn solid support-submit" id="supportFormSubmit">Send message</button>
              </div>
            </form>
          </section>

          <aside class="support-panel support-panel-tips">
            <h2 class="support-panel-title">Before you write</h2>
            <ul class="support-tips">
              <li>
                <span class="support-tip-num">01</span>
                <span><strong>Order ID</strong> — from the success page or payment email so we can find your delivery fast.</span>
              </li>
              <li>
                <span class="support-tip-num">02</span>
                <span><strong>Be specific</strong> — login failed, code missing, wrong product, etc.</span>
              </li>
              <li>
                <span class="support-tip-num">03</span>
                <span><strong>Don't change logins</strong> — changing username, password, or billing on shared accounts voids support.</span>
              </li>
              <li>
                <span class="support-tip-num">04</span>
                <span><strong>Refunds</strong> — only if the product is defective or not delivered.</span>
              </li>
            </ul>
            <div class="support-tips-foot">
              <p class="support-tips-foot-label">Direct email</p>
              <p class="support-tips-foot-email">${escapeHtml(email)}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>`;
}

function paymentMethodsList() {
  const list = state.paymentMethods && state.paymentMethods.length
    ? state.paymentMethods
    : [
        // Card/Stripe omitted from fallback — use PayPal for card payments
        { id: "paypal", label: "PayPal", desc: "Instant codes", group: "instant", delivery: "auto" },
        { id: "crypto", label: "Crypto", desc: "Instant codes", group: "instant", delivery: "auto" },
        { id: "manual_gcash", label: "GCash (QR)", desc: "10–30 min", group: "ewallet", delivery: "manual" },
        { id: "manual_maya", label: "Maya (QR)", desc: "10–30 min", group: "ewallet", delivery: "manual" },
        { id: "gcash", label: "GCash", desc: "Instant codes", group: "ewallet", delivery: "auto" },
        { id: "paymaya", label: "Maya", desc: "Instant codes", group: "ewallet", delivery: "auto" },
        { id: "liqpay", label: "LiqPay", desc: "Instant codes", group: "instant", delivery: "auto" },
        { id: "demo", label: "Demo", desc: "Test only", group: "instant", delivery: "auto" },
      ];
  return list;
}

const PH_EWALLETS = new Set([
  "gcash",
  "paymaya",
  "grab_pay",
  "shopeepay",
  "xendit",
  "manual_gcash",
  "manual_maya",
]);
const MANUAL_EWALLETS = new Set(["manual_gcash", "manual_maya"]);
/** Instant code delivery after payment succeeds */
const AUTO_DELIVERY_METHODS = new Set([
  "paypal",
  "crypto",
  "card",
  "liqpay",
  "demo",
]);

function isManualEwalletMethod(method) {
  return MANUAL_EWALLETS.has(method);
}

function isAutoDeliveryMethod(method) {
  if (isManualEwalletMethod(method)) return false;
  if (AUTO_DELIVERY_METHODS.has(method)) return true;
  // Gateway PH e-wallets (PayMongo/Xendit) are auto; manual QR is not
  if (PH_EWALLETS.has(method) && !isManualEwalletMethod(method)) return true;
  return false;
}

function payButtonLabel(method) {
  if (method === "manual_gcash") return "Continue — scan GCash QR";
  if (method === "manual_maya") return "Continue — scan Maya QR";
  if (method === "gcash") return "Continue to GCash";
  if (method === "paymaya") return "Continue to Maya";
  if (method === "grab_pay") return "Continue to GrabPay";
  if (method === "shopeepay") return "Continue to ShopeePay";
  if (method === "xendit") return "Continue to Xendit";
  if (method === "card" && state.stripeEnabled) return "Continue to Stripe";
  if (method === "card" && state.xenditEnabled) return "Continue to Xendit Card";
  if (method === "paypal") return state.paypalEnabled ? "Continue to PayPal" : "Pay with PayPal (demo)";
  if (method === "crypto") {
    return state.cryptoEnabled ? "Continue to crypto pay" : "Pay with crypto (demo)";
  }
  if (method === "liqpay") {
    return state.liqpayEnabled ? "Continue to LiqPay" : "Pay with LiqPay (demo)";
  }
  return "Continue to pay";
}

/** Official payment brand logos (SVG marks). */
const PAYMENT_LOGOS = {
  manual_gcash: { src: "/assets/payments/gcash.svg?v=paylogo1", alt: "GCash", wide: true },
  gcash: { src: "/assets/payments/gcash.svg?v=paylogo1", alt: "GCash", wide: true },
  manual_maya: { src: "/assets/payments/maya.svg?v=paylogo1", alt: "Maya", wide: true },
  paymaya: { src: "/assets/payments/maya.svg?v=paylogo1", alt: "Maya", wide: true },
  paypal: { src: "/assets/payments/paypal.svg?v=paylogo1", alt: "PayPal" },
  crypto: { src: "/assets/payments/bitcoin.svg?v=paylogo1", alt: "Crypto" },
  card: { src: "/assets/payments/card-mark.svg?v=paylogo1", alt: "Card" },
  stripe: { src: "/assets/payments/stripe.svg?v=paylogo1", alt: "Stripe" },
  liqpay: { src: "/assets/payments/liqpay.svg?v=paylogo1", alt: "LiqPay", wide: true },
  grab_pay: { src: "/assets/payments/grab.svg?v=paylogo1", alt: "GrabPay" },
  shopeepay: { src: "/assets/payments/shopee.svg?v=paylogo1", alt: "ShopeePay" },
  xendit: { src: "/assets/payments/xendit-mark.svg?v=paylogo1", alt: "Xendit" },
  demo: { src: "/assets/payments/demo.svg?v=paylogo1", alt: "Demo" },
};

function paymentLogoMeta(methodId) {
  const id = String(methodId || "").toLowerCase();
  if (PAYMENT_LOGOS[id]) return PAYMENT_LOGOS[id];
  if (id.includes("gcash")) return PAYMENT_LOGOS.gcash;
  if (id.includes("maya") || id.includes("paymaya")) return PAYMENT_LOGOS.paymaya;
  if (id.includes("paypal")) return PAYMENT_LOGOS.paypal;
  if (id.includes("grab")) return PAYMENT_LOGOS.grab_pay;
  if (id.includes("shopee")) return PAYMENT_LOGOS.shopeepay;
  if (id.includes("crypto") || id.includes("btc") || id.includes("coin")) return PAYMENT_LOGOS.crypto;
  if (id.includes("card") || id.includes("stripe")) return PAYMENT_LOGOS.card;
  if (id.includes("liqpay")) return PAYMENT_LOGOS.liqpay;
  if (id.includes("xendit")) return PAYMENT_LOGOS.xendit;
  return null;
}

function paymentLogoHtml(methodId) {
  const meta = paymentLogoMeta(methodId);
  if (!meta) return "";
  const wide = meta.wide ? " co-method-logo--wide" : "";
  return `<span class="co-method-logo${wide}" aria-hidden="true"><img class="co-method-logo-img product-img" src="${escapeAttr(meta.src)}" alt="" width="48" height="32" loading="lazy" decoding="async" /></span>`;
}

function viewCheckout() {
  const cart = getCart();
  const t = cartTotals();
  if (!cart.length) {
    return `<div class="page"><div class="page-inner empty"><h2>Cart empty</h2><a class="btn solid" href="#/deals">Find a plan</a></div></div>`;
  }
  const methods = paymentMethodsList();
  const cancelled =
    typeof location !== "undefined" && location.hash.includes("cancelled=1");
  const stripeOn = !!state.stripeEnabled;
  const isTestKey = String(state.stripePublishableKey || "").startsWith("pk_test_");
  const ewalletMethods = methods.filter(
    (m) => PH_EWALLETS.has(m.id) || m.group === "ewallet" || m.delivery === "manual"
  );
  const instantMethods = methods.filter(
    (m) =>
      !PH_EWALLETS.has(m.id) &&
      m.group !== "ewallet" &&
      m.delivery !== "manual"
  );

  /** One short line only — avoid repeating delivery text already in labels */
  const shortDesc = (m) => {
    if (m.desc && String(m.desc).length <= 28) return String(m.desc);
    const isManual = m.delivery === "manual" || MANUAL_EWALLETS.has(m.id);
    if (isManual) return "10–30 min";
    if (isAutoDeliveryMethod(m.id) || m.delivery === "auto") return "Instant";
    return "";
  };

  const radioHtml = (m, checked) => {
    const isManual = m.delivery === "manual" || MANUAL_EWALLETS.has(m.id);
    const isAuto = m.delivery === "auto" || isAutoDeliveryMethod(m.id);
    const line = shortDesc(m);
    const tone = isManual ? "ewallet" : isAuto ? "instant" : "default";
    const logo = paymentLogoHtml(m.id);
    return `
      <label class="co-method co-method--${tone}${checked ? " is-checked" : ""}${logo ? " co-method--has-logo" : ""}" data-pay-method="${escapeAttr(m.id)}">
        <input type="radio" name="method" value="${escapeHtml(m.id)}" ${checked ? "checked" : ""} required />
        <span class="co-method-check" aria-hidden="true"></span>
        ${logo}
        <span class="co-method-body">
          <span class="co-method-name">${escapeHtml(m.label)}</span>
          ${line ? `<span class="co-method-meta">${escapeHtml(line)}</span>` : ""}
        </span>
      </label>`;
  };

  // Prefer instant methods when available; else GCash QR for PH shoppers
  const preferred =
    methods.find((m) => m.id === "paypal") ||
    methods.find((m) => m.id === "crypto") ||
    methods.find((m) => m.id === "manual_gcash") ||
    methods.find((m) => m.id === "gcash") ||
    methods.find((m) => PH_EWALLETS.has(m.id)) ||
    methods[0];
  const methodRadios = [
    ...(instantMethods.length
      ? [
          `<p class="co-group-label">Instant delivery</p>`,
          ...instantMethods.map((m) =>
            radioHtml(m, preferred && m.id === preferred.id)
          ),
        ]
      : []),
    ...(ewalletMethods.length
      ? [
          `<p class="co-group-label">E-wallet QR</p>`,
          ...ewalletMethods.map((m) =>
            radioHtml(
              m,
              preferred &&
                m.id === preferred.id &&
                !instantMethods.some((x) => x.id === preferred.id)
            )
          ),
        ]
      : []),
  ].join("");

  const payHelp =
    stripeOn && isTestKey
      ? `<div class="test-card-box co-test-card" id="stripeTestBox" hidden>
            <p class="test-card-label">Stripe test card</p>
            <ul>
              <li><strong>Card:</strong> <code>4242 4242 4242 4242</code></li>
              <li><strong>Expiry / CVC:</strong> any future · any 3 digits</li>
            </ul>
          </div>`
      : `<div id="stripeTestBox" hidden></div>`;

  const itemCount = cart.reduce((n, i) => n + (i.qty || 1), 0);
  const totalLabel = formatMoney(t.total);

  return `
    <div class="page page-checkout page-checkout--v2">
      <div class="page-inner page-inner--checkout">
        <header class="co-head">
          <a class="co-back" href="#/deals" aria-label="Back to deals">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
          </a>
          <div class="co-head-text">
            <p class="co-eyebrow">Secure checkout</p>
            <h1 class="co-title">Checkout</h1>
          </div>
        </header>

        ${cancelled ? `<p class="err co-banner-err">Payment cancelled. You can try again.</p>` : ""}

        <div class="checkout checkout--v2">
          <section class="co-card co-order" aria-label="Order summary">
            <div class="co-card-top">
              <h2 class="co-card-title">Your order</h2>
              <span class="co-chip">${itemCount} item${itemCount === 1 ? "" : "s"}</span>
            </div>
            <ul class="co-order-list">
              ${cart
                .map(
                  (i) => `
                <li class="co-order-row">
                  <span class="co-order-mono">${escapeHtml(i.monogram || "•")}</span>
                  <span class="co-order-info">
                    <span class="co-order-name">${escapeHtml(i.name)}</span>
                    <span class="co-order-sub">${escapeHtml(i.duration)} · qty ${i.qty}</span>
                  </span>
                  <span class="co-order-price">${formatLinePrice(i)}</span>
                </li>`
                )
                .join("")}
            </ul>
            <div class="co-totals">
              <div class="co-total-row"><span>Subtotal</span><span>${formatMoney(t.subtotal)}</span></div>
              ${
                t.saved > 0
                  ? `<div class="co-total-row co-total-save"><span>You save</span><span>−${formatMoney(t.saved)}</span></div>`
                  : ""
              }
              <div class="co-total-row co-total-grand"><span>Total</span><span>${totalLabel}</span></div>
            </div>
          </section>

          <form id="payForm" class="co-form form" novalidate>
            <section class="co-card">
              <h2 class="co-card-title">Contact</h2>
              <div class="co-field">
                <label class="co-label" for="coEmail">Email for delivery</label>
                <input class="co-input" id="coEmail" required type="email" name="email" placeholder="you@email.com" autocomplete="email" inputmode="email" />
              </div>
              <div class="co-field">
                <label class="co-label" for="coName">Full name</label>
                <input class="co-input" id="coName" required name="name" placeholder="Juan Dela Cruz" autocomplete="name" />
              </div>
            </section>

            <section class="co-card">
              <h2 class="co-card-title">Currency</h2>
              <div id="pageFxMount" class="co-fx"></div>
            </section>

            <section class="co-card">
              <h2 class="co-card-title">Payment method</h2>
              <div class="co-methods pay-methods" role="radiogroup" aria-label="Payment method">
                ${methodRadios}
              </div>
              ${payHelp}
            </section>

            <p class="err co-err" id="checkoutErr"></p>

            <div class="co-cta-spacer" aria-hidden="true"></div>
            <div class="co-sticky">
              <div class="co-sticky-total">
                <span>Total</span>
                <strong>${totalLabel}</strong>
              </div>
              <button class="btn solid co-submit" type="submit" id="payBtn" data-total="${escapeHtml(totalLabel)}">
                Review &amp; continue
              </button>
            </div>
          </form>
        </div>
      </div>

      ${checkoutTermsModalHtml(cart, t)}
    </div>`;
}

function checkoutTermsModalHtml(cart, totals) {
  const s = siteSettings() || state.settings || {};
  const eyebrow = s.checkoutTermsEyebrow || "Before you pay";
  const title = s.checkoutTermsTitle || "Purchase details & rules";
  const whatLines = settingsLines(s.checkoutWhatYouBuy, [
    "You are buying a **prepaid digital access** (login or code) for the selected product.",
    "Delivery is **digital** after payment — on the success page and by email when configured.",
    "SubSaverPH is an **independent storefront**, not affiliated with the listed brands.",
  ]);
  const ruleLines = settingsLines(s.checkoutRules, [
    "**No refund** after login details are delivered, except **defective** or **not delivered** products.",
    "Do **not** change username, password, billing, or subscription — that voids support and refunds.",
    "Personal use only. Do not resell or share logins.",
    "You must be **18+**. By paying you accept these rules.",
  ]);
  const supportEmail = s.supportEmail || "support@subsaverph.com";
  const supportText =
    s.checkoutSupportText ||
    `Questions or delivery issues: email ${supportEmail} and include your order ID.`;
  const acceptLabel =
    s.checkoutAcceptLabel ||
    "I have read and accept the purchase details, rules, and regulations above.";
  const confirmPrefix = s.checkoutConfirmLabel || "Accept & pay";

  return `
      <div class="terms-modal" id="termsModal" hidden>
        <div class="terms-modal-backdrop" data-terms-close></div>
        <div class="terms-modal-panel" role="dialog" aria-modal="true" aria-labelledby="termsModalTitle">
          <div class="terms-modal-head">
            <p class="eyebrow terms-modal-eyebrow">${escapeHtml(eyebrow)}</p>
            <h2 id="termsModalTitle">${escapeHtml(title)}</h2>
            <button type="button" class="icon terms-modal-x" data-terms-close aria-label="Close">×</button>
          </div>
          <div class="terms-modal-body">
            <section class="terms-block terms-block--order">
              <h3><span class="terms-step">1</span> Order summary</h3>
              <ul class="terms-order-list">
                ${cart
                  .map(
                    (i) => `
                  <li>
                    <strong>${escapeHtml(i.name)}</strong>
                    <span>${escapeHtml(i.duration)} × ${i.qty} · ${formatLinePrice(i)}</span>
                  </li>`
                  )
                  .join("")}
              </ul>
              <p class="terms-total"><span>Total</span><strong>${formatMoney(totals.total)}</strong></p>
            </section>

            <section class="terms-block terms-block--what">
              <h3><span class="terms-step">2</span> What you are buying</h3>
              ${bulletsHtml(whatLines, "terms-what-list")}
            </section>

            <section class="terms-block terms-block--rules">
              <h3><span class="terms-step">3</span> Rules &amp; regulations</h3>
              <ol class="terms-rules-list">
                ${ruleLines.map((l) => `<li>${formatRuleLine(l)}</li>`).join("")}
              </ol>
            </section>

            <section class="terms-block terms-block--support">
              <h3><span class="terms-step">4</span> Support</h3>
              <p class="terms-support-text">${escapeHtml(supportText)}</p>
              <div class="terms-support-links">
                <a href="#/support" class="btn ghost js-go-support">Contact support</a>
                <a href="#/terms">Terms of Use</a>
                <a href="#/privacy">Privacy Policy</a>
              </div>
            </section>
          </div>
          <div class="terms-modal-foot">
            <label class="check terms-accept-label">
              <input type="checkbox" id="termsAccept" />
              <span>${escapeHtml(acceptLabel)}</span>
            </label>
            <p class="err" id="termsErr"></p>
            <div class="terms-actions">
              <button type="button" class="btn" data-terms-close>Back</button>
              <button type="button" class="btn solid" id="termsConfirmBtn" disabled data-confirm-prefix="${escapeHtml(confirmPrefix)}">
                ${escapeHtml(confirmPrefix)} · ${formatMoney(totals.total)}
              </button>
            </div>
          </div>
        </div>
      </div>`;
}

function viewManualEwalletPending(order) {
  const payTo = order.payTo || {};
  const wallet = payTo.wallet || (order.method === "manual_maya" ? "Maya" : "GCash");
  const accountName = payTo.name || "";
  const amount =
    order.amountFormatted ||
    (order.amountPhp != null ? `₱${Number(order.amountPhp).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—");
  const qrUrl =
    (order.paymentInstructions && order.paymentInstructions.qrUrl) ||
    payTo.qrUrl ||
    "";
  const st = String(order.status || "").toLowerCase();
  const submitted = st === "payment_submitted";
  const itemsHtml = (order.items || [])
    .map(
      (i) =>
        `<div class="manual-pay-line"><span class="manual-pay-line-name">${escapeHtml(i.name || i.id)}</span><span class="manual-pay-line-qty">× ${escapeHtml(String(i.qty || 1))}</span></div>`
    )
    .join("");

  return `
    <div class="success manual-pay-page${submitted ? " manual-pay-page--submitted" : ""}">
      <div class="success-card success-card-wide manual-pay-card">
        <div class="manual-pay-head">
          <div class="ok">${submitted ? "✓" : "₱"}</div>
          <h1>${submitted ? "Payment submitted" : "Pay with " + escapeHtml(wallet)}</h1>
          <p class="muted manual-pay-meta">Order <strong class="success-order-id">${escapeHtml(order.id || "")}</strong>
            ${order.email ? ` · ${escapeHtml(order.email)}` : ""}</p>
          <p class="muted manual-pay-lead">
            ${
              submitted
                ? "We received your reference. Codes are usually ready within <strong>10–30 minutes</strong>."
                : "Scan the QR, pay the exact amount, then submit your reference below."
            }
          </p>
        </div>

        ${
          !submitted
            ? `<div class="manual-pay-box" role="region" aria-label="Payment QR">
          <h2 class="manual-pay-title">Amount to pay</h2>
          <div class="manual-pay-amount">${escapeHtml(amount)}</div>
          ${
            qrUrl
              ? `<div class="manual-pay-qr">
              <p class="manual-pay-qr-label">Scan with ${escapeHtml(wallet)}</p>
              <img class="pay-qr" src="${escapeAttr(qrUrl)}" alt="${escapeAttr(wallet)} payment QR" width="260" height="260" decoding="async" />
              ${accountName ? `<p class="manual-pay-qr-name">${escapeHtml(accountName)}</p>` : ""}
            </div>`
              : `<p class="err manual-pay-err">QR missing — contact support with Order ID ${escapeHtml(order.id || "")}.</p>`
          }
          <div class="manual-pay-grid">
            <div class="manual-pay-field">
              <span class="manual-pay-label">Order ID</span>
              <div class="manual-pay-value-row">
                <code class="manual-pay-value" data-copy-text>${escapeHtml(order.id || "")}</code>
                <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(order.id || "")}">Copy</button>
              </div>
            </div>
          </div>
          <ol class="manual-pay-steps">
            <li>Open ${escapeHtml(wallet)} and scan the QR</li>
            <li>Pay exactly <strong>${escapeHtml(amount)}</strong></li>
            <li>Submit your reference number below</li>
          </ol>
        </div>

        <form id="manualProofForm" class="form manual-proof-form">
          <h3 class="manual-proof-title">I already paid</h3>
          <label class="manual-proof-label">Payment reference number
            <input required name="paymentReference" placeholder="e.g. 1234 567 890123" autocomplete="off" inputmode="text" />
          </label>
          <label class="manual-proof-label">Optional note
            <input name="note" placeholder="Sender name…" autocomplete="off" />
          </label>
          <p class="err manual-proof-err" id="manualProofErr"></p>
          <button class="btn solid full" type="submit" id="manualProofBtn">Submit payment reference</button>
        </form>`
            : `<div class="manual-pay-box manual-pay-box--submitted" role="region" aria-label="Payment received">
          <h2 class="manual-pay-title">Payment details</h2>
          <div class="manual-pay-grid manual-pay-grid--submitted">
            <div class="manual-pay-field">
              <span class="manual-pay-label">Method</span>
              <div class="manual-pay-value-row manual-pay-value-row--solo">
                <code class="manual-pay-value">${escapeHtml(wallet)} QR</code>
              </div>
            </div>
            <div class="manual-pay-field">
              <span class="manual-pay-label">Amount</span>
              <div class="manual-pay-value-row manual-pay-value-row--solo">
                <code class="manual-pay-value">${escapeHtml(amount)}</code>
              </div>
            </div>
            <div class="manual-pay-field">
              <span class="manual-pay-label">Reference</span>
              <div class="manual-pay-value-row">
                <code class="manual-pay-value">${escapeHtml(order.paymentReference || "—")}</code>
                <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(order.paymentReference || "")}">Copy</button>
              </div>
            </div>
            <div class="manual-pay-field">
              <span class="manual-pay-label">Order ID</span>
              <div class="manual-pay-value-row">
                <code class="manual-pay-value">${escapeHtml(order.id || "")}</code>
                <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(order.id || "")}">Copy</button>
              </div>
            </div>
          </div>
          <button type="button" class="btn solid full manual-pay-refresh" id="manualRefreshBtn">Check if codes are ready</button>
          <p class="err manual-proof-err" id="manualProofErr"></p>
        </div>`
        }

        <div class="manual-pay-order-summary">
          <h3 class="manual-pay-summary-title">Your order</h3>
          <div class="manual-pay-lines">${itemsHtml || "<p class='muted manual-pay-empty'>—</p>"}</div>
        </div>

        <div class="support-inline manual-pay-support">
          <button type="button" class="btn ghost" data-go-support-order="${escapeAttr(order.id || "")}">Contact support</button>
        </div>
        <div class="cta manual-pay-cta">
          <a class="btn" href="#/deals">More deals</a>
          <a class="btn" href="#/home">Home</a>
        </div>
      </div>
    </div>`;
}

function viewSuccess() {
  let order = null;
  try {
    order = JSON.parse(sessionStorage.getItem("subsaverph_last") || "null");
  } catch {
    order = null;
  }
  // hash format: #/success?session_id=cs_xxx or ?provider=paymongo&ref=...
  const hashQuery = location.hash.includes("?")
    ? location.hash.slice(location.hash.indexOf("?") + 1)
    : "";
  const params = new URLSearchParams(hashQuery);
  const sessionId = params.get("session_id");
  const provider = params.get("provider");
  const ref = params.get("ref");

  if (!order && sessionId) {
    fetch(`/api/checkout/session/${encodeURIComponent(sessionId)}`, {
      credentials: "same-origin",
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.error || "Could not load order");
        sessionStorage.setItem("subsaverph_last", JSON.stringify(d.order));
        clearCart();
        updateBadge();
        location.hash = "#/success";
        render();
      })
      .catch((err) => {
        const el = $("#app");
        if (el) {
          el.innerHTML = `<div class="success"><div class="success-card"><h1>Payment status</h1><p class="muted">${escapeHtml(err.message)}</p><p class="muted">If you were charged, contact support with your email.</p><a class="btn solid" href="#/deals">Back to deals</a></div></div>`;
        }
      });
    return `
      <div class="success">
        <div class="success-card">
          <div class="ok">…</div>
          <h1>Confirming payment</h1>
          <p class="muted">Retrieving your codes…</p>
        </div>
      </div>`;
  }

  if (!order && provider && ref) {
    fetch(
      `/api/checkout/complete?provider=${encodeURIComponent(provider)}&ref=${encodeURIComponent(ref)}`,
      { credentials: "same-origin" }
    )
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.error || "Could not complete order");
        sessionStorage.setItem("subsaverph_last", JSON.stringify(d.order));
        clearCart();
        updateBadge();
        location.hash = "#/success";
        render();
      })
      .catch((err) => {
        const el = $("#app");
        if (el) {
          el.innerHTML = `<div class="success"><div class="success-card"><h1>Confirming payment</h1><p class="muted">${escapeHtml(err.message)}</p><p class="muted">If you already paid, wait a few seconds and refresh, or contact support with your email.</p><button class="btn solid" type="button" onclick="location.reload()">Refresh</button></div></div>`;
        }
      });
    return `
      <div class="success">
        <div class="success-card">
          <div class="ok">…</div>
          <h1>Confirming ${escapeHtml(provider)} payment</h1>
          <p class="muted">Assigning your codes…</p>
        </div>
      </div>`;
  }

  if (!order) {
    return `<div class="success"><div class="empty"><h2>No order</h2><a class="btn solid" href="#/deals">Shop</a></div></div>`;
  }

  // Manual e-wallet: show pay instructions until status is paid
  const orderStatus = String(order.status || "").toLowerCase();
  if (
    order.paymentMode === "manual_ewallet" &&
    orderStatus !== "paid" &&
    orderStatus !== "refunded"
  ) {
    return viewManualEwalletPending(order);
  }

  /** Build full delivery packet: credentials + features + instructions + rules */
  const deliveryPackets = (order.items || [])
    .map((item) => {
      let creds = Array.isArray(item.credentials) ? item.credentials : [];
      if (!creds.length && Array.isArray(item.codes)) {
        creds = item.codes.map((c) => parseCredentialClient(c));
      }
      let credHtml = "";
      if (!creds.length) {
        credHtml = `<p class="muted" style="margin:8px 0 0">No login on file — contact support with order ID.</p>`;
      } else {
        credHtml = creds
          .map((cr, idx) => {
            const user = cr.username || cr.user || "";
            const pass = cr.password || cr.pass || "";
            const code = cr.code || (!user && !pass ? cr.raw || "" : "");
            const title =
              creds.length > 1 ? `Login #${idx + 1}` : "Your login";
            if (user || pass) {
              return `
            <div class="cred-card" data-cred-card>
              <div class="cred-product">${escapeHtml(title)}</div>
              <div class="cred-field">
                <label>Username / Email</label>
                <div class="cred-value-row">
                  <code class="cred-value" data-copy-text>${escapeHtml(user || "—")}</code>
                  <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(user)}" ${user ? "" : "disabled"}>Copy</button>
                </div>
              </div>
              <div class="cred-field">
                <label>Password</label>
                <div class="cred-value-row">
                  <code class="cred-value" data-copy-text>${escapeHtml(pass || "—")}</code>
                  <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(pass)}" ${pass ? "" : "disabled"}>Copy</button>
                </div>
              </div>
              <button type="button" class="btn solid sm full cred-copy-both" data-copy-user="${escapeAttr(user)}" data-copy-pass="${escapeAttr(pass)}" style="margin-top:12px">
                Copy username + password
              </button>
            </div>`;
            }
            return `
            <div class="cred-card" data-cred-card>
              <div class="cred-product">${escapeHtml(title)}</div>
              <div class="cred-field">
                <label>Access code</label>
                <div class="cred-value-row">
                  <code class="cred-value" data-copy-text>${escapeHtml(code || "—")}</code>
                  <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(code)}" ${code ? "" : "disabled"}>Copy</button>
                </div>
              </div>
            </div>`;
          })
          .join("");
      }

      /* Keep success package simple: product + login only (no repeated features/rules) */
      const metaBits = [item.duration || "", item.brand || ""].filter(Boolean);
      const instructions = String(item.howToRedeem || "").trim();
      const instructionsHtml = instructions
        ? `<div class="delivery-block">
            <h3 class="delivery-block-title">How to use</h3>
            <div class="delivery-pre">${escapeHtml(instructions)}</div>
          </div>`
        : "";

      return `
        <article class="delivery-packet">
          <header class="delivery-packet-head">
            <span class="mono-box sm">${escapeHtml(item.monogram || "•")}</span>
            <div>
              <h2 class="delivery-packet-title">${escapeHtml(item.name || "Product")}</h2>
              ${metaBits.length ? `<p class="muted delivery-meta">${escapeHtml(metaBits.join(" · "))}</p>` : ""}
            </div>
          </header>
          <div class="delivery-block">
            <h3 class="delivery-block-title">Login</h3>
            <div class="cred-list">${credHtml}</div>
          </div>
          ${instructionsHtml}
        </article>`;
    })
    .join("");

  const emailNote = order.emailSent
    ? `Invoice + login details were emailed to <strong style="color:var(--text)">${escapeHtml(order.email)}</strong>. Check inbox and spam.`
    : order.email
      ? `Logins are shown below. Email to <strong style="color:var(--text)">${escapeHtml(order.email)}</strong> was not confirmed${order.emailDetail ? ` (${escapeHtml(String(order.emailDetail).slice(0, 80))})` : ""}. Save them here.`
      : `Save your login details below.`;

  const ss = siteSettings();
  return `
    <div class="success">
      <div class="success-card success-card-wide">
        <div class="ok">OK</div>
        <h1>${escapeHtml(ss.successTitle || "Order delivered")}</h1>
        <p class="muted">Order <strong class="success-order-id">${escapeHtml(order.id)}</strong><br/>${emailNote}</p>

        <div class="cred-panel delivery-panel" role="region" aria-label="Your product delivery">
          <div class="cred-panel-head">
            <h2>${escapeHtml(ss.successPackageTitle || "Your access package")}</h2>
          </div>
          <div class="delivery-list">${deliveryPackets}</div>
        </div>

        <p class="muted" style="font-size:0.8rem;margin-top:16px">${escapeHtml(
          ss.successFooterNote ||
            "Save these credentials now. Follow the instructions and rules for each product. Not affiliated with listed brands."
        )}</p>
        <div class="support-inline">
          <p class="muted" style="margin:0;font-size:0.9rem">Problem with this order?</p>
          <button type="button" class="btn solid" data-go-support-order="${escapeAttr(order.id || "")}" data-go-support-pay="${escapeAttr(order.providerRef || order.stripeSessionId || "")}">Contact support</button>
          <a class="btn ghost js-go-support" href="#/support">Support page</a>
        </div>
        <div class="cta" style="justify-content:center;margin-top:22px">
          <a class="btn solid" href="#/deals">More deals</a>
          <a class="btn" href="#/home">Home</a>
        </div>
      </div>
    </div>`;
}

/** Client-side parse of legacy code strings into username/password */
function parseCredentialClient(raw) {
  const text = String(raw || "").trim();
  if (!text) return { username: "", password: "", raw: "", code: "" };
  let m = text.match(/user(?:name)?\s*[:\-]\s*(.+?)\s+(?:pass(?:word)?|pwd)\s*[:\-]\s*(.+)$/i);
  if (m) return { username: m[1].trim(), password: m[2].trim(), raw: text, code: "" };
  if (text.includes("|")) {
    const [a, b] = text.split("|").map((s) => s.trim());
    if (a && b) return { username: a, password: b, raw: text, code: "" };
  }
  if (text.includes(" / ")) {
    const [a, b] = text.split(" / ").map((s) => s.trim());
    if (a && b) return { username: a, password: b, raw: text, code: "" };
  }
  if ((text.match(/:/g) || []).length === 1) {
    const [a, b] = text.split(":").map((s) => s.trim());
    if (a && b && !a.includes(" ")) return { username: a, password: b, raw: text, code: "" };
  }
  return { username: "", password: "", raw: text, code: text };
}

function bindProductSearch() {
  const input = $("#productSearch");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goSearch(input.value);
    }
  });
  $("#searchGo")?.addEventListener("click", () => goSearch(input.value));
  $("#clearSearch")?.addEventListener("click", () => {
    state.query = "";
    goSearch("");
  });
  $("#clearSearchLink")?.addEventListener("click", () => {
    state.query = "";
    goSearch("");
  });
}

function bindSearchTags() {
  $$("[data-q]").forEach((btn) => {
    btn.addEventListener("click", () => goSearch(btn.dataset.q));
  });
}

function syncGlobalSearchInput() {
  const g = $("#globalSearchInput");
  if (g && document.activeElement !== g) g.value = state.query || "";
}

/** Group product hits into brand-level suggestions (SuperGrok once, not 7d + 1m) */
function brandSuggestLabel(brand) {
  if (brand === "xAI") return "SuperGrok";
  return brand || "Other";
}

function brandMonogram(brand) {
  const map = { xAI: "SG", Canva: "CV", CapCut: "CC", Netflix: "NF", YouTube: "YT" };
  return map[brand] || (brand || "??").slice(0, 2).toUpperCase();
}

function renderSuggest(q) {
  const box = $("#searchSuggest");
  if (!box) return;
  const query = (q || "").trim();
  if (!query) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const hits = suggestDeals(window.DEALS || [], query, 12);
  if (!hits.length) {
    box.innerHTML = `<div class="suggest-empty">No matches — press Enter to search</div>`;
    box.hidden = false;
    return;
  }

  // One row per brand (e.g. SuperGrok), not each plan
  const byBrand = new Map();
  for (const d of hits) {
    const key = d.brand || d.id;
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key).push(d);
  }

  const brandRows = [...byBrand.entries()].slice(0, 6).map(([brand, list]) => {
    const label = brandSuggestLabel(brand);
    const count = list.length;
    const from = Math.min(...list.map((d) => d.price));
    const sample = list[0];
    const priceLabel =
      count > 1
        ? `From ${formatDealPrice({ ...sample, price: from }, "price")}`
        : formatDealPrice(sample, "price");
    return `
    <button type="button" class="suggest-item" data-suggest-brand="${escapeHtml(label)}" role="option">
      <span class="mono-box tiny">${escapeHtml(brandMonogram(brand))}</span>
      <span class="suggest-text">
        <strong>${highlightMatch(label, query)}</strong>
        <em>${count} plan${count === 1 ? "" : "s"} · ${escapeHtml(sample.category || brand)}</em>
      </span>
      <span class="suggest-price">${priceLabel}</span>
    </button>`;
  });

  box.innerHTML =
    brandRows.join("") +
    `<button type="button" class="suggest-all" data-suggest-all="${escapeHtml(query)}">View all results for “${escapeHtml(query)}” →</button>`;
  box.hidden = false;
}

function bindGlobalSearch() {
  const input = $("#globalSearchInput");
  const box = $("#searchSuggest");
  const wrap = $("#globalSearch");
  if (!input) return;

  input.addEventListener("input", () => {
    renderSuggest(input.value);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) renderSuggest(input.value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      box.hidden = true;
      goSearch(input.value);
    }
    if (e.key === "Escape") {
      box.hidden = true;
      input.blur();
    }
  });

  box?.addEventListener("click", (e) => {
    const all = e.target.closest("[data-suggest-all]");
    if (all) {
      box.hidden = true;
      goSearch(all.dataset.suggestAll);
      return;
    }
    const brandItem = e.target.closest("[data-suggest-brand]");
    if (brandItem) {
      box.hidden = true;
      goSearch(brandItem.dataset.suggestBrand);
      return;
    }
    const item = e.target.closest("[data-suggest-id]");
    if (item) {
      box.hidden = true;
      location.hash = `#/deal/${item.dataset.suggestId}`;
    }
  });

  document.addEventListener("click", (e) => {
    if (wrap && !wrap.contains(e.target)) {
      if (box) box.hidden = true;
    }
  });

  // "/" focuses search (when not typing in an input)
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function mountPageFx() {
  const mount = $("#pageFxMount");
  if (!mount) return;
  mount.innerHTML = `
    <div class="currency-picker page-fx" id="pageCurrencyPicker">
      <button type="button" class="fx-btn" data-fx-btn>
        <span class="fx-caption">Pay</span>
        <span data-fx-label>PHP</span>
        <span class="fx-chevron">▾</span>
      </button>
      <div class="fx-panel" data-fx-panel hidden>
        <div class="fx-search-wrap">
          <input type="search" data-fx-search placeholder="Search currency…" autocomplete="off" />
        </div>
        <div class="fx-list" data-fx-list></div>
      </div>
    </div>`;
  mountCurrencyPicker($("#pageCurrencyPicker"), {
    onChange: () => {
      render();
      if ($("#drawer").classList.contains("open")) renderCart();
      toast(`Pay in ${getCurrencyCode()}`);
    },
  });
}

function render() {
  try {
    let html = "";
    switch (state.view) {
      case "deals":
        html = viewDeals();
        break;
      case "deal":
        html = viewDeal();
        break;
      case "search":
        html = viewSearch();
        break;
      case "how":
        // How it works page removed — send old links home
        html = viewHome();
        break;
      case "about":
        html = viewAbout();
        break;
      case "terms":
        html = viewTerms();
        break;
      case "privacy":
        html = viewPrivacy();
        break;
      case "support":
      case "contact":
        html = viewSupport();
        break;
      case "checkout":
        html = viewCheckout();
        break;
      case "success":
        html = viewSuccess();
        break;
      default:
        html = viewHome();
    }
    const root = $("#app");
    if (!root) return;
    root.innerHTML = html;
    updateBadge();
    syncMobileTabbar();
    $$("[data-rates]").forEach((el) => {
      el.textContent = ratesNote();
    });
    bindProductSearch();
    bindSearchTags();
    mountPageFx();
    bind();
    bindProductSlider();
    syncGlobalSearchInput();
    applySiteChrome();
    applyI18n();
    // Full-page translation for product text + leftover English
    if (getLang() !== "en") {
      queueTranslateDom(document.body, getLang());
    }
    // After payment / success screens, keep user at the top on mobile
    if (state.view === "success" || state.view === "checkout") {
      scrollPageToTop();
    }
  } catch (err) {
    console.error("SubSaverPH render error:", err);
    const root = $("#app");
    if (root) {
      root.innerHTML = `<div class="page"><div class="page-inner empty"><h2>Something went wrong</h2><p class="muted">${escapeHtml(
        String(err && err.message ? err.message : err)
      )}</p><p class="muted">${dealsList().length} products loaded.</p><a class="btn solid" href="#/deals">Browse deals</a></div></div>`;
    }
  }
}

/** Homepage product image carousel (autoplay; no prev/next/pause buttons). */
let _productSliderTimer = null;
let _productSliderProgressTimer = null;

function stopProductSlider() {
  if (_productSliderTimer) {
    clearInterval(_productSliderTimer);
    _productSliderTimer = null;
  }
  if (_productSliderProgressTimer) {
    clearInterval(_productSliderProgressTimer);
    _productSliderProgressTimer = null;
  }
}

function bindProductSlider() {
  stopProductSlider();
  const root = $("#productSlider");
  if (!root) return;
  const stage = root.querySelector(".product-slider-stage") || root;
  const slides = $$(".product-slide", root);
  const dots = $$(".product-slider-dot", root);
  const progress = $("#productSliderProgress");
  if (slides.length < 2) return;

  let index = 0;
  const DURATION = 4500;

  const show = (i) => {
    index = ((i % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, n) => {
      const on = n === index;
      slide.classList.toggle("is-active", on);
      if (on) slide.removeAttribute("hidden");
      else slide.setAttribute("hidden", "");
      const link = slide.querySelector("a");
      if (link) link.tabIndex = on ? 0 : -1;
    });
    dots.forEach((dot, n) => {
      const on = n === index;
      dot.classList.toggle("is-active", on);
      dot.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (progress) {
      progress.style.transition = "none";
      progress.style.width = "0%";
      // force reflow then animate
      void progress.offsetWidth;
      progress.style.transition = `width ${DURATION}ms linear`;
      progress.style.width = "100%";
    }
  };

  const next = () => show(index + 1);
  const prev = () => show(index - 1);

  const startAuto = () => {
    stopProductSlider();
    if (document.hidden) return;
    if (progress) {
      progress.style.transition = "none";
      progress.style.width = "0%";
      void progress.offsetWidth;
      progress.style.transition = `width ${DURATION}ms linear`;
      progress.style.width = "100%";
    }
    _productSliderTimer = setInterval(next, DURATION);
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const to = Number(dot.getAttribute("data-slide-to") || 0);
      show(to);
      startAuto();
    });
  });

  /* Mobile swipe between brands */
  let touchX = 0;
  let touchY = 0;
  let touchActive = false;
  stage.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      touchActive = true;
      touchX = t.clientX;
      touchY = t.clientY;
    },
    { passive: true }
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      if (!touchActive) return;
      touchActive = false;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchX;
      const dy = t.clientY - touchY;
      if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      if (dx < 0) next();
      else prev();
      startAuto();
    },
    { passive: true }
  );

  window.__ssphSliderResume = () => {
    if (!document.hidden) startAuto();
  };

  if (!window.__ssphSliderVisBound) {
    window.__ssphSliderVisBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopProductSlider();
      else if (typeof window.__ssphSliderResume === "function") window.__ssphSliderResume();
    });
  }

  show(0);
  startAuto();
}

function bind() {
  // Order help → Support page with draft prefilled
  $$("[data-go-support-order]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const oid = btn.getAttribute("data-go-support-order") || "";
      const pay = btn.getAttribute("data-go-support-pay") || "";
      goSupportPage({
        orderId: oid,
        subject: oid ? `Order help ${oid}` : "Order help",
        message: oid
          ? `Order ID: ${oid}\nPayment ID: ${pay || "—"}\n\nProblem:\n`
          : "",
      });
    });
  });
  const appRoot = $("#app") || document;
  $$("[data-copy-support-email]", appRoot).forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const email = supportEmailAddress();
      try {
        await navigator.clipboard.writeText(email);
        toast("Support email copied");
      } catch {
        toast(email, false);
      }
    });
  });
  // Any Support link inside the app → Support page
  $$("a.js-go-support, button.js-go-support, a[href='#/support'], a[href='#/contact']", appRoot).forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      goSupportPage();
    });
  });

  // On-site support form → server Resend
  const supportForm = $("#supportForm");
  if (supportForm && !supportForm.dataset.bound) {
    supportForm.dataset.bound = "1";

    supportForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const errEl = $("#supportFormErr");
      const okEl = $("#supportFormOk");
      const btn = $("#supportFormSubmit");
      if (errEl) errEl.textContent = "";
      if (okEl) okEl.textContent = "";
      const fd = new FormData(supportForm);
      const subject = String(fd.get("subject") || "").trim();
      if (!subject) {
        if (errEl) errEl.textContent = "Please select a subject.";
        toast("Please select a subject.", true);
        $("#supportSubject")?.focus();
        return;
      }
      const payload = {
        name: String(fd.get("name") || "").trim(),
        email: String(fd.get("email") || "").trim(),
        orderId: String(fd.get("orderId") || "").trim(),
        subject,
        message: String(fd.get("message") || "").trim(),
      };
      if (!payload.email || !payload.email.includes("@")) {
        if (errEl) errEl.textContent = "Enter your email so we can reply.";
        toast("Enter your email so we can reply.", true);
        return;
      }
      if (payload.message.length < 10) {
        if (errEl) errEl.textContent = "Please describe your problem (a few more words).";
        toast("Please describe your problem (a few more words).", true);
        return;
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending…";
      }
      try {
        const res = await fetch("/api/support/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        const raw = await res.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          if (/^\s*<!DOCTYPE/i.test(raw) || /^\s*<html/i.test(raw)) {
            throw new Error(
              "Server error page (try again in a minute). Please retry — your message may still be saved."
            );
          }
          data = {};
        }
        if (!res.ok) {
          throw new Error(data.error || data.detail || `Send failed (HTTP ${res.status})`);
        }
        try {
          sessionStorage.removeItem("subsaverph_support_draft");
        } catch {
          /* ignore */
        }
        const friendly =
          data.message ||
          (data.emailOk === false
            ? "Message saved. We will get back to you soon."
            : "Message sent. We will reply to your email as soon as we can.");
        if (okEl) okEl.textContent = friendly;
        toast(data.emailOk === false ? "Message saved — we will reply soon" : "Support message sent");
        supportForm.reset();
      } catch (err) {
        const msg = err.message || "Could not send message";
        if (errEl) errEl.textContent = msg;
        toast(msg, true);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Send message";
        }
      }
    });
  }

  // Success page: copy username / password
  $$(".cred-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const prev = btn.textContent;
        btn.textContent = "Copied!";
        toast("Copied");
        setTimeout(() => {
          btn.textContent = prev || "Copy";
        }, 1400);
      } catch {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("Copied");
      }
    });
  });
  $$(".cred-copy-both").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = btn.getAttribute("data-copy-user") || "";
      const p = btn.getAttribute("data-copy-pass") || "";
      const text = `Username: ${u}\nPassword: ${p}`;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied both!";
        toast("Username & password copied");
        setTimeout(() => {
          btn.textContent = "Copy username + password";
        }, 1600);
      } catch {
        toast("Could not copy — select text manually");
      }
    });
  });

  // Manual e-wallet: submit reference / refresh status
  const manualProofForm = $("#manualProofForm");
  if (manualProofForm) {
    manualProofForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = $("#manualProofErr");
      const btn = $("#manualProofBtn");
      const fd = new FormData(manualProofForm);
      let order = null;
      try {
        order = JSON.parse(sessionStorage.getItem("subsaverph_last") || "null");
      } catch {
        order = null;
      }
      if (!order?.id) {
        if (errEl) errEl.textContent = "Order missing — start checkout again.";
        return;
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Submitting…";
      }
      if (errEl) errEl.textContent = "";
      try {
        const res = await fetch("/api/checkout/manual/proof", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            orderId: order.id,
            email: order.email || "",
            paymentReference: fd.get("paymentReference"),
            note: fd.get("note") || "",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not submit reference");
        sessionStorage.setItem("subsaverph_last", JSON.stringify(data.order));
        try {
          saveOrder(data.order);
        } catch {
          /* optional */
        }
        toast("Reference submitted — waiting for confirmation");
        render();
        scrollPageToTop();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || "Submit failed";
        toast(err.message || "Submit failed", true);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Submit payment reference";
        }
      }
    });
  }
  const manualRefreshBtn = $("#manualRefreshBtn");
  if (manualRefreshBtn) {
    manualRefreshBtn.addEventListener("click", async () => {
      const errEl = $("#manualProofErr");
      let order = null;
      try {
        order = JSON.parse(sessionStorage.getItem("subsaverph_last") || "null");
      } catch {
        order = null;
      }
      if (!order?.id) return;
      manualRefreshBtn.disabled = true;
      manualRefreshBtn.textContent = "Checking…";
      try {
        const q = order.email
          ? `?email=${encodeURIComponent(order.email)}`
          : "";
        const res = await fetch(
          `/api/checkout/manual/${encodeURIComponent(order.id)}${q}`,
          { credentials: "same-origin" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load status");
        sessionStorage.setItem("subsaverph_last", JSON.stringify(data.order));
        try {
          saveOrder(data.order);
        } catch {
          /* optional */
        }
        if (String(data.order?.status || "").toLowerCase() === "paid") {
          toast("Payment confirmed — codes unlocked");
        } else {
          toast(`Status: ${data.order?.status || "pending"}`);
        }
        render();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || "Refresh failed";
        toast(err.message || "Refresh failed", true);
        manualRefreshBtn.disabled = false;
        manualRefreshBtn.textContent = "Check payment status";
      }
    });
  }

  $$("[data-add]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const deal = getDeal(btn.dataset.add);
      if (!deal) {
        toast("Product not found", true);
        return;
      }
      if (isSoldOut(deal)) {
        toast("SOLD OUT — no stock left");
        return;
      }
      addDeal(deal);
      toast("Added to cart");
      updateBadge();
      openCart();
    });
  });

  $$("[data-wish]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.wish;
      if (!id) return;
      const on = toggleWish(id);
      btn.classList.toggle("active", on);
      btn.textContent = on ? "♥" : "♡";
      toast(on ? "Saved to wishlist" : "Removed from wishlist");
    });
  });

  $$("[data-buy-now]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deal = getDeal(btn.dataset.buyNow);
      if (isSoldOut(deal)) {
        toast("SOLD OUT — no stock left");
        return;
      }
      addDeal(deal);
      location.hash = "#/checkout";
    });
  });

  $$("[data-brand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.brand = btn.dataset.brand;
      state.category = "All";
      state.query = "";
      location.hash = "#/deals";
      parseRoute();
    });
  });

  $$("[data-category]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cat = btn.dataset.category || "All";
      state.category = cat;
      state.brand = "All";
      state.query = "";
      location.hash = "#/deals";
      parseRoute();
    });
  });

  bindSearchTags();

  $$('input[name="brand"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.brand = input.value;
      render();
    });
  });

  $$('input[name="cat"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.category = input.value;
      render();
    });
  });

  const sort = $("#sortSelect");
  if (sort) {
    sort.addEventListener("change", () => {
      state.sort = sort.value;
      render();
    });
  }

  const form = $("#payForm");
  if (form) {
    const btn = $("#payBtn");
    const totalLabel = btn?.dataset?.total || "";
    const modal = $("#termsModal");
    const termsAccept = $("#termsAccept");
    const termsConfirm = $("#termsConfirmBtn");
    const termsErr = $("#termsErr");

    const updatePayBtn = () => {
      const method = form.querySelector('input[name="method"]:checked')?.value || "card";
      const testBox = $("#stripeTestBox");
      if (testBox) testBox.hidden = method !== "card";
      // Highlight selected payment card
      form.querySelectorAll(".co-method").forEach((el) => {
        const on = el.querySelector('input[name="method"]')?.checked;
        el.classList.toggle("is-checked", !!on);
      });
      if (!btn) return;
      // Sticky bar already shows total — keep CTA short
      btn.textContent = "Review & continue";
    };

    const openTermsModal = () => {
      if (!modal) return;
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      document.body.classList.add("terms-modal-open");
      if (termsAccept) termsAccept.checked = false;
      if (termsConfirm) termsConfirm.disabled = true;
      if (termsErr) termsErr.textContent = "";
      // Sync confirm button label with selected method
      const method = form.querySelector('input[name="method"]:checked')?.value || "card";
      const label = payButtonLabel(method);
      if (termsConfirm) {
        termsConfirm.textContent = totalLabel ? `Accept & pay · ${totalLabel}` : `Accept & ${label}`;
      }
      // Body scrolls; foot stays pinned — reset scroll to top of rules
      const body = modal.querySelector(".terms-modal-body");
      if (body) body.scrollTop = 0;
      // Ensure foot is in the viewport (PC + mobile)
      requestAnimationFrame(() => {
        const foot = modal.querySelector(".terms-modal-foot");
        if (!foot) return;
        foot.scrollIntoView({ block: "nearest", inline: "nearest" });
        // Double-check after layout: if foot is still clipped, nudge panel max-height via body scroll only
        const rect = foot.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (rect.bottom > vh - 8 && body) {
          body.scrollTop = Math.max(0, body.scrollTop - (rect.bottom - vh + 16));
        }
      });
      termsAccept?.focus({ preventScroll: true });
    };

    const closeTermsModal = () => {
      if (!modal) return;
      modal.hidden = true;
      document.body.style.overflow = "";
      document.body.classList.remove("terms-modal-open");
    };

    form.querySelectorAll('input[name="method"]').forEach((el) => {
      el.addEventListener("change", updatePayBtn);
    });
    updatePayBtn();

    // Step 1: validate form → open terms panel
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const errEl = $("#checkoutErr");
      if (errEl) errEl.textContent = "";
      openTermsModal();
    });

    termsAccept?.addEventListener("change", () => {
      if (termsConfirm) termsConfirm.disabled = !termsAccept.checked;
      if (termsErr) termsErr.textContent = "";
    });

    modal?.querySelectorAll("[data-terms-close]").forEach((el) => {
      el.addEventListener("click", () => closeTermsModal());
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && modal && !modal.hidden) closeTermsModal();
      },
      { once: false }
    );

    // Step 2: accept terms → process payment / redirect
    termsConfirm?.addEventListener("click", async () => {
      if (!termsAccept?.checked) {
        if (termsErr) termsErr.textContent = "Please accept the terms and rules to continue.";
        return;
      }
      if (!form.reportValidity()) {
        closeTermsModal();
        return;
      }

      const fd = new FormData(form);
      const errEl = $("#checkoutErr");
      const payBtn = $("#payBtn");
      if (errEl) errEl.textContent = "";
      if (termsErr) termsErr.textContent = "";
      if (termsConfirm) {
        termsConfirm.disabled = true;
        termsConfirm.textContent = "Processing…";
      }
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.textContent = "Processing…";
      }

      const method = String(fd.get("method") || "card");
      const currency = PH_EWALLETS.has(method) ? "PHP" : getCurrencyCode();
      const payload = {
        email: fd.get("email"),
        name: fd.get("name"),
        currency,
        method,
        items: getCart().map((i) => ({ id: i.id, qty: i.qty })),
        termsAccepted: true,
      };

      try {
        const res = await fetch("/api/checkout/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Checkout failed");

        // Redirect providers: Stripe, PayMongo, PayPal, Crypto, LiqPay…
        if (data.url) {
          sessionStorage.setItem(
            "subsaverph_pending",
            JSON.stringify({
              email: payload.email,
              currency: payload.currency,
              method: payload.method,
              ref: data.ref || null,
              provider: data.provider || null,
            })
          );
          window.location.href = data.url;
          return;
        }

        // Manual e-wallet — pending payment instructions
        const order = data.order;
        if (!order) throw new Error("Checkout failed — no order returned");
        order.totalFormatted =
          order.amountFormatted || formatMoney(cartTotals().total);
        sessionStorage.setItem("subsaverph_last", JSON.stringify(order));
        try {
          saveOrder(order);
        } catch {
          /* optional */
        }
        clearCart();
        updateBadge();
        closeTermsModal();
        scrollPageToTop();
        if (data.provider === "manual" || data.pending || order.status === "awaiting_payment") {
          location.hash = `#/success?manual=1&order=${encodeURIComponent(order.id || "")}`;
        } else {
          location.hash = "#/success";
        }
        // Ensure top after SPA render (hashchange + render)
        scrollPageToTop();
        setTimeout(scrollPageToTop, 100);
        setTimeout(scrollPageToTop, 300);
      } catch (err) {
        const msg = err.message || "Checkout failed";
        if (termsErr) termsErr.textContent = msg;
        if (errEl) errEl.textContent = msg;
        toast(msg);
        if (termsConfirm) {
          termsConfirm.disabled = !termsAccept?.checked;
          const method = form.querySelector('input[name="method"]:checked')?.value || "card";
          termsConfirm.textContent = totalLabel
            ? `Accept & pay · ${totalLabel}`
            : `Accept & ${payButtonLabel(method)}`;
        }
        if (payBtn) {
          payBtn.disabled = false;
          updatePayBtn();
        }
      }
    });
  }
}

function renderCart() {
  const cart = getCart();
  const t = cartTotals();
  const body = $("#cartBody");
  if (!cart.length) {
    body.innerHTML = `<div class="empty"><p>No plans staged.</p><button class="btn solid sm" data-go-deals>Browse deals</button></div>`;
  } else {
    body.innerHTML = cart
      .map(
        (i) => `
      <div class="cart-line" data-id="${i.id}">
        <span class="mono-box">${escapeHtml(i.monogram)}</span>
        <div>
          <strong>${escapeHtml(i.name)}</strong>
          <em>${formatLinePrice(i, true)}${i.period === "7 days" ? " / 7 days" : i.period === "month" ? " / mo" : ""}</em>
          <div class="qty">
            <button data-act="dec" type="button">−</button>
            <span>${i.qty}</span>
            <button data-act="inc" type="button">+</button>
            <button class="rm" data-act="rm" type="button">Remove</button>
          </div>
        </div>
        <strong>${formatLinePrice(i)}</strong>
      </div>`
      )
      .join("");
  }
  $("#sumSub").textContent = formatMoney(t.subtotal);
  $("#sumSave").textContent = "−" + formatMoney(t.saved);
  $("#sumTotal").textContent = formatMoney(t.total);
  $("#goCheckout").disabled = !cart.length;
  updateBadge();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

let _catalogLoadedAt = 0;
let _catalogRefreshing = null;

/** Re-fetch deals + stockLeft from inventory (admin Codes / Stock). */
async function loadLiveCatalog(opts = {}) {
  const force = !!opts.force;
  try {
    const res = await fetch("/api/catalog", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) throw new Error("offline");
    const data = await res.json();
    if (Array.isArray(data.deals) && data.deals.length) {
      window.DEALS = data.deals.map((d) => {
        const left =
          typeof d.stockLeft === "number"
            ? d.stockLeft
            : Number(d.stockLeft);
        const stockLeft = Number.isFinite(left) ? left : 0;
        return {
          ...d,
          includes: Array.isArray(d.includes) ? d.includes : [],
          badge: d.badge || null,
          // Live inventory count from /api/catalog (admin Codes / Stock)
          stockLeft,
          stock:
            stockLeft <= 0
              ? "SOLD OUT"
              : stockLeft <= 5
                ? `${stockLeft} in stock`
                : d.stock || "In stock",
        };
      });
      _catalogLoadedAt = Date.now();
    }
    if (data.settings) {
      state.settings = data.settings;
      try {
        if (data.settings.uiStrings) setAdminUiOverrides(data.settings.uiStrings);
        applySeoMeta();
      } catch {
        /* ignore */
      }
    }
    if (Array.isArray(data.brands)) window.BRANDS = data.brands;
    if (Array.isArray(data.categories)) window.CATEGORIES = data.categories;
    state.paymentMode = data.paymentMode || "instant_demo";
    state.stripeEnabled = !!data.stripeEnabled;
    state.stripePublishableKey = data.stripePublishableKey || "";
    state.paymongoEnabled = !!data.paymongoEnabled;
    state.xenditEnabled = !!data.xenditEnabled;
    state.paypalEnabled = !!data.paypalEnabled;
    state.cryptoEnabled = !!data.cryptoEnabled;
    state.liqpayEnabled = !!data.liqpayEnabled;
    state.manualEwalletEnabled = !!data.manualEwalletEnabled;
    state.ewalletProvider = data.ewalletProvider || "demo";
    state.paymentMethods = Array.isArray(data.paymentMethods)
      ? data.paymentMethods
      : [];
    state.live = true;

    // Apply host settings to chrome (logo image only — no text)
    const s = data.settings || {};
    if (s.siteName) {
      document.title = `${s.siteName} — Discounted Subscriptions`;
      document.querySelectorAll("a.logo").forEach((logo) => {
        const mark = logo.querySelector(".logo-mark");
        const alt = escapeHtml(s.siteName);
        const markHtml = mark
          ? mark.outerHTML
          : `<img class="logo-mark" src="/favicon.png" width="36" height="36" alt="${alt}" />`;
        logo.innerHTML = markHtml;
        logo.setAttribute("href", "#/home");
        logo.setAttribute("title", `${s.siteName} home`);
        logo.setAttribute("aria-label", `${s.siteName} home`);
      });
    }
    applySiteChrome();
  } catch {
    state.live = false;
  }
}

/** Map crawlable paths (/deals, /product/x) into SPA hash routes for shoppers. */
function bridgePathToHash() {
  try {
    const path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/index.html") return;
    const product = path.match(/^\/product\/([^/]+)$/i);
    if (product) {
      const id = decodeURIComponent(product[1]);
      const want = `#/deal/${id}`;
      if (!location.hash || location.hash === "#" || location.hash === "#/") {
        location.replace(want + (location.search || ""));
      }
      return;
    }
    const map = {
      deals: "deals",
      search: "search",
      how: "home",
      about: "about",
      support: "support",
      contact: "support",
      faq: "support",
      terms: "terms",
      privacy: "privacy",
      checkout: "checkout",
    };
    const key = path.replace(/^\//, "").toLowerCase();
    if (!map[key]) return;
    if (!location.hash || location.hash === "#" || location.hash === "#/") {
      let h = `#/${map[key]}`;
      if (key === "search" && location.search) {
        const q = new URLSearchParams(location.search).get("q");
        if (q) h = `#/search?q=${encodeURIComponent(q)}`;
      }
      location.replace(h);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Refresh catalog/stock if stale. Call when opening deals or returning to the tab.
 * @param {{ force?: boolean, rerender?: boolean, maxAgeMs?: number }} opts
 */
async function refreshCatalogIfStale(opts = {}) {
  const maxAge = opts.maxAgeMs ?? 8000;
  const force = !!opts.force;
  if (!force && _catalogLoadedAt && Date.now() - _catalogLoadedAt < maxAge) {
    return false;
  }
  if (_catalogRefreshing) return _catalogRefreshing;
  _catalogRefreshing = (async () => {
    try {
      const prev = JSON.stringify(
        (window.DEALS || []).map((d) => [d.id, d.stockLeft])
      );
      await loadLiveCatalog({ force: true });
      const next = JSON.stringify(
        (window.DEALS || []).map((d) => [d.id, d.stockLeft])
      );
      if (opts.rerender && prev !== next) {
        try {
          render();
        } catch {
          /* ignore */
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      _catalogRefreshing = null;
    }
  })();
  return _catalogRefreshing;
}

async function init() {
  try {
    if (!Array.isArray(window.DEALS)) window.DEALS = [];
    if (!Array.isArray(window.BRANDS)) window.BRANDS = ["All"];
    if (!Array.isArray(window.CATEGORIES)) window.CATEGORIES = ["All"];

    bridgePathToHash();
    initPrefs();
    applyI18n();
    bindPrefsPanel();

    const yearEl = document.getElementById("footerYear");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    try {
      await loadLiveCatalog({ force: true });
    } catch (e) {
      console.warn("catalog load failed, using bundled deals", e);
    }
    try {
      await loadRates();
    } catch {
      /* offline rates ok */
    }
    applyI18n();
    bindGlobalSearch();
    bindPrefsPanel();

    try {
      const { mountChatbot } = await import("./chatbot.js?v=nocapcut1");
      mountChatbot();
      window.__ssphOpenChat = async () => {
        try {
          const m = await import("./chatbot.js?v=nocapcut1");
          m.openChatbot?.();
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      console.warn("chatbot optional fail", e);
    }
  } catch (err) {
    console.error("SubSaverPH init error:", err);
  }

  // Logo + Home nav (and any #/home links) → always go home
  document.addEventListener("click", (e) => {
    const homeLink = e.target.closest('a.logo, a[href="#/home"], a[href="#/"], a[href="#"]');
    if (!homeLink) return;
    // Don't hijack external or other in-page anchors that aren't home
    const href = homeLink.getAttribute("href") || "";
    if (homeLink.classList.contains("logo") || href === "#/home" || href === "#/" || href === "#") {
      e.preventDefault();
      goHome();
    }
  });

  // Nav currency picker (Pay button)
  const navPicker = $("#navCurrencyPicker");
  if (navPicker) {
    mountCurrencyPicker(navPicker, {
      onChange: () => {
        render();
        if ($("#drawer")?.classList.contains("open")) renderCart();
        toast(`${t("toast_pay")} ${getCurrencyCode()}`);
      },
    });
  }

  const cartBtn = $("#cartBtn");
  if (cartBtn && cartBtn.dataset.bound !== "1") {
    cartBtn.dataset.bound = "1";
    cartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCart();
    });
  }
  const closeCartBtn = $("#closeCart");
  if (closeCartBtn && closeCartBtn.dataset.bound !== "1") {
    closeCartBtn.dataset.bound = "1";
    closeCartBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeCart();
    });
  }
  const overlayEl = $("#overlay");
  if (overlayEl && overlayEl.dataset.bound !== "1") {
    overlayEl.dataset.bound = "1";
    overlayEl.addEventListener("click", () => closeCart());
  }
  const goCheckoutBtn = $("#goCheckout");
  if (goCheckoutBtn && goCheckoutBtn.dataset.bound !== "1") {
    goCheckoutBtn.dataset.bound = "1";
    goCheckoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeCart();
      location.hash = "#/checkout";
    });
  }

  $("#cartBody").addEventListener("click", (e) => {
    if (e.target.matches("[data-go-deals]")) {
      closeCart();
      location.hash = "#/deals";
      return;
    }
    const line = e.target.closest(".cart-line");
    if (!line) return;
    const id = line.dataset.id;
    const item = getCart().find((i) => i.id === id);
    if (!item) return;
    const act = e.target.dataset.act;
    if (act === "inc") setQty(id, Math.min(item.qty + 1, 5));
    if (act === "dec") setQty(id, item.qty - 1);
    if (act === "rm") removeItem(id);
    renderCart();
  });

  const closeMobileMenu = () => {
    $("#navLinks")?.classList.remove("open");
    $("#menuBtn")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-menu-open");
  };

  $("#menuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const links = $("#navLinks");
    if (!links) return;
    const open = !links.classList.contains("open");
    links.classList.toggle("open", open);
    $("#menuBtn")?.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("nav-menu-open", open);
  });

  // Close hamburger menu after navigation or outside tap
  $("#navLinks")?.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      closeMobileMenu();
      document.body.classList.remove("nav-menu-open");
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#menuBtn") || e.target.closest("#navLinks")) return;
    closeMobileMenu();
    document.body.classList.remove("nav-menu-open");
  });

  // Mobile bottom tab bar: cart opens drawer; other tabs close menus
  $("#mobileTabCart")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMobileMenu();
    openCart();
  });
  $("#mobileTabbar")?.addEventListener("click", (e) => {
    const tab = e.target.closest("a.mobile-tab");
    if (tab) {
      closeMobileMenu();
      closeCart();
    }
  });

  window.addEventListener("scroll", () => {
    $("#siteNav").classList.toggle("scrolled", window.scrollY > 40);
    // Don't keep mobile nav open while scrolling the page
    if (window.scrollY > 80) closeMobileMenu();
  });

  window.addEventListener("hashchange", () => {
    closeMobileMenu();
    closeCart();
    parseRoute(); // also scrolls to top
    scrollPageToTop();
    // Pull latest stock when browsing catalog pages
    refreshCatalogIfStale({ rerender: true });
  });
  window.addEventListener("cart:change", () => {
    updateBadge();
    if ($("#drawer").classList.contains("open")) renderCart();
  });
  window.addEventListener("rates:loaded", () => render());

  // After adding stock in Admin, returning to the store refreshes counts
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshCatalogIfStale({ force: true, rerender: true });
    }
  });
  window.addEventListener("focus", () => {
    refreshCatalogIfStale({ force: true, rerender: true });
  });

  // Footer + any Support CTA → Support page (email options are on that page)
  document.body.addEventListener("click", (e) => {
    if (e.target.closest("[data-go-support-order]")) return;
    if (e.target.closest("[data-copy-support-email]")) return;
    if (e.target.closest("#supportForm")) return;
    // Let Gmail / mailto links on the Support page work natively
    const mailLink = e.target.closest('a[href*="mail.google.com"], a[href^="mailto:"]');
    if (mailLink) return;

    const go = e.target.closest(
      "a.js-go-support, button.js-go-support, a[href='#/support'], a[href='#/contact'], a[data-support-link], a[data-support-email]"
    );
    if (go) {
      e.preventDefault();
      e.stopPropagation();
      goSupportPage();
    }
  });

  try {
    parseRoute();
  } catch (e) {
    console.error("parseRoute failed", e);
    state.view = "home";
    render();
  }
  try {
    await loadRates();
  } catch {
    /* ignore */
  }
  render();
}

// Expose for debugging
window.SubSaverSupport = {
  openSupportMail,
  goSupportPage,
  supportEmailAddress,
  gmailComposeUrl,
  mailtoSupportUrl,
};

init().catch((e) => {
  console.error("SubSaverPH fatal init:", e);
  const root = document.getElementById("app");
  if (root) {
    root.innerHTML =
      '<div class="page"><div class="page-inner empty"><h2>Store failed to load</h2><p class="muted">Please hard-refresh (Ctrl+F5). If it continues, contact support.</p><a class="btn solid" href="/">Reload</a></div></div>';
  }
});
