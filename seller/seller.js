const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");

const state = {
  seller: null,
  balances: { held: 0, released: 0, paid: 0, currency: "PHP" },
  tab: "dashboard",
  deals: [],
  inventory: [],
  orders: [],
  payouts: [],
  msg: "",
  err: "",
  authMode: "login",
  editing: null,
  stockProductId: "",
};

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

async function api(path, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(opts.headers || {}),
  };
  let res;
  try {
    res = await fetch(path, { credentials: "same-origin", ...opts, headers });
  } catch (e) {
    throw new Error(`Network error: ${e.message || e}`);
  }
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(String(data.error || data.detail || `HTTP ${res.status}`).slice(0, 400));
  }
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
  }, isErr ? 6000 : 2800);
}

function isApproved() {
  return state.seller?.status === "approved";
}

function authView() {
  const reg = state.authMode === "register";
  return `
    <div class="login-wrap">
      <form class="login-card" id="authForm">
        <h1>Seller portal</h1>
        <p>${reg ? "Create a seller account. Admin must approve before you can list products." : "Sign in to manage listings, stock, and payouts."}</p>
        ${
          reg
            ? `<label>Display name<input name="displayName" required placeholder="Your store name" /></label>
               <label>Phone (optional)<input name="phone" placeholder="09…" /></label>
               <label>Payout method
                 <select name="payoutMethod">
                   <option value="gcash">GCash</option>
                   <option value="maya">Maya</option>
                   <option value="bank">Bank</option>
                   <option value="paypal">PayPal</option>
                 </select>
               </label>
               <label>Payout details<input name="payoutDetails" placeholder="GCash number / account" /></label>`
            : ""
        }
        <label>Email<input name="email" type="email" required autocomplete="email" /></label>
        <label>Password<input name="password" type="password" required minlength="6" autocomplete="${reg ? "new-password" : "current-password"}" /></label>
        <button class="btn" type="submit" style="width:100%;margin-top:8px">${reg ? "Register" : "Sign in"}</button>
        <p class="muted" style="margin-top:14px">
          ${
            reg
              ? `Have an account? <a href="#" id="switchAuth">Sign in</a>`
              : `New seller? <a href="#" id="switchAuth">Register</a>`
          }
          · <a href="/">Back to store</a>
        </p>
        <p class="err" id="authErr"></p>
      </form>
    </div>`;
}

function shell(content) {
  const s = state.seller || {};
  return `
    <div class="shell">
      <aside class="side">
        <h2>Seller</h2>
        <button type="button" data-tab="dashboard" class="${state.tab === "dashboard" ? "active" : ""}">Dashboard</button>
        <button type="button" data-tab="products" class="${state.tab === "products" ? "active" : ""}">Products</button>
        <button type="button" data-tab="stock" class="${state.tab === "stock" ? "active" : ""}">Stock</button>
        <button type="button" data-tab="sales" class="${state.tab === "sales" ? "active" : ""}">Sales</button>
        <button type="button" data-tab="payouts" class="${state.tab === "payouts" ? "active" : ""}">Payouts</button>
        <button type="button" data-tab="profile" class="${state.tab === "profile" ? "active" : ""}">Profile</button>
        <a href="/" target="_blank" rel="noopener">↗ Storefront</a>
        <button type="button" id="logoutBtn">Log out</button>
        <p class="muted" style="margin-top:24px;padding:0 12px">${escapeHtml(s.displayName || s.email || "")}<br/><span class="badge">${escapeHtml(s.status || "")}</span></p>
      </aside>
      <main class="main">
        ${state.msg ? `<p class="ok">${escapeHtml(state.msg)}</p>` : ""}
        ${state.err ? `<p class="err">${escapeHtml(state.err)}</p>` : ""}
        ${s.status === "pending" ? `<p class="err">Your account is pending admin approval. You can update profile; listing tools unlock after approval.</p>` : ""}
        ${s.status === "suspended" ? `<p class="err">Account suspended. Contact support.</p>` : ""}
        ${content}
      </main>
    </div>
    ${state.editing !== null ? dealModal(state.editing) : ""}`;
}

function dashboardView() {
  const b = state.balances || {};
  const live = (state.deals || []).filter((d) => d.listingStatus === "live").length;
  const pending = (state.deals || []).filter((d) => d.listingStatus === "pending").length;
  return `
    <div class="top"><h1>Dashboard</h1></div>
    <div class="grid3">
      <div class="panel"><p class="muted">Held</p><h2>₱${Number(b.held || 0).toFixed(2)}</h2><p class="muted">Waiting for admin release</p></div>
      <div class="panel"><p class="muted">Released</p><h2>₱${Number(b.released || 0).toFixed(2)}</h2><p class="muted">Approved — awaiting transfer</p></div>
      <div class="panel"><p class="muted">Paid</p><h2>₱${Number(b.paid || 0).toFixed(2)}</h2><p class="muted">Already sent to you</p></div>
    </div>
    <div class="panel" style="margin-top:16px">
      <p><strong>Listings:</strong> ${live} live · ${pending} pending approval · ${(state.deals || []).length} total</p>
      <p class="muted">Platform fee is deducted on each sale. Codes deliver instantly to buyers; your net stays held until the host releases payout.</p>
    </div>`;
}

function productsView() {
  const rows = (state.deals || [])
    .map(
      (d) => `
    <tr>
      <td><strong>${escapeHtml(d.name)}</strong><div class="muted">${escapeHtml(d.id)}</div></td>
      <td>₱${Number(d.price || 0).toFixed(2)}</td>
      <td><span class="badge">${escapeHtml(d.listingStatus || "")}</span></td>
      <td>${d.stockLeft ?? "—"}</td>
      <td class="row-actions">
        <button type="button" class="btn ghost" data-edit="${escapeAttr(d.id)}">Edit</button>
      </td>
    </tr>`
    )
    .join("");
  return `
    <div class="top">
      <h1>Products</h1>
      ${isApproved() ? `<button type="button" class="btn" id="addDeal">Add product</button>` : ""}
    </div>
    <p class="muted">New listings go to <strong>pending</strong> until SubSaverPH approves them.</p>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Name</th><th>Price</th><th>Status</th><th>Stock</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">No products yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function stockView() {
  if (state.stockProductId) {
    return `
      <div class="top"><h1>Add stock</h1><button type="button" class="btn ghost" id="cancelStock">Back</button></div>
      <form class="panel" id="stockForm">
        <p class="muted">Product: <strong>${escapeHtml(state.stockProductId)}</strong> — one code or login per line (e.g. user:pass)</p>
        <label>Codes<textarea name="codes" rows="10" required placeholder="user1:pass1&#10;user2:pass2"></textarea></label>
        <button class="btn" type="submit">Add stock</button>
      </form>`;
  }
  const rows = (state.inventory || [])
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.name)}<div class="muted">${escapeHtml(r.productId)}</div></td>
      <td>${r.available}</td>
      <td>${r.sold}</td>
      <td>${r.total}</td>
      <td>${isApproved() ? `<button type="button" class="btn" data-stock="${escapeAttr(r.productId)}">Add codes</button>` : ""}</td>
    </tr>`
    )
    .join("");
  return `
    <div class="top"><h1>Stock</h1></div>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Product</th><th>Available</th><th>Sold</th><th>Total</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">Create a product first.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function salesView() {
  const rows = (state.orders || [])
    .map((o) => {
      const items = (o.items || [])
        .map((it) => `${escapeHtml(it.name)} ×${it.qty} (net ₱${Number(it.sellerNet || 0).toFixed(2)})`)
        .join("<br/>");
      return `<tr>
        <td><strong>${escapeHtml(o.id)}</strong><div class="muted">${escapeHtml(o.createdAt || "")}</div></td>
        <td class="muted">${escapeHtml(o.email || "")}</td>
        <td>${items}</td>
        <td><strong>₱${Number(o.sellerNetTotal || 0).toFixed(2)}</strong></td>
      </tr>`;
    })
    .join("");
  return `
    <div class="top"><h1>Sales</h1></div>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Order</th><th>Buyer</th><th>Items</th><th>Your net</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No sales yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function payoutsView() {
  const b = state.balances || {};
  const rows = (state.payouts || [])
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.id)}<div class="muted">Order ${escapeHtml(p.orderId || "")}</div></td>
      <td>₱${Number(p.net || 0).toFixed(2)}</td>
      <td><span class="badge">${escapeHtml(p.status || "")}</span></td>
      <td class="muted">${escapeHtml(p.createdAt || "")}</td>
    </tr>`
    )
    .join("");
  return `
    <div class="top"><h1>Payouts</h1></div>
    <p class="muted">Held ₱${Number(b.held || 0).toFixed(2)} · Released ₱${Number(b.released || 0).toFixed(2)} · Paid ₱${Number(b.paid || 0).toFixed(2)}</p>
    <div class="panel" style="overflow:auto">
      <table class="table">
        <thead><tr><th>Payout</th><th>Net</th><th>Status</th><th>When</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No payout rows yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function profileView() {
  const s = state.seller || {};
  return `
    <div class="top"><h1>Profile</h1></div>
    <form class="panel" id="profileForm">
      <label>Display name<input name="displayName" value="${escapeAttr(s.displayName || "")}" /></label>
      <label>Phone<input name="phone" value="${escapeAttr(s.phone || "")}" /></label>
      <label>Payout method
        <select name="payoutMethod">
          ${["gcash", "maya", "bank", "paypal", "other"]
            .map(
              (m) =>
                `<option value="${m}" ${s.payoutMethod === m ? "selected" : ""}>${m}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>Payout details<input name="payoutDetails" value="${escapeAttr(s.payoutDetails || "")}" /></label>
      <button class="btn" type="submit">Save profile</button>
    </form>
    <form class="panel" id="passwordForm" style="margin-top:16px">
      <h3 class="settings-h">Change password</h3>
      <label>Current<input name="current" type="password" required /></label>
      <label>New password<input name="newPassword" type="password" required minlength="6" /></label>
      <button class="btn" type="submit">Update password</button>
    </form>`;
}

function emptyDeal() {
  return {
    name: "",
    brand: "Other",
    category: "Other",
    monogram: "XX",
    price: 0,
    original: 0,
    priceBase: "PHP",
    period: "month",
    duration: "",
    tagline: "",
    description: "",
    includes: [],
    finePrint: "",
    delivery: "Instant code",
    stock: "In stock",
    _isNew: true,
  };
}

function dealModal(deal) {
  const includes = Array.isArray(deal.includes) ? deal.includes.join("\n") : "";
  return `
    <div class="modal-bg" id="modalBg">
      <form class="modal" id="dealForm">
        <h2>${deal._isNew ? "Add product" : "Edit product"}</h2>
        <label>Name<input name="name" required value="${escapeAttr(deal.name || "")}" /></label>
        <div class="grid2">
          <label>Brand<input name="brand" value="${escapeAttr(deal.brand || "")}" /></label>
          <label>Category<input name="category" value="${escapeAttr(deal.category || "")}" /></label>
        </div>
        <div class="grid2">
          <label>Price (PHP)<input name="price" type="number" step="0.01" value="${escapeAttr(deal.price || 0)}" /></label>
          <label>Retail / original<input name="original" type="number" step="0.01" value="${escapeAttr(deal.original || 0)}" /></label>
        </div>
        <label>Duration<input name="duration" value="${escapeAttr(deal.duration || "")}" placeholder="1 month" /></label>
        <label>Description<textarea name="description" rows="4">${escapeHtml(deal.description || "")}</textarea></label>
        <label>Includes (one per line)<textarea name="includes" rows="3">${escapeHtml(includes)}</textarea></label>
        <label>Fine print<textarea name="finePrint" rows="2">${escapeHtml(deal.finePrint || "")}</textarea></label>
        <div class="row-actions" style="margin-top:12px">
          <button class="btn" type="submit">Save</button>
          <button class="btn ghost" type="button" id="cancelModal">Cancel</button>
        </div>
      </form>
    </div>`;
}

function render() {
  if (!state.seller) {
    app.innerHTML = authView();
    $("#switchAuth")?.addEventListener("click", (e) => {
      e.preventDefault();
      state.authMode = state.authMode === "login" ? "register" : "login";
      render();
    });
    $("#authForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = $("#authErr");
      try {
        if (state.authMode === "register") {
          const data = await api("/api/seller/register", {
            method: "POST",
            body: JSON.stringify({
              email: fd.get("email"),
              password: fd.get("password"),
              displayName: fd.get("displayName"),
              phone: fd.get("phone"),
              payoutMethod: fd.get("payoutMethod"),
              payoutDetails: fd.get("payoutDetails"),
            }),
          });
          state.seller = data.seller;
        } else {
          const data = await api("/api/seller/login", {
            method: "POST",
            body: JSON.stringify({
              email: fd.get("email"),
              password: fd.get("password"),
            }),
          });
          state.seller = data.seller;
        }
        await refreshMe();
        await loadTabData();
        render();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    });
    return;
  }

  let content = dashboardView();
  if (state.tab === "products") content = productsView();
  else if (state.tab === "stock") content = stockView();
  else if (state.tab === "sales") content = salesView();
  else if (state.tab === "payouts") content = payoutsView();
  else if (state.tab === "profile") content = profileView();

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
        await loadTabData();
      } catch (err) {
        toast(err.message, true);
      }
      render();
    });
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await api("/api/seller/logout", { method: "POST", body: "{}" });
    state.seller = null;
    state.deals = [];
    render();
  });

  $("#addDeal")?.addEventListener("click", () => {
    state.editing = emptyDeal();
    render();
  });

  $$("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = state.deals.find((x) => x.id === btn.dataset.edit);
      state.editing = { ...d, _isNew: false };
      render();
    });
  });

  $$("[data-stock]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.stockProductId = btn.dataset.stock;
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
      const data = await api(
        `/api/seller/inventory/${encodeURIComponent(state.stockProductId)}`,
        { method: "POST", body: JSON.stringify({ codes: fd.get("codes") }) }
      );
      state.stockProductId = "";
      await loadTabData();
      toast(`Added ${data.added} codes`);
    } catch (err) {
      toast(err.message, true);
    }
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
    const payload = {
      name: fd.get("name"),
      brand: fd.get("brand"),
      category: fd.get("category"),
      price: fd.get("price"),
      original: fd.get("original"),
      priceBase: "PHP",
      duration: fd.get("duration"),
      description: fd.get("description"),
      includes: fd.get("includes"),
      finePrint: fd.get("finePrint"),
      monogram: (fd.get("name") || "XX").toString().slice(0, 2).toUpperCase(),
    };
    try {
      if (state.editing?._isNew) {
        await api("/api/seller/deals", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await api(`/api/seller/deals/${encodeURIComponent(state.editing.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      state.editing = null;
      await loadTabData();
      toast("Product saved (pending approval if new or price/name changed)");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#profileForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const data = await api("/api/seller/profile", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      state.seller = data.seller;
      toast("Profile saved");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#passwordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/api/seller/password", {
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

async function refreshMe() {
  const data = await api("/api/seller/me");
  state.seller = data.seller;
  state.balances = data.balances || state.balances;
}

async function loadTabData() {
  await refreshMe();
  if (state.tab === "dashboard" || state.tab === "products") {
    const d = await api("/api/seller/deals");
    state.deals = d.deals || [];
  }
  if (state.tab === "stock") {
    const d = await api("/api/seller/deals");
    state.deals = d.deals || [];
    const inv = await api("/api/seller/inventory");
    state.inventory = inv.summary || [];
  }
  if (state.tab === "sales") {
    const d = await api("/api/seller/orders");
    state.orders = d.orders || [];
  }
  if (state.tab === "payouts" || state.tab === "dashboard") {
    const d = await api("/api/seller/payouts");
    state.payouts = d.payouts || [];
    state.balances = d.balances || state.balances;
  }
}

async function boot() {
  try {
    await refreshMe();
    state.tab = "dashboard";
    await loadTabData();
  } catch {
    state.seller = null;
  }
  render();
}

boot();
