"""
SubSaverPH AI chatbot via SpaceXAI (xAI API).

Store-only: products, checkout, delivery, rules, refunds, FAQ.
Does NOT answer general off-topic questions.

Env:
  XAI_API_KEY   — required for full AI store replies
  XAI_MODEL     — optional, default grok-4.5
  XAI_BASE_URL  — optional, default https://api.x.ai/v1
  XAI_CHAT_TOOLS — optional, default 0 (tools off; store FAQ does not need web search)
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


DEFAULT_MODEL = "grok-4.5"
DEFAULT_BASE = "https://api.x.ai/v1"


def chat_configured() -> bool:
    return bool((os.environ.get("XAI_API_KEY") or "").strip())


def _model() -> str:
    return (os.environ.get("XAI_MODEL") or DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _base_url() -> str:
    return (os.environ.get("XAI_BASE_URL") or DEFAULT_BASE).strip().rstrip("/")


def _tools_enabled() -> bool:
    # Default OFF — store FAQ bot should not browse the open web
    v = (os.environ.get("XAI_CHAT_TOOLS") or "0").strip().lower()
    return v in ("1", "true", "yes", "on")


def build_catalog_brief(deals: list[dict]) -> str:
    lines = []
    for d in deals or []:
        if not d.get("active", True):
            continue
        price = d.get("price")
        base = (d.get("priceBase") or "PHP").upper()
        stock = d.get("stockLeft")
        stock_note = ""
        if stock is not None:
            stock_note = f", stockLeft={stock}"
        elif "SOLD" in str(d.get("stock") or "").upper():
            stock_note = ", sold out"
        lines.append(
            f"- {d.get('name')} (id={d.get('id')}, brand={d.get('brand')}, "
            f"category={d.get('category')}, {price} {base}, "
            f"duration={d.get('duration') or d.get('period')}{stock_note})"
        )
        if d.get("description"):
            lines.append(f"  About: {str(d.get('description'))[:220]}")
        feats = d.get("includes") or []
        if isinstance(feats, list) and feats:
            lines.append("  Features: " + "; ".join(str(x) for x in feats[:8]))
        notes = (d.get("importantNotes") or "").strip()
        howto = (d.get("howToRedeem") or "").strip()
        if notes:
            lines.append(f"  Rules: {notes[:500]}")
        if howto:
            lines.append(f"  Instructions: {howto[:500]}")
    return "\n".join(lines) if lines else "(no live products listed)"


def system_prompt(deals: list[dict], settings: dict | None = None) -> str:
    settings = settings or {}
    site = settings.get("siteName") or "SubSaverPH"
    support = settings.get("supportEmail") or "support@subsaverph.com"
    tagline = settings.get("tagline") or "Premium plans. Lower cost."
    about = (settings.get("aboutBody") or settings.get("footerCompanyBlurb") or "")[:900]
    terms_snip = (settings.get("checkoutRules") or settings.get("termsBody") or "")[:700]
    faq_extra = (settings.get("chatbotFaq") or settings.get("supportFaq") or "")[:1200]
    catalog = build_catalog_brief(deals)

    return f"""You are the official store support chatbot for {site} ({tagline}).

## SCOPE — STORE & FAQ ONLY
You ONLY answer questions about this store and shopping FAQ, including:
- Products, prices, stock, features, brands (SuperGrok, Canva, CapCut, Netflix, YouTube, etc.)
- How checkout / payment works (card, GCash, Maya, GrabPay, ShopeePay, PayPal, crypto when shown on site)
- What happens after payment (delivery package: login credentials, features, instructions, rules)
- Product rules (especially CapCut logout / device limits)
- Refunds, support, Order ID, contact email
- How to use the website (cart, currency, support form)
- About the company / terms / privacy at a high level from the facts below

## OUT OF SCOPE — DO NOT ANSWER
If the user asks about anything unrelated to SubSaverPH shopping (homework, coding projects, news, politics, medical/legal advice, random trivia, other brands not sold here, etc.):
1. Politely refuse to answer that topic.
2. Say you only help with SubSaverPH store and FAQ.
3. Offer 2–3 example store questions they can ask instead.
4. For human help, point to Support (#/support) or {support} with Order ID when relevant.

Never role-play as a general assistant. Never answer off-topic even if the user insists.

## Style
- Clear, friendly, concise (short paragraphs or bullets).
- Match the user's language (English, Filipino/Taglish, etc.).
- Prefer the catalog and policy facts below over guesses.

## Hard rules
- Never invent login credentials or claim payment succeeded without the customer already having checkout confirmation / Order ID.
- Never invent live order status — ask for Order ID and send them to Support if they need human follow-up.
- Refunds: generally non-refundable once credentials are delivered, except defective or not delivered.
- CapCut: Do NOT log out. Max 2 devices. 3rd device/session can lose access (not refundable). Login on CapCut mobile first; for PC scan QR after mobile login.
- Not affiliated with xAI, Canva, CapCut, Netflix, YouTube, or Google.
- Human support: {support} · Support page #/support · https://subsaverph.com/

## About {site}
{about or "(see website)"}

## Checkout / policy notes
{terms_snip or "Digital goods limited refunds; contact support with Order ID."}

## Extra FAQ (admin)
{faq_extra or "(none)"}

## Live catalog
{catalog}
"""


_STORE_KEYWORDS = (
    "capcut",
    "cap cut",
    "supergrok",
    "grok",
    "canva",
    "netflix",
    "youtube",
    "premium",
    "refund",
    "money back",
    "chargeback",
    "pay",
    "gcash",
    "maya",
    "checkout",
    "card",
    "paypal",
    "crypto",
    "order",
    "login",
    "password",
    "credential",
    "code",
    "deliver",
    "price",
    "product",
    "deal",
    "stock",
    "cart",
    "support",
    "subsaver",
    "account",
    "device",
    "logout",
    "log out",
    "instruction",
    "rule",
    "faq",
    "how to",
    "paano",
    "bili",
    "bayad",
    "order id",
)


def _looks_like_store_question(user_text: str) -> bool:
    t = (user_text or "").lower()
    if not t.strip():
        return False
    return any(k in t for k in _STORE_KEYWORDS)


def _offtopic_reply() -> str:
    return (
        "I only answer **SubSaverPH store and FAQ** questions (products, prices, checkout, delivery, "
        "account rules, refunds, support).\n\n"
        "Try asking something like:\n"
        "• What are the CapCut account rules?\n"
        "• How do I get my login after payment?\n"
        "• How do refunds work?\n"
        "• What products do you sell?\n\n"
        "For other topics I can’t help — for order issues, open **Support** with your Order ID."
    )


def _fallback_reply(user_text: str) -> str:
    t = (user_text or "").lower()
    if not _looks_like_store_question(t):
        return _offtopic_reply()
    if any(k in t for k in ("capcut", "cap cut")):
        return (
            "For CapCut accounts:\n"
            "• Log in on the **CapCut mobile app** with the credentials you received after payment.\n"
            "• For PC: stay logged in on mobile, open CapCut on PC, and **scan the QR code** with the mobile app.\n"
            "• **Do not log out** — you may not get back into the account.\n"
            "• **Max 2 devices**. A 3rd login can remove access and is **not refundable**.\n\n"
            "Need more help? Open Support and include your Order ID."
        )
    if any(k in t for k in ("refund", "money back", "chargeback")):
        return (
            "Refunds: digital access is generally **non-refundable** once login details are delivered, "
            "except when the product is **defective** or **not delivered**. "
            "Contact Support with your **Order ID**. Logging out or using extra devices (e.g. CapCut 3rd device) is not refundable."
        )
    if any(k in t for k in ("pay", "gcash", "maya", "checkout", "card", "paypal", "crypto")):
        return (
            "Checkout accepts the payment methods shown on the site (card / e-wallets / PayPal / crypto when enabled). "
            "After payment succeeds, your **login credentials**, features, instructions, and rules appear on the success page "
            "and are emailed when email is configured."
        )
    if any(k in t for k in ("order", "login", "password", "credential", "code", "deliver")):
        return (
            "After a successful payment you receive an **access package**: username/password (or code), "
            "features, how-to-use instructions, and product rules. "
            "If something is missing, go to Support with your Order ID: support@subsaverph.com"
        )
    if any(k in t for k in ("supergrok", "grok", "canva", "netflix", "youtube", "price", "product", "deal", "stock")):
        return (
            "Browse **Deals** for current prices and stock. Each product page lists features and fine print. "
            "After you buy, delivery includes login + instructions + rules.\n\n"
            "Ask about a specific product (e.g. CapCut, SuperGrok) for more detail."
        )
    return (
        "I’m the SubSaverPH store helper (FAQ only).\n\n"
        "Ask about products, CapCut rules, payments, delivery after payment, or refunds — "
        "or open **Support** with your Order ID."
    )


def _extract_responses_text(data: dict) -> str:
    """Parse xAI / OpenAI-style Responses API JSON into plain text."""
    if not isinstance(data, dict):
        return ""
    # Common convenience field
    if data.get("output_text"):
        return str(data.get("output_text")).strip()
    chunks: list[str] = []
    for item in data.get("output") or []:
        if not isinstance(item, dict):
            continue
        itype = item.get("type")
        if itype in ("message", "output_message"):
            for part in item.get("content") or []:
                if not isinstance(part, dict):
                    continue
                ptype = part.get("type") or ""
                if ptype in ("output_text", "text"):
                    chunks.append(str(part.get("text") or part.get("output_text") or ""))
                elif "text" in part:
                    chunks.append(str(part.get("text") or ""))
        elif itype == "output_text" and item.get("text"):
            chunks.append(str(item.get("text")))
    return "\n".join(c for c in chunks if c).strip()


def _http_json(url: str, payload: dict, timeout: int = 90) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {(os.environ.get('XAI_API_KEY') or '').strip()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SubSaverPH-Chatbot/1.1",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _call_responses_api(
    messages: list[dict[str, str]],
    *,
    deals: list[dict],
    settings: dict,
) -> dict[str, Any]:
    """Prefer Responses API + built-in tools so Grok can answer anything (incl. web)."""
    payload: dict[str, Any] = {
        "model": _model(),
        "instructions": system_prompt(deals, settings),
        "input": messages,
        "temperature": 0.35,
        "max_output_tokens": 1200,
    }
    if _tools_enabled():
        payload["tools"] = [
            {"type": "web_search"},
            {"type": "code_interpreter"},
        ]
    data = _http_json(f"{_base_url()}/responses", payload, timeout=120)
    reply = _extract_responses_text(data)
    if not reply:
        raise ValueError(f"Empty responses output: {str(data)[:240]}")
    return {
        "ok": True,
        "reply": reply,
        "model": data.get("model") or _model(),
        "provider": "xai",
        "mode": "responses+tools" if _tools_enabled() else "responses",
    }


def _call_chat_completions(
    messages: list[dict[str, str]],
    *,
    deals: list[dict],
    settings: dict,
) -> dict[str, Any]:
    payload = {
        "model": _model(),
        "messages": [
            {"role": "system", "content": system_prompt(deals, settings)},
            *messages,
        ],
        "temperature": 0.35,
        "max_tokens": 1200,
    }
    data = _http_json(f"{_base_url()}/chat/completions", payload, timeout=90)
    reply = data["choices"][0]["message"]["content"]
    return {
        "ok": True,
        "reply": str(reply or "").strip(),
        "model": data.get("model") or _model(),
        "provider": "xai",
        "mode": "chat.completions",
    }


def call_xai_chat(
    messages: list[dict[str, str]],
    *,
    deals: list[dict] | None = None,
    settings: dict | None = None,
) -> dict[str, Any]:
    """
    messages: list of {role: user|assistant, content: str} (no system — we inject it).
    Returns { ok, reply, model?, provider, detail? }
    """
    clean: list[dict[str, str]] = []
    for m in messages or []:
        role = (m.get("role") or "").strip().lower()
        content = str(m.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        clean.append({"role": role, "content": content[:8000]})
    if not clean:
        return {"ok": False, "error": "Message required", "provider": None}

    # Keep a longer conversation window
    clean = clean[-24:]
    last_user = next((m["content"] for m in reversed(clean) if m["role"] == "user"), "")
    deals = deals or []
    settings = settings or {}

    if not chat_configured():
        return {
            "ok": True,
            "reply": _fallback_reply(last_user),
            "provider": "fallback",
            "model": None,
            "detail": "XAI_API_KEY not set — limited tips only. Set key for answers to all questions.",
        }

    errors: list[str] = []

    # 1) Responses API + tools (best for "answer anything")
    try:
        result = _call_responses_api(clean, deals=deals, settings=settings)
        result["reply"] = re.sub(r"\s+\n", "\n", result["reply"]).strip()
        return result
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:400]
        errors.append(f"responses HTTP {e.code}: {err_body}")
    except Exception as e:
        errors.append(f"responses: {e}")

    # 2) Classic chat completions fallback
    try:
        result = _call_chat_completions(clean, deals=deals, settings=settings)
        result["reply"] = re.sub(r"\s+\n", "\n", result["reply"]).strip()
        result["detail"] = "Fell back to chat.completions (" + "; ".join(errors)[:200] + ")"
        return result
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:400]
        errors.append(f"chat HTTP {e.code}: {err_body}")
    except Exception as e:
        errors.append(f"chat: {e}")

    return {
        "ok": False,
        "error": "AI provider unavailable",
        "detail": " | ".join(errors)[:500],
        "provider": "xai",
        "reply": _fallback_reply(last_user)
        + "\n\n_(Full AI is temporarily unavailable. Please try again or use Support.)_",
    }
