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
} from "./prefs.js";
import { queueTranslateDom } from "./translate.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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
  ewalletProvider: "demo",
  paymentMethods: [],
};

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
  return window.DEALS.find((d) => d.id === id);
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
  let list = [...window.DEALS];
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
  const tags = popularQueries(window.DEALS || []);
  return `
    <div class="search-tags" role="list">
      ${tags
        .map(
          (t) =>
            `<button type="button" class="search-tag" data-q="${escapeHtml(t)}" role="listitem">${escapeHtml(t)}</button>`
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
  const results = q ? searchDeals(window.DEALS, q, { limit: 100 }) : [];
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

function applySiteChrome() {
  const s = siteSettings();
  const setText = (sel, val) => {
    const el = document.querySelector(sel);
    if (el && val != null && String(val).length) el.textContent = val;
  };
  setText("#footerBlurb", c("footer_blurb", "footerText"));
  setText("#footerCompanyBlurb", c("footer_company_blurb", "footerCompanyBlurb"));
  setText("#footerBrand", s.footerBrand || s.siteName || "SubSaverPH");
  setText("#footerServiceArea", c("footer_service_area", "footerServiceArea"));
  setText("#footerWebsiteLabel", s.footerWebsite || "subsaverph.com");
  const support = supportEmailAddress();
  setText("#footerBusinessType", c("footer_business_type", "footerBusinessType"));
  setText("#footerDisclaimer", c("footer_disclaimer", "footerDisclaimer"));
  const year = new Date().getFullYear();
  setText("#footerCopyright", `© ${year} ${c("footer_copyright", "footerCopyright")}`);
  document.querySelectorAll(".footer-meta li span[data-i18n-meta]").forEach((span) => {
    span.textContent = t(span.getAttribute("data-i18n-meta"));
  });
  // Footer support: go to support page (no static mailto — Cloudflare breaks those)
  const supportLabel = document.querySelector("#footerSupportLabel");
  if (supportLabel) {
    supportLabel.innerHTML = `<a href="#/support" class="js-go-support">${escapeHtml(support)}</a>`;
  }
  document.querySelectorAll("a[data-support-email], a[data-support-link]").forEach((a) => {
    a.setAttribute("href", "#/support");
    a.classList.add("js-go-support");
  });
}

function heroTitleHtml() {
  const raw = c("hero_title", "heroTitle") || "Premium\nplans.\nLower\ncost.";
  return escapeHtml(raw).replace(/\\n/g, "<br/>").replace(/\n/g, "<br/>");
}

function viewHome() {
  const q = state.query.trim();
  const matches = q ? searchDeals(window.DEALS || [], q, { limit: 100 }) : [];
  const top = [...window.DEALS].sort((a, b) => off(b) - off(a)).slice(0, 6);
  const s = siteSettings();
  const brandSet = [...new Set(window.DEALS.map((d) => d.brand).filter(Boolean))];
  const monoMap = { xAI: "SG", Canva: "CV", CapCut: "CC", Netflix: "NF", YouTube: "YT" };
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
          <a class="btn" href="#/deals">${escapeHtml(t("cta_browse"))}</a>
        </div>
        <div class="meta">
          <div><strong>${window.DEALS.length}</strong><span>${escapeHtml(t("meta_plans"))}</span></div>
          <div><strong>5</strong><span>${escapeHtml(t("meta_platforms"))}</span></div>
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
            <h2>${escapeHtml(c("platforms_title", "platformsTitle"))}</h2>
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
        <div class="section-head">
          <div>
            <p class="eyebrow">${escapeHtml(t("eyebrow_catalog"))}</p>
            <h2>${escapeHtml(c("catalog_title", "catalogTitle"))}</h2>
          </div>
          <a href="#/deals" class="link">${escapeHtml(t("view_all"))}</a>
        </div>
        <div class="grid">${top.map(card).join("")}</div>
      </div>
    </section>

    <section class="mission">
      <div class="mission-line"></div>
      <div class="mission-inner">
        <p class="eyebrow">${escapeHtml(t("why_prefix"))} ${escapeHtml(s.siteName || "SubSaverPH")}</p>
        <h2>${escapeHtml(c("mission_title", "missionTitle"))}</h2>
        <p>${escapeHtml(c("mission_text", "missionText"))}</p>
        <a class="btn solid" href="#/deals">${escapeHtml(t("cta_browse"))}</a>
      </div>
    </section>`;
}

function viewDeals() {
  const list = filtered();
  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">${escapeHtml(t("eyebrow_catalog"))}</p>
        <h1 class="page-title">${escapeHtml(t("page_deals"))}</h1>
        <p class="muted">${list.length} plan${list.length === 1 ? "" : "s"} · currency <strong>${getCurrencyCode()}</strong></p>

        ${searchBarHTML()}

        <div class="toolbar">
          <div id="pageFxMount"></div>
          <select id="sortSelect" class="field-select" aria-label="Sort">
            <option value="savings" ${state.sort === "savings" ? "selected" : ""}>Highest savings</option>
            <option value="price" ${state.sort === "price" ? "selected" : ""}>Lowest price</option>
            <option value="name" ${state.sort === "name" ? "selected" : ""}>Name A–Z</option>
          </select>
        </div>
        <p class="rates" data-rates>${ratesNote()}</p>

        <div class="layout">
          <aside class="filters">
            <h3>Service</h3>
            ${window.BRANDS.map(
              (b) => `
              <label class="radio">
                <input type="radio" name="brand" value="${b}" ${state.brand === b ? "checked" : ""} />
                <span>${b === "All" ? "All services" : b === "xAI" ? "SuperGrok (xAI)" : b}</span>
              </label>`
            ).join("")}
            <h3 style="margin-top:20px">Category</h3>
            ${window.CATEGORIES.map(
              (c) => `
              <label class="radio">
                <input type="radio" name="cat" value="${c}" ${state.category === c ? "checked" : ""} />
                <span>${c}</span>
              </label>`
            ).join("")}
          </aside>
          <div>
            ${list.length ? `<div class="grid">${list.map((d) => card(d, state.query)).join("")}</div>` : `<div class="empty">No plans match. Try another search.</div>`}
          </div>
        </div>
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

function viewHow() {
  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">${escapeHtml(t("protocol"))}</p>
        <h1 class="page-title">${escapeHtml(t("page_how"))}</h1>
        <div class="steps">
          <div class="step"><em>01</em><h3>${escapeHtml(t("how_step1_t"))}</h3><p>${escapeHtml(t("how_step1_p"))}</p></div>
          <div class="step"><em>02</em><h3>${escapeHtml(t("how_step2_t"))}</h3><p>${escapeHtml(t("how_step2_p"))}</p></div>
          <div class="step"><em>03</em><h3>${escapeHtml(t("how_step3_t"))}</h3><p>${escapeHtml(t("how_step3_p"))}</p></div>
          <div class="step"><em>04</em><h3>${escapeHtml(t("how_step4_t"))}</h3><p>${escapeHtml(t("how_step4_p"))}</p></div>
        </div>
        <div class="note">
          <h3>${escapeHtml(t("demo_notice"))}</h3>
          <p class="muted">${escapeHtml(t("demo_notice_p"))}</p>
          <div class="cta" style="margin:18px 0 0">
            <a class="btn solid" href="#/deals">${escapeHtml(t("cta_browse"))}</a>
          </div>
        </div>
      </div>
    </div>`;
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

/** Open mail client without static mailto in HTML (avoids Cloudflare email-protection breakage). */
function openSupportMail(opts = {}) {
  const email = supportEmailAddress();
  const subject = opts.subject || "SubSaverPH support request";
  const body =
    opts.body ||
    "Hi SubSaverPH Support,\n\nOrder ID (if any):\nProblem:\n\nThank you.";
  const url = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    window.location.href = url;
  } catch {
    window.open(url, "_self");
  }
  return false;
}

function goSupportPage() {
  if (location.hash !== "#/support" && location.hash !== "#/contact") {
    location.hash = "#/support";
  } else {
    state.view = "support";
    render();
    window.scrollTo(0, 0);
  }
}

function viewSupport() {
  const email = supportEmailAddress();
  return `
    <div class="page">
      <div class="page-inner support-page">
        <p class="eyebrow">Help</p>
        <h1 class="page-title">Customer support</h1>
        <p class="muted" style="max-width:36rem;line-height:1.55">
          Having a problem with your order, login, or delivery? Email us and we will help.
          Include your <strong style="color:var(--text)">Order ID</strong> or Payment ID when you have one.
        </p>
        <div class="support-card">
          <p class="eyebrow" style="margin:0 0 8px">Support email</p>
          <p class="support-email-link" id="supportEmailDisplay" data-support-display>${escapeHtml(email)}</p>
          <p class="muted" style="margin:14px 0 0;font-size:0.9rem;line-height:1.5">
            Tap <strong style="color:var(--text)">Email support</strong> to open your email app (Outlook, Gmail, etc.).
            Or copy the address above.
          </p>
          <div class="cta" style="margin-top:18px">
            <button type="button" class="btn solid" data-open-support-mail>Email support</button>
            <button type="button" class="btn" data-copy-support-email>Copy email</button>
            <a class="btn" href="#/deals">Back to deals</a>
          </div>
        </div>
        <div class="note" style="margin-top:22px">
          <h3 style="margin-top:0">Before you write</h3>
          <ul class="muted" style="margin:8px 0 0;padding-left:1.2rem;line-height:1.55">
            <li>Include your Order ID from the success page or payment email.</li>
            <li>Describe what is wrong (e.g. login failed, code missing, wrong product).</li>
            <li>Do not change username, password, billing, or subscription on shared accounts — that voids support.</li>
            <li>Refunds only if the product is defective or not delivered.</li>
          </ul>
        </div>
      </div>
    </div>`;
}

function paymentMethodsList() {
  const list = state.paymentMethods && state.paymentMethods.length
    ? state.paymentMethods
    : [
        // Card/Stripe omitted from fallback — use PayPal for card payments
        { id: "gcash", label: "GCash", desc: "Pay with GCash (PHP)", group: "ewallet" },
        { id: "paymaya", label: "Maya", desc: "Pay with Maya / PayMaya (PHP)", group: "ewallet" },
        { id: "grab_pay", label: "GrabPay", desc: "Pay with GrabPay (PHP)", group: "ewallet" },
        { id: "shopeepay", label: "ShopeePay", desc: "Pay with ShopeePay (PHP)", group: "ewallet" },
        { id: "paypal", label: "PayPal", desc: "Pay with PayPal balance or linked card", group: "other" },
        { id: "crypto", label: "Crypto", desc: "USDT, BTC, ETH & more", group: "other" },
        { id: "liqpay", label: "LiqPay", desc: "Card & wallets via LiqPay", group: "other" },
        { id: "demo", label: "Demo", desc: "Test without real money", group: "other" },
      ];
  return list;
}

const PH_EWALLETS = new Set(["gcash", "paymaya", "grab_pay", "shopeepay", "xendit"]);

function payButtonLabel(method) {
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
  const ewalletBackend = state.ewalletProvider || (paymongoOn ? "paymongo" : xenditOn ? "xendit" : "demo");
  const isTestKey = String(state.stripePublishableKey || "").startsWith("pk_test_");
  const hasEwallet = methods.some((m) => PH_EWALLETS.has(m.id));
  const ewalletMethods = methods.filter((m) => PH_EWALLETS.has(m.id) || m.group === "ewallet");
  const otherMethods = methods.filter((m) => !PH_EWALLETS.has(m.id) && m.group !== "ewallet");

  const radioHtml = (m, checked) => `
      <label class="pay-method ${PH_EWALLETS.has(m.id) ? "pay-method-ewallet" : ""}">
        <input type="radio" name="method" value="${escapeHtml(m.id)}" ${checked ? "checked" : ""} required />
        <span class="pay-method-box">
          <strong>${escapeHtml(m.label)}</strong>
          <em>${escapeHtml(m.desc || "")}</em>
        </span>
      </label>`;

  // Prefer GCash first for Filipino shoppers when available
  const preferred =
    methods.find((m) => m.id === "gcash") ||
    methods.find((m) => PH_EWALLETS.has(m.id)) ||
    methods[0];
  const methodRadios = [
    ...(ewalletMethods.length
      ? [
          `<p class="pay-group-label">Philippine e-wallets (PHP)</p>`,
          ...ewalletMethods.map((m) => radioHtml(m, preferred && m.id === preferred.id)),
        ]
      : []),
    ...(otherMethods.length
      ? [
          ewalletMethods.length ? `<p class="pay-group-label">Other methods</p>` : "",
          ...otherMethods.map((m) =>
            radioHtml(m, !preferred || (!PH_EWALLETS.has(preferred.id) && m.id === preferred.id))
          ),
        ]
      : []),
  ].join("");

  const payHelp = `
        <div class="pay-help" id="payHelpBox">
          <strong>How payment works</strong>
          <p id="payHelpText">
            ${
              stripeOn ||
              paymongoOn ||
              xenditOn ||
              state.paypalEnabled ||
              state.cryptoEnabled ||
              state.liqpayEnabled
                ? "Pick a method below. You’ll be redirected to a secure payment page. Codes unlock after payment succeeds."
                : "Demo mode — no real money. Add payment keys for live PayPal / Crypto / LiqPay."
            }
          </p>
          ${
            hasEwallet
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:var(--text)">PH e-wallets</strong> (GCash, Maya, GrabPay, ShopeePay) bill in
            <strong style="color:var(--text)">PHP</strong> via
            <strong style="color:var(--text)">${escapeHtml(ewalletBackend === "xendit" ? "Xendit" : ewalletBackend === "paymongo" ? "PayMongo" : "demo")}</strong>.
            ${
              xenditOn || paymongoOn
                ? "Gateway keys are configured."
                : "Showing demo e-wallets until Xendit/PayMongo is configured."
            }
          </p>`
              : ""
          }
          ${
            paypalOn
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:var(--text)">PayPal</strong> —
            ${
              state.paypalEnabled
                ? "live PayPal Checkout is configured. You’ll approve payment on PayPal, then return here for codes."
                : "shown in demo mode until you set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
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
                ? "NOWPayments is configured (USDT, BTC, ETH, etc.). Pay on the hosted crypto page, then return for codes."
                : "shown in demo mode until you set NOWPAYMENTS_API_KEY (see CRYPTO-SETUP.md)."
            }
          </p>`
              : ""
          }
          ${
            liqpayOn
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:var(--text)">LiqPay</strong> —
            ${
              state.liqpayEnabled
                ? "LiqPay is configured for card/wallet checkout."
                : "demo until you set LIQPAY_PUBLIC_KEY + LIQPAY_PRIVATE_KEY (see LIQPAY-SETUP.md)."
            }
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
                <button type="button" class="btn ghost" data-open-support-mail style="margin:6px 0 0;padding:6px 12px;font-size:0.85rem">Email ${escapeHtml(supportEmail)}</button>
                · <a href="#/support" class="js-go-support">Support page</a>
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

  /** Build credential cards from credentials[] or parse codes[] */
  const credCards = (order.items || [])
    .map((item) => {
      let creds = Array.isArray(item.credentials) ? item.credentials : [];
      if (!creds.length && Array.isArray(item.codes)) {
        creds = item.codes.map((c) => parseCredentialClient(c));
      }
      if (!creds.length) {
        return `<div class="cred-card">
          <div class="cred-product">${escapeHtml(item.monogram || "")} ${escapeHtml(item.name || "Product")}</div>
          <p class="muted" style="margin:8px 0 0">No login on file — contact support with order ID.</p>
        </div>`;
      }
      return creds
        .map((cr, idx) => {
          const user = cr.username || cr.user || "";
          const pass = cr.password || cr.pass || "";
          const code = cr.code || (!user && !pass ? cr.raw || "" : "");
          const title =
            (order.items || []).length > 1 || creds.length > 1
              ? `${item.name || "Product"}${creds.length > 1 ? ` #${idx + 1}` : ""}`
              : item.name || "Your access";
          if (user || pass) {
            return `
            <div class="cred-card" data-cred-card>
              <div class="cred-product">${escapeHtml(item.monogram || "")} ${escapeHtml(title)}</div>
              <div class="cred-field">
                <label>Username / Email</label>
                <div class="cred-value-row">
                  <code class="cred-value" data-copy-text>${escapeHtml(user || "—")}</code>
                  <button type="button" class="btn sm cred-copy" data-copy="${escapeHtml(user)}" ${user ? "" : "disabled"}>Copy</button>
                </div>
              </div>
              <div class="cred-field">
                <label>Password</label>
                <div class="cred-value-row">
                  <code class="cred-value" data-copy-text>${escapeHtml(pass || "—")}</code>
                  <button type="button" class="btn sm cred-copy" data-copy="${escapeHtml(pass)}" ${pass ? "" : "disabled"}>Copy</button>
                </div>
              </div>
              <button type="button" class="btn solid sm full cred-copy-both" data-copy-user="${escapeHtml(user)}" data-copy-pass="${escapeHtml(pass)}" style="margin-top:12px">
                Copy username + password
              </button>
            </div>`;
          }
          return `
            <div class="cred-card" data-cred-card>
              <div class="cred-product">${escapeHtml(item.monogram || "")} ${escapeHtml(title)}</div>
              <div class="cred-field">
                <label>Access code</label>
                <div class="cred-value-row">
                  <code class="cred-value" data-copy-text>${escapeHtml(code || "—")}</code>
                  <button type="button" class="btn sm cred-copy" data-copy="${escapeHtml(code)}" ${code ? "" : "disabled"}>Copy</button>
                </div>
              </div>
            </div>`;
        })
        .join("");
    })
    .join("");

  const emailNote = order.emailSent
    ? `Invoice + login details were emailed to <strong style="color:var(--text)">${escapeHtml(order.email)}</strong>. Check inbox and spam.`
    : order.email
      ? `Logins are shown below. Email to <strong style="color:var(--text)">${escapeHtml(order.email)}</strong> was not confirmed${order.emailDetail ? ` (${escapeHtml(String(order.emailDetail).slice(0, 80))})` : ""}. Save them here.`
      : `Save your login details below.`;

  return `
    <div class="success">
      <div class="success-card success-card-wide">
        <div class="ok">OK</div>
        <h1>Order delivered</h1>
        <p class="muted">Order <strong class="success-order-id">${escapeHtml(order.id)}</strong><br/>${emailNote}</p>
        <p style="margin-top:12px;font-weight:600">${escapeHtml(order.currency || getCurrencyCode())} · ${escapeHtml(order.paymentMode || "instant")} · Instant digital delivery</p>

        <div class="cred-panel" role="region" aria-label="Your product login">
          <div class="cred-panel-head">
            <h2>Your login</h2>
            <p class="muted">Username and password for each product — tap Copy to paste into the app.</p>
          </div>
          <div class="cred-list">${credCards}</div>
        </div>

        <p class="muted" style="font-size:0.8rem;margin-top:16px">Save these credentials now. Redeem / sign in on the official service. Not affiliated with listed brands.</p>
        <div class="support-inline">
          <p class="muted" style="margin:0;font-size:0.9rem">Problem with this order?</p>
          <button type="button" class="btn" data-open-support-mail data-support-subject="${escapeAttr("Order help " + (order.id || ""))}" data-support-body="${escapeAttr("Order ID: " + (order.id || "") + "\nPayment ID: " + (order.providerRef || order.stripeSessionId || "") + "\n\nProblem:\n")}">Email support</button>
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
      html = viewHow();
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
  $("#app").innerHTML = html;
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
}

function bind() {
  // Support mail / page (Cloudflare-safe — no broken /cdn-cgi/l/email-protection links)
  $$("[data-open-support-mail]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openSupportMail({
        subject: btn.getAttribute("data-support-subject") || undefined,
        body: btn.getAttribute("data-support-body") || undefined,
      });
    });
  });
  $$("[data-copy-support-email]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = supportEmailAddress();
      try {
        await navigator.clipboard.writeText(email);
        toast("Support email copied");
      } catch {
        toast(email, false);
      }
    });
  });
  $$("a.js-go-support, a[href='#/support'], a[href='#/contact']").forEach((a) => {
    a.addEventListener("click", (e) => {
      // Ensure SPA navigation even if hash is sticky / CF rewrote something
      if (a.getAttribute("href")?.startsWith("#/")) {
        e.preventDefault();
        goSupportPage();
      }
    });
  });

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

        // Demo / instant order
        const order = data.order;
        order.totalFormatted = formatMoney(cartTotals().total);
        sessionStorage.setItem("subsaverph_last", JSON.stringify(order));
        try {
          saveOrder(order);
        } catch {
          /* optional */
        }
        clearCart();
        updateBadge();
        closeTermsModal();
        location.hash = "#/success";
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

async function loadLiveCatalog() {
  try {
    const res = await fetch("/api/catalog", { credentials: "same-origin" });
    if (!res.ok) throw new Error("offline");
    const data = await res.json();
    if (Array.isArray(data.deals) && data.deals.length) {
      window.DEALS = data.deals.map((d) => ({
        ...d,
        includes: Array.isArray(d.includes) ? d.includes : [],
        badge: d.badge || null,
        // stockLeft from API inventory; 0 = SOLD OUT
        stockLeft: typeof d.stockLeft === "number" ? d.stockLeft : Number(d.stockLeft) || 0,
      }));
    }
    if (data.settings) state.settings = data.settings;
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

async function init() {
  initPrefs();
  applyI18n();
  bindPrefsPanel();

  const yearEl = document.getElementById("footerYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  await loadLiveCatalog();
  await loadRates();
  applyI18n();
  bindGlobalSearch();
  bindPrefsPanel(); // ensure language list filled after catalog

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
  });
  window.addEventListener("cart:change", () => {
    updateBadge();
    if ($("#drawer").classList.contains("open")) renderCart();
  });
  window.addEventListener("rates:loaded", () => render());

  // Footer lives outside #app — bind support links once (not wiped by render)
  document.body.addEventListener("click", (e) => {
    const go = e.target.closest("a.js-go-support, a[href='#/support'], a[href='#/contact'], a[data-support-link]");
    if (go) {
      e.preventDefault();
      goSupportPage();
      return;
    }
    const mailBtn = e.target.closest("[data-open-support-mail]");
    if (mailBtn && !mailBtn.closest("#app")) {
      e.preventDefault();
      openSupportMail({
        subject: mailBtn.getAttribute("data-support-subject") || undefined,
        body: mailBtn.getAttribute("data-support-body") || undefined,
      });
    }
  });

  parseRoute();
  await loadRates();
  render();
}

// Expose for inline debugging / future buttons
window.SubSaverSupport = { openSupportMail, goSupportPage, supportEmailAddress };

init();
