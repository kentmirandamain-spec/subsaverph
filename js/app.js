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
};

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, "") || "home";
  // support #/search?q=netflix and #/search/netflix and #/deals?q=
  const [pathPart, queryPart] = hash.split("?");
  const [view, id] = pathPart.split("/");
  state.view = view || "home";
  state.dealId = id || null;

  const params = new URLSearchParams(queryPart || "");
  if (params.has("q")) {
    state.query = params.get("q") || "";
  } else if (view === "search" && id) {
    state.query = decodeURIComponent(id);
  }

  render();
  syncGlobalSearchInput();
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

function card(d, highlightQ = "") {
  const nameHtml = highlightQ ? highlightMatch(d.name, highlightQ) : escapeHtml(d.name);
  const tagHtml = highlightQ ? highlightMatch(d.tagline || "", highlightQ) : escapeHtml(d.tagline || "");
  return `
    <article class="card">
      <div class="card-accent"></div>
      <div class="card-top">
        <div class="mono-box">${escapeHtml(d.monogram)}</div>
        <div class="pills">
          ${d.badge ? `<span class="pill">${escapeHtml(d.badge)}</span>` : ""}
          <span class="pill on">−${off(d)}%</span>
        </div>
      </div>
      <p class="cat">${escapeHtml(d.brand)} · ${escapeHtml(d.category)}</p>
      <h3><a href="#/deal/${d.id}">${nameHtml}</a></h3>
      <p class="tag">${tagHtml}</p>
      <div class="price">
        <div>
          <strong>${formatDealPrice(d, "price")}</strong><span class="per">${periodLabel(d)}</span>
          <span class="was">${formatDealPrice(d, "original")}${periodLabel(d)}</span>
        </div>
        <div class="dur">${escapeHtml(d.duration)}</div>
      </div>
      <div class="actions">
        <a class="btn sm" href="#/deal/${d.id}">Details</a>
        <button class="btn sm solid" data-add="${d.id}">Add</button>
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

function searchBarHTML(placeholder = "Search SuperGrok, Netflix, Canva, AI…") {
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
        <h1 class="page-title">Find a plan</h1>
        <p class="muted">Search by name, brand, category, features, or monogram (SG, NF, YT…)</p>
        ${searchBarHTML("Type to search all products…")}
        ${
          q
            ? `<div class="search-meta">
                <strong>${results.length}</strong> result${results.length === 1 ? "" : "s"} for
                “<span>${escapeHtml(q)}</span>”
                ${results.length ? "" : " — try SuperGrok, Netflix, or Canva"}
              </div>
              ${
                results.length
                  ? `<div class="grid search-grid">${results.map((d) => card(d, q)).join("")}</div>`
                  : `<div class="empty">No products matched “${escapeHtml(q)}”.<br/><button type="button" class="btn solid sm" data-q="SuperGrok" style="margin-top:16px">Try SuperGrok</button></div>`
              }`
            : `<div class="search-empty-hero">
                <p class="muted">Popular searches</p>
                ${quickTagsHTML()}
                <div class="grid" style="margin-top:32px">${[...window.DEALS].sort((a,b)=>off(b)-off(a)).slice(0,6).map((d)=>card(d)).join("")}</div>
              </div>`
        }
      </div>
    </div>`;
}

function siteSettings() {
  return state.settings || {};
}

function heroTitleHtml() {
  const raw = siteSettings().heroTitle || "Premium\nplans.\nLower\ncost.";
  return escapeHtml(raw).replace(/\\n/g, "<br/>").replace(/\n/g, "<br/>");
}

function viewHome() {
  const top = filtered().length && state.query
    ? filtered()
    : [...window.DEALS].sort((a, b) => off(b) - off(a)).slice(0, 6);
  const s = siteSettings();
  const brandSet = [...new Set(window.DEALS.map((d) => d.brand).filter(Boolean))];
  const monoMap = { xAI: "SG", Canva: "CV", CapCut: "CC", Netflix: "NF", YouTube: "YT" };
  const brands = brandSet.map((b) => ({
    key: b,
    mono: monoMap[b] || (b.slice(0, 2) || "XX").toUpperCase(),
    label: b === "xAI" ? "SuperGrok" : b,
  }));

  return `
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="hero-inner">
        <p class="eyebrow">${escapeHtml(s.heroEyebrow || "SubSaverPH · Subscription access")}</p>
        <h1 class="display">${heroTitleHtml()}</h1>
        <p class="lead">${escapeHtml(s.heroLead || "Prepaid discounts. Pay in any currency.")}</p>

        ${searchBarHTML("Search products — SuperGrok, Netflix, Canva…")}

        <div class="cta" style="margin-top:28px">
          <a class="btn solid" href="#/search">Open search</a>
          <a class="btn" href="#/deals">Browse deals</a>
        </div>
        <div class="meta">
          <div><strong>${window.DEALS.length}</strong><span>Active plans</span></div>
          <div><strong>5</strong><span>Platforms</span></div>
          <div><strong>${CURRENCY_LIST.length}+</strong><span>Currencies</span></div>
          <div><strong>₱99</strong><span>SuperGrok 7 days</span></div>
        </div>
      </div>
    </section>

    <div class="strip">
      <div>Secure checkout</div>
      <div>Searchable FX pay</div>
      <div>Instant digital codes</div>
      <div>Demo storefront</div>
    </div>

    ${
      state.query
        ? `<section class="section">
            <div class="section-inner">
              <div class="section-head">
                <div>
                  <p class="eyebrow">Search results</p>
                  <h2>${filtered().length} match${filtered().length === 1 ? "" : "es"} for “${escapeHtml(state.query)}”</h2>
                </div>
                <button type="button" class="link" id="clearSearchLink">Clear</button>
              </div>
              ${
                filtered().length
                  ? `<div class="grid">${filtered().map((d) => card(d, state.query)).join("")}</div>`
                  : `<div class="empty">No products found. Try “SuperGrok”, “Netflix”, or “Canva”.</div>`
              }
            </div>
          </section>`
        : ""
    }

    <section class="section">
      <div class="section-inner">
        <div class="section-head">
          <div>
            <p class="eyebrow">Platforms</p>
            <h2>Select a service</h2>
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
        ${
          state.query
            ? ""
            : `<div class="section-head">
          <div>
            <p class="eyebrow">Catalog</p>
            <h2>Highest savings</h2>
          </div>
          <a href="#/deals" class="link">View all</a>
        </div>
        <div class="grid">${top.map(card).join("")}</div>`
        }
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
        <p class="eyebrow">Catalog</p>
        <h1 class="page-title">All deals</h1>
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
  return `
    <div class="page">
      <div class="page-inner">
        <a href="#/deals" class="link">← All deals</a>
        <div class="detail">
          <div class="detail-panel">
            <div class="mono-box lg">${escapeHtml(d.monogram)}</div>
            <div class="save-big">−${off(d)}%<span>Versus retail</span></div>
            ${isPhp ? `<p class="php-tag">Base price in PHP · shows exact ₱ when currency is PHP</p>` : ""}
            <ul class="list">
              ${d.includes.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}
            </ul>
          </div>
          <div class="detail-info">
            <p class="cat">${escapeHtml(d.brand)} · ${escapeHtml(d.category)} · ${escapeHtml(d.stock)}</p>
            <h1>${escapeHtml(d.name)}</h1>
            <p class="tag">${escapeHtml(d.tagline)}</p>
            <p class="muted" style="margin:8px 0 14px">★ ${d.rating} · ${d.reviews.toLocaleString()} reviews</p>

            <div id="pageFxMount" style="margin-bottom:14px"></div>

            <div class="price-hero">
              <div>
                <strong>${formatDealPrice(d, "price")}</strong><span class="per">${periodLabel(d)}</span>
                <span class="was" style="display:block;margin-top:4px">${formatDealPrice(d, "original")} retail</span>
              </div>
              <div class="you-save">Save ${formatDealPrice({ ...d, price: d.original - d.price, priceBase: d.priceBase }, "price")}</div>
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
              <button class="btn solid" data-add="${d.id}">Add to cart</button>
              <button class="btn" data-buy-now="${d.id}">Buy now</button>
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

function viewCheckout() {
  const cart = getCart();
  const t = cartTotals();
  if (!cart.length) {
    return `<div class="page"><div class="page-inner empty"><h2>Cart empty</h2><a class="btn solid" href="#/deals">Find a plan</a></div></div>`;
  }
  return `
    <div class="page">
      <div class="page-inner">
        <p class="eyebrow">Payment</p>
        <h1 class="page-title">Checkout</h1>
        <div class="checkout">
          <form id="payForm" class="form" novalidate>
            <h3>Contact</h3>
            <label>Email for codes<input required type="email" name="email" placeholder="you@email.com" /></label>
            <h3>Payment currency</h3>
            <div id="pageFxMount" style="margin-bottom:16px"></div>
            <h3>Card · demo only</h3>
            <label>Name on card<input required name="name" placeholder="Juan Dela Cruz" /></label>
            <label>Card number<input required name="card" placeholder="4242 4242 4242 4242" maxlength="19" /></label>
            <div class="row2">
              <label>Expiry<input required name="exp" placeholder="MM/YY" maxlength="5" /></label>
              <label>CVC<input required name="cvc" placeholder="123" maxlength="4" /></label>
            </div>
            <label class="check"><input type="checkbox" required /> I understand this is a SubSaverPH demo — no real subscription is purchased.</label>
            <button class="btn solid full" type="submit">Pay ${formatMoney(t.total)} · ${getCurrencyCode()}</button>
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
  if (!order) {
    return `<div class="success"><div class="empty"><h2>No order</h2><a class="btn solid" href="#/deals">Shop</a></div></div>`;
  }
  return `
    <div class="success">
      <div class="success-card">
        <div class="ok">OK</div>
        <h1>Order confirmed</h1>
        <p class="muted">Order <strong style="color:#fff">${escapeHtml(order.id)}</strong><br/>Codes for <strong style="color:#fff">${escapeHtml(order.email)}</strong></p>
        <p style="margin-top:12px;font-weight:600">${escapeHtml(order.currency)} · ${escapeHtml(order.totalFormatted)}</p>
        <div class="codes">
          ${order.items
            .map(
              (i, idx) => `
            <div class="code-row">
              <span>${escapeHtml(i.monogram)} ${escapeHtml(i.name)}</span>
              <code>PH-${order.id.slice(-4)}-${String(idx + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}</code>
            </div>`
            )
            .join("")}
        </div>
        <p class="muted" style="font-size:0.8rem">Demo codes — will not activate real services.</p>
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

function renderSuggest(q) {
  const box = $("#searchSuggest");
  if (!box) return;
  const query = (q || "").trim();
  if (!query) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const hits = suggestDeals(window.DEALS || [], query, 6);
  if (!hits.length) {
    box.innerHTML = `<div class="suggest-empty">No matches — press Enter to search</div>`;
    box.hidden = false;
    return;
  }
  box.innerHTML = hits
    .map(
      (d) => `
    <button type="button" class="suggest-item" data-suggest-id="${escapeHtml(d.id)}" role="option">
      <span class="mono-box tiny">${escapeHtml(d.monogram)}</span>
      <span class="suggest-text">
        <strong>${highlightMatch(d.name, query)}</strong>
        <em>${escapeHtml(d.brand)} · ${escapeHtml(d.category)}</em>
      </span>
      <span class="suggest-price">${formatDealPrice(d, "price")}</span>
    </button>`
    )
    .join("") +
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
}

function bind() {
  $$("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addDeal(getDeal(btn.dataset.add));
      toast("Added to cart");
      updateBadge();
      openCart();
    });
  });

  $$("[data-buy-now]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addDeal(getDeal(btn.dataset.buyNow));
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
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const t = cartTotals();
      const order = {
        id: "PH" + Date.now().toString(36).toUpperCase(),
        email: fd.get("email"),
        name: fd.get("name"),
        items: getCart(),
        total: t.total,
        currency: getCurrencyCode(),
        totalFormatted: formatMoney(t.total),
      };
      saveOrder(order);
      sessionStorage.setItem("subsaverph_last", JSON.stringify(order));
      clearCart();
      updateBadge();
      location.hash = "#/success";
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
      }));
    }
    if (data.settings) state.settings = data.settings;
    if (Array.isArray(data.brands)) window.BRANDS = data.brands;
    if (Array.isArray(data.categories)) window.CATEGORIES = data.categories;
    state.live = true;

    // Apply host settings to chrome
    const s = data.settings || {};
    if (s.siteName) {
      document.title = `${s.siteName} — Discounted Subscriptions`;
      const logo = document.querySelector(".logo");
      if (logo) logo.innerHTML = `${escapeHtml(s.siteName.replace(/PH$/i, ""))}<b>PH</b>`;
    }
    const foot = document.querySelector(".footer-inner p");
    if (foot && s.footerText) foot.textContent = s.footerText;
  } catch {
    state.live = false;
  }
}

async function init() {
  await loadLiveCatalog();
  bindGlobalSearch();

  // Nav currency picker
  const navMount = $("#navFxMount");
  if (navMount) {
    mountCurrencyPicker($("#navCurrencyPicker"), {
      onChange: () => {
        render();
        if ($("#drawer").classList.contains("open")) renderCart();
        toast(`Pay in ${getCurrencyCode()}`);
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
