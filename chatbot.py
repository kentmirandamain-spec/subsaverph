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

    return f"""You are the official customer support assistant for {site} ({tagline}).

## Mission
Help customers finish shopping and solve store problems. Be proactive, clear, and kind.
Answer ALL customer questions about this store, products, payment, delivery, rules, refunds, and FAQ.

## You help with (always try to answer)
- Product recommendations, prices, stock, features, duration
- Brands: SuperGrok, Canva, CapCut, Netflix, YouTube Premium, etc.
- Checkout & payment (card, GCash, Maya, GrabPay, ShopeePay, PayPal, crypto when shown)
- After payment: login credentials, instructions, features, rules on success page/email
- Account / product rules (especially CapCut)
- Refunds, Order ID, how to contact support
- Using the website: cart, currency, deals, support form
- About company / terms / privacy at a high level

## Out of scope
Only refuse topics unrelated to SubSaverPH shopping (homework, coding unrelated to the store, news, medical/legal advice). When refusing, still offer 2 store questions they can ask and point to Support ({support}) for order issues.

## Style
- Friendly customer service tone; short paragraphs or bullets
- Match language (English, Filipino/Taglish)
- Use catalog facts below; if stockLeft is 0 say sold out and suggest similar live products
- End with a helpful next step when useful (e.g. open Deals, Support with Order ID)

## Hard rules
- Never invent login credentials or claim payment succeeded without customer already having Order ID / success page
- Never invent live order status — ask Order ID → Support page or {support}
- Refunds: generally non-refundable once credentials delivered, except defective or not delivered
- CapCut: Do NOT log out. Max 2 devices. 3rd can lose access (not refundable). Mobile login first; PC via QR after mobile login
- Not affiliated with xAI, Canva, CapCut, Netflix, YouTube, Google
- Human support: {support} · /support · https://subsaverph.com/

## About {site}
{about or "(see website)"}

## Checkout / policy
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
    "super grok",
    "grok",
    "canva",
    "netflix",
    "youtube",
    "yt premium",
    "premium",
    "refund",
    "money back",
    "chargeback",
    "pay",
    "gcash",
    "g-cash",
    "maya",
    "paymaya",
    "checkout",
    "card",
    "paypal",
    "crypto",
    "grab",
    "shopee",
    "order",
    "login",
    "password",
    "credential",
    "code",
    "deliver",
    "price",
    "magkano",
    "product",
    "deal",
    "stock",
    "sold",
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
    "help",
    "how to",
    "paano",
    "bili",
    "bayad",
    "order id",
    "hello",
    "hi ",
    "hey",
    "good day",
    "kumusta",
    "available",
    "buy",
    "purchase",
    "subscription",
    "access",
    "email",
    "contact",
)


def _is_clearly_offtopic(user_text: str) -> bool:
    t = (user_text or "").lower()
    # Programming / homework / general AI tasks (not store "access code")
    if re.search(
        r"\b(python|javascript|java|algorithm|homework|essay|poem|recipe|"
        r"write (me )?(a |an )?(function|script|code|program)|sort(ing)? algorithm|"
        r"leetcode|compile|debug this)\b",
        t,
    ):
        return True
    return False


def _looks_like_store_question(user_text: str, deals: list[dict] | None = None) -> bool:
    t = (user_text or "").lower().strip()
    if not t:
        return False
    if _is_clearly_offtopic(t):
        return False
    if any(k in t for k in _STORE_KEYWORDS):
        return True
    # Match product names from catalog
    for d in deals or []:
        name = str(d.get("name") or "").lower()
        brand = str(d.get("brand") or "").lower()
        pid = str(d.get("id") or "").lower()
        if name and name in t:
            return True
        if brand and len(brand) > 2 and brand in t:
            return True
        if pid and pid.replace("-", " ") in t:
            return True
    # Short greetings
    if t in ("hi", "hello", "hey", "help", "help me", "assist", "assistance"):
        return True
    return False


def _offtopic_reply(support: str = "support@subsaverph.com") -> str:
    return (
        "I’m here to help with **SubSaverPH customer questions** — products, prices, checkout, "
        "delivery after payment, account rules, and refunds.\n\n"
        "Try asking:\n"
        "• What CapCut plans do you have and what are the rules?\n"
        "• How do I get my login after I pay?\n"
        "• How do refunds work?\n"
        "• Is SuperGrok available and how much is it?\n\n"
        f"For a human agent, open **Support** or email {support} with your **Order ID**."
    )


def _match_products(user_text: str, deals: list[dict]) -> list[dict]:
    t = (user_text or "").lower()
    hits = []
    for d in deals or []:
        if not d.get("active", True):
            continue
        blob = " ".join(
            str(d.get(k) or "")
            for k in ("id", "name", "brand", "category", "tagline", "description")
        ).lower()
        score = 0
        for token in re.findall(r"[a-z0-9+]{3,}", t):
            if token in blob:
                score += 2 if token in str(d.get("name") or "").lower() else 1
        if "super grok" in t or "supergrok" in t or re.search(r"\bgrok\b", t):
            if "grok" in blob or "xai" in blob:
                score += 5
        if "capcut" in t or "cap cut" in t:
            if "capcut" in blob:
                score += 5
        if "canva" in t and "canva" in blob:
            score += 5
        if "netflix" in t and "netflix" in blob:
            score += 5
        if ("youtube" in t or "yt premium" in t) and "youtube" in blob:
            score += 5
        if score:
            hits.append((score, d))
    hits.sort(key=lambda x: -x[0])
    return [d for _, d in hits[:5]]


def _format_product_line(d: dict) -> str:
    price = d.get("price")
    base = (d.get("priceBase") or "PHP").upper()
    dur = d.get("duration") or d.get("period") or ""
    left = d.get("stockLeft")
    if left is not None:
        stock = "in stock" if int(left or 0) > 0 else "sold out"
    else:
        stock = str(d.get("stock") or "see site")
    return f"• **{d.get('name')}** — {price} {base}" + (f" · {dur}" if dur else "") + f" · {stock}"


def _customer_assist_reply(
    user_text: str,
    *,
    deals: list[dict] | None = None,
    settings: dict | None = None,
) -> str:
    """Local FAQ / catalog assistant — works without XAI_API_KEY."""
    deals = deals or []
    settings = settings or {}
    support = settings.get("supportEmail") or "support@subsaverph.com"
    t = (user_text or "").lower().strip()

    if not _looks_like_store_question(t, deals):
        return _offtopic_reply(support)

    if t in ("hi", "hello", "hey", "help", "help me", "assist", "assistance", "kumusta") or t.startswith(
        ("hi ", "hello ", "hey ")
    ):
        live = [d for d in deals if d.get("active", True)][:6]
        lines = [
            "Hi! I’m the **SubSaverPH customer assistant**. I can help with products, payment, delivery, rules, and refunds.",
            "",
            "Popular questions:",
            "• CapCut rules after purchase",
            "• How login delivery works after payment",
            "• Refund policy",
            "• What’s in stock and how much",
            "",
        ]
        if live:
            lines.append("Some plans on the site:")
            lines.extend(_format_product_line(d) for d in live)
            lines.append("")
        lines.append(f"Ask me anything about the store — or contact **{support}** with your Order ID for human help.")
        return "\n".join(lines)

    # CapCut — prices vs rules
    if "capcut" in t or "cap cut" in t:
        matched = _match_products(t, deals) or [
            d
            for d in deals
            if d.get("active", True) and "capcut" in str(d.get("brand") or "").lower() + str(d.get("id") or "").lower()
        ]
        wants_price = any(
            k in t for k in ("price", "magkano", "how much", "cost", "stock", "available", "buy", "plan")
        )
        wants_rules = any(
            k in t for k in ("rule", "logout", "log out", "device", "instruction", "how to use", "qr", "pc")
        )
        parts: list[str] = []
        if wants_price or not wants_rules:
            parts.append("**CapCut plans**")
            if matched:
                parts.extend(_format_product_line(d) for d in matched)
            else:
                parts.append("Open **Deals** and filter CapCut for current prices.")
            parts.append("")
        if wants_rules or not wants_price:
            parts.extend(
                [
                    "**CapCut rules & how to use (after payment)**",
                    "1. Log in on the **CapCut mobile app** with the credentials from your delivery package.",
                    "2. For **PC**: stay logged in on mobile → open CapCut on PC → **scan the QR** with mobile.",
                    "3. **Do not log out** — you may lose access permanently.",
                    "4. **Max 2 devices** — a 3rd login can remove access (**not refundable**).",
                    "5. Don’t change password, email, or billing.",
                    "",
                ]
            )
        parts.append(f"Need help after payment? Support with Order ID → {support}")
        return "\n".join(parts)

    if any(k in t for k in ("refund", "money back", "chargeback", "return")):
        return (
            "**Refunds**\n"
            "• Digital access is generally **non-refundable** once login details are delivered.\n"
            "• Exceptions: product is **defective** or **not delivered**.\n"
            "• CapCut: logout or using more than 2 devices is **not** a refund reason.\n\n"
            f"Contact Support with your **Order ID**: {support} or the Support page on the site."
        )

    if any(
        k in t
        for k in (
            "pay",
            "gcash",
            "g-cash",
            "maya",
            "paymaya",
            "checkout",
            "card",
            "paypal",
            "crypto",
            "grab",
            "shopee",
            "bayad",
        )
    ):
        return (
            "**Payment & checkout**\n"
            "1. Add a plan to your **cart** from Deals.\n"
            "2. Open **Checkout** and enter your email.\n"
            "3. Choose a payment method shown on the site (card, GCash, Maya, GrabPay, ShopeePay, PayPal, crypto — when enabled).\n"
            "4. Complete payment. On success you get your **access package** on the page (and by email when configured).\n\n"
            "Tip: keep the success page open until you copy username/password.\n"
            f"Payment charged but no code? Email {support} with Order ID / payment proof."
        )

    if any(
        k in t
        for k in (
            "login",
            "password",
            "credential",
            "deliver",
            "code",
            "after payment",
            "after pay",
            "success",
            "email",
        )
    ):
        return (
            "**After payment — what you receive**\n"
            "On the **success page** (and email when configured) you get an access package:\n"
            "• Login **username / password** (or access code)\n"
            "• **Features** included\n"
            "• **Instructions** how to use\n"
            "• **Rules** you must follow\n\n"
            "Save credentials immediately. Follow product rules (especially CapCut: no logout, max 2 devices).\n"
            f"Missing login after a successful pay? Contact **{support}** with your **Order ID**."
        )

    # Product catalog answers
    matched = _match_products(t, deals)
    if matched or any(
        k in t
        for k in (
            "product",
            "deal",
            "price",
            "magkano",
            "stock",
            "available",
            "sell",
            "subscription",
            "buy",
            "bili",
            "list",
        )
    ):
        show = matched or [d for d in deals if d.get("active", True)][:8]
        if not show:
            return (
                "I don’t see live products in the catalog right now. Please open **Deals** on the site "
                f"or email {support}."
            )
        lines = ["**Here’s what I can tell you from our catalog:**", ""]
        for d in show:
            lines.append(_format_product_line(d))
            feats = d.get("includes") or []
            if isinstance(feats, list) and feats:
                lines.append("  Features: " + ", ".join(str(x) for x in feats[:5]))
            howto = (d.get("howToRedeem") or "").strip()
            if howto and matched:
                first = howto.splitlines()[0].strip()
                if first:
                    lines.append(f"  Start: {first}")
            lines.append("")
        lines.append("Open a product page for full details, then **Add to cart** → **Checkout**.")
        lines.append(f"Need help choosing? Tell me your budget or which app (CapCut, SuperGrok, Canva…).")
        return "\n".join(lines)

    if any(k in t for k in ("support", "contact", "human", "agent", "email")):
        return (
            "**Human support**\n"
            f"• Email: **{support}** (include Order ID)\n"
            "• Website: open **Support** and send a message\n"
            "• Chat here for store FAQ anytime\n\n"
            "Order issues are fastest with Order ID + what went wrong (login failed, no code, wrong product)."
        )

    return (
        "I can help with **SubSaverPH customer questions**:\n"
        "• Products & prices\n"
        "• Payment / GCash / checkout\n"
        "• Login delivery after payment\n"
        "• CapCut & other product rules\n"
        "• Refunds & Order ID support\n\n"
        f"Ask me one of those — or email **{support}** for a human agent."
    )


def _fallback_reply(
    user_text: str,
    *,
    deals: list[dict] | None = None,
    settings: dict | None = None,
) -> str:
    return _customer_assist_reply(user_text, deals=deals, settings=settings)


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

    # Always-on customer assistant from catalog/FAQ (works without API key)
    local_reply = _customer_assist_reply(last_user, deals=deals, settings=settings)

    if not chat_configured():
        return {
            "ok": True,
            "reply": local_reply,
            "provider": "assistant",
            "model": None,
            "mode": "customer-faq",
            "detail": "Catalog/FAQ assistant (set XAI_API_KEY for Grok AI answers)",
        }

    errors: list[str] = []

    # 1) Chat completions first (reliable store support)
    try:
        result = _call_chat_completions(clean, deals=deals, settings=settings)
        result["reply"] = re.sub(r"\s+\n", "\n", result["reply"]).strip()
        return result
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:400]
        errors.append(f"chat HTTP {e.code}: {err_body}")
    except Exception as e:
        errors.append(f"chat: {e}")

    # 2) Responses API optional
    try:
        result = _call_responses_api(clean, deals=deals, settings=settings)
        result["reply"] = re.sub(r"\s+\n", "\n", result["reply"]).strip()
        result["detail"] = "Used responses API (" + "; ".join(errors)[:160] + ")"
        return result
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:400]
        errors.append(f"responses HTTP {e.code}: {err_body}")
    except Exception as e:
        errors.append(f"responses: {e}")

    return {
        "ok": True,
        "reply": local_reply
        + "\n\n_(AI is temporarily unavailable — answered from store FAQ. For urgent issues use Support.)_",
        "provider": "assistant",
        "mode": "customer-faq-fallback",
        "detail": " | ".join(errors)[:500],
    }
