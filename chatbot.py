"""
SubSaverPH AI support chatbot via SpaceXAI (xAI API).

Env:
  XAI_API_KEY   — required for live AI replies
  XAI_MODEL     — optional, default grok-4.5
  XAI_BASE_URL  — optional, default https://api.x.ai/v1
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
        elif str(d.get("stock") or "").upper().find("SOLD") >= 0:
            stock_note = ", sold out"
        lines.append(
            f"- {d.get('name')} (id={d.get('id')}, brand={d.get('brand')}, "
            f"{price} {base}, duration={d.get('duration') or d.get('period')}{stock_note})"
        )
        notes = (d.get("importantNotes") or "").strip()
        howto = (d.get("howToRedeem") or "").strip()
        if notes:
            lines.append(f"  Rules: {notes[:400]}")
        if howto:
            lines.append(f"  Instructions: {howto[:400]}")
    return "\n".join(lines) if lines else "(no live products listed)"


def system_prompt(deals: list[dict], settings: dict | None = None) -> str:
    settings = settings or {}
    site = settings.get("siteName") or "SubSaverPH"
    support = settings.get("supportEmail") or "support@subsaverph.com"
    catalog = build_catalog_brief(deals)

    return f"""You are the official AI support assistant for {site}, an online store in the Philippines selling discounted prepaid digital subscriptions and access codes (SuperGrok, Canva, CapCut, Netflix, YouTube Premium, etc.).

Your job:
- Help shoppers with products, pricing, checkout, delivery, and account rules.
- Be clear, friendly, and concise (prefer short paragraphs or bullets).
- Reply in the customer's language when they write in Filipino/Taglish or another language.
- Never invent order status you cannot verify. You do not have live payment databases.
- Never invent stock login credentials. Codes are only delivered after successful payment on the success page / email.
- Never claim affiliation with xAI, Canva, CapCut, Netflix, YouTube, or Google.
- For refunds: digital goods are generally non-refundable once delivered, except defective or not delivered. Ask them to use Support with Order ID.
- CapCut-specific (important): Do NOT log out — may lose access permanently. Max 2 devices; logging into a 3rd can lose access (not refundable). Login on CapCut mobile app first; for PC, scan QR from PC after mobile login.
- Payment methods may include card, GCash, Maya, GrabPay, ShopeePay, PayPal, crypto depending on server config.
- If unsure or they need a human, direct them to Support page (#/support) or email {support} with Order ID.

Live catalog snapshot:
{catalog}

Website: https://subsaverph.com/
Support: {support}
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
    if any(k in t for k in ("pay", "gcash", "maya", "checkout", "card", "paypal")):
        return (
            "Checkout accepts the payment methods shown on the site (card / e-wallets / PayPal / crypto when enabled). "
            "After payment succeeds, your **login credentials**, features, instructions, and rules appear on the success page "
            "and are emailed when email is configured."
        )
    if any(k in t for k in ("order", "login", "password", "credential", "code")):
        return (
            "After a successful payment you receive an **access package**: username/password (or code), "
            "features, how-to-use instructions, and product rules. "
            "If something is missing, go to Support with your Order ID: support@subsaverph.com"
        )
    return (
        "Hi! I'm the SubSaverPH helper. Ask about products, CapCut rules, payments, or delivery.\n\n"
        "For order-specific issues, open **Support** and include your Order ID "
        "(or email support@subsaverph.com).\n\n"
        "Note: AI chat needs `XAI_API_KEY` on the server for full answers. Fallback tips are still available."
    )


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
        clean.append({"role": role, "content": content[:4000]})
    if not clean:
        return {"ok": False, "error": "Message required", "provider": None}

    # Keep last N turns
    clean = clean[-12:]
    last_user = next((m["content"] for m in reversed(clean) if m["role"] == "user"), "")

    if not chat_configured():
        return {
            "ok": True,
            "reply": _fallback_reply(last_user),
            "provider": "fallback",
            "model": None,
            "detail": "XAI_API_KEY not set",
        }

    payload = {
        "model": _model(),
        "messages": [
            {"role": "system", "content": system_prompt(deals or [], settings)},
            *clean,
        ],
        "temperature": 0.5,
        "max_tokens": 800,
    }
    body = json.dumps(payload).encode("utf-8")
    url = f"{_base_url()}/chat/completions"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {(os.environ.get('XAI_API_KEY') or '').strip()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "SubSaverPH-Chatbot/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        return {
            "ok": False,
            "error": f"AI provider error ({e.code})",
            "detail": err_body,
            "provider": "xai",
            "reply": _fallback_reply(last_user),
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e)[:200],
            "provider": "xai",
            "reply": _fallback_reply(last_user),
        }

    try:
        reply = data["choices"][0]["message"]["content"]
    except Exception:
        return {
            "ok": False,
            "error": "Unexpected AI response shape",
            "detail": str(data)[:300],
            "provider": "xai",
            "reply": _fallback_reply(last_user),
        }

    reply = re.sub(r"\s+\n", "\n", str(reply or "").strip())
    return {
        "ok": True,
        "reply": reply,
        "model": data.get("model") or _model(),
        "provider": "xai",
    }
