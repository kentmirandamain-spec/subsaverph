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
};

function friendlyApiError(status, raw, data) {
  const text = String(raw || "");
  const looksHtml =
    /^\s*<!DOCTYPE/i.test(text) ||
    /^\s*<html/i.test(text) ||
    text.includes("cf-error") ||
    text.includes("Cloudflare") ||
    text.includes("Attention Required");
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

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json", ...(opts.headers || {}) };
  let res;
  try {
    res = await fetch(path, {
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
        <button type="button" data-tab="orders" class="${state.tab === "orders" ? "active" : ""}">Orders</button>
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

function settingsView() {
  const s = state.settings || {};
  const ui = s.uiStrings && typeof s.uiStrings === "object" ? s.uiStrings : {};
  const uiKeys = [...new Set([...Object.keys(UI_STRING_DEFAULTS), ...Object.keys(ui)])].sort();
  const uiFields = uiKeys
    .map((key) => {
      const val = ui[key] != null && String(ui[key]).length ? ui[key] : UI_STRING_DEFAULTS[key] || "";
      return `<label class="ui-string-field"><code>${escapeHtml(key)}</code><input name="ui__${escapeAttr(key)}" value="${escapeAttr(val)}" /></label>`;
    })
    .join("");

  return `
    <div class="top"><h1>Site content</h1></div>
    <p class="muted">Edit <strong>all</strong> storefront copy here. Product names, prices, features, and rules are under <strong>Products</strong>. Save once to update the live site.</p>
    <form class="panel" id="settingsForm">
      <h3 class="settings-h">Brand &amp; contact</h3>
      <div class="grid2">
        <label>Site name<input name="siteName" value="${escapeAttr(s.siteName || "")}" /></label>
        <label>Tagline<input name="tagline" value="${escapeAttr(s.tagline || "")}" /></label>
        <label>Default currency<input name="defaultCurrency" value="${escapeAttr(s.defaultCurrency || "PHP")}" /></label>
        <label>Public support email
          <input name="supportEmail" value="${escapeAttr(s.supportEmail || "support@subsaverph.com")}" />
        </label>
      </div>
      <label>Owner inbox (form emails go here)
        <input name="ownerInbox" type="email" value="${escapeAttr(s.ownerInbox || "")}" placeholder="you@outlook.com" />
      </label>
      <label>Website URL<input name="websiteUrl" value="${escapeAttr(s.websiteUrl || "")}" /></label>
      <label>Announcement bar (optional)<input name="announcement" value="${escapeAttr(s.announcement || "")}" placeholder="Leave empty to hide" /></label>

      <h3 class="settings-h">Google / search preview</h3>
      <p class="muted" style="margin-top:0">Title &amp; description when people search for SubSaverPH. Re-request indexing in Search Console after changes.</p>
      <label>SEO title
        <input name="seoTitle" value="${escapeAttr(s.seoTitle || "")}" placeholder="SubSaverPH — Official Site | Philippines Digital Subscription Store" />
      </label>
      <label>SEO description (company only — no product names)
        <textarea name="seoDescription" rows="3" placeholder="SubSaverPH is a Philippines-based online storefront for discounted prepaid digital subscriptions…">${escapeHtml(s.seoDescription || "")}</textarea>
      </label>
      <label>SEO keywords (comma-separated)
        <input name="seoKeywords" value="${escapeAttr(s.seoKeywords || "")}" />
      </label>
      <div class="grid2">
        <label>Share title (Facebook / Messenger)
          <input name="seoOgTitle" value="${escapeAttr(s.seoOgTitle || "")}" />
        </label>
        <label>Share description
          <input name="seoOgDescription" value="${escapeAttr(s.seoOgDescription || "")}" />
        </label>
      </div>

      <h3 class="settings-h">Homepage hero</h3>
      <label>Hero eyebrow<input name="heroEyebrow" value="${escapeAttr(s.heroEyebrow || "")}" /></label>
      <label>Hero title (use Enter for line breaks)<textarea name="heroTitle" rows="4">${escapeHtml(s.heroTitle || "")}</textarea></label>
      <label>Hero lead<textarea name="heroLead" rows="3">${escapeHtml(s.heroLead || "")}</textarea></label>

      <h3 class="settings-h">Homepage strips &amp; sections</h3>
      <div class="grid2">
        <label>Strip 1<input name="strip1" value="${escapeAttr(s.strip1 || "")}" /></label>
        <label>Strip 2<input name="strip2" value="${escapeAttr(s.strip2 || "")}" /></label>
        <label>Strip 3<input name="strip3" value="${escapeAttr(s.strip3 || "")}" /></label>
        <label>Strip 4<input name="strip4" value="${escapeAttr(s.strip4 || "")}" /></label>
        <label>Platforms section title<input name="platformsTitle" value="${escapeAttr(s.platformsTitle || "")}" /></label>
        <label>Catalog section title<input name="catalogTitle" value="${escapeAttr(s.catalogTitle || "")}" /></label>
      </div>
      <label>Mission title<input name="missionTitle" value="${escapeAttr(s.missionTitle || "")}" /></label>
      <label>Mission text<textarea name="missionText" rows="3">${escapeHtml(s.missionText || "")}</textarea></label>

      <h3 class="settings-h">How it works page</h3>
      <div class="grid2">
        <label>Eyebrow<input name="howEyebrow" value="${escapeAttr(s.howEyebrow || "Protocol")}" /></label>
        <label>Page title<input name="howTitle" value="${escapeAttr(s.howTitle || "How it works")}" /></label>
      </div>
      <div class="grid2">
        <label>Step 1 title<input name="howStep1Title" value="${escapeAttr(s.howStep1Title || UI_STRING_DEFAULTS.how_step1_t)}" /></label>
        <label>Step 1 text<input name="howStep1Text" value="${escapeAttr(s.howStep1Text || UI_STRING_DEFAULTS.how_step1_p)}" /></label>
        <label>Step 2 title<input name="howStep2Title" value="${escapeAttr(s.howStep2Title || UI_STRING_DEFAULTS.how_step2_t)}" /></label>
        <label>Step 2 text<input name="howStep2Text" value="${escapeAttr(s.howStep2Text || UI_STRING_DEFAULTS.how_step2_p)}" /></label>
        <label>Step 3 title<input name="howStep3Title" value="${escapeAttr(s.howStep3Title || UI_STRING_DEFAULTS.how_step3_t)}" /></label>
        <label>Step 3 text<input name="howStep3Text" value="${escapeAttr(s.howStep3Text || UI_STRING_DEFAULTS.how_step3_p)}" /></label>
        <label>Step 4 title<input name="howStep4Title" value="${escapeAttr(s.howStep4Title || UI_STRING_DEFAULTS.how_step4_t)}" /></label>
        <label>Step 4 text<input name="howStep4Text" value="${escapeAttr(s.howStep4Text || UI_STRING_DEFAULTS.how_step4_p)}" /></label>
      </div>
      <label>Notice box title<input name="howNoticeTitle" value="${escapeAttr(s.howNoticeTitle || UI_STRING_DEFAULTS.demo_notice)}" /></label>
      <label>Notice box text<textarea name="howNoticeText" rows="2">${escapeHtml(s.howNoticeText || UI_STRING_DEFAULTS.demo_notice_p)}</textarea></label>
      <label>CTA button label<input name="howCtaLabel" value="${escapeAttr(s.howCtaLabel || UI_STRING_DEFAULTS.cta_browse)}" /></label>

      <h3 class="settings-h">Support page</h3>
      <label>Badge<input name="supportPageBadge" value="${escapeAttr(s.supportPageBadge || "Help center")}" /></label>
      <label>Support page title<input name="supportPageTitle" value="${escapeAttr(s.supportPageTitle || "We're here to help")}" /></label>
      <label>Support page subtitle<textarea name="supportPageLead" rows="2">${escapeHtml(s.supportPageLead || "Order issues, login problems, missing codes — reach us by email or send a message below.")}</textarea></label>
      <label>Support form heading<input name="supportFormTitle" value="${escapeAttr(s.supportFormTitle || "Send a message")}" /></label>
      <label>Support form subtext<textarea name="supportFormSub" rows="2">${escapeHtml(s.supportFormSub || "No email app needed — we get this in our inbox and reply by email.")}</textarea></label>
      <label>Support subject options (one topic per line)
        <textarea name="supportSubjectOptions" rows="8">${escapeHtml(
          s.supportSubjectOptions ||
            "Login not working\nMissing code or credentials\nWrong product delivered\nPayment charged but no order\nAccount expired early\nRefund request\nOrder status question\nPayment / checkout problem\nOther"
        )}</textarea>
      </label>
      <label>Chatbot extra FAQ
        <textarea name="chatbotFaq" rows="4">${escapeHtml(s.chatbotFaq || "")}</textarea>
      </label>
      <label>Chat welcome line
        <input name="chatWelcome" value="${escapeAttr(s.chatWelcome || "")}" />
      </label>

      <h3 class="settings-h">Success page (after payment)</h3>
      <label>Success heading<input name="successTitle" value="${escapeAttr(s.successTitle || "Order delivered")}" /></label>
      <label>Package title<input name="successPackageTitle" value="${escapeAttr(s.successPackageTitle || "Your access package")}" /></label>
      <label>Package subtitle
        <input name="successPackageSub" value="${escapeAttr(s.successPackageSub || "Login credentials, features, instructions, and rules for each product.")}" />
      </label>
      <label>Footer note<textarea name="successFooterNote" rows="2">${escapeHtml(s.successFooterNote || "Save these credentials now. Follow the instructions and rules for each product.")}</textarea></label>

      <h3 class="settings-h">Footer</h3>
      <label>Footer blurb<textarea name="footerText" rows="3">${escapeHtml(s.footerText || "")}</textarea></label>
      <label>Company about blurb<textarea name="footerCompanyBlurb" rows="4">${escapeHtml(s.footerCompanyBlurb || "")}</textarea></label>
      <div class="grid2">
        <label>Brand label<input name="footerBrand" value="${escapeAttr(s.footerBrand || "")}" /></label>
        <label>Service area<input name="footerServiceArea" value="${escapeAttr(s.footerServiceArea || "")}" /></label>
        <label>Website label<input name="footerWebsite" value="${escapeAttr(s.footerWebsite || "")}" /></label>
        <label>Support label<input name="footerSupport" value="${escapeAttr(s.footerSupport || "")}" /></label>
        <label>Business type<input name="footerBusinessType" value="${escapeAttr(s.footerBusinessType || "")}" /></label>
        <label>Copyright line<input name="footerCopyright" value="${escapeAttr(s.footerCopyright || "")}" /></label>
      </div>
      <label>Footer disclaimer<textarea name="footerDisclaimer" rows="3">${escapeHtml(s.footerDisclaimer || "")}</textarea></label>

      <h3 class="settings-h">About page</h3>
      <div class="grid2">
        <label>About title<input name="aboutTitle" value="${escapeAttr(s.aboutTitle || "")}" /></label>
        <label>Last updated<input name="aboutUpdated" value="${escapeAttr(s.aboutUpdated || "")}" /></label>
      </div>
      <label>About body<textarea name="aboutBody" rows="10">${escapeHtml(s.aboutBody || "")}</textarea></label>

      <h3 class="settings-h">Checkout — purchase rules (before pay)</h3>
      <label>Popup title<input name="checkoutTermsTitle" value="${escapeAttr(s.checkoutTermsTitle || "Purchase details & rules")}" /></label>
      <label>Eyebrow label<input name="checkoutTermsEyebrow" value="${escapeAttr(s.checkoutTermsEyebrow || "Before you pay")}" /></label>
      <label>What you are buying<textarea name="checkoutWhatYouBuy" rows="5">${escapeHtml(s.checkoutWhatYouBuy || "")}</textarea></label>
      <label>Rules &amp; regulations<textarea name="checkoutRules" rows="10">${escapeHtml(s.checkoutRules || "")}</textarea></label>
      <label>Support blurb<textarea name="checkoutSupportText" rows="3">${escapeHtml(s.checkoutSupportText || "")}</textarea></label>
      <label>Accept checkbox text<input name="checkoutAcceptLabel" value="${escapeAttr(s.checkoutAcceptLabel || "")}" /></label>
      <label>Confirm button prefix<input name="checkoutConfirmLabel" value="${escapeAttr(s.checkoutConfirmLabel || "Accept & pay")}" /></label>

      <h3 class="settings-h">Terms of Use</h3>
      <div class="grid2">
        <label>Terms title<input name="termsTitle" value="${escapeAttr(s.termsTitle || "")}" /></label>
        <label>Last updated<input name="termsUpdated" value="${escapeAttr(s.termsUpdated || "")}" /></label>
      </div>
      <label>Terms body<textarea name="termsBody" rows="12">${escapeHtml(s.termsBody || "")}</textarea></label>

      <h3 class="settings-h">Privacy Policy</h3>
      <div class="grid2">
        <label>Privacy title<input name="privacyTitle" value="${escapeAttr(s.privacyTitle || "")}" /></label>
        <label>Last updated<input name="privacyUpdated" value="${escapeAttr(s.privacyUpdated || "")}" /></label>
      </div>
      <label>Privacy body<textarea name="privacyBody" rows="12">${escapeHtml(s.privacyBody || "")}</textarea></label>

      <h3 class="settings-h">All UI labels (buttons, nav, cart…)</h3>
      <p class="muted" style="margin-top:0">Every small English label. Product names/prices stay under Products.</p>
      <div class="ui-strings-grid">${uiFields}</div>

      <button class="btn" type="submit" style="margin-top:20px">Save all site content</button>
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
    </form>
    ${testInvoicePanel({ margin: "margin-top:16px" })}`;
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

function ordersView() {
  const rows = (state.orders || [])
    .map((o) => {
      const codes = (o.items || [])
        .map((i) => `${i.name}: ${(i.codes || []).join(", ")}`)
        .join(" · ");
      const mail = o.emailSent
        ? "emailed"
        : o.emailDetail
          ? "email fail"
          : "—";
      return `
      <tr>
        <td><strong>${escapeHtml(o.id)}</strong><div class="muted">${escapeHtml(o.createdAt || "")}</div></td>
        <td>${escapeHtml(o.email)}<div class="muted">${escapeHtml(o.name || "")}</div></td>
        <td><span class="badge">${escapeHtml(o.status || "")}</span>
          <div class="muted">${escapeHtml(mail)}</div></td>
        <td class="muted" style="max-width:280px;word-break:break-all">${escapeHtml(codes)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="top"><h1>Orders</h1></div>
    ${testInvoicePanel({ title: "Send test invoice email", margin: "margin-bottom:16px" })}
    <p class="muted">Paid orders with delivered codes.</p>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Codes delivered</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No orders yet.</td></tr>`}</tbody>
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
          <label>Price<input name="price" type="number" step="0.01" value="${escapeAttr(deal.price)}" /></label>
          <label>Retail / original<input name="original" type="number" step="0.01" value="${escapeAttr(deal.original)}" /></label>
          <label>Price base currency
            <select name="priceBase">
              <option value="PHP" ${deal.priceBase === "PHP" ? "selected" : ""}>PHP</option>
              <option value="USD" ${deal.priceBase === "USD" ? "selected" : ""}>USD</option>
              <option value="EUR" ${deal.priceBase === "EUR" ? "selected" : ""}>EUR</option>
            </select>
          </label>
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
        const data = await api(`/api/admin/inventory/${encodeURIComponent(pid)}`, {
          method: "DELETE",
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
        await api(`/api/admin/deals/${encodeURIComponent(btn.dataset.del)}`, {
          method: "DELETE",
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
          method: "PUT",
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
        method: "PUT",
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
