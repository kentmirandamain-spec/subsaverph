/**
 * SubSaverPH floating customer help chat.
 */
const CHAT_STORAGE_KEY = "subsaverph_chat_v1";

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(-20) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  } catch {
    /* ignore */
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Lightweight markdown-ish: bold, line breaks, bullets */
function formatReply(text) {
  let t = escapeHtml(text);
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/^• /gm, "· ");
  t = t.replace(/\n/g, "<br/>");
  return t;
}

function setStatusLabel(sub, d) {
  if (!sub) return;
  if (d?.provider === "groq") sub.textContent = "Online · free cloud AI";
  else if (d?.provider === "gemini") sub.textContent = "Online · free cloud AI";
  else if (d?.provider === "spacexai" || d?.provider === "xai") sub.textContent = "Online · cloud AI";
  else sub.textContent = "Online · store assistant";
}

export function mountChatbot() {
  if (document.getElementById("ssphChatRoot")) return;

  const root = document.createElement("div");
  root.id = "ssphChatRoot";
  root.innerHTML = `
    <button type="button" class="ssph-chat-fab" id="ssphChatFab" aria-label="Open help chat" aria-expanded="false">
      <span class="ssph-chat-fab-ring" aria-hidden="true"></span>
      <span class="ssph-chat-fab-core" aria-hidden="true">
        <svg class="ssph-chat-fab-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.5-.3-3.6-.8L3 21l1.4-4.1A8.4 8.4 0 0 1 3.5 12 8.5 8.5 0 1 1 21 12Z"/>
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>
        </svg>
        <svg class="ssph-chat-fab-close-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </span>
      <span class="ssph-chat-fab-label">Help</span>
    </button>

    <section class="ssph-chat-panel" id="ssphChatPanel" hidden aria-label="Customer help chat">
      <div class="ssph-chat-glow" aria-hidden="true"></div>
      <header class="ssph-chat-head">
        <div class="ssph-chat-brand">
          <span class="ssph-chat-avatar" aria-hidden="true">S</span>
          <div class="ssph-chat-brand-text">
            <strong>SubSaverPH Help</strong>
            <p class="ssph-chat-sub" id="ssphChatSub"><span class="ssph-chat-dot" aria-hidden="true"></span> Online · store assistant</p>
          </div>
        </div>
        <div class="ssph-chat-head-actions">
          <button type="button" class="ssph-chat-icon-btn" id="ssphChatClear" title="Clear chat" aria-label="Clear chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12"/></svg>
          </button>
          <button type="button" class="ssph-chat-icon-btn" id="ssphChatClose" aria-label="Close chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </header>

      <div class="ssph-chat-messages" id="ssphChatMessages" role="log" aria-live="polite"></div>

      <div class="ssph-chat-composer">
        <form class="ssph-chat-form" id="ssphChatForm">
          <input type="text" id="ssphChatInput" name="message" autocomplete="off" maxlength="2000"
            placeholder="Ask about payment, login, rules…" required />
          <button type="submit" class="ssph-chat-send" id="ssphChatSend" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4 3 10l11 2L3 14z"/></svg>
          </button>
        </form>
        <p class="ssph-chat-foot">Store help only · <a href="#/support">Human support</a></p>
      </div>
    </section>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector("#ssphChatFab");
  const panel = root.querySelector("#ssphChatPanel");
  const closeBtn = root.querySelector("#ssphChatClose");
  const clearBtn = root.querySelector("#ssphChatClear");
  const form = root.querySelector("#ssphChatForm");
  const input = root.querySelector("#ssphChatInput");
  const list = root.querySelector("#ssphChatMessages");
  const sub = root.querySelector("#ssphChatSub");
  const sendBtn = root.querySelector("#ssphChatSend");

  let messages = loadHistory();
  let busy = false;

  function welcomeHtml() {
    return `
      <div class="ssph-chat-row bot">
        <span class="ssph-chat-mini-avatar" aria-hidden="true">S</span>
        <div class="ssph-chat-bubble bot">
          Hi — I’m your SubSaverPH help assistant. Ask about products, prices, payment, login after pay, account rules, or refunds.
        </div>
      </div>
      <div class="ssph-chat-suggestions" role="list">
        <button type="button" data-suggest="Hi, I need help choosing a product">Need help</button>
        <button type="button" data-suggest="What are CapCut account rules?">CapCut rules</button>
        <button type="button" data-suggest="How do I receive my login after payment?">After payment</button>
        <button type="button" data-suggest="How do refunds work?">Refunds</button>
        <button type="button" data-suggest="What products do you sell and roughly how much?">Products</button>
        <button type="button" data-suggest="What payment methods do you accept?">Payments</button>
      </div>`;
  }

  function renderMessages() {
    if (!messages.length) {
      list.innerHTML = welcomeHtml();
      list.querySelectorAll("[data-suggest]").forEach((btn) => {
        btn.addEventListener("click", () => {
          input.value = btn.getAttribute("data-suggest") || "";
          form.requestSubmit();
        });
      });
      return;
    }
    list.innerHTML = messages
      .map((m) => {
        if (m.role === "user") {
          return `<div class="ssph-chat-row user"><div class="ssph-chat-bubble user">${escapeHtml(m.content)}</div></div>`;
        }
        return `<div class="ssph-chat-row bot"><span class="ssph-chat-mini-avatar" aria-hidden="true">S</span><div class="ssph-chat-bubble bot">${formatReply(m.content)}</div></div>`;
      })
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  function openPanel() {
    panel.hidden = false;
    root.classList.add("is-open");
    fab.setAttribute("aria-expanded", "true");
    renderMessages();
    setTimeout(() => input.focus(), 80);
  }

  function closePanel() {
    panel.hidden = true;
    root.classList.remove("is-open");
    fab.setAttribute("aria-expanded", "false");
  }

  fab.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });
  closeBtn.addEventListener("click", closePanel);
  clearBtn?.addEventListener("click", () => {
    messages = [];
    saveHistory(messages);
    renderMessages();
    input.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    messages.push({ role: "user", content: text });
    saveHistory(messages);
    renderMessages();
    busy = true;
    sendBtn.disabled = true;
    root.classList.add("is-busy");

    const thinking = document.createElement("div");
    thinking.className = "ssph-chat-row bot ssph-chat-thinking-row";
    thinking.innerHTML = `
      <span class="ssph-chat-mini-avatar" aria-hidden="true">S</span>
      <div class="ssph-chat-bubble bot ssph-chat-thinking" aria-label="Thinking">
        <span></span><span></span><span></span>
      </div>`;
    list.appendChild(thinking);
    list.scrollTop = list.scrollHeight;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ messages }),
      });
      const data = await res.json().catch(() => ({}));
      thinking.remove();
      const reply =
        data.reply ||
        data.error ||
        "Sorry, I could not answer right now. Please use Support with your Order ID.";
      messages.push({ role: "assistant", content: reply });
      saveHistory(messages);
      setStatusLabel(sub, data);
      renderMessages();
    } catch {
      thinking.remove();
      messages.push({
        role: "assistant",
        content: "Network error. Please try again or open the Support page.",
      });
      saveHistory(messages);
      renderMessages();
    } finally {
      busy = false;
      sendBtn.disabled = false;
      root.classList.remove("is-busy");
      input.focus();
    }
  });

  fetch("/api/chat/status", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d) => setStatusLabel(sub, d))
    .catch(() => {});

  try {
    const wantChat =
      /#\/support/i.test(location.hash || "") ||
      /[?&]chat=1\b/.test(location.search || "") ||
      /[?&]chat=1\b/.test(location.hash || "");
    if (wantChat) openPanel();
  } catch {
    /* ignore */
  }

  renderMessages();
}

/** Open the help chat from other UI (e.g. support page). */
export function openChatbot() {
  const root = document.getElementById("ssphChatRoot");
  const fab = document.getElementById("ssphChatFab");
  const panel = document.getElementById("ssphChatPanel");
  if (!fab || !panel) return;
  panel.hidden = false;
  root?.classList.add("is-open");
  fab.setAttribute("aria-expanded", "true");
  document.getElementById("ssphChatInput")?.focus();
}
