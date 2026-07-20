const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");

const state = {
  user: null,
  tab: "deals",
  deals: [],
  settings: {},
  msg: "",
  err: "",
  editing: null,
  productFilter: "",
  inventorySummary: [],
  stockProductId: "",
  stockCodes: [],
  orders: [],
  supportMessages: [],
  /** Orders/Sales P&L focus: day | week | month | all */
  salesPeriod: "day",
};

function friendlyApiError(status, raw, data) {
  const text = String(raw || "");
  const looksHtml =
    /^\s*<!DOCTYPE/i.test(text) ||
    /^\s*<html/i.test(text) ||
    text.includes("cf-error") ||
    text.includes("Cloudflare") ||
    text.includes("Attention Required");
  if (status === 405) {
    return (
      `HTTP 405 (method not allowed) — hard-refresh (Ctrl+F5) to load the latest admin, then try again. ` +
      `If it continues: Cloudflare Dashboard → Security → turn Bot Fight Mode off, Security Level Medium.`
    );
  }
  if (looksHtml) {
    return (
      `Host/Cloudflare returned an error page (HTTP ${status || "?"}) instead of API JSON. ` +
      `Usually: origin timeout, brief Render restart, or Cloudflare security. ` +
      `Wait 30s, hard-refresh (Ctrl+F5), try again. In Cloudflare: Security → turn Bot Fight Mode off for this site, or set Security Level to Medium.`
    );
  }
  return String(
    (data && (data.error || data.detail || data.message)) ||
      `Request failed (HTTP ${status || "?"})`
  ).slice(0, 500);
}

/**
 * Admin API helper.
 * - Mutations use POST (Cloudflare sometimes returns HTML 405 for PUT/DELETE).
 * - Paths are normalized (no trailing slash) — trailing slash caused live 405 on /api/admin/settings/.
 */
async function api(path, opts = {}) {
  let url = String(path || "");
  // Keep query string; strip trailing slash on the path part only
  const q = url.indexOf("?");
  if (q === -1) {
    if (url.length > 1 && url.endsWith("/")) url = url.replace(/\/+$/, "");
  } else {
    const base = url.slice(0, q).replace(/\/+$/, "") || "/";
    url = base + url.slice(q);
  }
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(opts.headers || {}),
  };
  let res;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      ...opts,
      headers,
    });
  } catch (e) {
    throw new Error(`Network error: ${e.message || e}. Check your connection and try again.`);
  }
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(friendlyApiError(res.status, raw, data));
  }
  return data;
}

function toast(msg, isErr = false) {
  state.msg = isErr ? "" : msg;
  state.err = isErr ? msg : "";
  render();
  const ms = isErr || String(msg).length > 80 ? 8000 : 2800;
  setTimeout(() => {
    state.msg = "";
    state.err = "";
    render();
  }, ms);
}

function loginView() {
  return `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <h1>SubSaverPH Host</h1>
        <p>Sign in to edit products, prices, and site copy.</p>
        <label>Username<input name="username" value="admin" required autocomplete="username" /></label>
        <label>Password<input name="password" type="password" value="" required autocomplete="current-password" /></label>
        <button class="btn" type="submit" style="width:100%;margin-top:8px">Sign in</button>
        <p class="muted" style="margin-top:14px">Sign in with your host admin account.</p>
        <p class="err" id="loginErr"></p>
      </form>
    </div>`;
}

function shell(content) {
  return `
    <div class="shell">
      <aside class="side">
        <h2>SubSaverPH</h2>
        <button type="button" data-tab="deals" class="${state.tab === "deals" ? "active" : ""}">Products</button>
        <button type="button" data-tab="stock" class="${state.tab === "stock" ? "active" : ""}">Codes / Stock</button>
        <button type="button" data-tab="orders" class="${state.tab === "orders" ? "active" : ""}">Orders / Sales</button>
        <button type="button" data-tab="support" class="${state.tab === "support" ? "active" : ""}">Support inbox</button>
        <button type="button" data-tab="emailtest" class="${state.tab === "emailtest" ? "active" : ""}">★ Test email</button>
        <button type="button" data-tab="settings" class="${state.tab === "settings" ? "active" : ""}">Site content</button>
        <button type="button" data-tab="account" class="${state.tab === "account" ? "active" : ""}">Account</button>
        <a href="/" target="_blank" rel="noopener">↗ View live site</a>
        <button type="button" id="logoutBtn">Log out</button>
        <p class="muted" style="margin-top:24px;padding:0 12px">Signed in as ${escapeHtml(state.user || "admin")}</p>
      </aside>
      <main class="main">
        ${state.msg ? `<p class="ok">${escapeHtml(state.msg)}</p>` : ""}
        ${state.err ? `<p class="err">${escapeHtml(state.err)}</p>` : ""}
        ${content}
      </main>
    </div>
    ${state.editing !== null ? dealModal(state.editing) : ""}`;
}

function dealsView() {
  const q = (state.productFilter || "").trim().toLowerCase();
  const list = !q
    ? state.deals
    : state.deals.filter((d) =>
        [d.name, d.brand, d.category, d.id, d.tagline, d.monogram]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );

  const rows = list
    .map(
      (d) => `
    <tr>
      <td><strong>${escapeHtml(d.name)}</strong><div class="muted">${escapeHtml(d.id)}</div></td>
      <td>${escapeHtml(d.brand)}</td>
      <td>${escapeHtml(String(d.price))} ${escapeHtml(d.priceBase || "USD")}</td>
      <td>${escapeHtml(String(d.original))} ${escapeHtml(d.priceBase || "USD")}</td>
      <td><span class="badge ${d.active === false ? "off" : ""}">${d.active === false ? "Hidden" : "Live"}</span></td>
      <td class="row-actions">
        <button class="btn ghost" data-edit="${escapeHtml(d.id)}">Edit</button>
        <button class="btn danger" data-del="${escapeHtml(d.id)}">Delete</button>
      </td>
    </tr>`
    )
    .join("");

  return `
    <div class="top">
      <h1>Products / deals</h1>
      <button class="btn" id="addDeal">+ Add product</button>
    </div>
    <p class="muted">Changes save immediately to the live storefront at /</p>
    <div class="panel" style="margin-bottom:12px">
      <label style="margin:0">Search products
        <input id="adminProductSearch" type="search" placeholder="Name, brand, category…" value="${escapeAttr(state.productFilter || "")}" />
      </label>
      <p class="muted" style="margin:8px 0 0">${list.length} shown</p>
    </div>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th><th>Brand</th><th>Price</th><th>Retail</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="6" class="muted">No products match.</td></tr>`}</tbody>
      </table>
    </div>`;
}

/** Default English UI labels — admin can override each via uiStrings. */
const UI_STRING_DEFAULTS = {
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
  footer_contact: "Support",
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
  search_results_title: "Results",
  search_only_match: "Only products that match",
  search_are_shown: "are shown.",
  products_found: "products found",
  product_found: "product found",
  clear_search: "Clear search",
  no_products_matched: "No products matched",
  try_brands: "Try SuperGrok, Netflix, or Canva.",
  search_product_ph: "Search a product name…",
  details: "Details",
  add: "Add",
  add_to_cart: "Add to cart",
  buy_now: "Buy now",
  sold_out: "SOLD OUT",
  in_stock: "In stock",
  only_left: "Only {n} left",
  n_in_stock: "{n} in stock",
  plan_not_found: "Plan not found",
  back: "Back",
  all_deals: "All deals",
  versus_retail: "Versus retail",
  no_codes_left: "No codes left in stock",
  reviews: "reviews",
  retail: "retail",
  save: "Save",
  pick_another: "This plan has no codes left. Check back later or pick another product.",
  protocol: "Protocol",
  how_step1_t: "Search",
  how_step1_p: "Use the home search bar to find plans by category — AI, Design, Video, or Streaming.",
  how_step2_t: "Currency",
  how_step2_p: "Open Pay → search any currency (PHP, USD, EUR…). Prices convert when you change currency.",
  how_step3_t: "Checkout",
  how_step3_p: "Complete checkout with your preferred payment method. Codes appear on confirmation.",
  how_step4_t: "Redeem",
  how_step4_p: "Apply codes on the official service. Keep the order ID.",
  demo_notice: "Demo notice",
  demo_notice_p: "SubSaverPH offers prepaid digital access across AI, Design, Video, and Streaming. Independent storefront — not affiliated with any brand listed in the catalog.",
  brand_meta: "Brand",
  service_area_meta: "Service area",
  website_meta: "Website",
  support_meta: "Support",
  business_type_meta: "Business type",
  company: "Company",
  legal: "Legal",
  last_updated: "Last updated",
  back_to_home: "Back to home",
  live_fx: "Live FX",
  cached_fx: "Cached FX",
  offline_fx: "Offline FX",
  currencies_word: "currencies",
  pay_in: "pay in",
  sort_label: "Sort",
  filter_all: "All",
};

/** Friendly labels for UI strings — grouped like the live website top → bottom. */
const UI_STRING_GROUPS = [
  {
    title: "Top bar & menu",
    where: "Header on every page",
    keys: [
      ["nav_home", "Menu · Home"],
      ["nav_deals", "Menu · Deals"],
      ["nav_search", "Menu · Search"],
      ["nav_mission", "Menu · Mission"],
      ["nav_checkout", "Menu · Checkout"],
      ["nav_pay", "Menu · Pay"],
      ["nav_cart", "Menu · Cart"],
      ["nav_menu", "Mobile menu button"],
      ["nav_prefs", "Menu · Settings"],
      ["search_placeholder", "Search box placeholder"],
      ["search_aria", "Search box accessibility label"],
      ["search_product_ph", "Search page placeholder"],
    ],
  },
  {
    title: "Homepage labels",
    where: "Home · buttons & small labels",
    keys: [
      ["cta_search", "Hero button · Open search"],
      ["cta_browse", "Hero button · Browse deals"],
      ["meta_plans", "Hero stat · plans label"],
      ["meta_platforms", "Hero stat · platforms label"],
      ["meta_currencies", "Hero stat · currencies label"],
      ["eyebrow_platforms", "Platforms section eyebrow"],
      ["eyebrow_catalog", "Catalog section eyebrow"],
      ["view_all", "View all link"],
      ["page_deals", "All deals page title"],
      ["page_search", "Search page title"],
      ["page_results", "Results page title"],
    ],
  },
  {
    title: "Search results",
    where: "When customer searches",
    keys: [
      ["search_results_title", "Results heading"],
      ["search_only_match", "Only products that match…"],
      ["search_are_shown", "…are shown"],
      ["products_found", "products found"],
      ["product_found", "product found"],
      ["clear_search", "Clear search button"],
      ["no_products_matched", "No products matched"],
      ["try_brands", "Empty search hint"],
    ],
  },
  {
    title: "Product cards & detail",
    where: "Deal cards and product page",
    keys: [
      ["details", "Details button"],
      ["add", "Add button"],
      ["add_to_cart", "Add to cart"],
      ["buy_now", "Buy now"],
      ["sold_out", "Sold out badge"],
      ["in_stock", "In stock label"],
      ["only_left", "Only {n} left"],
      ["n_in_stock", "{n} in stock"],
      ["plan_not_found", "Plan not found"],
      ["back", "Back link"],
      ["all_deals", "All deals link"],
      ["versus_retail", "Versus retail"],
      ["no_codes_left", "No codes left"],
      ["reviews", "reviews word"],
      ["retail", "retail word"],
      ["save", "Save badge"],
      ["pick_another", "Sold-out help message"],
    ],
  },
  {
    title: "Cart drawer",
    where: "Side cart panel",
    keys: [
      ["cart_title", "Cart title"],
      ["cart_close", "Close cart"],
      ["cart_subtotal", "Subtotal"],
      ["cart_save", "You save"],
      ["cart_total", "Total"],
      ["cart_checkout", "Checkout button"],
      ["cart_empty", "Empty cart message"],
      ["cart_find", "Find a plan button"],
    ],
  },
  {
    title: "Footer link labels",
    where: "Bottom of every page · column titles & links",
    keys: [
      ["footer_shop", "Column · Shop"],
      ["footer_company", "Column · Company"],
      ["footer_legal", "Column · Legal"],
      ["footer_about_company", "About the company heading"],
      ["footer_about", "Link · About"],
      ["footer_terms", "Link · Terms"],
      ["footer_privacy", "Link · Privacy"],
      ["footer_all_deals", "Link · All deals"],
      ["footer_contact", "Link · Support"],
      ["brand_meta", "Meta · Brand"],
      ["service_area_meta", "Meta · Service area"],
      ["website_meta", "Meta · Website"],
      ["support_meta", "Meta · Support"],
      ["business_type_meta", "Meta · Business type"],
      ["company", "Company word"],
      ["legal", "Legal word"],
    ],
  },
  {
    title: "Preferences & currency",
    where: "Settings panel & Pay menu",
    keys: [
      ["prefs_title", "Preferences title"],
      ["prefs_language", "Language label"],
      ["prefs_theme", "Appearance label"],
      ["prefs_theme_hint", "Theme hint"],
      ["prefs_lang_hint", "Language hint"],
      ["theme_dark", "Dark"],
      ["theme_light", "Light"],
      ["theme_system", "System"],
      ["currency_search", "Currency search placeholder"],
      ["pay_in", "pay in"],
      ["live_fx", "Live FX"],
      ["cached_fx", "Cached FX"],
      ["offline_fx", "Offline FX"],
      ["currencies_word", "currencies"],
      ["toast_theme", "Theme toast"],
      ["toast_lang", "Language toast"],
      ["toast_pay", "Pay toast"],
    ],
  },
  {
    title: "Legal page labels",
    where: "About / Terms / Privacy chrome",
    keys: [
      ["last_updated", "Last updated label"],
      ["back_to_home", "Back to home link"],
    ],
  },
];

function uiStringValue(ui, key) {
  if (ui[key] != null && String(ui[key]).length) return ui[key];
  return UI_STRING_DEFAULTS[key] || "";
}

function renderUiStringGroups(ui) {
  const used = new Set();
  const blocks = UI_STRING_GROUPS.map((g) => {
    const fields = g.keys
      .map(([key, label]) => {
        used.add(key);
        return `<label class="ui-string-field">
          <span class="ui-string-label">${escapeHtml(label)}</span>
          <input name="ui__${escapeAttr(key)}" value="${escapeAttr(uiStringValue(ui, key))}" />
        </label>`;
      })
      .join("");
    return `<div class="ui-string-group">
      <h4 class="ui-string-group-title">${escapeHtml(g.title)}</h4>
      <p class="field-where">${escapeHtml(g.where)}</p>
      <div class="ui-strings-grid">${fields}</div>
    </div>`;
  }).join("");

  const extraKeys = [...new Set([...Object.keys(UI_STRING_DEFAULTS), ...Object.keys(ui)])]
    .filter((k) => !used.has(k))
    .sort();
  let extra = "";
  if (extraKeys.length) {
    extra = `<div class="ui-string-group">
      <h4 class="ui-string-group-title">Other labels</h4>
      <p class="field-where">Extra or custom keys</p>
      <div class="ui-strings-grid">${extraKeys
        .map(
          (key) => `<label class="ui-string-field">
          <span class="ui-string-label">${escapeHtml(key)}</span>
          <input name="ui__${escapeAttr(key)}" value="${escapeAttr(uiStringValue(ui, key))}" />
        </label>`
        )
        .join("")}</div>
    </div>`;
  }
  return blocks + extra;
}

function fieldHint(where) {
  return `<p class="field-where">${escapeHtml(where)}</p>`;
}

function settingsView() {
  const s = state.settings || {};
  const ui = s.uiStrings && typeof s.uiStrings === "object" ? s.uiStrings : {};

  return `
    <div class="top"><h1>Site content</h1></div>
    <p class="muted">Sections follow the website <strong>top → bottom</strong>, same order you see when browsing. Product names &amp; prices are under <strong>Products</strong>.</p>

    <nav class="page-map" aria-label="Jump to section">
      <span class="page-map-label">Jump to</span>
      <a href="#sc-home">1 · Homepage</a>
      <a href="#sc-about">2 · About</a>
      <a href="#sc-support">3 · Support</a>
      <a href="#sc-checkout">4 · Checkout rules</a>
      <a href="#sc-success">5 · After payment</a>
      <a href="#sc-footer">6 · Footer</a>
      <a href="#sc-terms">7 · Terms</a>
      <a href="#sc-privacy">8 · Privacy</a>
      <a href="#sc-chat">9 · Help chat</a>
      <a href="#sc-seo">10 · Google / SEO</a>
      <a href="#sc-brand">11 · Brand &amp; contact</a>
      <a href="#sc-ui">12 · Buttons &amp; labels</a>
    </nav>

    <form class="panel" id="settingsForm">

      <!-- ========== 1. HOMEPAGE (top → bottom) ========== -->
      <section class="settings-block" id="sc-home">
        <h3 class="settings-h">1 · Homepage <span class="settings-page">as on subsaverph.com/#/home</span></h3>
        <p class="muted settings-lead">Edit in the same order visitors scroll the home page.</p>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Top announcement bar</h4>
          ${fieldHint("Thin bar above the menu (optional — leave empty to hide)")}
          <label>Announcement text
            <input name="announcement" value="${escapeAttr(s.announcement || "")}" placeholder="Leave empty to hide" />
          </label>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Hero (big top section)</h4>
          ${fieldHint("First thing customers see under the menu")}
          <label>Small line above title (eyebrow)
            <input name="heroEyebrow" value="${escapeAttr(s.heroEyebrow || "")}" />
          </label>
          <label>Big title (press Enter for new lines)
            <textarea name="heroTitle" rows="4">${escapeHtml(s.heroTitle || "")}</textarea>
          </label>
          <label>Paragraph under the title
            <textarea name="heroLead" rows="3">${escapeHtml(s.heroLead || "")}</textarea>
          </label>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Feature strip (4 boxes under hero)</h4>
          ${fieldHint("Horizontal row: Secure checkout · FX pay · …")}
          <div class="grid2">
            <label>Box 1<input name="strip1" value="${escapeAttr(s.strip1 || "")}" /></label>
            <label>Box 2<input name="strip2" value="${escapeAttr(s.strip2 || "")}" /></label>
            <label>Box 3<input name="strip3" value="${escapeAttr(s.strip3 || "")}" /></label>
            <label>Box 4<input name="strip4" value="${escapeAttr(s.strip4 || "")}" /></label>
          </div>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Platforms section</h4>
          ${fieldHint("“Select a service” heading above brand chips")}
          <label>Section title
            <input name="platformsTitle" value="${escapeAttr(s.platformsTitle || "")}" />
          </label>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Catalog / deals section</h4>
          ${fieldHint("“Highest savings” heading above product cards")}
          <label>Section title
            <input name="catalogTitle" value="${escapeAttr(s.catalogTitle || "")}" />
          </label>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Mission block</h4>
          ${fieldHint("Near bottom of homepage before footer")}
          <label>Mission title
            <input name="missionTitle" value="${escapeAttr(s.missionTitle || "")}" />
          </label>
          <label>Mission text
            <textarea name="missionText" rows="3">${escapeHtml(s.missionText || "")}</textarea>
          </label>
        </div>
      </section>

      <!-- ========== 2. ABOUT ========== -->
      <section class="settings-block" id="sc-about">
        <h3 class="settings-h">2 · About page <span class="settings-page">#/about</span></h3>
        ${fieldHint("Full company story page")}
        <div class="grid2">
          <label>Page title<input name="aboutTitle" value="${escapeAttr(s.aboutTitle || "")}" /></label>
          <label>Last updated line<input name="aboutUpdated" value="${escapeAttr(s.aboutUpdated || "")}" /></label>
        </div>
        <label>About body (full page text)
          <textarea name="aboutBody" rows="12">${escapeHtml(s.aboutBody || "")}</textarea>
        </label>
      </section>

      <!-- ========== 4. SUPPORT ========== -->
      <section class="settings-block" id="sc-support">
        <h3 class="settings-h">3 · Support page <span class="settings-page">#/support</span></h3>
        <p class="muted settings-lead">Top banner → form → topics list.</p>
        <label>Badge (small pill)
          <input name="supportPageBadge" value="${escapeAttr(s.supportPageBadge || "Help center")}" />
        </label>
        <label>Big page title
          <input name="supportPageTitle" value="${escapeAttr(s.supportPageTitle || "We're here to help")}" />
        </label>
        <label>Subtitle under title
          <textarea name="supportPageLead" rows="2">${escapeHtml(s.supportPageLead || "Order issues, login problems, missing codes — reach us by email or send a message below.")}</textarea>
        </label>
        <label>Form heading
          <input name="supportFormTitle" value="${escapeAttr(s.supportFormTitle || "Send a message")}" />
        </label>
        <label>Form subtext
          <textarea name="supportFormSub" rows="2">${escapeHtml(s.supportFormSub || "No email app needed — we get this in our inbox and reply by email.")}</textarea>
        </label>
        <label>Subject dropdown options (one topic per line)
          <textarea name="supportSubjectOptions" rows="8">${escapeHtml(
            s.supportSubjectOptions ||
              "Login not working\nMissing code or credentials\nWrong product delivered\nPayment charged but no order\nAccount expired early\nRefund request\nOrder status question\nPayment / checkout problem\nOther"
          )}</textarea>
        </label>
      </section>

      <!-- ========== 5. CHECKOUT RULES ========== -->
      <section class="settings-block" id="sc-checkout">
        <h3 class="settings-h">4 · Checkout rules popup <span class="settings-page">before customer pays</span></h3>
        ${fieldHint("Popup: eyebrow → title → what you buy → rules → checkbox → button")}
        <label>Small line above title
          <input name="checkoutTermsEyebrow" value="${escapeAttr(s.checkoutTermsEyebrow || "Before you pay")}" />
        </label>
        <label>Popup title
          <input name="checkoutTermsTitle" value="${escapeAttr(s.checkoutTermsTitle || "Purchase details & rules")}" />
        </label>
        <label>What you are buying
          <textarea name="checkoutWhatYouBuy" rows="5">${escapeHtml(s.checkoutWhatYouBuy || "")}</textarea>
        </label>
        <label>Rules &amp; regulations
          <textarea name="checkoutRules" rows="10">${escapeHtml(s.checkoutRules || "")}</textarea>
        </label>
        <label>Support note at bottom of popup
          <textarea name="checkoutSupportText" rows="3">${escapeHtml(s.checkoutSupportText || "")}</textarea>
        </label>
        <label>Accept checkbox text
          <input name="checkoutAcceptLabel" value="${escapeAttr(s.checkoutAcceptLabel || "")}" />
        </label>
        <label>Confirm button text
          <input name="checkoutConfirmLabel" value="${escapeAttr(s.checkoutConfirmLabel || "Accept & pay")}" />
        </label>
      </section>

      <!-- ========== 6. SUCCESS ========== -->
      <section class="settings-block" id="sc-success">
        <h3 class="settings-h">5 · After payment (success page) <span class="settings-page">#/success</span></h3>
        ${fieldHint("Shown after successful checkout with login package")}
        <label>Success heading
          <input name="successTitle" value="${escapeAttr(s.successTitle || "Order delivered")}" />
        </label>
        <label>Package box title
          <input name="successPackageTitle" value="${escapeAttr(s.successPackageTitle || "Your access package")}" />
        </label>
        <label>Package box subtitle
          <input name="successPackageSub" value="${escapeAttr(s.successPackageSub || "Login credentials, features, instructions, and rules for each product.")}" />
        </label>
        <label>Note under the package
          <textarea name="successFooterNote" rows="2">${escapeHtml(s.successFooterNote || "Save these credentials now. Follow the instructions and rules for each product.")}</textarea>
        </label>
      </section>

      <!-- ========== 7. FOOTER (every page) ========== -->
      <section class="settings-block" id="sc-footer">
        <h3 class="settings-h">6 · Footer <span class="settings-page">bottom of every page</span></h3>
        <p class="muted settings-lead">Order matches the live footer: blurb → company about → details → disclaimer → copyright.</p>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Left column blurb</h4>
          ${fieldHint("Under the logo")}
          <label>Footer blurb
            <textarea name="footerText" rows="3">${escapeHtml(s.footerText || "")}</textarea>
          </label>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">About the company block</h4>
          ${fieldHint("Wide band above the disclaimer")}
          <label>Company about blurb
            <textarea name="footerCompanyBlurb" rows="4">${escapeHtml(s.footerCompanyBlurb || "")}</textarea>
          </label>
          <div class="grid2">
            <label>Brand<input name="footerBrand" value="${escapeAttr(s.footerBrand || "")}" /></label>
            <label>Service area<input name="footerServiceArea" value="${escapeAttr(s.footerServiceArea || "")}" /></label>
            <label>Website<input name="footerWebsite" value="${escapeAttr(s.footerWebsite || "")}" /></label>
            <label>Support email shown<input name="footerSupport" value="${escapeAttr(s.footerSupport || "")}" /></label>
            <label>Business type<input name="footerBusinessType" value="${escapeAttr(s.footerBusinessType || "")}" /></label>
            <label>Copyright line<input name="footerCopyright" value="${escapeAttr(s.footerCopyright || "")}" /></label>
          </div>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Disclaimer</h4>
          ${fieldHint("Small legal text under company about")}
          <label>Footer disclaimer
            <textarea name="footerDisclaimer" rows="3">${escapeHtml(s.footerDisclaimer || "")}</textarea>
          </label>
        </div>
      </section>

      <!-- ========== 8. TERMS ========== -->
      <section class="settings-block" id="sc-terms">
        <h3 class="settings-h">7 · Terms of Use <span class="settings-page">#/terms</span></h3>
        <div class="grid2">
          <label>Page title<input name="termsTitle" value="${escapeAttr(s.termsTitle || "")}" /></label>
          <label>Last updated<input name="termsUpdated" value="${escapeAttr(s.termsUpdated || "")}" /></label>
        </div>
        <label>Terms body
          <textarea name="termsBody" rows="12">${escapeHtml(s.termsBody || "")}</textarea>
        </label>
      </section>

      <!-- ========== 9. PRIVACY ========== -->
      <section class="settings-block" id="sc-privacy">
        <h3 class="settings-h">8 · Privacy Policy <span class="settings-page">#/privacy</span></h3>
        <div class="grid2">
          <label>Page title<input name="privacyTitle" value="${escapeAttr(s.privacyTitle || "")}" /></label>
          <label>Last updated<input name="privacyUpdated" value="${escapeAttr(s.privacyUpdated || "")}" /></label>
        </div>
        <label>Privacy body
          <textarea name="privacyBody" rows="12">${escapeHtml(s.privacyBody || "")}</textarea>
        </label>
      </section>

      <!-- ========== 10. HELP CHAT ========== -->
      <section class="settings-block" id="sc-chat">
        <h3 class="settings-h">9 · Help chat bubble <span class="settings-page">bottom-right on the store</span></h3>
        <label>Extra FAQ for the assistant
          <textarea name="chatbotFaq" rows="4" placeholder="Optional facts the bot should know…">${escapeHtml(s.chatbotFaq || "")}</textarea>
        </label>
        <label>Welcome line (optional override)
          <input name="chatWelcome" value="${escapeAttr(s.chatWelcome || "")}" placeholder="Leave empty for default welcome" />
        </label>
      </section>

      <!-- ========== 10. SEO (Google + crawler page text) ========== -->
      <section class="settings-block" id="sc-seo">
        <h3 class="settings-h">10 · Google / search &amp; social <span class="settings-page">search results + crawler text on the homepage</span></h3>
        <p class="muted settings-lead">Edit what Google and link previews show. Changes apply live after <strong>Save all</strong> (hard-refresh the storefront). Prefer company wording (categories), not product brand lists.</p>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Search result &amp; browser tab</h4>
          ${fieldHint("Blue title + grey snippet in Google; also the browser tab title")}
          <label>Google / page title
            <input name="seoTitle" value="${escapeAttr(s.seoTitle || "")}" maxlength="70" />
          </label>
          <label>Google description (meta)
            <textarea name="seoDescription" rows="3" maxlength="320">${escapeHtml(s.seoDescription || "")}</textarea>
          </label>
          <label>Keywords (comma-separated)
            <input name="seoKeywords" value="${escapeAttr(s.seoKeywords || "")}" />
          </label>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Share preview (Facebook, Messenger, X / Twitter)</h4>
          ${fieldHint("Leave blank to reuse Google title &amp; description")}
          <div class="grid2">
            <label>Share title
              <input name="seoOgTitle" value="${escapeAttr(s.seoOgTitle || "")}" />
            </label>
            <label>Share description
              <input name="seoOgDescription" value="${escapeAttr(s.seoOgDescription || "")}" />
            </label>
          </div>
        </div>

        <div class="settings-sub">
          <h4 class="settings-sub-h">Crawler homepage text (SEO body)</h4>
          ${fieldHint("HTML Googlebot reads before JavaScript loads. Shoppers with JS see the normal store UI instead.")}
          <label>Main heading (H1)
            <input name="seoH1" value="${escapeAttr(s.seoH1 || "")}" />
          </label>
          <label>Intro paragraph
            <textarea name="seoIntro" rows="4">${escapeHtml(s.seoIntro || "")}</textarea>
          </label>
          <label>“Why shop” section title
            <input name="seoWhyTitle" value="${escapeAttr(s.seoWhyTitle || "")}" />
          </label>
          <label>Why-shop bullets <span class="muted">(one line = one bullet)</span>
            <textarea name="seoWhyItems" rows="5">${escapeHtml(s.seoWhyItems || "")}</textarea>
          </label>
          <label>“Popular deals” section title
            <input name="seoPopularTitle" value="${escapeAttr(s.seoPopularTitle || "")}" />
          </label>
          <label>Popular deals list <span class="muted">(one line each; use **name** for bold)</span>
            <textarea name="seoPopularItems" rows="7">${escapeHtml(s.seoPopularItems || "")}</textarea>
          </label>
          <label>FAQ section title
            <input name="seoFaqTitle" value="${escapeAttr(s.seoFaqTitle || "")}" />
          </label>
          <label>FAQ blocks <span class="muted">(first line = question, next lines = answer; blank line between Q&amp;As)</span>
            <textarea name="seoFaq" rows="12">${escapeHtml(s.seoFaq || "")}</textarea>
          </label>
          <label>Browse section title
            <input name="seoBrowseTitle" value="${escapeAttr(s.seoBrowseTitle || "")}" />
          </label>
          <label>Browse line
            <input name="seoBrowseText" value="${escapeAttr(s.seoBrowseText || "")}" />
          </label>
          <label>Contact section title
            <input name="seoContactTitle" value="${escapeAttr(s.seoContactTitle || "")}" />
          </label>
          <label>Contact paragraph
            <textarea name="seoContactText" rows="2">${escapeHtml(s.seoContactText || "")}</textarea>
          </label>
          <label>Affiliation disclaimer
            <textarea name="seoDisclaimer" rows="2">${escapeHtml(s.seoDisclaimer || "")}</textarea>
          </label>
          <label>No-JavaScript message
            <textarea name="seoNoscript" rows="2">${escapeHtml(s.seoNoscript || "")}</textarea>
          </label>
        </div>
      </section>

      <!-- ========== 12. BRAND ========== -->
      <section class="settings-block" id="sc-brand">
        <h3 class="settings-h">11 · Brand &amp; contact <span class="settings-page">site-wide settings</span></h3>
        <div class="grid2">
          <label>Site name<input name="siteName" value="${escapeAttr(s.siteName || "")}" /></label>
          <label>Tagline<input name="tagline" value="${escapeAttr(s.tagline || "")}" /></label>
          <label>Default currency<input name="defaultCurrency" value="${escapeAttr(s.defaultCurrency || "PHP")}" /></label>
          <label>Public support email
            <input name="supportEmail" value="${escapeAttr(s.supportEmail || "support@subsaverph.com")}" />
          </label>
        </div>
        <label>Owner inbox (where support form emails go)
          <input name="ownerInbox" type="email" value="${escapeAttr(s.ownerInbox || "")}" placeholder="you@outlook.com" />
        </label>
        <label>Website URL
          <input name="websiteUrl" value="${escapeAttr(s.websiteUrl || "")}" />
        </label>
      </section>

      <!-- ========== 13. UI LABELS ========== -->
      <section class="settings-block" id="sc-ui">
        <h3 class="settings-h">12 · Buttons, menu &amp; small labels <span class="settings-page">grouped like the website</span></h3>
        <p class="muted settings-lead">Small words on buttons and menus. Grouped by where you see them. Product names stay under Products.</p>
        ${renderUiStringGroups(ui)}
      </section>

      <div class="settings-save-bar">
        <button class="btn" type="submit">Save all site content</button>
        <span class="muted">Saves every section above to the live store.</span>
      </div>
    </form>`;
}

function testInvoicePanel(opts = {}) {
  const support = (state.settings && state.settings.supportEmail) || "";
  const dealOpts = (state.deals || [])
    .map(
      (d) =>
        `<option value="${escapeAttr(d.id)}">${escapeHtml(d.name || d.id)}</option>`
    )
    .join("");
  const title = opts.title || "Send test invoice email";
  return `
    <form class="panel" id="testInvoiceForm" style="max-width:560px;${opts.margin || ""}">
      <h3 class="settings-h" style="margin-top:0">${title}</h3>
      <p class="muted">Sends a sample payment email with <strong>demo username + password</strong> and product details. Safe: no payment, no stock used, no real order saved.</p>
      <label>Send test to (your inbox)
        <input name="email" type="email" required placeholder="you@email.com" value="${escapeAttr(support)}" autocomplete="email" />
      </label>
      <label>Customer name (optional)
        <input name="name" type="text" placeholder="Test Customer" value="Test Customer" />
      </label>
      <label>Product details to include
        <select name="productId">
          <option value="">First product / sample</option>
          ${dealOpts}
        </select>
      </label>
      <div class="row-actions" style="margin-top:8px;flex-wrap:wrap;gap:8px">
        <button class="btn" type="submit" data-mode="send">Send test invoice</button>
        <button class="btn ghost" type="submit" data-mode="preview">Preview only (no send)</button>
      </div>
      <p class="muted" style="margin-top:12px;font-size:0.85rem">
        Use the <strong>same email as your Resend account</strong> if you have not verified <code>subsaverph.com</code> yet.
        If you see a long HTML error, wait and retry — that is Cloudflare/host, not the invoice itself.
      </p>
    </form>`;
}

function emailTestView() {
  return `
    <div class="top"><h1>Test order email</h1></div>
    <p class="muted" style="margin-top:0">Use this to confirm buyers receive username, password, and product details after payment.</p>
    ${testInvoicePanel()}`;
}

function accountView() {
  return `
    <div class="top"><h1>Account</h1></div>
    <form class="panel" id="passwordForm" style="max-width:480px">
      <p class="muted">Change the host login password.</p>
      <label>Current password<input type="password" name="current" required /></label>
      <label>New password<input type="password" name="newPassword" required minlength="6" /></label>
      <button class="btn" type="submit">Update password</button>
    </form>`;
}

function stockView() {
  const rows = (state.inventorySummary || [])
    .map(
      (s) => `
    <tr>
      <td><strong>${escapeHtml(s.name)}</strong><div class="muted">${escapeHtml(s.productId)}</div></td>
      <td>${s.available}</td>
      <td>${s.sold}</td>
      <td>${s.total}</td>
      <td class="row-actions">
        <button class="btn ghost" data-stock="${escapeHtml(s.productId)}">Add codes</button>
        <button class="btn ghost" data-clear-stock="${escapeHtml(s.productId)}" title="Clear available, sold, and total for this product">Clear</button>
      </td>
    </tr>`
    )
    .join("");

  let form = "";
  if (state.stockProductId) {
    const prod = state.deals.find((d) => d.id === state.stockProductId);
    form = `
      <div class="panel">
        <h2 style="margin-top:0;font-size:1rem">Add codes → ${escapeHtml(prod?.name || state.stockProductId)}</h2>
        <p class="muted">One login per line. Customers see <strong>Username</strong> + <strong>Password</strong> with copy buttons after payment.</p>
        <p class="muted" style="font-size:0.85rem">Formats: <code>user@mail.com | Pass123</code> · <code>Username: u Password: p</code> · <code>u:p</code> · or a single access code</p>
        <form id="stockForm">
          <label>Logins / codes (one per line)
            <textarea name="codes" placeholder="user@email.com | MyPassword123&#10;Username: buyer@mail.com Password: GrokPass#1&#10;CODE-ONLY-IF-NEEDED" required></textarea>
          </label>
          <div class="row-actions">
            <button class="btn" type="submit">Save stock</button>
            <button class="btn ghost" type="button" id="cancelStock">Cancel</button>
          </div>
        </form>
        <p class="muted" style="margin-top:12px">Available codes on file: ${(state.stockCodes || []).filter((c) => c.status !== "sold").length}</p>
      </div>`;
  }

  return `
    <div class="top"><h1>Codes / Stock (instant delivery)</h1></div>
    <p class="muted">Load digital codes for each product. Checkout auto-sends an unused code after payment.</p>
    <div class="row-actions" style="margin-bottom:12px">
      <button type="button" class="btn ghost" id="clearSoldOnly">Clear sold only</button>
      <button type="button" class="btn ghost" id="clearAllStock">Clear all stock (available + sold + total)</button>
    </div>
    ${form}
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Product</th><th>Available</th><th>Sold</th><th>Total</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">No products yet. Add products first.</td></tr>`}</tbody>
      </table>
    </div>`;
}

/** Always format as Philippine Peso (Orders / Sales is PHP-only). */
function money(n) {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `₱${v.toFixed(2)}`;
  }
}

function isPhpOrder(o) {
  const cur = String(o?.currency || "PHP").toUpperCase();
  return cur === "PHP" || !o?.currency;
}

function orderLineTotal(o) {
  const items = Array.isArray(o?.items) ? o.items : [];
  return items.reduce((sum, i) => {
    const qty = Math.max(
      1,
      Number(i.qty) ||
        (Array.isArray(i.codes) && i.codes.length) ||
        (Array.isArray(i.credentials) && i.credentials.length) ||
        1
    );
    return sum + (Number(i.price) || 0) * qty;
  }, 0);
}

function orderStatusKey(o) {
  return String(o?.status || "").toLowerCase();
}

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Week starts Monday (local time). */
function startOfLocalWeek(d = new Date()) {
  const x = startOfLocalDay(d);
  const day = x.getDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfLocalMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfLocalDay(d = new Date()) {
  const x = startOfLocalDay(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function orderEventDate(o) {
  const st = orderStatusKey(o);
  const isRefund = ["refunded", "refund", "reversed", "chargeback"].includes(st);
  const raw = (isRefund && o.refundedAt) || o.createdAt || o.paidAt || "";
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function periodRange(period, now = new Date()) {
  if (period === "day") {
    return { from: startOfLocalDay(now), to: endOfLocalDay(now), label: "Today" };
  }
  if (period === "week") {
    return { from: startOfLocalWeek(now), to: endOfLocalDay(now), label: "This week" };
  }
  if (period === "month") {
    return { from: startOfLocalMonth(now), to: endOfLocalDay(now), label: "This month" };
  }
  return { from: null, to: null, label: "All time" };
}

function filterOrdersByPeriod(orders, period) {
  const { from, to } = periodRange(period);
  if (!from) return orders || [];
  return (orders || []).filter((o) => {
    const d = orderEventDate(o);
    if (!d) return false;
    return d >= from && d <= to;
  });
}

function formatPeriodRange(period) {
  const { from, to, label } = periodRange(period);
  if (!from) return label;
  const fmt = (d) =>
    d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  if (period === "day") return `${label} · ${fmt(from)}`;
  return `${label} · ${fmt(from)} – ${fmt(to)}`;
}

/**
 * PHP P&L: paid sales count; refunded sales are deducted from net revenue/profit.
 * Gross = paid + refunded history; Net = paid only; Refunds line = refunded totals.
 * @param {object[]} orders
 * @param {object[]} deals
 * @param {"day"|"week"|"month"|"all"} [period]
 */
function buildSalesReport(orders, deals, period = "all") {
  const dealById = Object.fromEntries((deals || []).map((d) => [d.id, d]));
  const paidStatuses = new Set(["paid", "completed", "succeeded", "complete", "success"]);
  const refundStatuses = new Set(["refunded", "refund", "reversed", "chargeback"]);

  const scoped = filterOrdersByPeriod((orders || []).filter(isPhpOrder), period);
  const paid = scoped.filter((o) => paidStatuses.has(orderStatusKey(o)));
  const refunded = scoped.filter((o) => refundStatuses.has(orderStatusKey(o)));

  /** @type {Record<string, { id: string, name: string, brand: string, units: number, revenue: number, cost: number, profit: number, orders: number, refundedUnits: number, refundedAmount: number }>} */
  const byProduct = {};
  const totals = {
    revenue: 0,
    cost: 0,
    profit: 0,
    units: 0,
    orders: paid.length,
    refunds: 0,
    refundOrders: refunded.length,
    refundUnits: 0,
    grossRevenue: 0,
  };

  function ensureProduct(id, name, brand) {
    if (!byProduct[id]) {
      byProduct[id] = {
        id,
        name,
        brand,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        orders: 0,
        refundedUnits: 0,
        refundedAmount: 0,
      };
    }
    return byProduct[id];
  }

  function walkItems(o, mode) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const item of items) {
      const id = String(item.id || item.productId || item.name || "unknown");
      const name = String(item.name || id);
      const brand = String(item.brand || dealById[id]?.brand || "");
      const qty = Math.max(
        1,
        Number(item.qty) ||
          (Array.isArray(item.codes) && item.codes.length) ||
          (Array.isArray(item.credentials) && item.credentials.length) ||
          1
      );
      const unitPrice = Number(item.price);
      const price = Number.isFinite(unitPrice) ? unitPrice : Number(dealById[id]?.price) || 0;
      const unitCost = Number(dealById[id]?.cost);
      const costEach = Number.isFinite(unitCost) ? unitCost : 0;
      const rev = price * qty;
      const costTotal = costEach * qty;
      const row = ensureProduct(id, name, brand);

      if (mode === "paid") {
        row.units += qty;
        row.revenue += rev;
        row.cost += costTotal;
        row.profit += rev - costTotal;
        row.orders += 1;
        totals.revenue += rev;
        totals.cost += costTotal;
        totals.profit += rev - costTotal;
        totals.units += qty;
        totals.grossRevenue += rev;
      } else if (mode === "refunded") {
        row.refundedUnits += qty;
        row.refundedAmount += rev;
        totals.refunds += rev;
        totals.refundUnits += qty;
        totals.grossRevenue += rev;
      }
    }
  }

  for (const o of paid) walkItems(o, "paid");
  for (const o of refunded) walkItems(o, "refunded");

  const products = Object.values(byProduct)
    .filter((p) => p.units > 0 || p.refundedUnits > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue);

  const range = periodRange(period);
  return {
    period,
    periodLabel: formatPeriodRange(period),
    paid,
    refunded,
    totalOrders: totals.orders,
    products,
    totals,
    from: range.from,
    to: range.to,
  };
}

function pnlCardHtml(title, report, active) {
  const t = report.totals || {};
  const profitClass = (t.profit || 0) < 0 ? "sales-loss" : "";
  return `
    <button type="button" class="sales-card sales-pnl-card ${active ? "active" : ""}" data-sales-period="${escapeAttr(report.period)}" title="Show ${escapeAttr(title)} detail">
      <div class="sales-card-label">${escapeHtml(title)}</div>
      <div class="muted sales-pnl-range">${escapeHtml(report.periodLabel || "")}</div>
      <div class="sales-card-row"><span>Orders</span><strong>${report.totalOrders || 0}</strong></div>
      <div class="sales-card-row"><span>Units</span><strong>${t.units || 0}</strong></div>
      <div class="sales-card-row"><span>Gross</span><strong>${escapeHtml(money(t.grossRevenue))}</strong></div>
      <div class="sales-card-row sales-refund"><span>Refunds</span><strong>− ${escapeHtml(money(t.refunds))}</strong></div>
      <div class="sales-card-row"><span>Net revenue</span><strong>${escapeHtml(money(t.revenue))}</strong></div>
      <div class="sales-card-row"><span>Cost</span><strong>${escapeHtml(money(t.cost))}</strong></div>
      <div class="sales-card-row sales-profit ${profitClass}"><span>Net profit</span><strong>${escapeHtml(money(t.profit))}</strong></div>
    </button>`;
}

function salesChecklistHtml(report, periodReports) {
  const { products, totals, totalOrders, periodLabel } = report;
  const t = totals || {
    revenue: 0,
    cost: 0,
    profit: 0,
    units: 0,
    refunds: 0,
    refundOrders: 0,
    refundUnits: 0,
    grossRevenue: 0,
  };
  const period = state.salesPeriod || "day";
  const tabs = [
    { id: "day", label: "Daily" },
    { id: "week", label: "Weekly" },
    { id: "month", label: "Monthly" },
    { id: "all", label: "All time" },
  ]
    .map(
      (tab) =>
        `<button type="button" class="sales-period-tab ${period === tab.id ? "active" : ""}" data-sales-period="${tab.id}">${tab.label}</button>`
    )
    .join("");

  const checklist = products.length
    ? products
        .map((p) => {
          const refundNote =
            p.refundedUnits > 0
              ? ` · <span class="sales-refund-tag">${p.refundedUnits} refunded (−${escapeHtml(money(p.refundedAmount))})</span>`
              : "";
          return `
        <label class="sales-check-item">
          <input type="checkbox" checked disabled />
          <span class="sales-check-body">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="muted">${escapeHtml(p.brand || p.id)} · ${p.units} sold (net) · ${p.orders} paid order(s)${refundNote}</span>
            <span class="sales-check-money">
              Rev ${escapeHtml(money(p.revenue))}
              · Cost ${escapeHtml(money(p.cost))}
              · <em class="${p.profit < 0 ? "sales-loss" : ""}">Profit ${escapeHtml(money(p.profit))}</em>
            </span>
          </span>
        </label>`;
        })
        .join("")
    : `<p class="muted" style="margin:0">No PHP sales in this period. Paid PHP orders will appear here automatically.</p>`;

  const dayR = periodReports.day;
  const weekR = periodReports.week;
  const monthR = periodReports.month;

  return `
    <div class="panel sales-panel">
      <h2 class="sales-h">P&amp;L (PHP)</h2>
      <p class="muted" style="margin-top:0">
        Daily / weekly / monthly profit &amp; loss. Amounts in <strong>₱</strong>.
        Net profit = paid sales − cost; refunds are deducted from gross.
        Click a period card or tab to filter the product checklist.
      </p>
      <div class="sales-summary sales-pnl-grid">
        ${pnlCardHtml("Daily", dayR, period === "day")}
        ${pnlCardHtml("Weekly", weekR, period === "week")}
        ${pnlCardHtml("Monthly", monthR, period === "month")}
      </div>
      <div class="sales-period-tabs" role="tablist" aria-label="P&L period">
        ${tabs}
      </div>
      <div class="sales-period-detail">
        <h3 class="settings-h" style="margin:0 0 6px">Detail · ${escapeHtml(periodLabel || "")}</h3>
        <p class="muted" style="margin:0 0 12px">
          ${totalOrders} paid order(s) · ${t.units || 0} unit(s) ·
          Net revenue ${escapeHtml(money(t.revenue))} ·
          Net profit <strong class="${(t.profit || 0) < 0 ? "sales-loss" : ""}">${escapeHtml(money(t.profit))}</strong>
          ${t.refundOrders ? ` · ${t.refundOrders} refund(s) (−${escapeHtml(money(t.refunds))})` : ""}
        </p>
        <h3 class="settings-h" style="margin-top:8px">Products bought &amp; sold (net of refunds)</h3>
        <div class="sales-checklist" role="list">
          ${checklist}
        </div>
      </div>
    </div>`;
}

function ordersView() {
  const allOrders = state.orders || [];
  const deals = state.deals || [];
  const period = state.salesPeriod || "day";
  const periodReports = {
    day: buildSalesReport(allOrders, deals, "day"),
    week: buildSalesReport(allOrders, deals, "week"),
    month: buildSalesReport(allOrders, deals, "month"),
    all: buildSalesReport(allOrders, deals, "all"),
  };
  const report = periodReports[period] || periodReports.day;
  const periodOrders = filterOrdersByPeriod(allOrders, period === "all" ? "all" : period);

  const rows = (period === "all" ? allOrders : periodOrders)
    .map((o) => {
      const st = orderStatusKey(o);
      const isRefunded = st === "refunded" || st === "refund" || st === "reversed" || st === "chargeback";
      const isPaid = ["paid", "completed", "succeeded", "complete", "success"].includes(st);
      const lineTotal = orderLineTotal(o);
      const codes = (o.items || []).map((i) => `${i.name}: ${(i.codes || []).join(", ")}`).join(" · ");
      const mail = o.emailSent ? "emailed" : o.emailDetail ? "email fail" : "—";
      const badgeClass = isRefunded ? "badge badge-refund" : "badge";
      let actions = "";
      if (isPaid) {
        actions = `<button type="button" class="btn ghost btn-sm" data-order-status="refunded" data-order-id="${escapeAttr(o.id)}">Mark refunded</button>`;
      } else if (isRefunded) {
        actions = `<button type="button" class="btn ghost btn-sm" data-order-status="paid" data-order-id="${escapeAttr(o.id)}">Undo refund</button>`;
      }
      return `
      <tr class="${isRefunded ? "row-refunded" : ""}">
        <td><strong>${escapeHtml(o.id)}</strong><div class="muted">${escapeHtml(o.createdAt || "")}</div></td>
        <td>${escapeHtml(o.email)}<div class="muted">${escapeHtml(o.name || "")}</div></td>
        <td><span class="${badgeClass}">${escapeHtml(o.status || "")}</span>
          <div class="muted">${escapeHtml(mail)}</div>
          ${actions ? `<div style="margin-top:6px">${actions}</div>` : ""}</td>
        <td><strong class="${isRefunded ? "sales-loss" : ""}">${isRefunded ? "− " : ""}${escapeHtml(money(lineTotal))}</strong>
          <div class="muted" style="max-width:280px;word-break:break-all">${escapeHtml(codes)}</div></td>
      </tr>`;
    })
    .join("");

  return `
    <div class="top"><h1>Orders / Sales</h1></div>
    ${salesChecklistHtml(report, periodReports)}
    <p class="muted">Orders in selected period (${escapeHtml(report.periodLabel || "")}). Mark refunded to deduct from PHP P&amp;L.</p>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Amount / codes</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No orders in this period.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function supportInboxView() {
  const rows = (state.supportMessages || [])
    .map((m) => {
      const sent = m.emailSent ? "emailed" : m.emailDetail ? "email fail" : "saved";
      return `
      <tr>
        <td><strong>${escapeHtml(m.id || "")}</strong><div class="muted">${escapeHtml(m.createdAt || "")}</div></td>
        <td>${escapeHtml(m.email || "")}<div class="muted">${escapeHtml(m.name || "")}</div></td>
        <td>${escapeHtml(m.orderId || "—")}</td>
        <td><strong>${escapeHtml(m.subject || "")}</strong>
          <div class="muted" style="max-width:360px;white-space:pre-wrap;word-break:break-word">${escapeHtml(m.message || "")}</div>
          <div class="muted">${escapeHtml(sent)}${m.emailTo ? " → " + escapeHtml(m.emailTo) : ""}</div>
        </td>
      </tr>`;
    })
    .join("");
  return `
    <div class="top"><h1>Support inbox</h1></div>
    <p class="muted">Messages from the website form at <code>/#/support</code>. Also emailed to <code>SUPPORT_INBOX</code> / <code>ORDER_NOTIFY_EMAIL</code> when Resend is set.</p>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Ticket</th><th>From</th><th>Order</th><th>Message</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No support messages yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function emptyDeal() {
  return {
    id: "",
    name: "",
    brand: "xAI",
    category: "AI",
    tagline: "",
    monogram: "XX",
    price: 0,
    original: 0,
    cost: 0,
    priceBase: "PHP",
    period: "month",
    duration: "",
    rating: 4.5,
    reviews: 0,
    badge: "",
    stock: "In stock",
    delivery: "Instant code",
    description: "",
    includes: [],
    finePrint: "",
    accountType: "",
    validity: "",
    howToRedeem: "",
    importantNotes: "",
    extraDetails: [],
    active: true,
    _isNew: true,
  };
}

function dealModal(deal) {
  const includes = Array.isArray(deal.includes) ? deal.includes.join("\n") : "";
  const extraDetails = Array.isArray(deal.extraDetails)
    ? deal.extraDetails.join("\n")
    : deal.extraDetails || "";
  return `
    <div class="modal-bg" id="modalBg">
      <form class="modal" id="dealForm">
        <h2>${deal._isNew ? "Add product" : "Edit product"}</h2>
        <div class="grid2">
          <label>Name<input name="name" required value="${escapeAttr(deal.name)}" /></label>
          <label>ID (optional)<input name="id" value="${escapeAttr(deal.id)}" ${deal._isNew ? "" : "readonly"} /></label>
        </div>
        <div class="grid3">
          <label>Brand<input name="brand" value="${escapeAttr(deal.brand)}" /></label>
          <label>Category<input name="category" value="${escapeAttr(deal.category)}" /></label>
          <label>Monogram<input name="monogram" maxlength="3" value="${escapeAttr(deal.monogram)}" /></label>
        </div>
        <div class="grid3">
          <label>Sell price (customer pays)<input name="price" type="number" step="0.01" value="${escapeAttr(deal.price)}" /></label>
          <label>Retail / original (strikethrough)<input name="original" type="number" step="0.01" value="${escapeAttr(deal.original)}" /></label>
          <label>Your cost (for profit)
            <input name="cost" type="number" step="0.01" value="${escapeAttr(deal.cost ?? 0)}" placeholder="What you paid for stock" />
          </label>
        </div>
        <div class="grid3">
          <label>Price base currency
            <select name="priceBase">
              <option value="PHP" ${deal.priceBase === "PHP" ? "selected" : ""}>PHP</option>
              <option value="USD" ${deal.priceBase === "USD" ? "selected" : ""}>USD</option>
              <option value="EUR" ${deal.priceBase === "EUR" ? "selected" : ""}>EUR</option>
            </select>
          </label>
          <label></label>
          <label></label>
        </div>
        <div class="grid3">
          <label>Period<input name="period" value="${escapeAttr(deal.period)}" placeholder="7 days / month" /></label>
          <label>Duration label<input name="duration" value="${escapeAttr(deal.duration)}" /></label>
          <label>Badge<input name="badge" value="${escapeAttr(deal.badge || "")}" /></label>
        </div>
        <div class="grid2">
          <label>Stock label<input name="stock" value="${escapeAttr(deal.stock || "")}" /></label>
          <label>Delivery<input name="delivery" value="${escapeAttr(deal.delivery || "")}" /></label>
        </div>
        <label>Tagline<input name="tagline" value="${escapeAttr(deal.tagline || "")}" /></label>
        <label>Description<textarea name="description" rows="4">${escapeHtml(deal.description || "")}</textarea></label>
        <label>Fine print (storefront + delivery footer)<textarea name="finePrint" rows="2">${escapeHtml(deal.finePrint || "")}</textarea></label>

        <h3 class="settings-h" style="margin-top:16px">After purchase delivery (shown on success page + email)</h3>
        <p class="muted" style="margin-top:0">Buyers receive <strong>login credentials</strong> plus the sections below after payment succeeds. Edit these carefully — this is what customers keep.</p>
        <label>Features included (one per line)
          <textarea name="includes" rows="5" placeholder="SuperGrok model access&#10;Higher rate limits&#10;Priority responses">${escapeHtml(includes)}</textarea>
        </label>
        <div class="grid2">
          <label>Account type<input name="accountType" value="${escapeAttr(deal.accountType || "")}" placeholder="e.g. Shared login / Private / Redeem code" /></label>
          <label>Validity / access length<input name="validity" value="${escapeAttr(deal.validity || "")}" placeholder="e.g. 7 days from delivery" /></label>
        </div>
        <label>Instructions — how to use (step-by-step)
          <textarea name="howToRedeem" rows="6" placeholder="1. Open the official app or website&#10;2. Sign in with the username and password below&#10;3. Do not change the password&#10;4. Enjoy your plan for the full duration">${escapeHtml(deal.howToRedeem || "")}</textarea>
        </label>
        <label>Rules (must-follow after purchase)
          <textarea name="importantNotes" rows="6" placeholder="Do not change username, password, or billing&#10;Do not share the account publicly&#10;One device / personal use only&#10;Breaking rules voids refunds">${escapeHtml(deal.importantNotes || "")}</textarea>
        </label>
        <label>Extra storefront detail lines (one per line)<textarea name="extraDetails" rows="3" placeholder="Works on mobile&#10;Region: Global">${escapeHtml(extraDetails)}</textarea></label>

        <div class="grid2">
          <label>Rating<input name="rating" type="number" step="0.1" value="${escapeAttr(deal.rating ?? 4.5)}" /></label>
          <label>Reviews<input name="reviews" type="number" value="${escapeAttr(deal.reviews ?? 0)}" /></label>
        </div>
        <label style="flex-direction:row;align-items:center;gap:8px;text-transform:none;letter-spacing:0">
          <input type="checkbox" name="active" ${deal.active !== false ? "checked" : ""} /> Live on storefront
        </label>
        <div class="row-actions" style="margin-top:12px">
          <button class="btn" type="submit">Save product</button>
          <button class="btn ghost" type="button" id="cancelModal">Cancel</button>
        </div>
      </form>
    </div>`;
}

function formToDeal(fd, existing) {
  return {
    id: (fd.get("id") || existing?.id || "").trim(),
    name: fd.get("name"),
    brand: fd.get("brand"),
    category: fd.get("category"),
    monogram: fd.get("monogram"),
    price: fd.get("price"),
    original: fd.get("original"),
    cost: fd.get("cost"),
    priceBase: fd.get("priceBase"),
    period: fd.get("period"),
    duration: fd.get("duration"),
    badge: fd.get("badge"),
    stock: fd.get("stock"),
    delivery: fd.get("delivery"),
    tagline: fd.get("tagline"),
    description: fd.get("description"),
    includes: fd.get("includes"),
    finePrint: fd.get("finePrint"),
    accountType: fd.get("accountType"),
    validity: fd.get("validity"),
    howToRedeem: fd.get("howToRedeem"),
    importantNotes: fd.get("importantNotes"),
    extraDetails: fd.get("extraDetails"),
    rating: fd.get("rating"),
    reviews: fd.get("reviews"),
    active: fd.get("active") === "on",
  };
}

function render() {
  if (!state.user) {
    app.innerHTML = loginView();
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const data = await api("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({
            username: fd.get("username"),
            password: fd.get("password"),
          }),
        });
        state.user = data.username;
        await loadAll();
        render();
      } catch (err) {
        $("#loginErr").textContent = err.message;
      }
    });
    return;
  }

  let content = "";
  if (state.tab === "settings") content = settingsView();
  else if (state.tab === "account") content = accountView();
  else if (state.tab === "emailtest") content = emailTestView();
  else if (state.tab === "stock") content = stockView();
  else if (state.tab === "orders") content = ordersView();
  else if (state.tab === "support") content = supportInboxView();
  else content = dealsView();

  app.innerHTML = shell(content);
  bindShell();
}

function bindShell() {
  $$("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.tab = btn.dataset.tab;
      state.editing = null;
      state.stockProductId = "";
      try {
        if (state.tab === "stock") await loadInventory();
        if (state.tab === "orders") await loadOrders();
        if (state.tab === "support") await loadSupportMessages();
      } catch (err) {
        toast(err.message, true);
      }
      render();
    });
  });

  $$("[data-sales-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.salesPeriod;
      if (!p || !["day", "week", "month", "all"].includes(p)) return;
      state.salesPeriod = p;
      render();
    });
  });

  $$("[data-order-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.orderId;
      const status = btn.dataset.orderStatus;
      if (!id || !status) return;
      const label = status === "refunded" ? "Mark this order as refunded? It will be deducted from P&L." : "Restore this order to paid?";
      if (!confirm(label)) return;
      btn.disabled = true;
      try {
        await api(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
          method: "POST",
          body: JSON.stringify({ status }),
        });
        await loadOrders();
        toast(status === "refunded" ? "Order refunded — deducted from P&L" : "Order restored to paid");
        render();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  });

  $$("[data-stock]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.stockProductId = btn.dataset.stock;
      try {
        const data = await api(`/api/admin/inventory/${encodeURIComponent(state.stockProductId)}`);
        state.stockCodes = data.codes || [];
      } catch (err) {
        toast(err.message, true);
      }
      render();
    });
  });

  $("#cancelStock")?.addEventListener("click", () => {
    state.stockProductId = "";
    render();
  });

  $("#stockForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api(`/api/admin/inventory/${encodeURIComponent(state.stockProductId)}`, {
        method: "POST",
        body: JSON.stringify({ codes: fd.get("codes") }),
      });
      await loadInventory();
      state.stockProductId = "";
      toast(`Added ${data.added} codes (${data.available} available)`);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $$("[data-clear-stock]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.dataset.clearStock;
      if (!confirm(`Clear ALL codes for this product?\nAvailable, sold, and total will become 0.`)) return;
      try {
        const data = await api(`/api/admin/inventory/${encodeURIComponent(pid)}/clear`, {
          method: "POST",
          body: "{}",
        });
        if (state.stockProductId === pid) state.stockProductId = "";
        await loadInventory();
        toast(`Cleared ${data.removed || 0} codes`);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#clearSoldOnly")?.addEventListener("click", async () => {
    if (!confirm("Remove all SOLD codes for every product? Available stock is kept.")) return;
    try {
      const data = await api("/api/admin/inventory/clear-all", {
        method: "POST",
        body: JSON.stringify({ mode: "sold" }),
      });
      await loadInventory();
      toast(`Removed ${data.removed || 0} sold codes`);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#clearAllStock")?.addEventListener("click", async () => {
    if (
      !confirm(
        "Clear ALL stock for every product?\nAvailable, sold, and total will all become 0. This cannot be undone."
      )
    )
      return;
    try {
      const data = await api("/api/admin/inventory/clear-all", {
        method: "POST",
        body: JSON.stringify({ mode: "all" }),
      });
      state.stockProductId = "";
      await loadInventory();
      toast(`Cleared all stock (${data.removed || 0} codes removed)`);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    state.user = null;
    state.deals = [];
    render();
  });

  $("#addDeal")?.addEventListener("click", () => {
    state.editing = emptyDeal();
    render();
  });

  $("#adminProductSearch")?.addEventListener("input", (e) => {
    state.productFilter = e.target.value;
    const keep = e.target.selectionStart;
    render();
    const again = $("#adminProductSearch");
    if (again) {
      again.focus();
      try {
        again.setSelectionRange(keep, keep);
      } catch {
        /* ignore */
      }
    }
  });

  $$("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = state.deals.find((x) => x.id === btn.dataset.edit);
      state.editing = { ...d, _isNew: false };
      render();
    });
  });

  $$("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this product from the live site?")) return;
      try {
        await api(`/api/admin/deals/${encodeURIComponent(btn.dataset.del)}/delete`, {
          method: "POST",
          body: "{}",
        });
        await loadAll();
        toast("Product deleted");
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  $("#cancelModal")?.addEventListener("click", () => {
    state.editing = null;
    render();
  });

  $("#modalBg")?.addEventListener("click", (e) => {
    if (e.target.id === "modalBg") {
      state.editing = null;
      render();
    }
  });

  $("#dealForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = formToDeal(fd, state.editing);
    try {
      if (state.editing?._isNew) {
        await api("/api/admin/deals", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await api(`/api/admin/deals/${encodeURIComponent(state.editing.id)}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      state.editing = null;
      await loadAll();
      toast("Product saved — live on storefront");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {};
    const uiStrings = {};
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("ui__")) {
        uiStrings[k.slice(4)] = String(v);
      } else {
        payload[k] = v;
      }
    }
    payload.uiStrings = uiStrings;
    try {
      const data = await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.settings = data.settings;
      toast("All site text saved — live on storefront");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#passwordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/api/admin/password", {
        method: "POST",
        body: JSON.stringify({
          current: fd.get("current"),
          newPassword: fd.get("newPassword"),
        }),
      });
      e.target.reset();
      toast("Password updated");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#testInvoiceForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const modeBtn = e.submitter;
    const previewOnly = modeBtn?.dataset?.mode === "preview";
    const buttons = [...e.target.querySelectorAll('button[type="submit"]')];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    if (modeBtn) modeBtn.textContent = previewOnly ? "Building…" : "Sending…";
    try {
      const data = await api("/api/admin/test-invoice", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          name: fd.get("name") || "Test Customer",
          productId: fd.get("productId") || "",
          previewOnly: !!previewOnly,
        }),
      });
      if (data.previewOnly) {
        const lines = (data.plainPreview || "").split("\n").slice(0, 18).join(" · ");
        toast(`Preview OK — subject: ${data.subject || "—"}. ${lines}`.slice(0, 420));
      } else {
        toast(
          `Test invoice sent to ${data.to} (${data.productName || "sample"}). Check inbox / spam.`
        );
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
        if (b.dataset.mode === "preview") b.textContent = "Preview only (no send)";
        else b.textContent = "Send test invoice";
      });
    }
  });
}

function $$(s) {
  return [...document.querySelectorAll(s)];
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

async function loadAll() {
  const [dealsRes, settingsRes] = await Promise.all([
    api("/api/admin/deals"),
    api("/api/admin/settings"),
  ]);
  state.deals = dealsRes.deals || [];
  state.settings = settingsRes.settings || {};
}

async function loadInventory() {
  const data = await api("/api/admin/inventory");
  state.inventorySummary = data.summary || [];
}

async function loadOrders() {
  const data = await api("/api/admin/orders");
  state.orders = data.orders || [];
}

async function loadSupportMessages() {
  const data = await api("/api/admin/support-messages");
  state.supportMessages = data.messages || [];
}

async function boot() {
  try {
    const me = await api("/api/admin/me");
    if (me.authenticated) {
      state.user = me.username;
      await loadAll();
    }
  } catch {
    state.user = null;
  }
  render();
}

boot();
