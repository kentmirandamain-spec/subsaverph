/**
 * SubSaverPH floating AI support chat (SpaceXAI backend via /api/chat).
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

export function mountChatbot() {
  if (document.getElementById("ssphChatRoot")) return;

  const root = document.createElement("div");
  root.id = "ssphChatRoot";
  root.innerHTML = `
    <button type="button" class="ssph-chat-fab" id="ssphChatFab" aria-label="Open customer help chat">
      <span class="ssph-chat-fab-icon" aria-hidden="true">💬</span>
      <span class="ssph-chat-fab-label">Help</span>
    </button>
    <section class="ssph-chat-panel" id="ssphChatPanel" hidden aria-label="Customer help chat">
      <header class="ssph-chat-head">
        <div>
          <strong>Customer Help</strong>
          <p class="ssph-chat-sub" id="ssphChatSub">Products · payment · delivery · rules · refunds</p>
        </div>
        <button type="button" class="ssph-chat-close" id="ssphChatClose" aria-label="Close chat">✕</button>
      </header>
      <div class="ssph-chat-messages" id="ssphChatMessages" role="log" aria-live="polite"></div>
      <form class="ssph-chat-form" id="ssphChatForm">
        <input type="text" id="ssphChatInput" name="message" autocomplete="off" maxlength="2000"
          placeholder="Ask about products, payment, login…" required />
        <button type="submit" class="btn solid sm" id="ssphChatSend">Send</button>
      </form>
      <p class="ssph-chat-foot">Store assistant · <a href="#/support">Human support</a></p>
    </section>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector("#ssphChatFab");
  const panel = root.querySelector("#ssphChatPanel");
  const closeBtn = root.querySelector("#ssphChatClose");
  const form = root.querySelector("#ssphChatForm");
  const input = root.querySelector("#ssphChatInput");
  const list = root.querySelector("#ssphChatMessages");
  const sub = root.querySelector("#ssphChatSub");
  const sendBtn = root.querySelector("#ssphChatSend");

  let messages = loadHistory();
  let busy = false;

  function renderMessages() {
    if (!messages.length) {
      list.innerHTML = `
        <div class="ssph-chat-bubble bot">
          Hi! I’m here to help with your SubSaverPH order and shopping questions — products, prices, payment, login after pay, CapCut rules, and refunds.
        </div>
        <div class="ssph-chat-suggestions">
          <button type="button" data-suggest="Hi, I need help choosing a product">Need help</button>
          <button type="button" data-suggest="What are CapCut account rules?">CapCut rules</button>
          <button type="button" data-suggest="How do I receive my login after payment?">After payment</button>
          <button type="button" data-suggest="How do refunds work?">Refunds</button>
          <button type="button" data-suggest="What products do you sell and roughly how much?">Products</button>
          <button type="button" data-suggest="What payment methods do you accept?">Payments</button>
        </div>`;
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
        const cls = m.role === "user" ? "user" : "bot";
        const body = m.role === "user" ? escapeHtml(m.content) : formatReply(m.content);
        return `<div class="ssph-chat-bubble ${cls}">${body}</div>`;
      })
      .join("");
    list.scrollTop = list.scrollHeight;
  }

  function openPanel() {
    panel.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    renderMessages();
    setTimeout(() => input.focus(), 50);
  }

  function closePanel() {
    panel.hidden = true;
    fab.setAttribute("aria-expanded", "false");
  }

  fab.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });
  closeBtn.addEventListener("click", closePanel);

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
    const thinking = document.createElement("div");
    thinking.className = "ssph-chat-bubble bot ssph-chat-thinking";
    thinking.textContent = "Thinking…";
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
      if (data.provider === "assistant" || data.provider === "fallback") {
        sub.textContent = "Customer assistant · products, payment, delivery, rules";
      } else if (data.provider === "xai" || data.provider === "spacexai") {
        sub.textContent = "Customer assistant · Powered by SpaceXAI (Grok)";
      }
      renderMessages();
    } catch (err) {
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
      input.focus();
    }
  });

  // Status badge
  fetch("/api/chat/status", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d) => {
      if (d.aiConfigured) sub.textContent = "Customer assistant · Powered by SpaceXAI (Grok)";
      else sub.textContent = "Customer assistant · products, payment, delivery, rules";
    })
    .catch(() => {});

  // Open help when landing on support or ?chat=1
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
  const fab = document.getElementById("ssphChatFab");
  const panel = document.getElementById("ssphChatPanel");
  if (!fab || !panel) return;
  panel.hidden = false;
  fab.setAttribute("aria-expanded", "true");
  document.getElementById("ssphChatInput")?.focus();
}
