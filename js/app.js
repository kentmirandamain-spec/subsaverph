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
  applyLang,
  getThemePref,
  getLang,
  setThemePref,
  setLang,
  t,
} from "./prefs.js";

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

  if (langSel) langSel.value = getLang();
  if (themeSel) themeSel.value = getThemePref();

  const close = () => {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    picker.classList.remove("open");
  };
  const open = () => {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    picker.classList.add("open");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) open();
    else close();
  });

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  langSel?.addEventListener("change", () => {
    setLang(langSel.value);
    applyI18n();
    render();
    toast(t("toast_lang"));
  });

  themeSel?.addEventListener("change", () => {
    setThemePref(themeSel.value);
    applyTheme(themeSel.value);
    toast(t("toast_theme"));
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
  const src = info.source === "live" ? "Live FX" : info.source === "cache" ? "Cached FX" : "Offline FX";
  return `${src} · ${CURRENCY_LIST.length} currencies · pay in ${getCurrencyCode()}`;
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
  if (d.period === "7 days") return " / 7 days";
  if (d.period === "month") return " / month";
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
  if (isSoldOut(d)) return "SOLD OUT";
  if (typeof d.stockLeft === "number") {
    if (d.stockLeft <= 3) return `Only ${d.stockLeft} left`;
    return `${d.stockLeft} in stock`;
  }
  return d.stock || "In stock";
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
          ${soldOut ? `<span class="pill sold-out-pill">SOLD OUT</span>` : ""}
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
        <a class="btn sm" href="#/deal/${d.id}">Details</a>
        ${
          soldOut
            ? `<button class="btn sm sold-out-btn" type="button" disabled>SOLD OUT</button>`
            : `<button class="btn sm solid" data-add="${d.id}">Add</button>`
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
  setText("#footerBlurb", s.footerText);
  setText("#footerCompanyBlurb", s.footerCompanyBlurb);
  setText("#footerBrand", s.footerBrand);
  setText("#footerServiceArea", s.footerServiceArea);
  setText("#footerWebsiteLabel", s.footerWebsite);
  setText("#footerSupportLabel", s.footerSupport);
  setText("#footerBusinessType", s.footerBusinessType);
  setText("#footerDisclaimer", s.footerDisclaimer);
  if (s.footerCopyright) {
    const year = new Date().getFullYear();
    setText("#footerCopyright", `© ${year} ${s.footerCopyright}`);
  }
  if (s.supportEmail) {
    document.querySelectorAll("a[data-support-email]").forEach((a) => {
      a.href = `mailto:${s.supportEmail}`;
      if (a.dataset.supportLabel !== "0") a.textContent = s.supportEmail;
    });
  }
}

function heroTitleHtml() {
  const raw = siteSettings().heroTitle || "Premium\nplans.\nLower\ncost.";
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
    return `
    <div class="page page-search-only">
      <div class="page-inner">
        <p class="eyebrow">Search</p>
        <h1 class="page-title">Results</h1>
        <p class="muted">Only products that match “<strong>${escapeHtml(q)}</strong>” are shown.</p>
        ${searchBarHTML("Search a product name…")}
        <div class="search-meta">
          <strong>${matches.length}</strong> product${matches.length === 1 ? "" : "s"} found
          <button type="button" class="link" id="clearSearchLink" style="margin-left:16px">Clear search</button>
        </div>
        ${
          matches.length
            ? `<div class="grid search-grid${matches.length === 1 ? " grid-single" : ""}">${matches.map((d) => card(d, q)).join("")}</div>`
            : `<div class="empty">No products matched “${escapeHtml(q)}”.<br/>Try SuperGrok, Netflix, or Canva.</div>`
        }
      </div>
    </div>`;
  }

  return `
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="hero-inner">
        <p class="eyebrow">${escapeHtml(s.heroEyebrow || "SubSaverPH · Subscription access")}</p>
        <h1 class="display">${heroTitleHtml()}</h1>
        <p class="lead">${escapeHtml(s.heroLead || "Prepaid discounts. Pay in any currency.")}</p>

        ${searchBarHTML("Search SuperGrok, Netflix, Canva…")}

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
      <div>${escapeHtml(s.strip1 || "Secure checkout")}</div>
      <div>${escapeHtml(s.strip2 || "Searchable FX pay")}</div>
      <div>${escapeHtml(s.strip3 || "Instant digital codes")}</div>
      <div>${escapeHtml(s.strip4 || "Demo storefront")}</div>
    </div>

    <section class="section">
      <div class="section-inner">
        <div class="section-head">
          <div>
            <p class="eyebrow">${escapeHtml(t("eyebrow_platforms"))}</p>
            <h2>${escapeHtml(s.platformsTitle || "Select a service")}</h2>
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
            <h2>${escapeHtml(s.catalogTitle || "Highest savings")}</h2>
          </div>
          <a href="#/deals" class="link">${escapeHtml(t("view_all"))}</a>
        </div>
        <div class="grid">${top.map(card).join("")}</div>
      </div>
    </section>

    <section class="mission">
      <div class="mission-line"></div>
      <div class="mission-inner">
        <p class="eyebrow">Why ${escapeHtml(s.siteName || "SubSaverPH")}</p>
        <h2>${escapeHtml(s.missionTitle || "Stack subscriptions without stacking full price")}</h2>
        <p>${escapeHtml(s.missionText || "Prepaid multi-month plans at outlet rates.")}</p>
        <a class="btn solid" href="#/deals">Browse deals</a>
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
    return `<div class="page"><div class="page-inner empty"><h2>Plan not found</h2><a class="btn solid" href="#/deals">Back</a></div></div>`;
  }
  const isPhp = (d.priceBase || "USD") === "PHP";
  const yearly = d.period === "month" ? d.price * 12 : d.price;
  const yearlyWas = d.period === "month" ? d.original * 12 : d.original;
  const soldOut = isSoldOut(d);
  return `
    <div class="page">
      <div class="page-inner">
        <a href="#/deals" class="link">← All deals</a>
        <div class="detail">
          <div class="detail-panel">
            <div class="mono-box lg">${escapeHtml(d.monogram)}</div>
            ${
              soldOut
                ? `<div class="save-big sold-out-big">SOLD OUT<span>No codes left in stock</span></div>`
                : `<div class="save-big">−${off(d)}%<span>Versus retail</span></div>`
            }
            ${isPhp ? `<p class="php-tag">Base price in PHP · shows exact ₱ when currency is PHP</p>` : ""}
            <ul class="list">
              ${d.includes.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
            </ul>
          </div>
          <div class="detail-info">
            <p class="cat">${escapeHtml(d.brand)} · ${escapeHtml(d.category)} · <span class="${soldOut ? "is-sold-out" : ""}">${escapeHtml(stockLabel(d))}</span></p>
            <h1>${escapeHtml(d.name)}</h1>
            <p class="tag">${escapeHtml(d.tagline)}</p>
            <p class="muted" style="margin:8px 0 14px">★ ${d.rating} · ${d.reviews.toLocaleString()} reviews</p>

            <div id="pageFxMount" style="margin-bottom:14px"></div>

            <div class="price-hero">
              <div>
                <strong>${formatDealPrice(d, "price")}</strong><span class="per">${periodLabel(d)}</span>
                <span class="was" style="display:block;margin-top:4px">${formatDealPrice(d, "original")} retail</span>
              </div>
              ${
                soldOut
                  ? `<div class="you-save sold-out-banner">SOLD OUT</div>`
                  : `<div class="you-save">Save ${formatDealPrice({ ...d, price: d.original - d.price, priceBase: d.priceBase }, "price")}</div>`
              }
            </div>
            <p class="muted" style="font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">
              ${escapeHtml(d.duration)} · ${escapeHtml(d.delivery)}
            </p>
            <p class="tag" style="margin:14px 0">${escapeHtml(d.description)}</p>
            ${
              d.period === "month"
                ? `<div class="compare">
              <div><span>Yearly at deal rate</span><strong>${formatDealPrice({ ...d, price: yearly }, "price")}</strong></div>
              <div><span>Yearly at retail</span><strong class="strike">${formatDealPrice({ ...d, price: yearlyWas }, "price")}</strong></div>
            </div>`
                : ""
            }
            <div class="buy">
              ${
                soldOut
                  ? `<button class="btn sold-out-btn" type="button" disabled>SOLD OUT</button>
                     <p class="muted" style="width:100%;margin:8px 0 0">This plan has no codes left. Check back later or pick another product.</p>`
                  : `<button class="btn solid" data-add="${d.id}">Add to cart</button>
                     <button class="btn" data-buy-now="${d.id}">Buy now</button>`
              }
            </div>
            <p class="fine">${escapeHtml(d.finePrint)}</p>
            <p class="rates" data-rates style="margin-top:12px">${ratesNote()}</p>
          </div>
        </div>
      </div>
    </div>`;
}

function viewHow() {
  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">Protocol</p>
        <h1 class="page-title">How it works</h1>
        <div class="steps">
          <div class="step"><em>01</em><h3>Search</h3><p>Use the home search bar to find SuperGrok, Canva, CapCut, Netflix, or YouTube.</p></div>
          <div class="step"><em>02</em><h3>Currency</h3><p>Open Pay → search any currency (PHP, USD, EUR…). SuperGrok stays exact at ₱99 / ₱399 in PHP.</p></div>
          <div class="step"><em>03</em><h3>Checkout</h3><p>Demo card form only. No real charges. Codes on confirmation.</p></div>
          <div class="step"><em>04</em><h3>Redeem</h3><p>Apply codes on the official service. Keep the order ID.</p></div>
        </div>
        <div class="note">
          <h3>Demo notice</h3>
          <p class="muted">SubSaverPH is a portfolio storefront. Not affiliated with xAI, Canva, CapCut, Netflix, or YouTube.</p>
          <div class="cta" style="margin:18px 0 0">
            <a class="btn solid" href="#/deals">Browse deals</a>
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
        <p class="legal-updated muted">Last updated: ${updated}</p>
        <div class="legal-body">
          ${bodyHtml}
        </div>
        <div class="legal-nav">
          <a href="#/about">About</a>
          <a href="#/terms">Terms of Use</a>
          <a href="#/privacy">Privacy Policy</a>
          <a href="#/home">Back to home</a>
        </div>
      </div>
    </div>`;
}

function viewAbout() {
  const s = siteSettings();
  const body =
    textToLegalHtml(s.aboutBody) ||
    `<p><strong>${escapeHtml(s.siteName || "SubSaverPH")}</strong> — discounted prepaid subscriptions in the Philippines.</p>`;
  return viewLegalShell(
    "Company",
    escapeHtml(s.aboutTitle || "About SubSaverPH"),
    escapeHtml(s.aboutUpdated || "July 16, 2026"),
    body
  );
}

function viewTerms() {
  const s = siteSettings();
  const body =
    textToLegalHtml(s.termsBody) ||
    `<p>Terms of Use for ${escapeHtml(s.siteName || "SubSaverPH")}. Contact ${escapeHtml(s.supportEmail || "support@subsaverph.com")}.</p>`;
  return viewLegalShell(
    "Legal",
    escapeHtml(s.termsTitle || "Terms of Use"),
    escapeHtml(s.termsUpdated || "July 16, 2026"),
    body
  );
}

function viewPrivacy() {
  const s = siteSettings();
  const body =
    textToLegalHtml(s.privacyBody) ||
    `<p>Privacy Policy for ${escapeHtml(s.siteName || "SubSaverPH")}. Contact ${escapeHtml(s.supportEmail || "support@subsaverph.com")}.</p>`;
  return viewLegalShell(
    "Legal",
    escapeHtml(s.privacyTitle || "Privacy Policy"),
    escapeHtml(s.privacyUpdated || "July 16, 2026"),
    body
  );
}

function paymentMethodsList() {
  const list = state.paymentMethods && state.paymentMethods.length
    ? state.paymentMethods
    : [
        { id: "card", label: "Card", desc: "Visa / Mastercard" },
        { id: "gcash", label: "GCash", desc: "Pay with GCash" },
        { id: "paymaya", label: "Maya", desc: "Pay with Maya" },
        { id: "paypal", label: "PayPal", desc: "PayPal" },
        { id: "crypto", label: "Crypto", desc: "USDT, BTC, ETH" },
        { id: "demo", label: "Demo", desc: "Test without real money" },
      ];
  return list;
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
  const isTestKey = String(state.stripePublishableKey || "").startsWith("pk_test_");
  const hasGcash = methods.some((m) => m.id === "gcash");
  const hasMaya = methods.some((m) => m.id === "paymaya");
  const methodRadios = methods
    .map(
      (m, i) => `
      <label class="pay-method">
        <input type="radio" name="method" value="${escapeHtml(m.id)}" ${i === 0 ? "checked" : ""} required />
        <span class="pay-method-box">
          <strong>${escapeHtml(m.label)}</strong>
          <em>${escapeHtml(m.desc || "")}</em>
        </span>
      </label>`
    )
    .join("");

  const payHelp = `
        <div class="pay-help" id="payHelpBox">
          <strong>How payment works</strong>
          <p id="payHelpText">
            ${
              stripeOn || paymongoOn
                ? "Pick a method below. You’ll be redirected to a secure payment page (Stripe or PayMongo). Codes unlock after payment."
                : "Demo mode — no real money. Orders complete instantly for testing."
            }
          </p>
          ${
            hasGcash || hasMaya
              ? `<p class="muted" style="margin:8px 0 0;font-size:0.8rem;text-transform:none;letter-spacing:0;font-weight:400">
            <strong style="color:#fff">GCash / Maya</strong> charge in <strong style="color:#fff">PHP</strong> via PayMongo.
            ${paymongoOn ? "Live/test keys are configured." : "Currently demo until PayMongo keys are set on the server."}
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

  const defaultMethod = methods[0]?.id || "card";
  const defaultBtn =
    defaultMethod === "gcash"
      ? "Continue to GCash"
      : defaultMethod === "paymaya"
        ? "Continue to Maya"
        : defaultMethod === "card" && stripeOn
          ? "Continue to Stripe"
          : "Continue to pay";

  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">Payment</p>
        <h1 class="page-title">Checkout</h1>
        <p class="muted" style="margin-bottom:16px">
          Pay with <strong style="color:#fff">Card</strong>, <strong style="color:#fff">GCash</strong>, or <strong style="color:#fff">Maya</strong>.
          After payment, codes deliver <strong style="color:#fff">instantly</strong>.
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
              GCash &amp; Maya always bill in PHP (converted automatically).
            </p>
            <h3>Payment method</h3>
            <div class="pay-methods" role="radiogroup" aria-label="Payment method">
              ${methodRadios}
            </div>
            ${payHelp}
            <label class="check"><input type="checkbox" name="agree" required /> I agree to purchase digital codes; delivery is instant after payment.</label>
            <p class="err" id="checkoutErr" style="color:#ff8a8a;font-size:0.85rem;min-height:1.2em"></p>
            <button class="btn solid full" type="submit" id="payBtn" data-total="${escapeHtml(formatMoney(t.total))}">
              ${defaultBtn} · ${formatMoney(t.total)}
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
    </div>`;
}

function viewSuccess() {
  const order = JSON.parse(sessionStorage.getItem("subsaverph_last") || "null");
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
  const lines = (order.items || [])
    .map((i) => {
      const codes = (i.codes || []).length
        ? i.codes
            .map(
              (c) =>
                `<div class="code-row"><span>${escapeHtml(i.monogram || "")} ${escapeHtml(i.name)}</span><code>${escapeHtml(c)}</code></div>`
            )
            .join("")
        : `<div class="code-row"><span>${escapeHtml(i.name)}</span><code>No stock — contact support</code></div>`;
      return codes;
    })
    .join("");

  const emailNote = order.emailSent
    ? `Invoice + codes emailed to <strong style="color:#fff">${escapeHtml(order.email)}</strong>.`
    : order.email
      ? `Codes are shown below. If email is configured on the server, an invoice was also sent to <strong style="color:#fff">${escapeHtml(order.email)}</strong>.`
      : `Save your codes below.`;

  return `
    <div class="success">
      <div class="success-card">
        <div class="ok">OK</div>
        <h1>Order delivered</h1>
        <p class="muted">Order <strong style="color:#fff">${escapeHtml(order.id)}</strong><br/>${emailNote}</p>
        <p style="margin-top:12px;font-weight:600">${escapeHtml(order.currency || getCurrencyCode())} · ${escapeHtml(order.paymentMode || "instant")} · Instant digital delivery</p>
        <div class="codes">${lines}</div>
        <p class="muted" style="font-size:0.8rem">Save these codes now (and check your email inbox/spam). Redeem on the official service.</p>
        <div class="cta" style="justify-content:center;margin-top:22px">
          <a class="btn solid" href="#/deals">More deals</a>
          <a class="btn" href="#/home">Home</a>
        </div>
      </div>
    </div>`;
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
}

function bind() {
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
    const updatePayBtn = () => {
      const method = form.querySelector('input[name="method"]:checked')?.value || "card";
      const testBox = $("#stripeTestBox");
      if (testBox) testBox.hidden = method !== "card";
      if (!btn) return;
      const label =
        method === "gcash"
          ? "Continue to GCash"
          : method === "paymaya"
            ? "Continue to Maya"
            : method === "card" && state.stripeEnabled
              ? "Continue to Stripe"
              : method === "paypal"
                ? "Continue to PayPal"
                : method === "crypto"
                  ? "Continue to Crypto"
                  : "Continue to pay";
      btn.textContent = totalLabel ? `${label} · ${totalLabel}` : label;
    };
    form.querySelectorAll('input[name="method"]').forEach((el) => {
      el.addEventListener("change", updatePayBtn);
    });
    updatePayBtn();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const errEl = $("#checkoutErr");
      const payBtn = $("#payBtn");
      if (errEl) errEl.textContent = "";
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.textContent = "Processing…";
      }
      const method = fd.get("method") || "card";
      // E-wallets settle in PHP via PayMongo
      const currency =
        method === "gcash" || method === "paymaya" ? "PHP" : getCurrencyCode();
      const payload = {
        email: fd.get("email"),
        name: fd.get("name"),
        currency,
        method,
        items: getCart().map((i) => ({ id: i.id, qty: i.qty })),
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

        // Redirect providers: Stripe, PayMongo, PayPal, Crypto
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
        location.hash = "#/success";
      } catch (err) {
        if (errEl) errEl.textContent = err.message || "Checkout failed";
        toast(err.message || "Checkout failed");
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
  applyI18n();
  bindGlobalSearch();

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

  // Nav currency picker
  const navMount = $("#navFxMount");
  if (navMount) {
    mountCurrencyPicker($("#navCurrencyPicker"), {
      onChange: () => {
        render();
        if ($("#drawer").classList.contains("open")) renderCart();
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

  $("#menuBtn")?.addEventListener("click", () => {
    $("#navLinks").classList.toggle("open");
  });

  window.addEventListener("scroll", () => {
    $("#siteNav").classList.toggle("scrolled", window.scrollY > 40);
  });

  window.addEventListener("hashchange", () => {
    parseRoute();
    window.scrollTo(0, 0);
  });
  window.addEventListener("cart:change", () => {
    updateBadge();
    if ($("#drawer").classList.contains("open")) renderCart();
  });
  window.addEventListener("rates:loaded", () => render());

  parseRoute();
  await loadRates();
  render();
}

init();
