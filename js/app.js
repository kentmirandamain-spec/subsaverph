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
  b.textContent = n;
  b.hidden = n === 0;
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
  $("#drawer").classList.add("open");
  $("#overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  $("#drawer").classList.remove("open");
  $("#overlay").classList.remove("open");
  document.body.style.overflow = "";
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

function card(d, highlightQ = "") {
  const nameHtml = highlightQ ? highlightMatch(d.name, highlightQ) : escapeHtml(d.name);
  const tagHtml = highlightQ ? highlightMatch(d.tagline || "", highlightQ) : escapeHtml(d.tagline || "");
  const soldOut = isSoldOut(d);
  return `
    <article class="card ${soldOut ? "sold-out" : ""}">
      <div class="card-accent"></div>
      <div class="card-top">
        <div class="mono-box">${escapeHtml(d.monogram)}</div>
        <div class="pills">
          ${soldOut ? `<span class="pill sold-out-pill">${escapeHtml(t("sold_out"))}</span>` : ""}
          ${!soldOut && d.badge ? `<span class="pill">${escapeHtml(d.badge)}</span>` : ""}
          ${!soldOut ? `<span class="pill on">−${off(d)}%</span>` : ""}
        </div>
      </div>
      <p class="cat">${escapeHtml(d.brand)} · ${escapeHtml(d.category)}</p>
      <h3><a href="#/deal/${d.id}">${nameHtml}</a></h3>
      <p class="tag">${tagHtml}</p>
      <p class="stock-line ${soldOut ? "is-sold-out" : ""}">${escapeHtml(stockLabel(d))}</p>
      <div class="price">
        <div>
          <strong>${formatDealPrice(d, "price")}</strong><span class="per">${periodLabel(d)}</span>
          <span class="was">${formatDealPrice(d, "original")}${periodLabel(d)}</span>
        </div>
        <div class="dur">${escapeHtml(d.duration)}</div>
      </div>
      <div class="actions">
        <a class="btn sm" href="#/deal/${d.id}">${escapeHtml(t("details"))}</a>
        ${
          soldOut
            ? `<button class="btn sm sold-out-btn" type="button" disabled>${escapeHtml(t("sold_out"))}</button>`
            : `<button class="btn sm solid" data-add="${d.id}">${escapeHtml(t("add"))}</button>`
        }
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
    <div class="product-search large">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input
        id="productSearch"
        type="search"
        value="${escapeHtml(state.query)}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
        aria-label="Search products"
      />
      ${state.query ? `<button type="button" class="search-clear" id="clearSearch" aria-label="Clear search">✕</button>` : ""}
      <button type="button" class="btn sm solid search-go" id="searchGo">Search</button>
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
  const raw = c("hero_title", "heroTitle") || "Premium\nplans.\nLower\ncost.";
  return escapeHtml(raw).replace(/\\n/g, "<br/>").replace(/\n/g, "<br/>");
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
            <h3>Service</h3>
            ${(Array.isArray(window.BRANDS) ? window.BRANDS : ["All"]).map(
              (b) => `
              <label class="radio">
                <input type="radio" name="brand" value="${b}" ${state.brand === b ? "checked" : ""} />
                <span>${b === "All" ? "All services" : b === "xAI" ? "SuperGrok (xAI)" : b}</span>
              </label>`
            ).join("")}
            <h3 style="margin-top:20px">Category</h3>
            ${(Array.isArray(window.CATEGORIES) ? window.CATEGORIES : ["All"]).map(
              (cat) => `
              <label class="radio">
                <input type="radio" name="cat" value="${cat}" ${state.category === cat ? "checked" : ""} />
                <span>${cat}</span>
              </label>`
            ).join("")}
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

  return `
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="hero-inner">
        <p class="eyebrow">${escapeHtml(c("hero_eyebrow", "heroEyebrow"))}</p>
        <h1 class="display">${heroTitleHtml()}</h1>
        <p class="lead">${escapeHtml(c("hero_lead", "heroLead"))}</p>

        ${searchBarHTML(t("search_placeholder"))}

        <div class="cta" style="margin-top:28px">
          <a class="btn solid" href="#/search">${escapeHtml(t("cta_search"))}</a>
          <a class="btn" href="#view-all-deals">${escapeHtml(t("cta_browse"))}</a>
        </div>
        <div class="meta">
          <div><strong>${all.length}</strong><span>${escapeHtml(t("meta_plans"))}</span></div>
          <div><strong>${brands.length}</strong><span>${escapeHtml(t("meta_platforms"))}</span></div>
          <div><strong>${CURRENCY_LIST.length}+</strong><span>${escapeHtml(t("meta_currencies"))}</span></div>
        </div>
      </div>
    </section>

    <div class="strip">
      <div>${escapeHtml(c("strip1", "strip1"))}</div>
      <div>${escapeHtml(c("strip2", "strip2"))}</div>
      <div>${escapeHtml(c("strip3", "strip3"))}</div>
      <div>${escapeHtml(c("strip4", "strip4"))}</div>
    </div>

    <section class="section">
      <div class="section-inner">
        <div class="section-head">
          <div>
            <p class="eyebrow">${escapeHtml(t("eyebrow_platforms"))}</p>
            ${(() => {
              const platformsTitle = c("platforms_title", "platformsTitle");
              return platformsTitle
                ? `<h2>${escapeHtml(platformsTitle)}</h2>`
                : "";
            })()}
          </div>
        </div>
        <div class="brands">
          ${brands
            .map(
              (b) => `
            <button type="button" class="brand-tile" data-brand="${b.key}">
              <div class="mono">${b.mono}</div>
              <div class="name">${b.label}</div>
            </button>`
            )
            .join("")}
        </div>
      </div>
    </section>

    <!-- Same All deals arrangement as #/deals — visible when scrolling the main page -->
    <section class="section home-view-all" id="view-all-deals">
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
            <div class="mono-box lg">${escapeHtml(d.monogram)}</div>
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

function bulletsHtml(lines) {
  if (!lines.length) return "";
  return `<ul>${lines.map((l) => `<li>${formatRuleLine(l)}</li>`).join("")}</ul>`;
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
        { id: "paypal", label: "PayPal", desc: "PayPal · Instant automatic delivery", group: "instant", delivery: "auto", deliveryLabel: "Instant automatic delivery" },
        { id: "crypto", label: "Crypto", desc: "USDT, BTC, ETH · Instant automatic delivery", group: "instant", delivery: "auto", deliveryLabel: "Instant automatic delivery" },
        { id: "manual_gcash", label: "GCash (QR)", desc: "Scan QR · delivery in 10–30 minutes", group: "ewallet", delivery: "manual", deliveryLabel: "10–30 minutes" },
        { id: "manual_maya", label: "Maya (QR)", desc: "Scan QR · delivery in 10–30 minutes", group: "ewallet", delivery: "manual", deliveryLabel: "10–30 minutes" },
        { id: "gcash", label: "GCash", desc: "Pay with GCash (PHP)", group: "ewallet", delivery: "auto", deliveryLabel: "Instant automatic delivery" },
        { id: "paymaya", label: "Maya", desc: "Pay with Maya (PHP)", group: "ewallet", delivery: "auto", deliveryLabel: "Instant automatic delivery" },
        { id: "liqpay", label: "LiqPay", desc: "Card & wallets · Instant automatic delivery", group: "instant", delivery: "auto" },
        { id: "demo", label: "Demo", desc: "Test without real money · Instant", group: "instant", delivery: "auto" },
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
  const paymongoOn = !!state.paymongoEnabled;
  const xenditOn = !!state.xenditEnabled;
  const paypalOn = !!state.paypalEnabled || methods.some((m) => m.id === "paypal");
  const cryptoOn = !!state.cryptoEnabled || methods.some((m) => m.id === "crypto");
  const liqpayOn = !!state.liqpayEnabled || methods.some((m) => m.id === "liqpay");
  const manualOn =
    !!state.manualEwalletEnabled || methods.some((m) => MANUAL_EWALLETS.has(m.id));
  const ewalletBackend = state.ewalletProvider || (paymongoOn ? "paymongo" : xenditOn ? "xendit" : "demo");
  const isTestKey = String(state.stripePublishableKey || "").startsWith("pk_test_");
  const hasEwallet = methods.some((m) => PH_EWALLETS.has(m.id) || m.group === "ewallet");
  const ewalletMethods = methods.filter(
    (m) => PH_EWALLETS.has(m.id) || m.group === "ewallet" || m.delivery === "manual"
  );
  const instantMethods = methods.filter(
    (m) =>
      !PH_EWALLETS.has(m.id) &&
      m.group !== "ewallet" &&
      m.delivery !== "manual"
  );

  const radioHtml = (m, checked) => {
    const isManual = m.delivery === "manual" || MANUAL_EWALLETS.has(m.id);
    const isAuto = m.delivery === "auto" || isAutoDeliveryMethod(m.id);
    const eta =
      m.deliveryLabel ||
      (isManual ? "Delivery: 10–30 minutes" : isAuto ? "Instant automatic delivery" : "");
    return `
      <label class="pay-method ${isManual ? "pay-method-ewallet" : ""} ${isAuto ? "pay-method-instant" : ""}">
        <input type="radio" name="method" value="${escapeHtml(m.id)}" ${checked ? "checked" : ""} required />
        <span class="pay-method-box">
          <strong>${escapeHtml(m.label)}</strong>
          <em>${escapeHtml(m.desc || "")}</em>
          ${eta ? `<span class="pay-method-eta">${escapeHtml(eta)}</span>` : ""}
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
          `<p class="pay-group-label">Instant automatic delivery</p>`,
          ...instantMethods.map((m) =>
            radioHtml(m, preferred && m.id === preferred.id)
          ),
        ]
      : []),
    ...(ewalletMethods.length
      ? [
          `<p class="pay-group-label">E-wallet QR · delivery 10–30 minutes</p>`,
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

  const payHelp = `
        <div class="pay-help" id="payHelpBox">
          <strong>How payment &amp; delivery work</strong>
          <p id="payHelpText">
            ${
              paypalOn || cryptoOn || manualOn || stripeOn || paymongoOn || xenditOn
                ? "Choose a method below. <strong style=\"color:var(--text)\">PayPal &amp; Crypto</strong> = codes unlock automatically after payment. <strong style=\"color:var(--text)\">GCash/Maya QR</strong> = delivery in <strong style=\"color:var(--text)\">10–30 minutes</strong> after we verify."
                : "Demo mode — no real money. Add payment keys on the server for live PayPal / Crypto."
            }
          </p>
          <div class="ewallet-eta-notice delivery-notice-auto" id="autoDeliveryNotice" hidden>
            <strong>Instant automatic delivery</strong>
            <p>PayPal and Crypto payments unlock your login codes <strong>automatically</strong> right after payment succeeds — no waiting for manual review.</p>
          </div>
          <div class="ewallet-eta-notice" id="ewalletEtaNotice" hidden>
            <strong>E-wallet delivery: 10–30 minutes</strong>
            <p>After you pay via GCash or Maya QR and submit your reference, we verify payment. Login codes are usually delivered in <strong>10–30 minutes</strong> (not instant).</p>
          </div>
          ${
            paypalOn
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:var(--text)">PayPal</strong> —
            ${
              state.paypalEnabled
                ? "Live · Instant automatic delivery after you approve payment on PayPal."
                : "Demo mode until PAYPAL_CLIENT_ID + SECRET are set on the server."
            }
          </p>`
              : ""
          }
          ${
            cryptoOn
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:var(--text)">Crypto</strong> —
            ${
              state.cryptoEnabled
                ? "Live · Instant automatic delivery after crypto payment confirms."
                : "Demo mode until NOWPAYMENTS_API_KEY is set on the server."
            }
          </p>`
              : ""
          }
          ${
            manualOn
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:var(--text)">GCash / Maya QR</strong> —
            scan, pay, submit reference · <strong style="color:var(--text)">delivery 10–30 minutes</strong> after we verify.
          </p>`
              : ""
          }
          ${
            stripeOn && isTestKey
              ? `<div class="test-card-box" id="stripeTestBox" hidden>
            <p class="test-card-label">Stripe test card (Card method only)</p>
            <ul>
              <li><strong>Card number:</strong> <code>4242 4242 4242 4242</code></li>
              <li><strong>Expiry:</strong> any future date (e.g. 12/34)</li>
              <li><strong>CVC:</strong> any 3 digits (e.g. 123)</li>
              <li><strong>Name / ZIP:</strong> anything</li>
            </ul>
          </div>`
              : ""
          }
        </div>`;

  const defaultMethod = preferred?.id || methods[0]?.id || "gcash";
  const defaultBtn = payButtonLabel(defaultMethod);

  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">Payment</p>
        <h1 class="page-title">Checkout</h1>
        <p class="muted" style="margin-bottom:16px">
          Pay as a Filipino shopper with
          <strong style="color:var(--text)">GCash</strong>,
          <strong style="color:var(--text)">Maya</strong>,
          <strong style="color:var(--text)">GrabPay</strong>, or
          <strong style="color:var(--text)">ShopeePay</strong>
          (plus Card). Codes deliver <strong style="color:var(--text)">instantly</strong> after payment.
        </p>
        ${cancelled ? `<p class="err" style="color:#ff8a8a;margin-bottom:12px">Payment cancelled. You can try again.</p>` : ""}
        <div class="checkout">
          <form id="payForm" class="form" novalidate>
            <h3>Contact</h3>
            <label>Email for delivery<input required type="email" name="email" placeholder="you@email.com" /></label>
            <label>Full name<input required name="name" placeholder="Juan Dela Cruz" /></label>
            <h3>Payment currency</h3>
            <div id="pageFxMount" style="margin-bottom:16px"></div>
            <p class="muted" style="margin:-8px 0 16px;font-size:0.78rem;text-transform:none;letter-spacing:0;font-weight:400">
              PH e-wallets always bill in <strong>PHP</strong> (converted automatically from your display currency).
            </p>
            <h3>Payment method</h3>
            <div class="pay-methods" role="radiogroup" aria-label="Payment method">
              ${methodRadios}
            </div>
            ${payHelp}
            <p class="muted" style="font-size:0.8rem;margin:12px 0 0;text-transform:none;letter-spacing:0;font-weight:400">
              Next you will review purchase rules and must accept the terms before payment.
            </p>
            <p class="err" id="checkoutErr" style="color:#ff8a8a;font-size:0.85rem;min-height:1.2em"></p>
            <button class="btn solid full" type="submit" id="payBtn" data-total="${escapeHtml(formatMoney(t.total))}">
              Review &amp; continue · ${formatMoney(t.total)}
            </button>
          </form>
          <aside class="summary">
            <h3 style="font-family:var(--display);letter-spacing:.12em;text-transform:uppercase;font-size:.8rem;margin:0 0 14px">Order</h3>
            ${cart
              .map(
                (i) => `
              <div class="line">
                <span class="mono-box">${escapeHtml(i.monogram)}</span>
                <div>
                  <strong>${escapeHtml(i.name)}</strong>
                  <em>${escapeHtml(i.duration)} × ${i.qty}</em>
                </div>
                <span>${formatLinePrice(i)}</span>
              </div>`
              )
              .join("")}
            <div class="totals">
              <div><span>Subtotal</span><span>${formatMoney(t.subtotal)}</span></div>
              <div><span>You save</span><span>−${formatMoney(t.saved)}</span></div>
              <div class="grand"><span>Total</span><span>${formatMoney(t.total)}</span></div>
            </div>
            <p class="rates" data-rates style="margin-top:12px">${ratesNote()}</p>
          </aside>
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
    "You are purchasing a **prepaid digital access account or code** for the selected product (e.g. SuperGrok, Canva, streaming).",
    "Delivery is **digital** — username/password or access code is shown after successful payment (and emailed when email is configured).",
    "SubSaverPH is an **independent reseller / storefront**. We are **not** affiliated with, endorsed by, or sponsored by xAI, Canva, CapCut, Netflix, YouTube, Google, or any listed brand.",
  ]);
  const ruleLines = settingsLines(s.checkoutRules, [
    "**Digital goods are non-refundable** once login details or codes are delivered, **except** when the product is **defective** or **not delivered** — contact support with your order ID for those cases.",
    "If you **break these rules** (including changing username, password, billing address, or subscription), you **cannot get a refund** and support may be refused.",
    "You must be at least **18 years old** and able to form a binding contract.",
    "Use the product only for **personal, lawful use** and follow the official service’s terms of use.",
    "**Do not** resell, share publicly, or abuse accounts in a way that violates the brand’s policies.",
    "**Do not change the username/email, password, billing address, or subscription plan** on the shared/prepaid account — doing so may lock you out and **voids refunds and support**.",
    "**Do not** add your own payment method, cancel the plan, or transfer ownership of the account.",
    "Keep the login details private; use only as provided.",
    "Prices may be shown in other currencies; the amount charged is confirmed at payment (PH e-wallets bill in PHP when applicable).",
    "By paying you confirm you understand this is a digital delivery product and you accept these rules.",
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
            <p class="eyebrow" style="margin:0">${escapeHtml(eyebrow)}</p>
            <h2 id="termsModalTitle">${escapeHtml(title)}</h2>
            <button type="button" class="icon terms-modal-x" data-terms-close aria-label="Close">×</button>
          </div>
          <div class="terms-modal-body">
            <section class="terms-block">
              <h3>Order summary</h3>
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

            <section class="terms-block">
              <h3>What you are buying</h3>
              ${bulletsHtml(whatLines)}
            </section>

            <section class="terms-block">
              <h3>Rules &amp; regulations</h3>
              ${bulletsHtml(ruleLines)}
            </section>

            <section class="terms-block">
              <h3>Support</h3>
              <p class="muted" style="margin:0;text-transform:none;letter-spacing:0;font-weight:400;font-size:0.9rem">
                ${escapeHtml(supportText)}
                <br/>
                <a href="#/support" class="btn ghost js-go-support" style="margin:6px 0 0;padding:6px 12px;font-size:0.85rem">Contact support</a>
                · <a href="#/terms">Terms of Use</a>
                · <a href="#/privacy">Privacy Policy</a>
              </p>
            </section>
          </div>
          <div class="terms-modal-foot">
            <label class="check terms-accept-label">
              <input type="checkbox" id="termsAccept" />
              <span>${escapeHtml(acceptLabel)}</span>
            </label>
            <p class="err" id="termsErr" style="color:#ff8a8a;font-size:0.85rem;min-height:1.2em;margin:0"></p>
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
  const steps = (order.paymentInstructions && order.paymentInstructions.steps) || [
    `Open your ${wallet} app.`,
    "Scan the QR code below.",
    `Pay exactly ${amount}.`,
    `Put Order ID ${order.id} in the message / reference if asked.`,
    "Paste your payment reference below after paying.",
    "We verify payment and release your codes.",
  ];
  const note = (order.paymentInstructions && order.paymentInstructions.note) || "";
  const st = String(order.status || "").toLowerCase();
  const submitted = st === "payment_submitted";
  const itemsHtml = (order.items || [])
    .map(
      (i) =>
        `<div class="line" style="margin-bottom:8px"><strong>${escapeHtml(i.name || i.id)}</strong> × ${escapeHtml(String(i.qty || 1))}</div>`
    )
    .join("");

  return `
    <div class="success">
      <div class="success-card success-card-wide">
        <div class="ok">${submitted ? "…" : "₱"}</div>
        <h1>${submitted ? "Payment under review" : "Scan to pay with " + escapeHtml(wallet)}</h1>
        <p class="muted">Order <strong class="success-order-id">${escapeHtml(order.id || "")}</strong>
          · ${escapeHtml(order.email || "")}</p>
        <p style="margin-top:10px;font-weight:600">${escapeHtml(
          order.message ||
            (submitted
              ? "We received your reference. Login codes usually arrive in 10–30 minutes after confirmation."
              : "Scan the QR, pay the exact amount, then submit your reference.")
        )}</p>

        <div class="ewallet-eta-notice ewallet-eta-notice-page" role="status">
          <strong>Delivery time: 10–30 minutes</strong>
          <p>E-wallet payments are verified manually. After you pay and we confirm, your login codes are usually delivered within <strong>10–30 minutes</strong> (not instant).</p>
        </div>

        <div class="manual-pay-box" role="region" aria-label="Payment QR instructions">
          <h2 class="manual-pay-title">Pay exactly this amount</h2>
          <div class="manual-pay-amount">${escapeHtml(amount)}</div>
          ${
            qrUrl
              ? `<div class="manual-pay-qr">
              <p class="manual-pay-qr-label">Scan with ${escapeHtml(wallet)}</p>
              <img src="${escapeAttr(qrUrl)}" alt="${escapeAttr(wallet)} payment QR code" width="240" height="240" loading="lazy" />
              ${accountName ? `<p class="manual-pay-qr-name">${escapeHtml(accountName)}</p>` : ""}
            </div>`
              : `<p class="err" style="color:#ff8a8a">QR code missing — contact support with Order ID ${escapeHtml(order.id || "")}.</p>`
          }
          <div class="manual-pay-grid" style="margin-top:16px">
            <div>
              <span class="manual-pay-label">Order ID (use as message / reference)</span>
              <div class="manual-pay-value-row">
                <code class="manual-pay-value" data-copy-text>${escapeHtml(order.id || "")}</code>
                <button type="button" class="btn sm cred-copy" data-copy="${escapeAttr(order.id || "")}">Copy</button>
              </div>
            </div>
          </div>
          <ol class="manual-pay-steps">
            ${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
          </ol>
          ${note ? `<p class="muted" style="margin:12px 0 0;font-size:0.85rem">${escapeHtml(note)}</p>` : ""}
        </div>

        <div class="manual-pay-order-summary">
          <h3 style="margin:0 0 8px;font-size:0.85rem;text-transform:uppercase;letter-spacing:.08em">Your order</h3>
          ${itemsHtml || "<p class='muted'>—</p>"}
        </div>

        ${
          submitted
            ? `<div class="manual-pay-submitted">
            <p><strong>Reference submitted:</strong> <code>${escapeHtml(order.paymentReference || "—")}</code></p>
            <p class="muted" style="margin-top:8px">Status: <strong style="color:var(--text)">${escapeHtml(order.status)}</strong>.
              Typical delivery: <strong style="color:var(--text)">10–30 minutes</strong> after we confirm.
              Keep this page — refresh to see your login codes, or check email.
              Support: Order ID <strong style="color:var(--text)">${escapeHtml(order.id || "")}</strong>.</p>
            <button type="button" class="btn solid" id="manualRefreshBtn" style="margin-top:14px">Check payment status</button>
            <p class="err" id="manualProofErr" style="color:#ff8a8a;font-size:0.85rem;min-height:1.2em;margin-top:8px"></p>
          </div>`
            : `<form id="manualProofForm" class="form manual-proof-form" style="margin-top:20px">
            <h3 style="margin:0 0 10px">I already sent payment</h3>
            <label>GCash / Maya reference number
              <input required name="paymentReference" placeholder="e.g. 1234 567 890123" autocomplete="off" />
            </label>
            <label>Optional note
              <input name="note" placeholder="Time sent, sender name…" autocomplete="off" />
            </label>
            <p class="err" id="manualProofErr" style="color:#ff8a8a;font-size:0.85rem;min-height:1.2em"></p>
            <button class="btn solid full" type="submit" id="manualProofBtn">Submit payment reference</button>
          </form>`
        }

        <div class="support-inline" style="margin-top:22px">
          <p class="muted" style="margin:0;font-size:0.9rem">Need help?</p>
          <button type="button" class="btn ghost" data-go-support-order="${escapeAttr(order.id || "")}">Contact support</button>
          <a class="btn ghost js-go-support" href="#/support">Support page</a>
        </div>
        <div class="cta" style="justify-content:center;margin-top:18px">
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

      const features = Array.isArray(item.includes)
        ? item.includes.filter((x) => String(x || "").trim())
        : [];
      const featuresHtml = features.length
        ? `<div class="delivery-block">
            <h3 class="delivery-block-title">Features included</h3>
            <ul class="delivery-features">${features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
          </div>`
        : "";

      const instructions = String(item.howToRedeem || "").trim();
      const instructionsHtml = instructions
        ? `<div class="delivery-block">
            <h3 class="delivery-block-title">Instructions — how to use</h3>
            <div class="delivery-pre">${escapeHtml(instructions)}</div>
          </div>`
        : "";

      const rules = String(item.importantNotes || "").trim();
      const fine = String(item.finePrint || "").trim();
      const rulesHtml =
        rules || fine
          ? `<div class="delivery-block delivery-block-rules">
            <h3 class="delivery-block-title">Rules</h3>
            ${rules ? `<div class="delivery-pre">${escapeHtml(rules)}</div>` : ""}
            ${fine ? `<p class="muted delivery-fine">${escapeHtml(fine)}</p>` : ""}
          </div>`
          : "";

      const metaBits = [
        item.accountType ? `Account: ${item.accountType}` : "",
        item.validity ? `Validity: ${item.validity}` : "",
        item.duration || "",
        item.delivery || "",
      ].filter(Boolean);

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
            <h3 class="delivery-block-title">Login credentials</h3>
            <div class="cred-list">${credHtml}</div>
          </div>
          ${featuresHtml}
          ${instructionsHtml}
          ${rulesHtml}
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
        <p style="margin-top:12px;font-weight:600">${escapeHtml(order.currency || getCurrencyCode())} · ${escapeHtml(order.paymentMode || "instant")} · Instant digital delivery</p>

        <div class="cred-panel delivery-panel" role="region" aria-label="Your product delivery">
          <div class="cred-panel-head">
            <h2>${escapeHtml(ss.successPackageTitle || "Your access package")}</h2>
            <p class="muted">${escapeHtml(
              ss.successPackageSub ||
                "Login credentials, features, instructions, and rules for each product."
            )}</p>
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
    $$("[data-rates]").forEach((el) => {
      el.textContent = ratesNote();
    });
    bindProductSearch();
    bindSearchTags();
    mountPageFx();
    bind();
    syncGlobalSearchInput();
    applySiteChrome();
    applyI18n();
    // Full-page translation for product text + leftover English
    if (getLang() !== "en") {
      queueTranslateDom(document.body, getLang());
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
    btn.addEventListener("click", () => {
      const deal = getDeal(btn.dataset.add);
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
      const etaBox = $("#ewalletEtaNotice");
      const autoBox = $("#autoDeliveryNotice");
      const manualPick = isManualEwalletMethod(method);
      const autoPick = isAutoDeliveryMethod(method);
      if (etaBox) etaBox.hidden = !manualPick;
      if (autoBox) autoBox.hidden = !autoPick;
      if (!btn) return;
      // Keep review CTA until they open terms
      btn.textContent = totalLabel ? `Review & continue · ${totalLabel}` : "Review & continue";
    };

    const openTermsModal = () => {
      if (!modal) return;
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      if (termsAccept) termsAccept.checked = false;
      if (termsConfirm) termsConfirm.disabled = true;
      if (termsErr) termsErr.textContent = "";
      // Sync confirm button label with selected method
      const method = form.querySelector('input[name="method"]:checked')?.value || "card";
      const label = payButtonLabel(method);
      if (termsConfirm) {
        termsConfirm.textContent = totalLabel ? `Accept & pay · ${totalLabel}` : `Accept & ${label}`;
      }
      termsAccept?.focus();
    };

    const closeTermsModal = () => {
      if (!modal) return;
      modal.hidden = true;
      document.body.style.overflow = "";
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
        if (data.provider === "manual" || data.pending || order.status === "awaiting_payment") {
          location.hash = `#/success?manual=1&order=${encodeURIComponent(order.id || "")}`;
        } else {
          location.hash = "#/success";
        }
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

  $("#cartBtn").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#overlay").addEventListener("click", closeCart);
  $("#goCheckout").addEventListener("click", () => {
    closeCart();
    location.hash = "#/checkout";
  });

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
  };

  $("#menuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const links = $("#navLinks");
    if (!links) return;
    const open = !links.classList.contains("open");
    links.classList.toggle("open", open);
    $("#menuBtn")?.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Close hamburger menu after navigation or outside tap
  $("#navLinks")?.addEventListener("click", (e) => {
    if (e.target.closest("a")) closeMobileMenu();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#menuBtn") || e.target.closest("#navLinks")) return;
    closeMobileMenu();
  });

  window.addEventListener("scroll", () => {
    $("#siteNav").classList.toggle("scrolled", window.scrollY > 40);
    // Don't keep mobile nav open while scrolling the page
    if (window.scrollY > 80) closeMobileMenu();
  });

  window.addEventListener("hashchange", () => {
    closeMobileMenu();
    parseRoute();
    window.scrollTo(0, 0);
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
