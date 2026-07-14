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
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

function toast(msg, isErr = false) {
  state.msg = isErr ? "" : msg;
  state.err = isErr ? msg : "";
  render();
  setTimeout(() => {
    state.msg = "";
    state.err = "";
    render();
  }, 2500);
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
        <p class="muted" style="margin-top:14px">Default: <strong>admin</strong> / <strong>subsaverph</strong></p>
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

function settingsView() {
  const s = state.settings || {};
  return `
    <div class="top"><h1>Site content</h1></div>
    <form class="panel" id="settingsForm">
      <div class="grid2">
        <label>Site name<input name="siteName" value="${escapeAttr(s.siteName || "")}" /></label>
        <label>Default currency<input name="defaultCurrency" value="${escapeAttr(s.defaultCurrency || "PHP")}" /></label>
      </div>
      <label>Hero eyebrow<input name="heroEyebrow" value="${escapeAttr(s.heroEyebrow || "")}" /></label>
      <label>Hero title (use \\n for line breaks)<textarea name="heroTitle">${escapeHtml(s.heroTitle || "")}</textarea></label>
      <label>Hero lead<textarea name="heroLead">${escapeHtml(s.heroLead || "")}</textarea></label>
      <label>Mission title<input name="missionTitle" value="${escapeAttr(s.missionTitle || "")}" /></label>
      <label>Mission text<textarea name="missionText">${escapeHtml(s.missionText || "")}</textarea></label>
      <label>Footer text<textarea name="footerText">${escapeHtml(s.footerText || "")}</textarea></label>
      <button class="btn" type="submit">Save site content</button>
    </form>`;
}

function accountView() {
  return `
    <div class="top"><h1>Account</h1></div>
    <form class="panel" id="passwordForm" style="max-width:420px">
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
      <td><button class="btn ghost" data-stock="${escapeHtml(s.productId)}">Add codes</button></td>
    </tr>`
    )
    .join("");

  let form = "";
  if (state.stockProductId) {
    const prod = state.deals.find((d) => d.id === state.stockProductId);
    form = `
      <div class="panel">
        <h2 style="margin-top:0;font-size:1rem">Add codes → ${escapeHtml(prod?.name || state.stockProductId)}</h2>
        <p class="muted">Paste one code / license key / redeem link per line. When a customer pays, one code is delivered instantly.</p>
        <form id="stockForm">
          <label>Codes (one per line)
            <textarea name="codes" placeholder="CODE-AAAA-1111&#10;CODE-BBBB-2222&#10;https://redeem.example/xyz" required></textarea>
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
      return `
      <tr>
        <td><strong>${escapeHtml(o.id)}</strong><div class="muted">${escapeHtml(o.createdAt || "")}</div></td>
        <td>${escapeHtml(o.email)}<div class="muted">${escapeHtml(o.name || "")}</div></td>
        <td><span class="badge">${escapeHtml(o.status || "")}</span></td>
        <td class="muted" style="max-width:280px;word-break:break-all">${escapeHtml(codes)}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="top"><h1>Orders</h1></div>
    <p class="muted">Paid orders with delivered codes.</p>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Codes delivered</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No orders yet.</td></tr>`}</tbody>
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
    active: true,
    _isNew: true,
  };
}

function dealModal(deal) {
  const includes = Array.isArray(deal.includes) ? deal.includes.join("\n") : "";
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
          <label>Stock<input name="stock" value="${escapeAttr(deal.stock || "")}" /></label>
          <label>Delivery<input name="delivery" value="${escapeAttr(deal.delivery || "")}" /></label>
        </div>
        <label>Tagline<input name="tagline" value="${escapeAttr(deal.tagline || "")}" /></label>
        <label>Description<textarea name="description">${escapeHtml(deal.description || "")}</textarea></label>
        <label>Includes (one per line)<textarea name="includes">${escapeHtml(includes)}</textarea></label>
        <label>Fine print<textarea name="finePrint">${escapeHtml(deal.finePrint || "")}</textarea></label>
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
  else if (state.tab === "stock") content = stockView();
  else if (state.tab === "orders") content = ordersView();
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
    const payload = Object.fromEntries(fd.entries());
    try {
      const data = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      state.settings = data.settings;
      toast("Site content saved");
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
