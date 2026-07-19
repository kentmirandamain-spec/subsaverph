"""
SubSaverPH AI chatbot via SpaceXAI (xAI API).

Answers store questions AND general knowledge (with optional web search).

Env:
  XAI_API_KEY   — required for full AI (answers any question)
  XAI_MODEL     — optional, default grok-4.5
  XAI_BASE_URL  — optional, default https://api.x.ai/v1
  XAI_CHAT_TOOLS — optional, default 1 (web_search + code_interpreter). Set 0 to disable.
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
    v = (os.environ.get("XAI_CHAT_TOOLS") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


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
    catalog = build_catalog_brief(deals)

    return f"""You are a highly capable AI assistant for {site} ({tagline}).

You can and SHOULD answer ALL kinds of questions:
- Store questions: products, prices, checkout, GCash/Maya/card, delivery, logins, CapCut rules, refunds, Order IDs
- General knowledge: tech, how-to, definitions, math, writing help, comparisons, troubleshooting, etc.
- Current events / facts when you have tools (web search) — use them when needed

Style:
- Be helpful, accurate, and clear. Use short paragraphs or bullets when useful.
- Match the user's language (English, Filipino/Taglish, etc.).
- Do not refuse ordinary questions. Only refuse illegal/harmful requests.

SubSaverPH store facts (authoritative for shop topics):
- Digital prepaid access codes / shared logins for SuperGrok, Canva, CapCut, Netflix, YouTube Premium, etc.
- After successful payment, customers receive an access package: login credentials, features, instructions, and rules (success page + email when configured).
- Never invent login credentials or claim an order was paid unless the customer already has an Order ID from checkout.
- Never invent live order status from thin air — if they need status lookup, ask for Order ID and send them to Support.
- Refunds: generally non-refundable once credentials are delivered, except defective or not delivered. CapCut: logout or 3rd device can lose access and is NOT refundable.
- CapCut rules: Do NOT log out. Max 2 devices. Login on CapCut mobile app first; for PC scan QR from PC after mobile login.
- Not affiliated with xAI, Canva, CapCut, Netflix, YouTube, or Google.
- Human support: {support} and website Support page (#/support) with Order ID.
- Website: https://subsaverph.com/

About {site}:
{about or "(see website)"}

Checkout / policy notes:
{terms_snip or "Digital goods limited refunds; contact support with Order ID."}

Live catalog snapshot:
{catalog}

When a question is unrelated to the store, still answer fully as a general assistant. When it is about the store, prefer the catalog and policy facts above.
"""


def _fallback_reply(user_text: str) -> str:
    t = (user_text or "").lower()
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
    if any(k in t for k in ("supergrok", "grok", "canva", "netflix", "youtube", "price", "product", "deal")):
        return (
            "Browse products on the **Deals** page for current prices and stock. "
            "Each product page lists features and fine print. After you buy, delivery includes login + instructions + rules.\n\n"
            "For full AI answers to any topic, the store owner must set **XAI_API_KEY** on the server "
            "(SpaceXAI / console.x.ai)."
        )
    return (
        "I can help with **any** SubSaverPH shop question — and with full AI enabled, almost any other topic too.\n\n"
        "Right now the server is in **limited tip mode** (no live Grok key). "
        "Ask about CapCut rules, refunds, payments, or delivery, or open **Support** with your Order ID.\n\n"
        "To unlock answers to all questions, set `XAI_API_KEY` from https://console.x.ai on Render."
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
        "temperature": 0.65,
        "max_output_tokens": 2048,
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
        "temperature": 0.65,
        "max_tokens": 2048,
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
