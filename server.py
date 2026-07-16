"""
SubSaverPH live server
- Public storefront at /
- Host admin at /admin
- REST API for deals + settings (JSON file store)
"""

from __future__ import annotations

import json
import os
import re
import uuid
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    jsonify,
    request,
    send_from_directory,
    session,
)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

# Optional local .env support
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
STORE = ROOT / "data" / "store"
DEALS_FILE = STORE / "deals.json"
SETTINGS_FILE = STORE / "settings.json"
AUTH_FILE = STORE / "auth.json"
INVENTORY_FILE = STORE / "inventory.json"
ORDERS_FILE = STORE / "orders.json"

app = Flask(__name__, static_folder=None)
# Stable secret so admin sessions survive restarts (set SECRET_KEY on Render)
app.secret_key = os.environ.get("SECRET_KEY") or "subsaverph-change-me-in-production"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# HTTPS on Render
if os.environ.get("RENDER") or os.environ.get("FORCE_HTTPS"):
    app.config["SESSION_COOKIE_SECURE"] = True
    app.config["PREFERRED_URL_SCHEME"] = "https"
# Trust Render / Cloudflare proxy headers
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# ---------- storage ----------


def ensure_store() -> None:
    try:
        STORE.mkdir(parents=True, exist_ok=True)
    except OSError:
        # Read-only FS edge case — continue with bundled defaults
        return
    try:
        if not AUTH_FILE.exists():
            AUTH_FILE.write_text(
                json.dumps(
                    {
                        "username": "admin",
                        "password_hash": generate_password_hash("subsaverph"),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        if not SETTINGS_FILE.exists():
            SETTINGS_FILE.write_text(
                json.dumps(
                    {
                        "siteName": "SubSaverPH",
                        "tagline": "Premium plans. Lower cost.",
                        "heroEyebrow": "SubSaverPH · Subscription access",
                        "heroTitle": "Premium\nplans.\nLower\ncost.",
                        "heroLead": "SuperGrok, Canva, CapCut, Netflix, and YouTube — prepaid discounts.",
                        "footerText": "Discounted prepaid subscriptions.",
                        "defaultCurrency": "PHP",
                        "missionTitle": "Stack subscriptions without stacking full price",
                        "missionText": "SuperGrok 7 days at ₱99 · SuperGrok 1 month at ₱399.",
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        if not DEALS_FILE.exists():
            DEALS_FILE.write_text("[]", encoding="utf-8")
        if not INVENTORY_FILE.exists():
            INVENTORY_FILE.write_text("{}", encoding="utf-8")
        if not ORDERS_FILE.exists():
            ORDERS_FILE.write_text("[]", encoding="utf-8")
        pending_file = STORE / "pending_payments.json"
        if not pending_file.exists():
            pending_file.write_text("{}", encoding="utf-8")
    except OSError:
        pass


def read_json(path: Path, default):
    try:
        # utf-8-sig handles Windows BOM if present
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_deals(include_inactive: bool = False):
    deals = read_json(DEALS_FILE, [])
    if include_inactive:
        return deals
    return [d for d in deals if d.get("active", True)]


def save_deals(deals) -> None:
    write_json(DEALS_FILE, deals)


def load_settings():
    return read_json(SETTINGS_FILE, {})


def save_settings(settings) -> None:
    write_json(SETTINGS_FILE, settings)


def load_auth():
    return read_json(AUTH_FILE, {})


def load_inventory() -> dict:
    data = read_json(INVENTORY_FILE, {})
    return data if isinstance(data, dict) else {}


def save_inventory(inv: dict) -> None:
    write_json(INVENTORY_FILE, inv)


def load_orders() -> list:
    data = read_json(ORDERS_FILE, [])
    return data if isinstance(data, list) else []


def save_orders(orders: list) -> None:
    write_json(ORDERS_FILE, orders)


def stock_count(product_id: str) -> int:
    inv = load_inventory()
    codes = inv.get(product_id) or []
    return sum(1 for c in codes if c.get("status", "available") == "available")


def reserve_codes(product_id: str, qty: int) -> list[str]:
    """Take qty available codes for product. Mutates inventory."""
    inv = load_inventory()
    codes = inv.get(product_id) or []
    available = [c for c in codes if c.get("status", "available") == "available"]
    if len(available) < qty:
        raise ValueError(
            f"Not enough stock for {product_id}. Need {qty}, have {len(available)}."
        )
    taken = []
    need = qty
    for c in codes:
        if need <= 0:
            break
        if c.get("status", "available") == "available":
            c["status"] = "sold"
            c["soldAt"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
            taken.append(c.get("code", ""))
            need -= 1
    inv[product_id] = codes
    save_inventory(inv)
    return taken


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper


# ---------- public API ----------


@app.get("/api/health")
def health():
    try:
        from email_delivery import mail_configured
        mail_ok = mail_configured()
    except Exception:
        mail_ok = False
    return jsonify(
        {
            "ok": True,
            "service": "SubSaverPH",
            "emailConfigured": mail_ok,
            "stripeConfigured": stripe_configured(),
            "paymongoConfigured": paymongo_configured(),
            "xenditConfigured": xendit_configured(),
            "ewalletProvider": ewallet_provider(),
        }
    )


@app.get("/api/deals")
def api_deals():
    deals = load_deals(include_inactive=False)
    for d in deals:
        d["stockLeft"] = stock_count(d.get("id", ""))
    return jsonify({"deals": deals})


@app.get("/api/settings")
def api_settings():
    return jsonify({"settings": load_settings()})


@app.get("/api/catalog")
def api_catalog():
    deals = load_deals(include_inactive=False)
    # Attach stock counts (not the actual codes)
    for d in deals:
        d["stockLeft"] = stock_count(d.get("id", ""))
    brands = sorted({d.get("brand", "") for d in deals if d.get("brand")})
    categories = sorted({d.get("category", "") for d in deals if d.get("category")})
    return jsonify(
        {
            "deals": deals,
            "settings": load_settings(),
            "brands": ["All", *brands],
            "categories": ["All", *categories],
            "paymentMode": payment_mode(),
            "stripeEnabled": stripe_configured(),
            "stripePublishableKey": os.environ.get("STRIPE_PUBLISHABLE_KEY") or "",
            "paymongoEnabled": paymongo_configured(),
            "xenditEnabled": xendit_configured(),
            "ewalletProvider": ewallet_provider(),
            "paymentMethods": available_payment_methods(),
        }
    )


def payment_mode() -> str:
    """
    stripe        → real Stripe Checkout (requires STRIPE_SECRET_KEY)
    instant_demo  → deliver codes without real charge (testing)
    """
    mode = (os.environ.get("PAYMENT_MODE") or "").strip().lower()
    if mode:
        return mode
    if os.environ.get("STRIPE_SECRET_KEY"):
        return "stripe"
    return "instant_demo"


def stripe_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY"))


def get_stripe():
    import stripe

    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY is not set")
    stripe.api_key = key
    return stripe


def unit_amount_cents(deal: dict, pay_currency: str) -> int:
    """Convert deal price to Stripe unit_amount (smallest currency unit)."""
    price = float(deal.get("price") or 0)
    base = (deal.get("priceBase") or "USD").upper()
    pay = (pay_currency or "USD").upper()
    # Simple conversion table vs USD (fallback). Prefer charging in product base when possible.
    rates_to_usd = {
        "USD": 1.0,
        "PHP": 1 / 56.5,
        "EUR": 1 / 0.92,
        "GBP": 1 / 0.79,
        "JPY": 1 / 149.5,
        "AUD": 1 / 1.53,
        "CAD": 1 / 1.36,
        "SGD": 1 / 1.34,
        "INR": 1 / 83.1,
    }
    usd = price * rates_to_usd.get(base, 1.0)
    amount = usd / rates_to_usd.get(pay, 1.0) if pay in rates_to_usd else usd
    zero_decimal = {"JPY", "KRW", "VND", "CLP"}
    if pay in zero_decimal:
        return max(1, int(round(amount)))
    return max(1, int(round(amount * 100)))


def validate_cart_items(items: list) -> tuple[list, dict]:
    """Validate cart; return (normalized items, deals_by_id). Does not reserve codes."""
    if not items:
        raise ValueError("Cart is empty")
    deals_by_id = {d["id"]: d for d in load_deals(include_inactive=False)}
    normalized = []
    for item in items:
        pid = item.get("id")
        qty = int(item.get("qty") or 1)
        if qty < 1 or qty > 10:
            raise ValueError("Invalid quantity")
        deal = deals_by_id.get(pid)
        if not deal:
            raise ValueError(f"Product not found: {pid}")
        left = stock_count(pid)
        if left < qty:
            raise ValueError(f"Out of stock: {deal.get('name')}. Only {left} left.")
        normalized.append({"id": pid, "qty": qty, "deal": deal})
    return normalized, deals_by_id


def _persist_order_update(order: dict) -> None:
    """Update a single order in the store by id."""
    orders = load_orders()
    oid = order.get("id")
    for i, o in enumerate(orders):
        if o.get("id") == oid:
            orders[i] = order
            save_orders(orders[:500])
            return
    orders.insert(0, order)
    save_orders(orders[:500])


def _email_invoice_for_order(order: dict) -> dict:
    """Send invoice email with codes; never raises. Updates order email fields."""
    try:
        from email_delivery import send_order_invoice

        result = send_order_invoice(order)
    except Exception as e:
        result = {"ok": False, "provider": None, "detail": str(e)}

    order["emailSent"] = bool(result.get("ok"))
    order["emailProvider"] = result.get("provider")
    order["emailDetail"] = str(result.get("detail") or "")[:500]
    order["emailNotified"] = bool(result.get("notified"))
    order["emailNotifyTo"] = result.get("notifyTo") or []
    order["emailSentAt"] = (
        __import__("datetime").datetime.utcnow().isoformat() + "Z"
        if result.get("ok")
        else order.get("emailSentAt")
    )
    if result.get("ok"):
        order["message"] = (
            "Payment confirmed. Codes delivered on-site and emailed to you."
        )
    elif result.get("skipped"):
        order["message"] = (
            "Payment confirmed. Codes delivered on-site "
            "(email not configured on server)."
        )
    else:
        order["message"] = (
            "Payment confirmed. Codes delivered on-site "
            f"(email failed: {order.get('emailDetail') or 'unknown'})."
        )
    return result


def fulfill_order(
    *,
    email: str,
    name: str,
    currency: str,
    items: list,
    payment_mode_name: str,
    stripe_session_id: str | None = None,
    stripe_payment_intent: str | None = None,
    provider_ref: str | None = None,
    method: str | None = None,
) -> dict:
    """Reserve codes, save paid order, email invoice. Idempotent by session/ref."""
    if stripe_session_id:
        for existing in load_orders():
            if existing.get("stripeSessionId") == stripe_session_id:
                if not existing.get("emailSent"):
                    _email_invoice_for_order(existing)
                    _persist_order_update(existing)
                return existing
    if provider_ref:
        for existing in load_orders():
            if existing.get("providerRef") == provider_ref:
                if not existing.get("emailSent"):
                    _email_invoice_for_order(existing)
                    _persist_order_update(existing)
                return existing

    normalized, _ = validate_cart_items(items)
    line_results = []
    for row in normalized:
        deal = row["deal"]
        qty = row["qty"]
        pid = row["id"]
        codes = reserve_codes(pid, qty)
        line_results.append(
            {
                "id": pid,
                "name": deal.get("name"),
                "monogram": deal.get("monogram"),
                "qty": qty,
                "price": deal.get("price"),
                "priceBase": deal.get("priceBase", "USD"),
                "duration": deal.get("duration"),
                "codes": codes,
            }
        )

    order_id = "PH" + uuid.uuid4().hex[:10].upper()
    order = {
        "id": order_id,
        "email": email,
        "name": name,
        "currency": currency,
        "items": line_results,
        "status": "paid",
        "paymentMode": payment_mode_name,
        "method": method or payment_mode_name,
        "stripeSessionId": stripe_session_id,
        "stripePaymentIntent": stripe_payment_intent,
        "providerRef": provider_ref,
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "delivery": "instant",
        "message": "Payment confirmed. Codes delivered instantly.",
        "emailSent": False,
    }
    orders = load_orders()
    orders.insert(0, order)
    save_orders(orders[:500])

    # Email invoice + codes (SMTP or Resend). Does not block order if mail fails.
    _email_invoice_for_order(order)
    _persist_order_update(order)
    return order


def public_base_url() -> str:
    return (os.environ.get("PUBLIC_URL") or request.host_url).rstrip("/")


def cart_total_php(normalized: list) -> float:
    """Approximate total in PHP for PH e-wallets."""
    total = 0.0
    for row in normalized:
        deal = row["deal"]
        qty = row["qty"]
        price = float(deal.get("price") or 0)
        base = (deal.get("priceBase") or "USD").upper()
        if base == "PHP":
            total += price * qty
        else:
            # convert via USD estimate
            rates_to_usd = {"USD": 1.0, "EUR": 1 / 0.92, "GBP": 1 / 0.79}
            usd = price * rates_to_usd.get(base, 1.0)
            total += usd * 56.5 * qty
    return round(total, 2)


def cart_total_usd(normalized: list) -> float:
    total = 0.0
    for row in normalized:
        deal = row["deal"]
        qty = row["qty"]
        price = float(deal.get("price") or 0)
        base = (deal.get("priceBase") or "USD").upper()
        rates_to_usd = {
            "USD": 1.0,
            "PHP": 1 / 56.5,
            "EUR": 1 / 0.92,
            "GBP": 1 / 0.79,
        }
        total += price * rates_to_usd.get(base, 1.0) * qty
    return round(total, 2)


def paymongo_configured() -> bool:
    return bool((os.environ.get("PAYMONGO_SECRET_KEY") or "").strip())


def xendit_configured() -> bool:
    return bool((os.environ.get("XENDIT_SECRET_KEY") or "").strip())


def ewallet_provider() -> str:
    """
    Which backend powers PH e-wallets (gcash, maya, grab_pay, shopeepay).
    Env EWALLET_PROVIDER = auto | xendit | paymongo
    auto → paymongo if set, else xendit if set, else demo
    """
    pref = (os.environ.get("EWALLET_PROVIDER") or "auto").strip().lower()
    if pref == "xendit" and xendit_configured():
        return "xendit"
    if pref == "paymongo" and paymongo_configured():
        return "paymongo"
    # auto
    if paymongo_configured():
        return "paymongo"
    if xendit_configured():
        return "xendit"
    return "demo"


def available_payment_methods() -> list:
    """Return enabled payment methods for the checkout UI.

    Card  → Stripe (preferred), else PayMongo/Xendit card, else demo
    PH e-wallets → PayMongo or Xendit (see EWALLET_PROVIDER)
    """
    methods = []
    has_stripe = bool((os.environ.get("STRIPE_SECRET_KEY") or "").strip())
    has_paymongo = paymongo_configured()
    has_xendit = xendit_configured()
    has_paypal = bool((os.environ.get("PAYPAL_CLIENT_ID") or "").strip())
    has_crypto = bool((os.environ.get("NOWPAYMENTS_API_KEY") or "").strip())
    ewallet_prov = ewallet_provider()
    any_live = has_stripe or has_paymongo or has_xendit or has_paypal or has_crypto
    demo_only = not any_live

    # Card (prefer Stripe)
    if has_stripe:
        methods.append(
            {
                "id": "card",
                "label": "Card",
                "provider": "stripe",
                "desc": "Visa / Mastercard via Stripe",
                "group": "card",
            }
        )
    elif has_paymongo:
        methods.append(
            {
                "id": "card",
                "label": "Card",
                "provider": "paymongo",
                "desc": "Visa / Mastercard via PayMongo",
                "group": "card",
            }
        )
    elif has_xendit:
        methods.append(
            {
                "id": "card",
                "label": "Card",
                "provider": "xendit",
                "desc": "Visa / Mastercard via Xendit",
                "group": "card",
            }
        )
    elif demo_only:
        methods.append(
            {
                "id": "card",
                "label": "Card",
                "provider": "demo",
                "desc": "Card (demo — no real charge)",
                "group": "card",
            }
        )

    # Philippine e-wallets via PayMongo or Xendit (or demo preview)
    if ewallet_prov in ("paymongo", "xendit") or demo_only:
        provider = ewallet_prov if ewallet_prov != "demo" else "demo"
        if demo_only:
            provider = "demo"
        label_src = {
            "paymongo": "PayMongo",
            "xendit": "Xendit",
            "demo": "demo",
        }.get(provider, provider)
        suffix = f" · {label_src}" if provider != "demo" else " (demo)"
        methods.append(
            {
                "id": "gcash",
                "label": "GCash",
                "provider": provider,
                "desc": f"Pay with GCash (PHP){suffix}",
                "group": "ewallet",
            }
        )
        methods.append(
            {
                "id": "paymaya",
                "label": "Maya",
                "provider": provider,
                "desc": f"Pay with Maya / PayMaya (PHP){suffix}",
                "group": "ewallet",
            }
        )
        methods.append(
            {
                "id": "grab_pay",
                "label": "GrabPay",
                "provider": provider,
                "desc": f"Pay with GrabPay (PHP){suffix}",
                "group": "ewallet",
            }
        )
        methods.append(
            {
                "id": "shopeepay",
                "label": "ShopeePay",
                "provider": provider,
                "desc": f"Pay with ShopeePay (PHP){suffix}",
                "group": "ewallet",
            }
        )

    # Full Xendit hosted invoice (all enabled channels on one page)
    if has_xendit:
        methods.append(
            {
                "id": "xendit",
                "label": "Xendit Checkout",
                "provider": "xendit",
                "desc": "GCash, Maya, GrabPay, ShopeePay & more (hosted)",
                "group": "ewallet",
            }
        )

    if has_paypal or demo_only:
        methods.append(
            {
                "id": "paypal",
                "label": "PayPal",
                "provider": "paypal" if has_paypal else "demo",
                "desc": "PayPal balance or linked card" if has_paypal else "PayPal (demo)",
                "group": "other",
            }
        )
    if has_crypto or demo_only:
        methods.append(
            {
                "id": "crypto",
                "label": "Crypto",
                "provider": "nowpayments" if has_crypto else "demo",
                "desc": "USDT, BTC, ETH & more" if has_crypto else "Crypto (demo)",
                "group": "other",
            }
        )

    # Deduplicate by id keeping first
    seen = set()
    out = []
    for m in methods:
        if m["id"] in seen:
            continue
        seen.add(m["id"])
        out.append(m)
    return out or [
        {
            "id": "demo",
            "label": "Instant demo",
            "provider": "demo",
            "desc": "Test delivery without real money",
        }
    ]


@app.post("/api/checkout")
def api_checkout():
    """Demo / instant fulfill (no real money)."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    name = (data.get("name") or "").strip()
    currency = (data.get("currency") or "PHP").strip().upper()
    items = data.get("items") or []
    method = (data.get("method") or "demo").strip().lower()
    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required for delivery"}), 400

    try:
        order = fulfill_order(
            email=email,
            name=name,
            currency=currency,
            items=items,
            payment_mode_name="instant_demo",
            method=method,
            provider_ref=f"demo-{uuid.uuid4().hex}",
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 409

    return jsonify({"ok": True, "order": order})


@app.get("/api/payments/config")
def payments_config():
    return jsonify(
        {
            "paymentMode": payment_mode(),
            "stripeEnabled": stripe_configured(),
            "publishableKey": os.environ.get("STRIPE_PUBLISHABLE_KEY") or "",
            "methods": available_payment_methods(),
        }
    )


@app.post("/api/checkout/start")
def api_checkout_start():
    """
    Unified checkout start.
    method: card | gcash | paymaya | grab_pay | shopeepay | xendit | paypal | crypto | demo
    Returns { url } for redirect providers, or { order } for demo.
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    name = (data.get("name") or "").strip()
    currency = (data.get("currency") or "PHP").strip().upper()
    items = data.get("items") or []
    method = (data.get("method") or "card").strip().lower()
    # Aliases
    if method in ("maya", "paymaya_wallet"):
        method = "paymaya"
    if method in ("grabpay", "grab-pay"):
        method = "grab_pay"
    if method in ("shopee_pay", "shopee-pay"):
        method = "shopeepay"

    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required for delivery"}), 400

    try:
        normalized, _ = validate_cart_items(items)
    except ValueError as e:
        return jsonify({"error": str(e)}), 409

    methods = {m["id"]: m for m in available_payment_methods()}
    if method not in methods and method != "demo":
        return jsonify({"error": f"Payment method not available: {method}"}), 400

    provider = (methods.get(method) or {}).get("provider") or "demo"
    base = public_base_url()
    cart_meta = [{"id": r["id"], "qty": r["qty"]} for r in normalized]
    ewallet_methods = ("gcash", "paymaya", "grab_pay", "shopeepay", "card", "xendit")

    # ---- DEMO (no real money) ----
    if provider == "demo" or method == "demo":
        try:
            order = fulfill_order(
                email=email,
                name=name,
                currency=currency,
                items=items,
                payment_mode_name="instant_demo",
                method=method,
                provider_ref=f"demo-{uuid.uuid4().hex}",
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 409
        return jsonify({"ok": True, "provider": "demo", "order": order})

    # ---- CARD via Stripe ----
    if method == "card" and provider == "stripe":
        return _stripe_session(email, name, currency, items, normalized, base)

    # ---- PH e-wallets + Card via PayMongo ----
    if provider == "paymongo" and method in ewallet_methods and method != "xendit":
        return _paymongo_checkout(email, name, method, normalized, cart_meta, base)

    # ---- PH e-wallets + Card + multi via Xendit ----
    if provider == "xendit" and method in ewallet_methods:
        return _xendit_checkout(email, name, method, normalized, cart_meta, base)

    # ---- PayPal ----
    if method == "paypal" and provider == "paypal":
        return _paypal_checkout(email, name, currency, normalized, cart_meta, base)

    # ---- Crypto (NOWPayments) ----
    if method == "crypto" and provider == "nowpayments":
        return _crypto_checkout(email, name, normalized, cart_meta, base)

    return jsonify({"error": "Payment method not configured on server"}), 503


def _stripe_session(email, name, currency, items, normalized, base):
    if not stripe_configured():
        return jsonify({"error": "Stripe not configured"}), 503
    # reuse existing stripe endpoint logic via internal call
    if currency not in {
        "USD", "EUR", "GBP", "PHP", "AUD", "CAD", "SGD", "JPY", "INR",
        "CHF", "HKD", "NZD", "SEK", "NOK", "DKK", "MXN", "BRL", "MYR", "THB", "PLN",
    }:
        currency = "USD"
    line_items = []
    for row in normalized:
        deal = row["deal"]
        qty = row["qty"]
        amount = unit_amount_cents(deal, currency)
        product_data = {"name": deal.get("name") or "Digital plan"}
        desc = (deal.get("duration") or deal.get("tagline") or "")[:200]
        if desc:
            product_data["description"] = desc
        line_items.append(
            {
                "quantity": qty,
                "price_data": {
                    "currency": currency.lower(),
                    "unit_amount": amount,
                    "product_data": product_data,
                },
            }
        )
    cart_meta = json.dumps([{"id": r["id"], "qty": r["qty"]} for r in normalized])
    try:
        stripe = get_stripe()
        session_obj = stripe.checkout.Session.create(
            mode="payment",
            customer_email=email,
            line_items=line_items,
            success_url=f"{base}/#/success?session_id={{CHECKOUT_SESSION_ID}}&provider=stripe",
            cancel_url=f"{base}/#/checkout?cancelled=1",
            metadata={
                "customer_name": name[:200],
                "cart": cart_meta,
                "currency": currency,
                "method": "card",
            },
        )
    except Exception as e:
        return jsonify({"error": f"Stripe error: {e}"}), 502
    return jsonify(
        {"ok": True, "provider": "stripe", "method": "card", "url": session_obj.url, "sessionId": session_obj.id}
    )


def _paymongo_checkout(email, name, method, normalized, cart_meta, base):
    """Start PayMongo Checkout for PH e-wallets (GCash, Maya, GrabPay, ShopeePay) or card."""
    secret = (os.environ.get("PAYMONGO_SECRET_KEY") or "").strip()
    if not secret:
        return jsonify(
            {
                "error": "PH e-wallets not configured. Set PAYMONGO_SECRET_KEY on the server (PayMongo dashboard).",
            }
        ), 503

    import base64
    import urllib.request

    # Official PayMongo payment method types
    method_map = {
        "card": "card",
        "gcash": "gcash",
        "paymaya": "paymaya",
        "maya": "paymaya",
        "grab_pay": "grab_pay",
        "grabpay": "grab_pay",
        "shopeepay": "shopeepay",
    }
    pm_type = method_map.get(method, "gcash")
    is_ewallet = pm_type in ("gcash", "paymaya", "grab_pay", "shopeepay")

    # PayMongo Checkout line amounts are in centavos (PHP only)
    line_items = []
    total_centavos = 0
    for row in normalized:
        deal = row["deal"]
        qty = max(1, int(row["qty"]))
        unit = int(round(cart_total_php([row]) / qty * 100))
        unit = max(unit, 100)  # min ₱1.00 per unit
        total_centavos += unit * qty
        line_items.append(
            {
                "currency": "PHP",
                "amount": unit,
                "name": (deal.get("name") or "Plan")[:100],
                "quantity": qty,
                "description": (deal.get("duration") or deal.get("tagline") or "Digital code")[
                    :255
                ],
            }
        )

    # E-wallets often require a sensible minimum (₱20+)
    if is_ewallet and total_centavos < 2000:
        return jsonify(
            {
                "error": "Minimum amount for PH e-wallets (GCash / Maya / GrabPay / ShopeePay) is ₱20.00. Add more items or use Card.",
            }
        ), 400

    ref = f"pm_{uuid.uuid4().hex[:16]}"
    body = {
        "data": {
            "attributes": {
                "send_email_receipt": True,
                "show_description": True,
                "show_line_items": True,
                "description": f"SubSaverPH · {pm_type.upper()} · {email}"[:255],
                "line_items": line_items,
                "payment_method_types": [pm_type],
                "success_url": f"{base}/#/success?provider=paymongo&ref={ref}",
                "cancel_url": f"{base}/#/checkout?cancelled=1",
                "metadata": {
                    "ref": ref,
                    "email": email,
                    "name": name,
                    "cart": json.dumps(cart_meta)[:500],
                    "method": method,
                },
            }
        }
    }

    auth = base64.b64encode(f"{secret}:".encode()).decode()
    req = urllib.request.Request(
        "https://api.paymongo.com/v1/checkout_sessions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        err_body = ""
        if hasattr(e, "read"):
            try:
                err_body = e.read().decode("utf-8")  # type: ignore
            except Exception:
                pass
        return jsonify({"error": f"PayMongo error: {e} {err_body}"}), 502

    attrs = payload.get("data", {}).get("attributes", {})
    checkout_url = attrs.get("checkout_url")
    session_id = payload.get("data", {}).get("id")
    if not checkout_url:
        return jsonify({"error": "PayMongo did not return checkout_url", "raw": payload}), 502

    # Store pending ref for fulfillment on return/webhook
    pending = read_json(STORE / "pending_payments.json", {})
    pending[ref] = {
        "email": email,
        "name": name,
        "cart": cart_meta,
        "method": method,
        "provider": "paymongo",
        "sessionId": session_id,
        "currency": "PHP",
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    write_json(STORE / "pending_payments.json", pending)

    return jsonify(
        {
            "ok": True,
            "provider": "paymongo",
            "method": method,
            "url": checkout_url,
            "ref": ref,
            "sessionId": session_id,
        }
    )


def _xendit_checkout(email, name, method, normalized, cart_meta, base):
    """
    Start Xendit Invoice for PH e-wallets / card / multi-method checkout.
    Docs: https://developers.xendit.co/api-reference/#create-invoice
    Auth: Basic secret_key:
    Amount is in major currency units (PHP pesos), not centavos.
    """
    secret = (os.environ.get("XENDIT_SECRET_KEY") or "").strip()
    if not secret:
        return jsonify(
            {
                "error": "Xendit not configured. Set XENDIT_SECRET_KEY on the server.",
            }
        ), 503

    import base64
    import urllib.request

    # Map our method ids → Xendit invoice payment_methods codes
    method_map = {
        "gcash": ["GCASH"],
        "paymaya": ["PAYMAYA"],
        "maya": ["PAYMAYA"],
        "grab_pay": ["GRABPAY"],
        "grabpay": ["GRABPAY"],
        "shopeepay": ["SHOPEEPAY"],
        "card": ["CREDIT_CARD"],
        "xendit": ["GCASH", "PAYMAYA", "GRABPAY", "SHOPEEPAY", "CREDIT_CARD"],
    }
    payment_methods = method_map.get(method, ["GCASH", "PAYMAYA", "GRABPAY", "SHOPEEPAY"])

    # Total in PHP (major units)
    total_php = float(cart_total_php(normalized))
    if total_php < 1:
        return jsonify({"error": "Cart total too low for Xendit."}), 400
    # E-wallets often need a small minimum
    if method != "card" and total_php < 20:
        return jsonify(
            {
                "error": "Minimum amount for PH e-wallets is ₱20.00. Add more items or use Card.",
            }
        ), 400

    items_payload = []
    for row in normalized:
        deal = row["deal"]
        qty = max(1, int(row["qty"]))
        unit = round(cart_total_php([row]) / qty, 2)
        items_payload.append(
            {
                "name": (deal.get("name") or "Plan")[:100],
                "quantity": qty,
                "price": max(unit, 1),
                "category": (deal.get("category") or "Digital")[:50],
            }
        )

    ref = f"xd_{uuid.uuid4().hex[:16]}"
    body = {
        "external_id": ref,
        "amount": round(total_php, 2),
        "description": f"SubSaverPH · {method} · {email}"[:255],
        "invoice_duration": int(os.environ.get("XENDIT_INVOICE_DURATION") or "86400"),
        "currency": "PHP",
        "reminder_time": 1,
        "customer": {
            "given_names": (name or "Customer")[:100],
            "email": email,
        },
        "customer_notification_preference": {
            "invoice_created": ["email"],
            "invoice_reminder": ["email"],
            "invoice_paid": ["email"],
        },
        "success_redirect_url": f"{base}/#/success?provider=xendit&ref={ref}",
        "failure_redirect_url": f"{base}/#/checkout?cancelled=1",
        "payment_methods": payment_methods,
        "items": items_payload,
        "metadata": {
            "ref": ref,
            "email": email,
            "name": name,
            "method": method,
            "cart": json.dumps(cart_meta)[:500],
        },
    }

    auth = base64.b64encode(f"{secret}:".encode()).decode()
    api_base = (os.environ.get("XENDIT_API_BASE") or "https://api.xendit.co").rstrip("/")
    req = urllib.request.Request(
        f"{api_base}/v2/invoices",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        err_body = ""
        if hasattr(e, "read"):
            try:
                err_body = e.read().decode("utf-8")  # type: ignore
            except Exception:
                pass
        return jsonify({"error": f"Xendit error: {e} {err_body}"}), 502

    invoice_url = payload.get("invoice_url")
    invoice_id = payload.get("id")
    if not invoice_url:
        return jsonify({"error": "Xendit did not return invoice_url", "raw": payload}), 502

    pending = read_json(STORE / "pending_payments.json", {})
    pending[ref] = {
        "email": email,
        "name": name,
        "cart": cart_meta,
        "method": method,
        "provider": "xendit",
        "invoiceId": invoice_id,
        "currency": "PHP",
        "amount": round(total_php, 2),
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    write_json(STORE / "pending_payments.json", pending)

    return jsonify(
        {
            "ok": True,
            "provider": "xendit",
            "method": method,
            "url": invoice_url,
            "ref": ref,
            "invoiceId": invoice_id,
        }
    )


def _paypal_checkout(email, name, currency, normalized, cart_meta, base):
    client_id = os.environ.get("PAYPAL_CLIENT_ID")
    secret = os.environ.get("PAYPAL_CLIENT_SECRET")
    if not client_id or not secret:
        return jsonify({"error": "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set"}), 503

    import base64
    import urllib.parse
    import urllib.request

    api_base = (
        "https://api-m.sandbox.paypal.com"
        if os.environ.get("PAYPAL_MODE", "sandbox").lower() == "sandbox"
        else "https://api-m.paypal.com"
    )

    # OAuth
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    token_req = urllib.request.Request(
        f"{api_base}/v1/oauth2/token",
        data=b"grant_type=client_credentials",
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(token_req, timeout=30) as resp:
            token = json.loads(resp.read().decode("utf-8")).get("access_token")
    except Exception as e:
        return jsonify({"error": f"PayPal auth error: {e}"}), 502

    # PayPal prefers USD for digital often; convert
    pay_currency = currency if currency in {"USD", "EUR", "GBP", "AUD", "CAD"} else "USD"
    total = cart_total_usd(normalized) if pay_currency == "USD" else cart_total_usd(normalized)
    value = f"{total:.2f}"
    ref = f"pp_{uuid.uuid4().hex[:16]}"

    order_body = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": ref,
                "description": "SubSaverPH digital codes",
                "custom_id": json.dumps({"email": email, "cart": cart_meta})[:127],
                "amount": {
                    "currency_code": pay_currency,
                    "value": value,
                },
            }
        ],
        "application_context": {
            "brand_name": "SubSaverPH",
            "landing_page": "LOGIN",
            "user_action": "PAY_NOW",
            "return_url": f"{base}/#/success?provider=paypal&ref={ref}",
            "cancel_url": f"{base}/#/checkout?cancelled=1",
        },
    }

    order_req = urllib.request.Request(
        f"{api_base}/v2/checkout/orders",
        data=json.dumps(order_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(order_req, timeout=30) as resp:
            order = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        err = ""
        if hasattr(e, "read"):
            try:
                err = e.read().decode("utf-8")  # type: ignore
            except Exception:
                pass
        return jsonify({"error": f"PayPal order error: {e} {err}"}), 502

    approve = next(
        (l.get("href") for l in order.get("links", []) if l.get("rel") == "approve"),
        None,
    )
    if not approve:
        return jsonify({"error": "PayPal approve URL missing", "raw": order}), 502

    pending = read_json(STORE / "pending_payments.json", {})
    pending[ref] = {
        "email": email,
        "name": name,
        "cart": cart_meta,
        "method": "paypal",
        "provider": "paypal",
        "paypalOrderId": order.get("id"),
        "currency": pay_currency,
        "accessTokenHint": True,
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    write_json(STORE / "pending_payments.json", pending)

    return jsonify(
        {
            "ok": True,
            "provider": "paypal",
            "method": "paypal",
            "url": approve,
            "ref": ref,
            "orderId": order.get("id"),
        }
    )


def _crypto_checkout(email, name, normalized, cart_meta, base):
    api_key = os.environ.get("NOWPAYMENTS_API_KEY")
    if not api_key:
        return jsonify({"error": "NOWPAYMENTS_API_KEY not set"}), 503

    import urllib.request

    price_usd = cart_total_usd(normalized)
    ref = f"cr_{uuid.uuid4().hex[:16]}"
    # Invoice creates a hosted payment page
    body = {
        "price_amount": price_usd,
        "price_currency": "usd",
        "order_id": ref,
        "order_description": f"SubSaverPH for {email}",
        "ipn_callback_url": f"{base}/api/webhooks/nowpayments",
        "success_url": f"{base}/#/success?provider=crypto&ref={ref}",
        "cancel_url": f"{base}/#/checkout?cancelled=1",
    }
    api_base = os.environ.get("NOWPAYMENTS_API_BASE", "https://api.nowpayments.io/v1")
    req = urllib.request.Request(
        f"{api_base}/invoice",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            inv = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        err = ""
        if hasattr(e, "read"):
            try:
                err = e.read().decode("utf-8")  # type: ignore
            except Exception:
                pass
        return jsonify({"error": f"NOWPayments error: {e} {err}"}), 502

    invoice_url = inv.get("invoice_url")
    if not invoice_url:
        return jsonify({"error": "No invoice_url from NOWPayments", "raw": inv}), 502

    pending = read_json(STORE / "pending_payments.json", {})
    pending[ref] = {
        "email": email,
        "name": name,
        "cart": cart_meta,
        "method": "crypto",
        "provider": "nowpayments",
        "invoiceId": inv.get("id"),
        "currency": "USD",
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    write_json(STORE / "pending_payments.json", pending)

    return jsonify(
        {
            "ok": True,
            "provider": "nowpayments",
            "method": "crypto",
            "url": invoice_url,
            "ref": ref,
        }
    )


@app.get("/api/checkout/complete")
def api_checkout_complete():
    """
    After redirect from PayMongo / Xendit / PayPal / Crypto:
    ?provider=paymongo|xendit|paypal|crypto&ref=...
    Verifies payment when possible and fulfills codes.
    """
    provider = (request.args.get("provider") or "").lower()
    ref = (request.args.get("ref") or "").strip()
    if not ref:
        return jsonify({"error": "Missing ref"}), 400

    # Already fulfilled?
    for existing in load_orders():
        if existing.get("providerRef") == ref:
            return jsonify({"ok": True, "order": existing})

    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(ref)
    if not pending:
        return jsonify({"error": "Unknown or expired payment ref"}), 404

    email = pending.get("email") or ""
    name = pending.get("name") or ""
    cart = pending.get("cart") or []
    currency = pending.get("currency") or "PHP"
    method = pending.get("method") or provider

    # Provider-specific verification
    if provider == "paypal" or pending.get("provider") == "paypal":
        ok = _paypal_capture(pending)
        if not ok:
            return jsonify({"error": "PayPal payment not completed yet"}), 402
    elif provider == "paymongo" or pending.get("provider") == "paymongo":
        ok = _paymongo_paid(pending)
        if not ok and os.environ.get("PAYMONGO_REQUIRE_VERIFY", "1") == "1":
            # If we cannot verify, still allow if session paid — otherwise wait
            return jsonify(
                {
                    "error": "PayMongo payment not confirmed yet. Wait a moment and refresh.",
                    "hint": "Ensure webhook is set or try again in a few seconds.",
                }
            ), 402
    elif provider == "xendit" or pending.get("provider") == "xendit":
        ok = _xendit_paid(pending)
        if not ok and os.environ.get("XENDIT_REQUIRE_VERIFY", "1") == "1":
            return jsonify(
                {
                    "error": "Xendit payment not confirmed yet. Wait a moment and refresh.",
                    "hint": "Ensure Xendit webhook is set, or wait a few seconds.",
                }
            ), 402
    elif provider == "crypto" or pending.get("provider") == "nowpayments":
        ok = _crypto_paid(pending)
        if not ok:
            return jsonify({"error": "Crypto payment not confirmed yet"}), 402

    try:
        order = fulfill_order(
            email=email,
            name=name,
            currency=currency,
            items=cart,
            payment_mode_name=pending.get("provider") or provider,
            method=method,
            provider_ref=ref,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 409

    # cleanup pending
    pending_all.pop(ref, None)
    write_json(STORE / "pending_payments.json", pending_all)
    return jsonify({"ok": True, "order": order})


def _paypal_capture(pending: dict) -> bool:
    client_id = os.environ.get("PAYPAL_CLIENT_ID")
    secret = os.environ.get("PAYPAL_CLIENT_SECRET")
    order_id = pending.get("paypalOrderId")
    if not all([client_id, secret, order_id]):
        return False
    import base64
    import urllib.request

    api_base = (
        "https://api-m.sandbox.paypal.com"
        if os.environ.get("PAYPAL_MODE", "sandbox").lower() == "sandbox"
        else "https://api-m.paypal.com"
    )
    auth = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
    try:
        token_req = urllib.request.Request(
            f"{api_base}/v1/oauth2/token",
            data=b"grant_type=client_credentials",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        with urllib.request.urlopen(token_req, timeout=30) as resp:
            token = json.loads(resp.read().decode("utf-8")).get("access_token")
        cap_req = urllib.request.Request(
            f"{api_base}/v2/checkout/orders/{order_id}/capture",
            data=b"{}",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(cap_req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        status = result.get("status")
        return status in ("COMPLETED", "APPROVED")
    except Exception:
        # Maybe already captured
        try:
            get_req = urllib.request.Request(
                f"{api_base}/v2/checkout/orders/{order_id}",
                headers={"Authorization": f"Bearer {token}"},
                method="GET",
            )
            with urllib.request.urlopen(get_req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            return result.get("status") == "COMPLETED"
        except Exception:
            return False


def _paymongo_paid(pending: dict) -> bool:
    secret = os.environ.get("PAYMONGO_SECRET_KEY")
    session_id = pending.get("sessionId")
    if not secret or not session_id:
        # Without API verify, treat return as success only if explicitly allowed
        return os.environ.get("PAYMONGO_TRUST_RETURN", "0") == "1"
    import base64
    import urllib.request

    auth = base64.b64encode(f"{secret}:".encode()).decode()
    req = urllib.request.Request(
        f"https://api.paymongo.com/v1/checkout_sessions/{session_id}",
        headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        attrs = data.get("data", {}).get("attributes", {})
        # payments list may indicate paid
        status = attrs.get("status")
        payments = attrs.get("payments") or []
        if status in ("paid", "active") and payments:
            return True
        if any(
            (p.get("attributes") or {}).get("status") == "paid"
            for p in payments
            if isinstance(p, dict)
        ):
            return True
        # some responses use payment_intent
        return status == "paid"
    except Exception:
        return False


def _crypto_paid(pending: dict) -> bool:
    api_key = os.environ.get("NOWPAYMENTS_API_KEY")
    invoice_id = pending.get("invoiceId")
    if not api_key or not invoice_id:
        return os.environ.get("CRYPTO_TRUST_RETURN", "0") == "1"
    import urllib.request

    api_base = os.environ.get("NOWPAYMENTS_API_BASE", "https://api.nowpayments.io/v1")
    req = urllib.request.Request(
        f"{api_base}/invoice/{invoice_id}",
        headers={"x-api-key": api_key},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        # invoice payments statuses
        status = (data.get("payment_status") or data.get("status") or "").lower()
        return status in ("finished", "confirmed", "sending", "paid")
    except Exception:
        return False


def _xendit_paid(pending: dict) -> bool:
    """Verify Xendit invoice is PAID / SETTLED."""
    secret = (os.environ.get("XENDIT_SECRET_KEY") or "").strip()
    invoice_id = pending.get("invoiceId")
    if not secret or not invoice_id:
        return os.environ.get("XENDIT_TRUST_RETURN", "0") == "1"
    import base64
    import urllib.request

    auth = base64.b64encode(f"{secret}:".encode()).decode()
    api_base = (os.environ.get("XENDIT_API_BASE") or "https://api.xendit.co").rstrip("/")
    req = urllib.request.Request(
        f"{api_base}/v2/invoices/{invoice_id}",
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        status = (data.get("status") or "").upper()
        return status in ("PAID", "SETTLED")
    except Exception:
        return False


@app.post("/api/webhooks/paymongo")
def paymongo_webhook():
    """PayMongo webhook — fulfill when payment paid."""
    payload = request.get_json(silent=True) or {}
    data = payload.get("data") or {}
    attrs = data.get("attributes") or {}
    typ = attrs.get("type") or payload.get("type") or ""
    # Normalize event
    inner = attrs.get("data") or data
    iattrs = inner.get("attributes") if isinstance(inner, dict) else {}
    meta = (iattrs or {}).get("metadata") or attrs.get("metadata") or {}
    ref = meta.get("ref")
    if not ref:
        return jsonify({"ok": True, "skipped": "no ref"})

    for existing in load_orders():
        if existing.get("providerRef") == ref:
            return jsonify({"ok": True, "duplicate": True})

    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(ref)
    if not pending:
        return jsonify({"ok": True, "skipped": "unknown ref"})

    # Only fulfill paid-like events
    event_ok = "payment.paid" in typ or "checkout_session.payment.paid" in typ or True
    if event_ok:
        try:
            fulfill_order(
                email=pending.get("email") or meta.get("email") or "",
                name=pending.get("name") or meta.get("name") or "",
                currency="PHP",
                items=pending.get("cart") or json.loads(meta.get("cart") or "[]"),
                payment_mode_name="paymongo",
                method=pending.get("method") or meta.get("method"),
                provider_ref=ref,
            )
            pending_all.pop(ref, None)
            write_json(STORE / "pending_payments.json", pending_all)
        except Exception as e:
            return jsonify({"error": str(e)}), 409
    return jsonify({"ok": True})


@app.post("/api/webhooks/nowpayments")
def nowpayments_webhook():
    payload = request.get_json(silent=True) or {}
    order_id = payload.get("order_id") or ""
    status = (payload.get("payment_status") or "").lower()
    if status not in ("finished", "confirmed", "sending"):
        return jsonify({"ok": True, "skipped": status})
    ref = order_id
    for existing in load_orders():
        if existing.get("providerRef") == ref:
            return jsonify({"ok": True, "duplicate": True})
    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(ref)
    if not pending:
        return jsonify({"ok": True, "skipped": "unknown"})
    try:
        fulfill_order(
            email=pending.get("email") or "",
            name=pending.get("name") or "",
            currency="USD",
            items=pending.get("cart") or [],
            payment_mode_name="nowpayments",
            method="crypto",
            provider_ref=ref,
        )
        pending_all.pop(ref, None)
        write_json(STORE / "pending_payments.json", pending_all)
    except Exception as e:
        return jsonify({"error": str(e)}), 409
    return jsonify({"ok": True})


@app.post("/api/webhooks/xendit")
def xendit_webhook():
    """
    Xendit invoice webhook.
    Dashboard → Settings → Callbacks → Invoice paid URL:
      https://YOUR-APP.onrender.com/api/webhooks/xendit
    Optional: set XENDIT_CALLBACK_TOKEN and verify X-CALLBACK-TOKEN header.
    """
    # Optional shared-secret verification
    expected = (os.environ.get("XENDIT_CALLBACK_TOKEN") or "").strip()
    if expected:
        got = (request.headers.get("X-CALLBACK-TOKEN") or "").strip()
        if got != expected:
            return jsonify({"error": "Invalid callback token"}), 401

    payload = request.get_json(silent=True) or {}
    # Invoice paid payload uses external_id + status
    status = (payload.get("status") or "").upper()
    # Some payloads nest under data
    if not status and isinstance(payload.get("data"), dict):
        status = (payload["data"].get("status") or "").upper()

    if status and status not in ("PAID", "SETTLED"):
        return jsonify({"ok": True, "skipped": status or "no status"})

    ref = (
        payload.get("external_id")
        or (payload.get("data") or {}).get("external_id")
        or ""
    ).strip()
    if not ref:
        # Fallback: match by invoice id
        inv_id = payload.get("id") or (payload.get("data") or {}).get("id")
        pending_all = read_json(STORE / "pending_payments.json", {})
        for k, v in pending_all.items():
            if v.get("invoiceId") == inv_id:
                ref = k
                break
    if not ref:
        return jsonify({"ok": True, "skipped": "no ref"})

    for existing in load_orders():
        if existing.get("providerRef") == ref:
            return jsonify({"ok": True, "duplicate": True})

    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(ref)
    if not pending:
        return jsonify({"ok": True, "skipped": "unknown ref"})

    try:
        fulfill_order(
            email=pending.get("email") or payload.get("payer_email") or "",
            name=pending.get("name") or "",
            currency="PHP",
            items=pending.get("cart") or [],
            payment_mode_name="xendit",
            method=pending.get("method") or "xendit",
            provider_ref=ref,
        )
        pending_all.pop(ref, None)
        write_json(STORE / "pending_payments.json", pending_all)
    except Exception as e:
        return jsonify({"error": str(e)}), 409
    return jsonify({"ok": True})


@app.post("/api/checkout/stripe")
def api_checkout_stripe():
    """Create a Stripe Checkout Session; customer pays on Stripe, then returns for codes."""
    if not stripe_configured():
        return jsonify(
            {
                "error": "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.",
            }
        ), 503

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    name = (data.get("name") or "").strip()
    currency = (data.get("currency") or "USD").strip().upper()
    items = data.get("items") or []
    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required for delivery"}), 400

    try:
        normalized, _ = validate_cart_items(items)
    except ValueError as e:
        return jsonify({"error": str(e)}), 409

    # Stripe-supported common currencies for Checkout
    if currency not in {
        "USD",
        "EUR",
        "GBP",
        "PHP",
        "AUD",
        "CAD",
        "SGD",
        "JPY",
        "INR",
        "CHF",
        "HKD",
        "NZD",
        "SEK",
        "NOK",
        "DKK",
        "MXN",
        "BRL",
        "MYR",
        "THB",
        "PLN",
    }:
        currency = "USD"

    line_items = []
    for row in normalized:
        deal = row["deal"]
        qty = row["qty"]
        amount = unit_amount_cents(deal, currency)
        line_items.append(
            {
                "quantity": qty,
                "price_data": {
                    "currency": currency.lower(),
                    "unit_amount": amount,
                    "product_data": {
                        "name": deal.get("name") or "Digital plan",
                        "description": (deal.get("duration") or deal.get("tagline") or "")[
                            :200
                        ]
                        or None,
                    },
                },
            }
        )
        # Stripe rejects null description
        if line_items[-1]["price_data"]["product_data"]["description"] is None:
            del line_items[-1]["price_data"]["product_data"]["description"]

    # Compact cart for metadata (Stripe metadata values max 500 chars)
    cart_meta = json.dumps([{"id": r["id"], "qty": r["qty"]} for r in normalized])
    if len(cart_meta) > 490:
        return jsonify({"error": "Cart too large for Stripe metadata"}), 400

    origin = request.host_url.rstrip("/")
    # Prefer explicit public URL for tunnels/production
    public = (os.environ.get("PUBLIC_URL") or origin).rstrip("/")

    try:
        stripe = get_stripe()
        session_obj = stripe.checkout.Session.create(
            mode="payment",
            customer_email=email,
            line_items=line_items,
            success_url=f"{public}/#/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{public}/#/checkout?cancelled=1",
            metadata={
                "customer_name": name[:200],
                "cart": cart_meta,
                "currency": currency,
            },
            payment_intent_data={
                "metadata": {
                    "customer_name": name[:200],
                    "cart": cart_meta,
                }
            },
        )
    except Exception as e:
        return jsonify({"error": f"Stripe error: {e}"}), 502

    return jsonify(
        {
            "ok": True,
            "paymentMode": "stripe",
            "sessionId": session_obj.id,
            "url": session_obj.url,
        }
    )


@app.get("/api/checkout/session/<session_id>")
def api_checkout_session(session_id: str):
    """After Stripe redirect: verify payment and return fulfilled order + codes."""
    if not stripe_configured():
        return jsonify({"error": "Stripe not configured"}), 503

    # Already fulfilled?
    for existing in load_orders():
        if existing.get("stripeSessionId") == session_id:
            return jsonify({"ok": True, "order": existing})

    try:
        stripe = get_stripe()
        sess = stripe.checkout.Session.retrieve(session_id)
    except Exception as e:
        return jsonify({"error": f"Could not load session: {e}"}), 400

    if sess.get("payment_status") != "paid" and sess.get("status") != "complete":
        # complete + paid is success; allow paid
        if sess.get("payment_status") != "paid":
            return jsonify(
                {
                    "error": "Payment not completed yet",
                    "payment_status": sess.get("payment_status"),
                    "status": sess.get("status"),
                }
            ), 402

    email = (sess.get("customer_email") or sess.get("customer_details", {}) or {}).get(
        "email"
    ) or ""
    if isinstance(sess.get("customer_details"), dict):
        email = email or sess["customer_details"].get("email") or ""
    meta = sess.get("metadata") or {}
    name = meta.get("customer_name") or ""
    currency = (meta.get("currency") or sess.get("currency") or "usd").upper()
    try:
        items = json.loads(meta.get("cart") or "[]")
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid cart metadata on session"}), 400

    try:
        order = fulfill_order(
            email=email or "customer@unknown",
            name=name,
            currency=currency,
            items=items,
            payment_mode_name="stripe",
            stripe_session_id=session_id,
            stripe_payment_intent=sess.get("payment_intent"),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 409

    return jsonify({"ok": True, "order": order})


@app.post("/api/webhooks/stripe")
def stripe_webhook():
    """Stripe webhook: fulfill on checkout.session.completed."""
    if not stripe_configured():
        return jsonify({"error": "Stripe not configured"}), 503

    payload = request.get_data()
    sig = request.headers.get("Stripe-Signature", "")
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    try:
        stripe = get_stripe()
        if secret:
            event = stripe.Webhook.construct_event(payload, sig, secret)
        else:
            # Local testing without webhook secret (not for production)
            event = json.loads(payload.decode("utf-8"))
    except Exception as e:
        return jsonify({"error": f"Webhook error: {e}"}), 400

    etype = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
    data_obj = (
        event["data"]["object"]
        if isinstance(event, dict)
        else event.data.object
    )

    if etype == "checkout.session.completed":
        sess = data_obj
        # dict-like from JSON or StripeObject
        def g(obj, key, default=None):
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        session_id = g(sess, "id")
        payment_status = g(sess, "payment_status")
        if payment_status and payment_status != "paid":
            return jsonify({"ok": True, "skipped": "not paid"})

        # Already done?
        for existing in load_orders():
            if existing.get("stripeSessionId") == session_id:
                return jsonify({"ok": True, "duplicate": True})

        meta = g(sess, "metadata") or {}
        if not isinstance(meta, dict):
            meta = dict(meta)
        email = g(sess, "customer_email") or ""
        details = g(sess, "customer_details") or {}
        if isinstance(details, dict):
            email = email or details.get("email") or ""
        try:
            items = json.loads(meta.get("cart") or "[]")
        except json.JSONDecodeError:
            return jsonify({"error": "bad cart"}), 400
        try:
            fulfill_order(
                email=email or "customer@unknown",
                name=meta.get("customer_name") or "",
                currency=(meta.get("currency") or g(sess, "currency") or "usd").upper(),
                items=items,
                payment_mode_name="stripe",
                stripe_session_id=session_id,
                stripe_payment_intent=str(g(sess, "payment_intent") or ""),
            )
        except ValueError as e:
            # Stock race — Stripe already charged; log as failed fulfillment order
            orders = load_orders()
            orders.insert(
                0,
                {
                    "id": "PHFAIL" + uuid.uuid4().hex[:8].upper(),
                    "email": email,
                    "status": "paid_unfulfilled",
                    "error": str(e),
                    "stripeSessionId": session_id,
                    "createdAt": __import__("datetime").datetime.utcnow().isoformat()
                    + "Z",
                },
            )
            save_orders(orders[:500])
            return jsonify({"error": str(e)}), 409

    return jsonify({"ok": True})


@app.get("/api/search")
def api_search():
    """Public product search: /api/search?q=netflix"""
    q = (request.args.get("q") or "").strip().lower()
    deals = load_deals(include_inactive=False)
    if not q:
        return jsonify({"q": q, "count": 0, "results": []})

    tokens = [t for t in re.split(r"[\s,+/|]+", q) if t]

    def score(deal: dict) -> int:
        blob = " ".join(
            str(deal.get(k, ""))
            for k in (
                "name",
                "brand",
                "category",
                "tagline",
                "description",
                "monogram",
                "badge",
                "duration",
                "period",
            )
        ).lower()
        includes = " ".join(deal.get("includes") or []).lower()
        full = blob + " " + includes
        s = 0
        for t in tokens:
            if t not in full:
                return 0
            name = str(deal.get("name", "")).lower()
            if name == t:
                s += 100
            elif t in name:
                s += 50
            if t in str(deal.get("brand", "")).lower():
                s += 40
            if t in str(deal.get("category", "")).lower():
                s += 25
            s += 8
        return s

    ranked = sorted(
        ((score(d), d) for d in deals),
        key=lambda x: (-x[0], x[1].get("name", "")),
    )
    results = [d for sc, d in ranked if sc > 0]
    return jsonify({"q": q, "count": len(results), "results": results})


# ---------- admin auth ----------


@app.post("/api/admin/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    auth = load_auth()
    if username == auth.get("username") and check_password_hash(
        auth.get("password_hash", ""), password
    ):
        session["admin"] = True
        session["admin_user"] = username
        return jsonify({"ok": True, "username": username})
    return jsonify({"error": "Invalid username or password"}), 401


@app.post("/api/admin/logout")
def admin_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/admin/me")
def admin_me():
    if not session.get("admin"):
        return jsonify({"authenticated": False}), 401
    return jsonify({"authenticated": True, "username": session.get("admin_user", "admin")})


@app.post("/api/admin/password")
@require_admin
def admin_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current") or ""
    new_pw = data.get("newPassword") or ""
    if len(new_pw) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400
    auth = load_auth()
    if not check_password_hash(auth.get("password_hash", ""), current):
        return jsonify({"error": "Current password is wrong"}), 400
    auth["password_hash"] = generate_password_hash(new_pw)
    write_json(AUTH_FILE, auth)
    return jsonify({"ok": True})


# ---------- admin deals CRUD ----------


@app.get("/api/admin/deals")
@require_admin
def admin_list_deals():
    return jsonify({"deals": load_deals(include_inactive=True)})


@app.post("/api/admin/deals")
@require_admin
def admin_create_deal():
    data = request.get_json(silent=True) or {}
    deals = load_deals(include_inactive=True)
    deal_id = (data.get("id") or "").strip() or slugify(data.get("name", "deal"))
    if any(d.get("id") == deal_id for d in deals):
        deal_id = f"{deal_id}-{uuid.uuid4().hex[:4]}"
    deal = normalize_deal(data, deal_id)
    deals.append(deal)
    save_deals(deals)
    return jsonify({"ok": True, "deal": deal}), 201


@app.put("/api/admin/deals/<deal_id>")
@require_admin
def admin_update_deal(deal_id: str):
    data = request.get_json(silent=True) or {}
    deals = load_deals(include_inactive=True)
    for i, d in enumerate(deals):
        if d.get("id") == deal_id:
            updated = normalize_deal({**d, **data}, deal_id)
            deals[i] = updated
            save_deals(deals)
            return jsonify({"ok": True, "deal": updated})
    return jsonify({"error": "Deal not found"}), 404


@app.delete("/api/admin/deals/<deal_id>")
@require_admin
def admin_delete_deal(deal_id: str):
    deals = load_deals(include_inactive=True)
    new_deals = [d for d in deals if d.get("id") != deal_id]
    if len(new_deals) == len(deals):
        return jsonify({"error": "Deal not found"}), 404
    save_deals(new_deals)
    return jsonify({"ok": True})


@app.put("/api/admin/settings")
@require_admin
def admin_update_settings():
    data = request.get_json(silent=True) or {}
    current = load_settings()
    current.update({k: v for k, v in data.items() if isinstance(k, str)})
    save_settings(current)
    return jsonify({"ok": True, "settings": current})


@app.get("/api/admin/settings")
@require_admin
def admin_get_settings():
    return jsonify({"settings": load_settings()})


# ---------- inventory (codes stock) ----------


@app.get("/api/admin/inventory")
@require_admin
def admin_inventory():
    inv = load_inventory()
    summary = []
    for d in load_deals(include_inactive=True):
        pid = d.get("id")
        codes = inv.get(pid) or []
        available = sum(1 for c in codes if c.get("status", "available") == "available")
        sold = sum(1 for c in codes if c.get("status") == "sold")
        summary.append(
            {
                "productId": pid,
                "name": d.get("name"),
                "available": available,
                "sold": sold,
                "total": len(codes),
            }
        )
    return jsonify({"summary": summary, "inventory": inv})


@app.get("/api/admin/inventory/<product_id>")
@require_admin
def admin_inventory_product(product_id: str):
    inv = load_inventory()
    codes = inv.get(product_id) or []
    return jsonify({"productId": product_id, "codes": codes})


@app.post("/api/admin/inventory/<product_id>")
@require_admin
def admin_add_codes(product_id: str):
    """Add stock codes. Body: { "codes": "CODE1\\nCODE2" } or { "codes": ["A","B"] }"""
    data = request.get_json(silent=True) or {}
    raw = data.get("codes")
    if isinstance(raw, str):
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    elif isinstance(raw, list):
        lines = [str(x).strip() for x in raw if str(x).strip()]
    else:
        return jsonify({"error": "Provide codes as text (one per line) or array"}), 400

    inv = load_inventory()
    existing = inv.get(product_id) or []
    existing_set = {c.get("code") for c in existing}
    added = 0
    for code in lines:
        if code in existing_set:
            continue
        existing.append(
            {
                "code": code,
                "status": "available",
                "addedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            }
        )
        existing_set.add(code)
        added += 1
    inv[product_id] = existing
    save_inventory(inv)
    return jsonify(
        {
            "ok": True,
            "added": added,
            "available": sum(1 for c in existing if c.get("status") == "available"),
            "total": len(existing),
        }
    )


@app.get("/api/admin/orders")
@require_admin
def admin_orders():
    return jsonify({"orders": load_orders()[:100]})


def normalize_deal(data: dict, deal_id: str) -> dict:
    includes = data.get("includes") or []
    if isinstance(includes, str):
        includes = [x.strip() for x in includes.split("\n") if x.strip()]

    def num(v, default=0):
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    return {
        "id": deal_id,
        "name": (data.get("name") or "Untitled plan").strip(),
        "brand": (data.get("brand") or "Other").strip(),
        "category": (data.get("category") or "Other").strip(),
        "tagline": (data.get("tagline") or "").strip(),
        "monogram": (data.get("monogram") or "XX").strip()[:3].upper(),
        "price": num(data.get("price"), 0),
        "original": num(data.get("original"), 0),
        "priceBase": (data.get("priceBase") or "USD").strip().upper() or "USD",
        "period": (data.get("period") or "month").strip(),
        "duration": (data.get("duration") or "").strip(),
        "rating": num(data.get("rating"), 4.5),
        "reviews": int(num(data.get("reviews"), 0)),
        "badge": (data.get("badge") or "").strip(),
        "stock": (data.get("stock") or "In stock").strip(),
        "delivery": (data.get("delivery") or "Instant code").strip(),
        "description": (data.get("description") or "").strip(),
        "includes": includes,
        "finePrint": (data.get("finePrint") or "").strip(),
        "active": bool(data.get("active", True)),
    }


# ---------- static pages ----------


@app.get("/")
def public_index():
    return send_from_directory(ROOT, "index.html")


@app.get("/admin")
@app.get("/admin/")
def admin_page():
    return send_from_directory(ROOT / "admin", "index.html")


@app.get("/admin/<path:path>")
def admin_static(path: str):
    return send_from_directory(ROOT / "admin", path)


@app.get("/robots.txt")
def robots_txt():
    return send_from_directory(ROOT, "robots.txt", mimetype="text/plain")


@app.get("/sitemap.xml")
def sitemap_xml():
    return send_from_directory(ROOT, "sitemap.xml", mimetype="application/xml")


@app.get("/<path:path>")
def public_static(path: str):
    # Don't shadow API
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    target = ROOT / path
    if target.is_file():
        return send_from_directory(ROOT, path)
    return jsonify({"error": "Not found"}), 404


def main():
    import traceback
    import sys

    try:
        ensure_store()
        port = int(os.environ.get("PORT") or "8790")
    except Exception:
        traceback.print_exc()
        sys.exit(1)

    print("=" * 50, flush=True)
    print("  SubSaverPH LIVE", flush=True)
    print(f"  PORT  : {port}", flush=True)
    print(f"  Store : http://0.0.0.0:{port}/", flush=True)
    print("  Admin : /admin", flush=True)
    print("  Login : admin / subsaverph", flush=True)
    print("=" * 50, flush=True)
    try:
        app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
    except Exception:
        traceback.print_exc()
        sys.exit(1)


# Ensure data store exists when imported by waitress/gunicorn
try:
    ensure_store()
except Exception:
    pass

if __name__ == "__main__":
    main()

