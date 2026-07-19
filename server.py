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
import threading
import uuid
from functools import wraps
from pathlib import Path

# Serialize inventory reserve / order writes (multi-thread Waitress)
_STORE_LOCK = threading.RLock()

from flask import (
    Flask,
    jsonify,
    make_response,
    redirect,
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


@app.before_request
def redirect_onrender_hostname_to_custom_domain():
    """
    Permanent redirect from *.onrender.com → PUBLIC_URL (subsaverph.com).
    Helps Google replace the old Render URL with the custom domain.
    """
    public = (os.environ.get("PUBLIC_URL") or "").strip().rstrip("/")
    if not public.startswith("http"):
        return None
    host = (request.host or "").split(":")[0].lower()
    if not host.endswith(".onrender.com"):
        return None
    # Don't redirect if PUBLIC_URL itself is still onrender
    if "onrender.com" in public.lower():
        return None
    # Keep health/ping usable on the Render hostname (monitors / keep-alive)
    if request.path in ("/api/health", "/api/health/"):
        return None
    target = public + request.path
    qs = request.query_string.decode("utf-8", errors="ignore") if request.query_string else ""
    if qs:
        target = f"{target}?{qs}"
    return redirect(target, code=301)


@app.after_request
def seo_friendly_headers(resp):
    """Googlebot rejects / misreads pages served like file downloads.

    Flask's send_from_directory adds Content-Disposition: inline; filename=...
    which can trigger live-test indexing failures. Strip it for HTML and mark
    public pages as indexable.
    """
    ctype = (resp.headers.get("Content-Type") or "").lower()
    if "text/html" in ctype:
        # Do not present homepage as a downloadable file
        if "Content-Disposition" in resp.headers:
            del resp.headers["Content-Disposition"]
        resp.headers.setdefault(
            "X-Robots-Tag", "index, follow, max-image-preview:large, max-snippet:-1"
        )
        # Short cache so deploys show quickly; still crawlable
        resp.headers.setdefault("Cache-Control", "public, max-age=300")
    return resp


def _serve_html(filename: str, folder: Path | None = None):
    """Serve HTML as a real webpage (no Content-Disposition filename)."""
    base = folder or ROOT
    path = base / filename
    html = path.read_text(encoding="utf-8")
    resp = make_response(html)
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    resp.headers["X-Robots-Tag"] = "index, follow, max-image-preview:large, max-snippet:-1"
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


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
        # Recovery: set ADMIN_RESET_PASSWORD on the host, redeploy/restart, then remove the env var
        reset_pw = (os.environ.get("ADMIN_RESET_PASSWORD") or "").strip()
        if reset_pw and len(reset_pw) >= 6:
            try:
                auth_obj = {}
                if AUTH_FILE.exists():
                    auth_obj = json.loads(AUTH_FILE.read_text(encoding="utf-8") or "{}")
                if not isinstance(auth_obj, dict):
                    auth_obj = {}
                auth_obj["username"] = (auth_obj.get("username") or "admin").strip() or "admin"
                auth_obj["password_hash"] = generate_password_hash(reset_pw)
                AUTH_FILE.write_text(
                    json.dumps(auth_obj, indent=2) + "\n",
                    encoding="utf-8",
                )
            except (OSError, json.JSONDecodeError, TypeError):
                pass
        if not SETTINGS_FILE.exists():
            SETTINGS_FILE.write_text(
                json.dumps(
                    {
                        "siteName": "SubSaverPH",
                        "tagline": "Premium plans. Lower cost.",
                        "heroEyebrow": "SubSaverPH · Subscription access",
                        "heroTitle": "Premium\nplans.\nLower\ncost.",
                        "heroLead": "Prepaid access to premium subscriptions at outlet rates. Checkout in any currency.",
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


def parse_credential_entry(entry) -> dict:
    """
    Normalize inventory entry into {username, password, raw, code}.
    Supports:
      - {username, password, code}
      - "Username: x Password: y"
      - "user | password"
      - "user:password"
      - "user / password"
      - plain access code (shown as code only)
    """
    if isinstance(entry, dict):
        u = (
            entry.get("username")
            or entry.get("user")
            or entry.get("email")
            or entry.get("login")
            or ""
        )
        p = entry.get("password") or entry.get("pass") or entry.get("pwd") or ""
        raw = (entry.get("code") or entry.get("raw") or entry.get("value") or "").strip()
        u = str(u).strip()
        p = str(p).strip()
        if u or p:
            return {
                "username": u,
                "password": p,
                "raw": raw or (f"{u}:{p}" if u and p else u or p),
                "code": raw if raw and not (u or p) else "",
            }
        text = raw
    else:
        text = str(entry or "").strip()

    if not text:
        return {"username": "", "password": "", "raw": "", "code": ""}

    m = re.search(
        r"user(?:name)?\s*[:\-]\s*(.+?)\s+(?:pass(?:word)?|pwd)\s*[:\-]\s*(.+)$",
        text,
        re.I | re.S,
    )
    if m:
        return {
            "username": m.group(1).strip(),
            "password": m.group(2).strip(),
            "raw": text,
            "code": "",
        }

    if "|" in text:
        left, right = [x.strip() for x in text.split("|", 1)]
        if left and right:
            return {"username": left, "password": right, "raw": text, "code": ""}

    if " / " in text:
        left, right = [x.strip() for x in text.split(" / ", 1)]
        if left and right and len(left) < 120 and len(right) < 120:
            return {"username": left, "password": right, "raw": text, "code": ""}

    if text.count(":") == 1:
        left, right = text.split(":", 1)
        left, right = left.strip(), right.strip()
        if left and right and " " not in left and len(left) < 120:
            return {"username": left, "password": right, "raw": text, "code": ""}

    return {"username": "", "password": "", "raw": text, "code": text}


def reserve_codes(product_id: str, qty: int) -> list[dict]:
    """Take qty available codes for product. Mutates inventory. Returns credential dicts."""
    with _STORE_LOCK:
        inv = load_inventory()
        codes = inv.get(product_id) or []
        available = [c for c in codes if c.get("status", "available") == "available"]
        if len(available) < qty:
            raise ValueError(
                f"Not enough stock for {product_id}. Need {qty}, have {len(available)}."
            )
        taken: list[dict] = []
        need = qty
        for c in codes:
            if need <= 0:
                break
            if c.get("status", "available") == "available":
                c["status"] = "sold"
                c["soldAt"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
                # Prefer structured fields on the inventory row
                if c.get("username") or c.get("password"):
                    cred = parse_credential_entry(c)
                else:
                    cred = parse_credential_entry(c.get("code", ""))
                taken.append(cred)
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


def get_outbound_ip() -> str | None:
    """Public IP this server uses for outbound API calls (whitelist in NOWPayments)."""
    fixed = (os.environ.get("SERVER_OUTBOUND_IP") or "").strip()
    if fixed:
        return fixed
    # Try several echo services (Render outbound IP)
    urls = (
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://icanhazip.com",
    )
    for url in urls:
        try:
            import urllib.request

            req = urllib.request.Request(
                url,
                headers={"User-Agent": "SubSaverPH/1.0"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                ip = resp.read().decode("utf-8", errors="replace").strip()
                if ip and len(ip) < 64 and " " not in ip:
                    return ip
        except Exception:
            continue
    # curl_cffi fallback
    try:
        from curl_cffi import requests as cf_requests

        r = cf_requests.get("https://api.ipify.org", timeout=5, impersonate="chrome120")
        ip = (r.text or "").strip()
        if ip and len(ip) < 64:
            return ip
    except Exception:
        pass
    return None


# NOWPayments notification server IPs (whitelist on your firewall/Cloudflare if needed)
NOWPAYMENTS_IPN_IPS = [
    "51.89.194.21",
    "51.75.77.69",
    "138.201.172.58",
    "65.21.158.36",
    "144.76.201.30",
]


# Simple in-memory rate limit for public support form (per IP)
_SUPPORT_HITS: dict[str, list[float]] = {}


# ---------- AI support chatbot (SpaceXAI / xAI) ----------

_CHAT_HITS: dict[str, list[float]] = {}


@app.get("/api/chat/status")
def api_chat_status():
    try:
        from chatbot import chat_configured, cloud_llm_configured
        import os

        cloud = cloud_llm_configured()
        use_cloud = (os.environ.get("USE_CLOUD_CHAT") or "0").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        free_only = (os.environ.get("FREE_CHAT_ONLY") or "0").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        provider = "free"
        if cloud and use_cloud and not free_only:
            if (os.environ.get("GROQ_API_KEY") or "").strip():
                provider = "groq"
            elif (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip():
                provider = "gemini"
            elif (os.environ.get("XAI_API_KEY") or "").strip():
                provider = "spacexai"
        return jsonify(
            {
                "ok": True,
                "enabled": True,
                "aiConfigured": chat_configured(),  # always true (free local)
                "free": True,
                "cloudConfigured": bool(cloud and use_cloud and not free_only),
                "provider": provider,
            }
        )
    except Exception:
        return jsonify(
            {
                "ok": True,
                "enabled": True,
                "aiConfigured": True,
                "free": True,
                "cloudConfigured": False,
                "provider": "free",
            }
        )


@app.post("/api/chat")
def api_chat():
    """
    Storefront AI assistant.
    Body: { "messages": [{ "role": "user"|"assistant", "content": "..." }] }
    or { "message": "..." } for a single turn.
    """
    try:
        from chatbot import call_xai_chat
    except Exception as e:
        return jsonify({"ok": False, "error": f"Chatbot module error: {e}"}), 500

    ip = (request.headers.get("CF-Connecting-IP") or request.remote_addr or "unknown").strip()
    now = __import__("time").time()
    window = 300.0
    max_hits = 40
    hits = [t for t in _CHAT_HITS.get(ip, []) if now - t < window]
    if len(hits) >= max_hits:
        _CHAT_HITS[ip] = hits
        return jsonify({"ok": False, "error": "Too many chat messages. Please wait a few minutes."}), 429
    hits.append(now)
    _CHAT_HITS[ip] = hits

    data = request.get_json(silent=True) or {}
    messages = data.get("messages")
    if not messages and data.get("message"):
        messages = [{"role": "user", "content": str(data.get("message"))}]
    if not isinstance(messages, list) or not messages:
        return jsonify({"ok": False, "error": "Provide message or messages[]"}), 400

    # Attach stockLeft for better answers
    deals = load_deals(include_inactive=False)
    for d in deals:
        try:
            d["stockLeft"] = stock_count(d.get("id", ""))
        except Exception:
            pass

    result = call_xai_chat(messages, deals=deals, settings=load_settings())
    status = 200 if result.get("ok") or result.get("reply") else 502
    return jsonify(result), status


@app.post("/api/support/contact")
def api_support_contact():
    """
    Website contact form → email store owner via Resend/SMTP.
    Also saves a copy under data/store/support_messages.json (admin can read).
    Does not require support@ domain MX / Email Routing to work.
    """
    try:
        from email_delivery import mail_configured, send_support_message, support_inbox
    except Exception as e:
        return jsonify({"error": f"Email module error: {e}"}), 500

    # Rate limit: max 5 messages / 15 minutes / IP
    import time

    ip = (request.headers.get("CF-Connecting-IP") or request.remote_addr or "unknown").strip()
    now = time.time()
    window = 15 * 60
    hits = [t for t in _SUPPORT_HITS.get(ip, []) if now - t < window]
    if len(hits) >= 5:
        return jsonify({"error": "Too many messages. Please wait a few minutes and try again."}), 429
    hits.append(now)
    _SUPPORT_HITS[ip] = hits

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    name = (data.get("name") or "").strip()
    subject = (data.get("subject") or "Support request").strip()
    message = (data.get("message") or data.get("body") or "").strip()
    order_id = (data.get("orderId") or data.get("order_id") or "").strip()

    if not email or "@" not in email:
        return jsonify({"error": "Please enter your email so we can reply."}), 400
    if len(message) < 10:
        return jsonify({"error": "Please describe your problem (at least a short message)."}), 400

    # Always save locally so messages are not lost if email fails
    ticket = {
        "id": "SUP" + uuid.uuid4().hex[:10].upper(),
        "email": email,
        "name": name,
        "subject": subject,
        "message": message,
        "orderId": order_id,
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "ip": ip[:64],
        "emailSent": False,
    }
    try:
        path = STORE / "support_messages.json"
        existing = read_json(path, [])
        if not isinstance(existing, list):
            existing = []
        existing.insert(0, ticket)
        write_json(path, existing[:200])
    except Exception:
        pass

    if not mail_configured():
        return jsonify(
            {
                "ok": True,
                "message": (
                    "Message saved. Email delivery is not configured yet — "
                    "the store owner can still read it in admin. "
                    "Set RESEND_API_KEY + SUPPORT_INBOX on the server for email delivery."
                ),
                "ticketId": ticket["id"],
                "savedOnly": True,
            }
        )

    # Deliver to owner's REAL inbox (Outlook/Gmail). Never to support@subsaverph.com
    # — that public address has no mailbox until Cloudflare Email Routing is enabled
    # ("Address not found" bounce).
    to_override = support_inbox()
    if not to_override:
        try:
            s = load_settings()
            for key in ("ownerInbox", "notifyEmail", "supportInbox"):
                candidate = (s.get(key) or "").strip()
                if (
                    candidate
                    and "@" in candidate
                    and not candidate.lower().endswith("@subsaverph.com")
                    and not candidate.lower().endswith("@subsaverph.onrender.com")
                ):
                    to_override = candidate
                    break
        except Exception:
            pass

    if not to_override:
        # Message already saved — instruct owner to set inbox
        return jsonify(
            {
                "ok": True,
                "message": (
                    "Your message was saved. The store owner will see it in admin → Support inbox. "
                    "(Email notify is not set up yet.)"
                ),
                "ticketId": ticket["id"],
                "emailOk": False,
                "detail": "Set SUPPORT_INBOX or admin ownerInbox to a real Outlook/Gmail address.",
            }
        )

    result = send_support_message(
        from_email=email,
        from_name=name,
        subject=subject,
        message=message,
        order_id=order_id,
        to_override=to_override,
    )

    # Update ticket email status
    try:
        path = STORE / "support_messages.json"
        existing = read_json(path, [])
        if isinstance(existing, list):
            for row in existing:
                if row.get("id") == ticket["id"]:
                    row["emailSent"] = bool(result.get("ok"))
                    row["emailDetail"] = str(result.get("detail") or "")[:300]
                    row["emailTo"] = result.get("to")
                    break
            write_json(path, existing[:200])
    except Exception:
        pass

    if not result.get("ok"):
        detail = str(result.get("detail") or "Failed to send email")
        # Still OK for customer if saved — never expose long provider errors
        return jsonify(
            {
                "ok": True,
                "message": (
                    "Your message was received and saved. "
                    "We will reply to your email as soon as possible."
                ),
                "ticketId": ticket["id"],
                "emailOk": False,
                "detail": detail[:300],
            }
        )

    return jsonify(
        {
            "ok": True,
            "message": "Message sent. We will reply to your email as soon as possible.",
            "ticketId": ticket["id"],
            "emailOk": True,
            "to": result.get("to"),
        }
    )


@app.get("/api/admin/support-messages")
@require_admin
def admin_support_messages():
    msgs = read_json(STORE / "support_messages.json", [])
    if not isinstance(msgs, list):
        msgs = []
    return jsonify({"messages": msgs[:100]})


@app.get("/api/health")
def health():
    try:
        from email_delivery import mail_configured
        mail_ok = mail_configured()
    except Exception:
        mail_ok = False
    outbound = get_outbound_ip()
    return jsonify(
        {
            "ok": True,
            "service": "SubSaverPH",
            "emailConfigured": mail_ok,
            "stripeConfigured": stripe_configured(),
            "paymongoConfigured": paymongo_configured(),
            "xenditConfigured": xendit_configured(),
            "paypalConfigured": paypal_configured(),
            "paypalMode": paypal_credentials()[2] if paypal_configured() else None,
            "cryptoConfigured": crypto_configured(),
            "liqpayConfigured": liqpay_configured(),
            "ewalletProvider": ewallet_provider(),
            # Add this IP in NOWPayments → Settings → Payments → IP addresses
            "outboundIp": outbound,
            "outboundIpHint": (
                "Whitelist this IP in NOWPayments dashboard (Settings → Payments → IP addresses). "
                "On free Render the IP can change after redeploys."
            ),
            "nowpaymentsIpnIps": NOWPAYMENTS_IPN_IPS,
            "nowpaymentsIpnUrl": f"{public_base_url()}/api/webhooks/nowpayments",
        }
    )


@app.get("/api/nowpayments/ip")
def nowpayments_ip_info():
    """Simple page/API for copying server IP for NOWPayments whitelist."""
    outbound = get_outbound_ip()
    return jsonify(
        {
            "ok": True,
            "outboundIp": outbound,
            "instructions": [
                "1. Copy outboundIp below",
                "2. NOWPayments dashboard → Settings → Payments → IP addresses",
                "3. Add / whitelist that IP (IPv4)",
                "4. Save, then retry Crypto checkout",
            ],
            "ipnCallbackUrl": f"{public_base_url()}/api/webhooks/nowpayments",
            "nowpaymentsNotificationIps": NOWPAYMENTS_IPN_IPS,
            "note": (
                "Free Render uses shared IPs that may change. "
                "For a fixed IP, use a paid Render static outbound IP or set SERVER_OUTBOUND_IP env."
            ),
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
            # Frontend only enables Stripe Checkout when both configured AND STRIPE_SHOW=1
            "stripeEnabled": stripe_configured()
            and (os.environ.get("STRIPE_SHOW") or "0").strip().lower()
            in ("1", "true", "yes", "on"),
            "stripePublishableKey": (
                (os.environ.get("STRIPE_PUBLISHABLE_KEY") or "")
                if (
                    stripe_configured()
                    and (os.environ.get("STRIPE_SHOW") or "0").strip().lower()
                    in ("1", "true", "yes", "on")
                )
                else ""
            ),
            "paymongoEnabled": paymongo_configured(),
            "xenditEnabled": xendit_configured(),
            "paypalEnabled": paypal_configured(),
            "cryptoEnabled": crypto_configured(),
            "liqpayEnabled": liqpay_configured(),
            "ewalletProvider": ewallet_provider(),
            "paymentMethods": available_payment_methods(),
        }
    )


def payment_mode() -> str:
    """
    stripe / live  → real payment providers
    instant_demo   → free fulfill only when demo is allowed
    """
    mode = (os.environ.get("PAYMENT_MODE") or "").strip().lower()
    if mode:
        return mode
    if any_live_payment_provider():
        return "live"
    if os.environ.get("STRIPE_SECRET_KEY"):
        return "stripe"
    return "instant_demo"


def any_live_payment_provider() -> bool:
    """True when at least one real money processor is configured."""
    show_stripe = (os.environ.get("STRIPE_SHOW") or "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    return bool(
        (stripe_configured() and show_stripe)
        or paymongo_configured()
        or xendit_configured()
        or paypal_configured()
        or crypto_configured()
        or liqpay_configured()
    )


def demo_checkout_allowed() -> bool:
    """
    Free demo fulfill is OFF whenever a live payment provider is configured,
    unless ALLOW_DEMO_CHECKOUT=1 is set explicitly.
    """
    flag = (os.environ.get("ALLOW_DEMO_CHECKOUT") or "").strip().lower()
    if flag in ("1", "true", "yes", "on"):
        return True
    if flag in ("0", "false", "no", "off"):
        return False
    # Default: allow demo only when no live providers exist
    return not any_live_payment_provider()


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
            "Payment confirmed. Login details delivered on-site and emailed "
            f"to {order.get('email') or 'you'} (Order ID + Payment ID included)."
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
        creds = reserve_codes(pid, qty)
        # codes: display strings for email/back-compat; credentials: structured for UI
        code_strings = []
        for cr in creds:
            if cr.get("username") or cr.get("password"):
                code_strings.append(
                    f"Username: {cr.get('username') or '—'}  Password: {cr.get('password') or '—'}"
                )
            else:
                code_strings.append(cr.get("raw") or cr.get("code") or "")
        includes = deal.get("includes") or []
        if isinstance(includes, str):
            includes = [x.strip() for x in includes.split("\n") if x.strip()]
        elif not isinstance(includes, list):
            includes = []
        includes = [str(x).strip() for x in includes if str(x).strip()]
        line_results.append(
            {
                "id": pid,
                "name": deal.get("name"),
                "monogram": deal.get("monogram"),
                "brand": deal.get("brand"),
                "category": deal.get("category"),
                "qty": qty,
                "price": deal.get("price"),
                "priceBase": deal.get("priceBase", "USD"),
                "duration": deal.get("duration"),
                "delivery": deal.get("delivery"),
                "description": deal.get("description"),
                "includes": includes,
                "accountType": deal.get("accountType"),
                "validity": deal.get("validity"),
                "howToRedeem": deal.get("howToRedeem") or "",
                "importantNotes": deal.get("importantNotes") or "",
                "finePrint": deal.get("finePrint") or "",
                "codes": code_strings,
                "credentials": creds,
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


def paypal_credentials() -> tuple[str, str, str, str]:
    """Return (client_id, secret, mode, api_base). Strips whitespace/quotes from env."""
    client_id = (os.environ.get("PAYPAL_CLIENT_ID") or "").strip().strip('"').strip("'")
    secret = (os.environ.get("PAYPAL_CLIENT_SECRET") or "").strip().strip('"').strip("'")
    mode = (os.environ.get("PAYPAL_MODE") or "sandbox").strip().lower()
    if mode not in ("sandbox", "live"):
        mode = "sandbox"
    api_base = (
        "https://api-m.sandbox.paypal.com"
        if mode == "sandbox"
        else "https://api-m.paypal.com"
    )
    return client_id, secret, mode, api_base


def paypal_configured() -> bool:
    client_id, secret, _, _ = paypal_credentials()
    return bool(client_id and secret)


def crypto_configured() -> bool:
    return bool(
        (os.environ.get("NOWPAYMENTS_API_KEY") or "").strip().strip('"').strip("'")
    )


def liqpay_configured() -> bool:
    pub = (os.environ.get("LIQPAY_PUBLIC_KEY") or "").strip().strip('"').strip("'")
    priv = (os.environ.get("LIQPAY_PRIVATE_KEY") or "").strip().strip('"').strip("'")
    return bool(pub and priv)


def liqpay_keys() -> tuple[str, str]:
    pub = (os.environ.get("LIQPAY_PUBLIC_KEY") or "").strip().strip('"').strip("'")
    priv = (os.environ.get("LIQPAY_PRIVATE_KEY") or "").strip().strip('"').strip("'")
    return pub, priv


def liqpay_encode(params: dict, private_key: str) -> tuple[str, str]:
    """Return (data_b64, signature_b64) for LiqPay Checkout API."""
    import base64
    import hashlib

    data_json = json.dumps(params, ensure_ascii=False, separators=(",", ":"))
    data_b64 = base64.b64encode(data_json.encode("utf-8")).decode("ascii")
    sign_str = f"{private_key}{data_b64}{private_key}"
    signature = base64.b64encode(hashlib.sha1(sign_str.encode("utf-8")).digest()).decode(
        "ascii"
    )
    return data_b64, signature


def liqpay_decode_callback(data_b64: str, signature: str, private_key: str) -> dict | None:
    """Verify signature and decode LiqPay callback data. Returns dict or None if invalid."""
    import base64
    import hashlib

    if not data_b64 or not signature:
        return None
    sign_str = f"{private_key}{data_b64}{private_key}"
    expected = base64.b64encode(hashlib.sha1(sign_str.encode("utf-8")).digest()).decode(
        "ascii"
    )
    if expected != signature:
        return None
    try:
        raw = base64.b64decode(data_b64.encode("ascii")).decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None


def _nowpayments_http(method: str, url: str, *, api_key: str, json_body=None, timeout: int = 30):
    """
    Call NOWPayments API. Cloudflare blocks stock Python urllib (Error 1010).
    Prefer curl_cffi (Chrome TLS), then requests, then urllib.
    Returns (status_code, parsed_json_or_none, raw_text).
    """
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "SubSaverPH/1.0 (+https://subsaverph.com; NOWPayments client)",
    }
    method_u = (method or "GET").upper()

    # 1) curl_cffi — best chance past Cloudflare bot filter
    try:
        from curl_cffi import requests as cf_requests

        r = cf_requests.request(
            method_u,
            url,
            headers=headers,
            json=json_body,
            timeout=timeout,
            impersonate="chrome120",
        )
        text = r.text or ""
        try:
            data = r.json() if text else None
        except Exception:
            data = None
        return r.status_code, data, text[:800]
    except Exception:
        pass

    # 2) requests
    try:
        import requests

        r = requests.request(
            method_u,
            url,
            headers=headers,
            json=json_body,
            timeout=timeout,
        )
        text = r.text or ""
        try:
            data = r.json() if text else None
        except Exception:
            data = None
        return r.status_code, data, text[:800]
    except Exception:
        pass

    # 3) urllib fallback
    import urllib.error
    import urllib.request

    data_bytes = None
    if json_body is not None:
        data_bytes = json.dumps(json_body).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method_u)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(text) if text else None
            except Exception:
                data = None
            return resp.getcode() or 200, data, text[:800]
    except urllib.error.HTTPError as e:
        text = ""
        try:
            text = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            data = json.loads(text) if text else None
        except Exception:
            data = None
        return e.code, data, (text or str(e))[:800]
    except Exception as e:
        return 0, None, str(e)[:800]


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
    # Stripe UI off by default (hard for non-US merchants). Set STRIPE_SHOW=1 to re-enable.
    show_stripe = (os.environ.get("STRIPE_SHOW") or "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    has_paymongo = paymongo_configured()
    has_xendit = xendit_configured()
    has_paypal = paypal_configured()
    has_crypto = crypto_configured()
    has_liqpay = liqpay_configured()
    ewallet_prov = ewallet_provider()
    allow_demo = demo_checkout_allowed()
    demo_only = allow_demo and not any_live_payment_provider()

    # Card — Stripe hidden unless STRIPE_SHOW=1
    if has_stripe and show_stripe:
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

    # Philippine e-wallets — only when a real backend is configured (or pure demo mode)
    if ewallet_prov in ("paymongo", "xendit") or demo_only:
        provider = ewallet_prov if ewallet_prov in ("paymongo", "xendit") else "demo"
        if demo_only and provider == "demo":
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

    # PayPal — live only (no free demo PayPal when keys missing)
    if has_paypal:
        methods.append(
            {
                "id": "paypal",
                "label": "PayPal",
                "provider": "paypal",
                "desc": "Pay with PayPal balance or linked card",
                "group": "other",
            }
        )
    elif demo_only:
        methods.append(
            {
                "id": "paypal",
                "label": "PayPal",
                "provider": "demo",
                "desc": "PayPal (demo — set PAYPAL_CLIENT_ID + SECRET for live)",
                "group": "other",
            }
        )

    # Crypto — live only
    if has_crypto:
        methods.append(
            {
                "id": "crypto",
                "label": "Crypto",
                "provider": "nowpayments",
                "desc": "USDT, BTC, ETH & more via NOWPayments",
                "group": "other",
            }
        )
    elif demo_only:
        methods.append(
            {
                "id": "crypto",
                "label": "Crypto",
                "provider": "demo",
                "desc": "Crypto (demo — set NOWPAYMENTS_API_KEY for live)",
                "group": "other",
            }
        )

    # LiqPay — live only
    if has_liqpay:
        methods.append(
            {
                "id": "liqpay",
                "label": "LiqPay",
                "provider": "liqpay",
                "desc": "Card & wallets via LiqPay",
                "group": "other",
            }
        )
    elif demo_only:
        methods.append(
            {
                "id": "liqpay",
                "label": "LiqPay",
                "provider": "demo",
                "desc": "LiqPay (demo — set LIQPAY_PUBLIC_KEY + LIQPAY_PRIVATE_KEY)",
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
    if out:
        return out
    if allow_demo:
        return [
            {
                "id": "demo",
                "label": "Instant demo",
                "provider": "demo",
                "desc": "Test delivery without real money",
            }
        ]
    return []


@app.post("/api/checkout")
def api_checkout():
    """Demo / instant fulfill (no real money). Disabled when live payments are on."""
    if not demo_checkout_allowed():
        return (
            jsonify(
                {
                    "error": "Demo checkout is disabled. Use PayPal, crypto, or another live method.",
                    "hint": "Set ALLOW_DEMO_CHECKOUT=1 only for testing.",
                }
            ),
            403,
        )
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
    method: card | gcash | paymaya | grab_pay | shopeepay | xendit | paypal | crypto | liqpay | demo
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

    # ---- DEMO (no real money) — blocked when live payments are configured ----
    if provider == "demo" or method == "demo":
        if not demo_checkout_allowed():
            return (
                jsonify(
                    {
                        "error": "Demo / free checkout is disabled on this live store.",
                        "hint": "Use a configured payment method (PayPal, crypto, etc.).",
                    }
                ),
                403,
            )
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

    # ---- LiqPay ----
    if method == "liqpay" and provider == "liqpay":
        return _liqpay_checkout(email, name, currency, normalized, cart_meta, base)

    return jsonify({"error": "Payment method not configured on server"}), 503


def _liqpay_checkout(email, name, currency, normalized, cart_meta, base):
    """Create LiqPay checkout payload; client redirected via auto-POST form page."""
    public_key, private_key = liqpay_keys()
    if not public_key or not private_key:
        return jsonify({"error": "LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY not set"}), 503

    pay_currency = (currency or "USD").upper()
    if pay_currency not in {"UAH", "USD", "EUR"}:
        pay_currency = "USD"
    if pay_currency == "USD":
        amount = cart_total_usd(normalized)
    elif pay_currency == "EUR":
        amount = round(cart_total_usd(normalized) * 0.92, 2)
    else:
        amount = round(cart_total_usd(normalized) * 41.0, 2)

    if amount < 0.5:
        return jsonify({"error": "Order total too low for LiqPay"}), 400

    ref = f"lq_{uuid.uuid4().hex[:16]}"
    params = {
        "public_key": public_key,
        "version": "3",
        "action": "pay",
        "amount": f"{amount:.2f}",
        "currency": pay_currency,
        "description": f"SubSaverPH order for {email}",
        "order_id": ref,
        "result_url": f"{base}/api/checkout/liqpay/return?ref={ref}",
        "server_url": f"{base}/api/webhooks/liqpay",
        "language": "en",
        "info": name or email,
        "customer": email,
    }
    data_b64, signature = liqpay_encode(params, private_key)

    pending = read_json(STORE / "pending_payments.json", {})
    pending[ref] = {
        "email": email,
        "name": name,
        "cart": cart_meta,
        "method": "liqpay",
        "provider": "liqpay",
        "currency": pay_currency,
        "amount": amount,
        "liqpayData": data_b64,
        "liqpaySignature": signature,
        "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    write_json(STORE / "pending_payments.json", pending)

    return jsonify(
        {
            "ok": True,
            "provider": "liqpay",
            "method": "liqpay",
            "url": f"{base}/api/checkout/liqpay/go?ref={ref}",
            "ref": ref,
        }
    )


@app.get("/api/checkout/liqpay/go")
def liqpay_go():
    """Auto-submit HTML form to LiqPay hosted checkout."""
    ref = (request.args.get("ref") or "").strip()
    if not ref:
        return "Missing ref", 400
    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(ref) or {}
    data_b64 = pending.get("liqpayData")
    signature = pending.get("liqpaySignature")
    if not data_b64 or not signature:
        return "Unknown or expired LiqPay session", 404

    def esc(s: str) -> str:
        return (
            str(s)
            .replace("&", "&amp;")
            .replace('"', "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting to LiqPay…</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background:#000; color:#fff;
      display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }}
    p {{ opacity:0.8; }}
  </style>
</head>
<body>
  <div>
    <p>Redirecting to LiqPay secure checkout…</p>
    <form id="liqpay" method="POST" action="https://www.liqpay.ua/api/3/checkout" accept-charset="utf-8">
      <input type="hidden" name="data" value="{esc(data_b64)}" />
      <input type="hidden" name="signature" value="{esc(signature)}" />
      <noscript><button type="submit">Continue to LiqPay</button></noscript>
    </form>
  </div>
  <script>document.getElementById("liqpay").submit();</script>
</body>
</html>"""
    return make_response(html)


@app.get("/api/checkout/liqpay/return")
def liqpay_return():
    """Customer browser return after LiqPay payment page."""
    ref = (request.args.get("ref") or "").strip()
    base = public_base_url()
    if not ref:
        return redirect(f"{base}/#/checkout?cancelled=1")
    return redirect(f"{base}/#/success?provider=liqpay&ref={ref}")


@app.route("/api/webhooks/liqpay", methods=["GET", "POST"])
def liqpay_webhook():
    """LiqPay server_url callback (payment status)."""
    if request.method == "GET":
        return jsonify(
            {
                "ok": True,
                "webhook": "liqpay",
                "message": "LiqPay server_url ready",
                "url": f"{public_base_url()}/api/webhooks/liqpay",
            }
        )

    data_b64 = request.form.get("data") or (request.get_json(silent=True) or {}).get("data")
    signature = request.form.get("signature") or (request.get_json(silent=True) or {}).get(
        "signature"
    )
    _public_key, private_key = liqpay_keys()
    if not private_key:
        return jsonify({"ok": False, "error": "liqpay_not_configured"}), 503

    payload = liqpay_decode_callback(str(data_b64 or ""), str(signature or ""), private_key)
    if not payload:
        if os.environ.get("LIQPAY_TRUST_UNSIGNED", "0") == "1" and data_b64:
            try:
                import base64

                payload = json.loads(base64.b64decode(str(data_b64)).decode("utf-8"))
            except Exception:
                return jsonify({"ok": False, "error": "bad_signature"}), 401
        else:
            return jsonify({"ok": False, "error": "bad_signature"}), 401

    status = str(payload.get("status") or "").lower()
    order_id = str(payload.get("order_id") or "").strip()
    paid_ok = status in (
        "success",
        "sandbox",
        "wait_accept",
        "wait_secure",
        "subscribed",
    )
    if not paid_ok:
        return jsonify({"ok": True, "skipped": status, "order_id": order_id})

    if not order_id:
        return jsonify({"ok": True, "skipped": "no_order_id"})

    for existing in load_orders():
        if existing.get("providerRef") == order_id:
            return jsonify({"ok": True, "duplicate": True})

    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(order_id)
    if not pending:
        return jsonify({"ok": True, "skipped": "unknown_order", "order_id": order_id})

    try:
        fulfill_order(
            email=pending.get("email") or payload.get("sender_email") or "",
            name=pending.get("name") or "",
            currency=pending.get("currency") or payload.get("currency") or "USD",
            items=pending.get("cart") or [],
            payment_mode_name="liqpay",
            method="liqpay",
            provider_ref=order_id,
        )
        pending_all.pop(order_id, None)
        write_json(STORE / "pending_payments.json", pending_all)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 409

    return jsonify({"ok": True, "fulfilled": True, "order_id": order_id, "status": status})


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


def _paypal_oauth_token(client_id: str, secret: str, api_base: str, mode: str):
    """Get PayPal access token; return (token|None, error_message|None)."""
    import base64
    import urllib.error
    import urllib.request

    auth = base64.b64encode(f"{client_id}:{secret}".encode("utf-8")).decode("ascii")
    token_req = urllib.request.Request(
        f"{api_base}/v1/oauth2/token",
        data=b"grant_type=client_credentials",
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(token_req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            token = payload.get("access_token")
            if not token:
                return None, "PayPal auth returned no access_token"
            return token, None
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:400]
        except Exception:
            pass
        if e.code == 401:
            other = "live" if mode == "sandbox" else "sandbox"
            return None, (
                f"PayPal 401 Unauthorized (mode={mode}). "
                f"Client ID and Secret do not match, or they are for {other} while "
                f"PAYPAL_MODE={mode}. "
                f"Fix: Developer Dashboard → Apps → select {'Sandbox' if mode == 'sandbox' else 'Live'} "
                f"→ copy Client ID + Secret again → set PAYPAL_MODE={mode} on Render → redeploy. "
                f"Details: {body or e}"
            )
        return None, f"PayPal auth HTTP {e.code}: {body or e}"
    except Exception as e:
        return None, f"PayPal auth error: {e}"


def _paypal_checkout(email, name, currency, normalized, cart_meta, base):
    client_id, secret, mode, api_base = paypal_credentials()
    if not client_id or not secret:
        return jsonify({"error": "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set"}), 503

    import urllib.request

    token, auth_err = _paypal_oauth_token(client_id, secret, api_base, mode)
    if not token:
        return jsonify({"error": auth_err or "PayPal auth failed", "paypalMode": mode}), 502

    # PayPal supports major currencies; fall back to USD for others (e.g. PHP display)
    pay_currency = (currency or "USD").upper()
    if pay_currency not in {"USD", "EUR", "GBP", "AUD", "CAD", "SGD", "JPY", "PHP"}:
        pay_currency = "USD"
    # Always compute from USD cart total then convert for supported FX
    total_usd = cart_total_usd(normalized)
    rates_from_usd = {
        "USD": 1.0,
        "EUR": 0.92,
        "GBP": 0.79,
        "AUD": 1.53,
        "CAD": 1.36,
        "SGD": 1.34,
        "JPY": 149.5,
        "PHP": 56.5,
    }
    total = total_usd * rates_from_usd.get(pay_currency, 1.0)
    if pay_currency == "JPY":
        value = str(max(1, int(round(total))))
    else:
        value = f"{total:.2f}"
    ref = f"pp_{uuid.uuid4().hex[:16]}"

    # Server-side return URL — PayPal appends ?token= which breaks hash-only return URLs
    return_url = f"{base}/api/checkout/paypal/return?ref={ref}"
    cancel_url = f"{base}/api/checkout/paypal/cancel"

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
            "shipping_preference": "NO_SHIPPING",
            "return_url": return_url,
            "cancel_url": cancel_url,
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
    api_key = (os.environ.get("NOWPAYMENTS_API_KEY") or "").strip().strip('"').strip("'")
    if not api_key:
        return jsonify({"error": "NOWPAYMENTS_API_KEY not set"}), 503

    price_usd = cart_total_usd(normalized)
    if price_usd < 0.5:
        return jsonify(
            {
                "error": "Order total too low for crypto (minimum about $0.50 USD).",
            }
        ), 400

    ref = f"cr_{uuid.uuid4().hex[:16]}"
    # Hosted invoice page — server return URLs avoid broken hash redirects
    body = {
        "price_amount": round(price_usd, 2),
        "price_currency": "usd",
        "order_id": ref,
        "order_description": f"SubSaverPH digital codes ({email})",
        "ipn_callback_url": f"{base}/api/webhooks/nowpayments",
        "success_url": f"{base}/api/checkout/crypto/return?ref={ref}",
        "cancel_url": f"{base}/api/checkout/crypto/cancel",
        "is_fixed_rate": True,
        "is_fee_paid_by_user": False,
    }
    api_base = (
        os.environ.get("NOWPAYMENTS_API_BASE") or "https://api.nowpayments.io/v1"
    ).rstrip("/")
    status, inv, raw = _nowpayments_http(
        "POST", f"{api_base}/invoice", api_key=api_key, json_body=body
    )
    if status != 200 and status != 201:
        hint = "Check NOWPAYMENTS_API_KEY and that your NOWPayments account is active."
        if status == 403 or "1010" in (raw or "") or "cloudflare" in (raw or "").lower():
            hint = (
                "Cloudflare blocked the API call (Error 1010). "
                "Redeploy so curl_cffi is installed, or contact NOWPayments support "
                "to whitelist your server. Confirm the API key is correct."
            )
        return jsonify(
            {
                "error": f"NOWPayments error HTTP {status}: {(raw or '')[:400]}",
                "hint": hint,
            }
        ), 502

    if not isinstance(inv, dict):
        return jsonify({"error": "Invalid NOWPayments response", "raw": raw}), 502

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
        "tokenId": inv.get("token_id"),
        "currency": "USD",
        "amountUsd": round(price_usd, 2),
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
            "invoiceId": inv.get("id"),
        }
    )


@app.get("/api/checkout/crypto/return")
def crypto_return():
    """NOWPayments success redirect → success page to verify + fulfill."""
    ref = (request.args.get("ref") or "").strip()
    base = public_base_url()
    if not ref:
        return redirect(f"{base}/#/checkout?cancelled=1")
    return redirect(f"{base}/#/success?provider=crypto&ref={ref}")


@app.get("/api/checkout/crypto/cancel")
def crypto_cancel():
    base = public_base_url()
    return redirect(f"{base}/#/checkout?cancelled=1")


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
    elif provider == "liqpay" or pending.get("provider") == "liqpay":
        # Prefer server_url webhook. Soft trust is OFF by default (set LIQPAY_TRUST_RETURN=1 only for testing).
        if os.environ.get("LIQPAY_TRUST_RETURN", "0") != "1":
            return jsonify(
                {
                    "error": "Waiting for LiqPay callback. Refresh in a few seconds.",
                }
            ), 402

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


@app.get("/api/checkout/paypal/return")
def paypal_return():
    """PayPal redirects here after approval (avoids broken hash return URLs)."""
    ref = (request.args.get("ref") or "").strip()
    base = public_base_url()
    if not ref:
        return redirect(f"{base}/#/checkout?cancelled=1")
    # Optional: token is PayPal order id — store if missing
    token = (request.args.get("token") or "").strip()
    if token:
        pending_all = read_json(STORE / "pending_payments.json", {})
        pending = pending_all.get(ref) or {}
        if pending and not pending.get("paypalOrderId"):
            pending["paypalOrderId"] = token
            pending_all[ref] = pending
            write_json(STORE / "pending_payments.json", pending_all)
    return redirect(f"{base}/#/success?provider=paypal&ref={ref}")


@app.get("/api/checkout/paypal/cancel")
def paypal_cancel():
    base = public_base_url()
    return redirect(f"{base}/#/checkout?cancelled=1")


def _paypal_capture(pending: dict) -> bool:
    client_id, secret, mode, api_base = paypal_credentials()
    order_id = pending.get("paypalOrderId")
    if not all([client_id, secret, order_id]):
        return False
    import urllib.request

    token, auth_err = _paypal_oauth_token(client_id, secret, api_base, mode)
    if not token:
        return False
    try:
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
    """Verify crypto payment via NOWPayments invoice / payment lookup."""
    api_key = (os.environ.get("NOWPAYMENTS_API_KEY") or "").strip().strip('"').strip("'")
    invoice_id = pending.get("invoiceId")
    # Allow soft return if IPN may lag (optional)
    trust = os.environ.get("CRYPTO_TRUST_RETURN", "0") == "1"
    if not api_key:
        return trust

    api_base = (
        os.environ.get("NOWPAYMENTS_API_BASE") or "https://api.nowpayments.io/v1"
    ).rstrip("/")

    def _status_ok(status: str) -> bool:
        s = (status or "").lower()
        return s in ("finished", "confirmed", "sending", "paid")

    # 1) Invoice by id
    if invoice_id:
        code, data, _raw = _nowpayments_http(
            "GET", f"{api_base}/invoice/{invoice_id}", api_key=api_key
        )
        if code == 200 and isinstance(data, dict):
            status = (
                data.get("payment_status")
                or data.get("invoice_status")
                or data.get("status")
                or ""
            )
            if _status_ok(status):
                return True

    # 2) Payments linked to invoice
    if invoice_id:
        code, data, _raw = _nowpayments_http(
            "GET",
            f"{api_base}/payment/?invoiceId={invoice_id}&limit=5",
            api_key=api_key,
        )
        if code == 200 and data is not None:
            payments = []
            if isinstance(data, list):
                payments = data
            elif isinstance(data, dict):
                payments = data.get("data") or data.get("payments") or []
            for p in payments:
                if isinstance(p, dict) and _status_ok(
                    p.get("payment_status") or p.get("status") or ""
                ):
                    return True

    return trust


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

    # Only fulfill paid-like events (never trust all event types)
    typ_l = str(typ or "").lower()
    event_ok = (
        "payment.paid" in typ_l
        or "checkout_session.payment.paid" in typ_l
        or typ_l.endswith(".paid")
        or typ_l == "payment.paid"
    )
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


def _nowpayments_sort_obj(obj):
    """Recursively sort keys for IPN HMAC (NOWPayments requirement)."""
    if isinstance(obj, dict):
        return {k: _nowpayments_sort_obj(obj[k]) for k in sorted(obj.keys())}
    if isinstance(obj, list):
        return [_nowpayments_sort_obj(x) for x in obj]
    return obj


def _nowpayments_verify_sig(payload: dict) -> tuple[bool, str]:
    """
    Verify x-nowpayments-sig header when NOWPAYMENTS_IPN_SECRET is set.
    If secret not set, accept (still process) but note verification skipped.
    """
    secret = (os.environ.get("NOWPAYMENTS_IPN_SECRET") or "").strip()
    if not secret:
        return True, "ipn_secret_not_set"
    sig = (request.headers.get("x-nowpayments-sig") or request.headers.get("X-Nowpayments-Sig") or "").strip()
    if not sig:
        return False, "missing_signature"
    import hashlib
    import hmac as hmac_mod

    sorted_msg = json.dumps(_nowpayments_sort_obj(payload), separators=(",", ":"), ensure_ascii=False)
    digest = hmac_mod.new(secret.encode("utf-8"), sorted_msg.encode("utf-8"), hashlib.sha512).hexdigest()
    if hmac_mod.compare_digest(digest, sig):
        return True, "ok"
    # Some payloads need unescaped slashes only
    sorted_msg2 = json.dumps(_nowpayments_sort_obj(payload), separators=(",", ":"), ensure_ascii=False)
    digest2 = hmac_mod.new(secret.encode("utf-8"), sorted_msg2.encode("utf-8"), hashlib.sha512).hexdigest()
    if hmac_mod.compare_digest(digest2, sig):
        return True, "ok"
    return False, "bad_signature"


@app.route("/api/webhooks/nowpayments", methods=["GET", "POST", "HEAD"])
def nowpayments_webhook():
    """
    NOWPayments IPN callback.
    - GET/HEAD: health check for dashboard "test URL" (must not 404)
    - POST: payment status updates; fulfill when paid
    """
    # Dashboard / uptime probes often use GET
    if request.method in ("GET", "HEAD"):
        return (
            jsonify(
                {
                    "ok": True,
                    "service": "SubSaverPH",
                    "webhook": "nowpayments",
                    "message": "IPN endpoint ready. Send POST callbacks here.",
                    "ipnUrl": f"{public_base_url()}/api/webhooks/nowpayments",
                }
            ),
            200,
        )

    # Prefer JSON; also accept form-encoded
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}
        if request.form:
            payload = {k: request.form.get(k) for k in request.form}
        elif request.data:
            try:
                payload = json.loads(request.data.decode("utf-8"))
            except Exception:
                payload = {}

    ok_sig, sig_note = _nowpayments_verify_sig(payload if isinstance(payload, dict) else {})
    if not ok_sig:
        # Still 200 for "missing secret not configured" is handled above;
        # reject only bad signatures so attackers can't forge IPNs when secret is set
        return jsonify({"ok": False, "error": sig_note}), 401

    order_id = str(payload.get("order_id") or "").strip()
    status = str(payload.get("payment_status") or payload.get("status") or "").lower()
    payment_id = payload.get("payment_id") or payload.get("id")

    # Waiting / partial — acknowledge, do not fulfill yet
    if status not in ("finished", "confirmed", "sending", "paid"):
        return jsonify(
            {
                "ok": True,
                "skipped": status or "empty_status",
                "order_id": order_id,
                "payment_id": payment_id,
                "sig": sig_note,
            }
        )

    ref = order_id
    if not ref:
        return jsonify({"ok": True, "skipped": "no_order_id", "payment_id": payment_id})

    for existing in load_orders():
        if existing.get("providerRef") == ref:
            return jsonify({"ok": True, "duplicate": True, "order_id": ref})

    pending_all = read_json(STORE / "pending_payments.json", {})
    pending = pending_all.get(ref)
    if not pending:
        # Store payment_id for later manual match if needed
        return jsonify(
            {
                "ok": True,
                "skipped": "unknown_order",
                "order_id": ref,
                "hint": "No pending checkout for this order_id (expired or already cleaned).",
            }
        )

    try:
        fulfill_order(
            email=pending.get("email") or "",
            name=pending.get("name") or "",
            currency=pending.get("currency") or "USD",
            items=pending.get("cart") or [],
            payment_mode_name="nowpayments",
            method="crypto",
            provider_ref=ref,
        )
        # Keep invoice id linkage
        if payment_id:
            pending_all.get(ref, {})
        pending_all.pop(ref, None)
        write_json(STORE / "pending_payments.json", pending_all)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 409

    return jsonify({"ok": True, "fulfilled": True, "order_id": ref, "sig": sig_note})


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
    for k, v in data.items():
        if not isinstance(k, str):
            continue
        if k == "uiStrings" and isinstance(v, dict):
            current["uiStrings"] = {
                str(sk): str(sv) for sk, sv in v.items() if sk is not None
            }
        else:
            current[k] = v
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


@app.delete("/api/admin/inventory/<product_id>")
@require_admin
def admin_clear_product_inventory(product_id: str):
    """Remove all codes for one product (available + sold → 0)."""
    inv = load_inventory()
    removed = len(inv.get(product_id) or [])
    inv[product_id] = []
    save_inventory(inv)
    return jsonify({"ok": True, "productId": product_id, "removed": removed})


@app.post("/api/admin/inventory/clear-all")
@require_admin
def admin_clear_all_inventory():
    """
    Clear stock counts for all products.
    Body optional: { "mode": "all" | "sold" }
      all  — wipe every code (available, sold, total → 0)
      sold — remove only sold rows; keep available stock
    """
    data = request.get_json(silent=True) or {}
    mode = (data.get("mode") or "all").strip().lower()
    if mode not in ("all", "sold"):
        return jsonify({"error": "mode must be all or sold"}), 400

    inv = load_inventory()
    removed = 0
    if mode == "all":
        for pid in list(inv.keys()):
            removed += len(inv.get(pid) or [])
            inv[pid] = []
        # Keep keys aligned with products as empty lists
        for d in load_deals(include_inactive=True):
            pid = d.get("id")
            if pid:
                inv[pid] = []
    else:
        for pid, codes in list(inv.items()):
            if not isinstance(codes, list):
                continue
            kept = [c for c in codes if c.get("status", "available") != "sold"]
            removed += len(codes) - len(kept)
            inv[pid] = kept
    save_inventory(inv)
    return jsonify({"ok": True, "mode": mode, "removed": removed})


@app.get("/api/admin/orders")
@require_admin
def admin_orders():
    return jsonify({"orders": load_orders()[:100]})


@app.post("/api/admin/test-invoice")
@require_admin
def admin_test_invoice():
    """
    Send a sample order invoice email (username, password, product details).
    Safe: does not charge, does not consume stock, does not save an order.
    Body: { email, name?, productId?, previewOnly? }
    """
    try:
        from email_delivery import (
            mail_configured,
            send_order_invoice,
            build_invoice_content,
            _from_header,
        )
    except Exception as e:
        return jsonify({"error": f"Email module error: {e}"}), 500

    try:
        data = request.get_json(silent=True) or {}
        preview_only = bool(
            data.get("previewOnly")
            or data.get("preview")
            or data.get("dryRun")
        )

        if not preview_only and not mail_configured():
            return jsonify(
                {
                    "error": "Email not configured. Set RESEND_API_KEY (or SMTP_*) on Render Environment.",
                }
            ), 400

        to_email = (data.get("email") or "").strip()
        if not to_email or "@" not in to_email:
            settings = load_settings()
            to_email = (settings.get("supportEmail") or "").strip()
        if not to_email or "@" not in to_email:
            if preview_only:
                to_email = "preview@example.com"
            else:
                return jsonify({"error": "Provide a valid email address to send the test to"}), 400

        name = (data.get("name") or "Test Customer").strip() or "Test Customer"
        deals = load_deals(include_inactive=True)
        deal = None
        product_id = (data.get("productId") or "").strip()
        if product_id:
            deal = next((d for d in deals if d.get("id") == product_id), None)
        if deal is None and deals:
            deal = deals[0]

        demo_creds = [
            {
                "username": "demo.login@example.com",
                "password": "DemoOnly-NotARealPassword",
                "raw": "demo.login@example.com|DemoOnly-NotARealPassword",
                "code": "",
            }
        ]
        demo_codes = [
            "Username: demo.login@example.com  Password: DemoOnly-NotARealPassword"
        ]

        if deal:
            item = {
                "id": deal.get("id"),
                "name": deal.get("name") or "Sample product",
                "brand": deal.get("brand"),
                "category": deal.get("category"),
                "qty": 1,
                "price": deal.get("price") or 0,
                "priceBase": deal.get("priceBase") or "PHP",
                "duration": deal.get("duration") or deal.get("period") or "—",
                "delivery": deal.get("delivery") or "Instant digital",
                "description": (
                    "[TEST EMAIL — not a real purchase] "
                    + str(deal.get("description") or "Sample product description.")
                ),
                "accountType": deal.get("accountType") or "Demo shared login",
                "validity": deal.get("validity") or "Demo only",
                "howToRedeem": deal.get("howToRedeem")
                or "This is a test email. Sign-in steps would appear here after a real order.",
                "importantNotes": deal.get("importantNotes")
                or "Do not change username, password, billing, or subscription on real accounts.",
                "codes": demo_codes,
                "credentials": demo_creds,
            }
            currency = str(deal.get("priceBase") or "PHP").upper()
        else:
            item = {
                "id": "sample-product",
                "name": "Sample SuperGrok 1 Month (test)",
                "brand": "SuperGrok",
                "category": "AI",
                "qty": 1,
                "price": 499,
                "priceBase": "PHP",
                "duration": "1 month",
                "delivery": "Instant digital",
                "description": "[TEST EMAIL — not a real purchase] Sample product details for email preview.",
                "accountType": "Demo shared login",
                "validity": "Demo only",
                "howToRedeem": "Open the service → sign in with the username and password below.",
                "importantNotes": "Do not change username, password, billing, or subscription.",
                "codes": demo_codes,
                "credentials": demo_creds,
            }
            currency = "PHP"

        order_id = "TEST" + uuid.uuid4().hex[:8].upper()
        order = {
            "id": order_id,
            "email": to_email,
            "name": name,
            "currency": currency,
            "items": [item],
            "status": "test",
            "paymentMode": "test-invoice",
            "method": "test (admin)",
            "providerRef": "TEST-PAYMENT-NOT-REAL",
            "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "delivery": "instant",
            "message": "Admin test invoice — not a real order.",
        }

        # Fast path: build invoice only (no outbound Resend call — avoids CF timeouts)
        if preview_only:
            subject, text, _html = build_invoice_content(order)
            return jsonify(
                {
                    "ok": True,
                    "previewOnly": True,
                    "to": to_email,
                    "orderId": order_id,
                    "productName": item.get("name"),
                    "subject": subject,
                    "plainPreview": text[:1200],
                    "hasUsername": "demo.login@example.com" in text,
                    "hasPassword": "DemoOnly-NotARealPassword" in text,
                    "mailConfigured": mail_configured(),
                    "fromAddress": _from_header() if mail_configured() else None,
                    "note": "Preview only — email was NOT sent.",
                }
            )

        # No BCC on test sends (avoids Resend free-tier multi-recipient failures)
        # IMPORTANT: do not use HTTP 502 for mail failures — Cloudflare replaces
        # origin 502 bodies with its own HTML error page, hiding our JSON.
        result = send_order_invoice(order, skip_notify=True)
        if not result.get("ok"):
            detail = str(result.get("detail") or "Failed to send test invoice")
            if "<!DOCTYPE" in detail or "<html" in detail.lower():
                detail = (
                    "Email provider returned an HTML error page. "
                    "Check RESEND_API_KEY and MAIL_FROM on Render. "
                    f"Raw: {detail[:180]}"
                )
            return (
                jsonify(
                    {
                        "ok": False,
                        "error": detail,
                        "provider": result.get("provider"),
                        "detail": detail,
                        "to": to_email,
                        "orderId": order_id,
                        "fromAddress": result.get("fromAddress") or _from_header(),
                    }
                ),
                422,
            )

        return jsonify(
            {
                "ok": True,
                "to": to_email,
                "orderId": order_id,
                "provider": result.get("provider"),
                "detail": str(result.get("detail") or "")[:300],
                "productName": item.get("name"),
                "fromAddress": result.get("fromAddress") or _from_header(),
                "note": (
                    "Sent sample invoice with demo username/password and product details. "
                    "No stock was used and no real order was saved."
                ),
            }
        )
    except Exception as e:
        # Use 400 not 500/502 so Cloudflare keeps the JSON body
        return jsonify({"ok": False, "error": f"Test invoice failed: {e}"}), 400


def normalize_deal(data: dict, deal_id: str) -> dict:
    includes = data.get("includes") or []
    if isinstance(includes, str):
        includes = [x.strip() for x in includes.split("\n") if x.strip()]

    def num(v, default=0):
        try:
            return float(v)
        except (TypeError, ValueError):
            return default

    def lines(v):
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str):
            return [x.strip() for x in v.replace("\r", "").split("\n") if x.strip()]
        return []

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
        # Extra admin-editable product details (shown on product page)
        "accountType": (data.get("accountType") or "").strip(),
        "validity": (data.get("validity") or "").strip(),
        "howToRedeem": (data.get("howToRedeem") or "").strip(),
        "importantNotes": (data.get("importantNotes") or "").strip(),
        "extraDetails": lines(data.get("extraDetails")),
        "active": bool(data.get("active", True)),
    }


# ---------- static pages ----------


@app.get("/")
def public_index():
    return _serve_html("index.html")


@app.get("/admin")
@app.get("/admin/")
def admin_page():
    return _serve_html("index.html", ROOT / "admin")


@app.get("/admin/<path:path>")
def admin_static(path: str):
    return send_from_directory(ROOT / "admin", path)


@app.get("/robots.txt")
def robots_txt():
    """Always advertise sitemap on the preferred public domain."""
    base = public_base_url()
    body = (ROOT / "robots.txt").read_text(encoding="utf-8")
    # Force correct sitemap URL (file may still have an old host)
    if re.search(r"(?im)^Sitemap:\s*", body):
        body = re.sub(r"(?im)^Sitemap:\s*.+$", f"Sitemap: {base}/sitemap.xml", body)
    else:
        body = body.rstrip() + f"\n\nSitemap: {base}/sitemap.xml\n"
    # Drop any leftover onrender references
    body = body.replace("https://subsaverph.onrender.com", base)
    resp = make_response(body)
    resp.headers["Content-Type"] = "text/plain; charset=utf-8"
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


@app.get("/sitemap.xml")
def sitemap_xml():
    """Dynamic sitemap: homepage, key pages, and each live product (crawlable URLs)."""
    from html import escape as _esc
    from datetime import date

    base = public_base_url().rstrip("/")
    today = date.today().isoformat()
    urls: list[tuple[str, str, str]] = [
        (f"{base}/", "1.0", "daily"),
        (f"{base}/deals", "0.9", "daily"),
        (f"{base}/search", "0.7", "weekly"),
        (f"{base}/about", "0.6", "monthly"),
        (f"{base}/support", "0.7", "monthly"),
        (f"{base}/faq", "0.8", "weekly"),
        (f"{base}/terms", "0.3", "yearly"),
        (f"{base}/privacy", "0.3", "yearly"),
    ]
    for d in load_deals(include_inactive=False):
        pid = (d.get("id") or "").strip()
        if not pid:
            continue
        urls.append((f"{base}/product/{_esc(pid)}", "0.8", "weekly"))

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, pri, freq in urls:
        parts.append("  <url>")
        parts.append(f"    <loc>{loc}</loc>")
        parts.append(f"    <lastmod>{today}</lastmod>")
        parts.append(f"    <changefreq>{freq}</changefreq>")
        parts.append(f"    <priority>{pri}</priority>")
        parts.append("  </url>")
    parts.append("</urlset>")
    body = "\n".join(parts) + "\n"
    resp = make_response(body)
    resp.headers["Content-Type"] = "application/xml; charset=utf-8"
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


# Crawlable marketing paths → same SPA (with path→hash bridge in JS)
_SEO_SPA_PATHS = frozenset(
    {
        "deals",
        "search",
        "about",
        "support",
        "faq",
        "terms",
        "privacy",
        "checkout",
        "contact",
    }
)


@app.get("/deals")
@app.get("/search")
@app.get("/about")
@app.get("/support")
@app.get("/faq")
@app.get("/terms")
@app.get("/privacy")
@app.get("/checkout")
@app.get("/contact")
def seo_spa_shell():
    """Real paths for Google (not only hash routes)."""
    return _serve_html("index.html")


@app.get("/how")
def how_page_removed():
    """How it works page removed — keep old links from breaking."""
    return redirect("/", code=302)


@app.get("/product/<deal_id>")
def product_seo_page(deal_id: str):
    """
    Public product URL with unique title/description + Product schema.
    Humans are redirected into the SPA; crawlers get full HTML content.
    """
    from html import escape as _esc

    deal = next(
        (d for d in load_deals(include_inactive=False) if d.get("id") == deal_id),
        None,
    )
    base = public_base_url().rstrip("/")
    if not deal:
        # Soft land on deals
        return redirect(f"{base}/deals", code=302)

    name = str(deal.get("name") or "Plan")
    brand = str(deal.get("brand") or "")
    desc = str(
        deal.get("description")
        or deal.get("tagline")
        or f"Buy {name} prepaid digital access at SubSaverPH Philippines."
    )[:300]
    price = deal.get("price") or 0
    currency = (deal.get("priceBase") or "PHP").upper()
    duration = str(deal.get("duration") or deal.get("period") or "")
    includes = deal.get("includes") or []
    if not isinstance(includes, list):
        includes = []
    url = f"{base}/product/{deal_id}"
    spa_url = f"{base}/#/deal/{deal_id}"
    title = f"{name} — discounted {brand or 'subscription'} PH | SubSaverPH"
    li_html = "".join(f"<li>{_esc(str(x))}</li>" for x in includes[:12])
    product_ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": name,
        "description": desc,
        "brand": {"@type": "Brand", "name": brand or "SubSaverPH"},
        "sku": deal_id,
        "url": url,
        "image": f"{base}/og-image.png",
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": currency,
            "price": str(price),
            "availability": "https://schema.org/InStock",
            "seller": {"@type": "Organization", "name": "SubSaverPH"},
        },
    }
    ld_json = json.dumps(product_ld, ensure_ascii=False)
    html = f"""<!DOCTYPE html>
<html lang="en-PH">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{_esc(title)}</title>
  <meta name="description" content="{_esc(desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
  <link rel="canonical" href="{_esc(url)}" />
  <meta property="og:type" content="product" />
  <meta property="og:url" content="{_esc(url)}" />
  <meta property="og:title" content="{_esc(title)}" />
  <meta property="og:description" content="{_esc(desc)}" />
  <meta property="og:image" content="{base}/og-image.png" />
  <meta property="og:site_name" content="SubSaverPH" />
  <meta property="product:price:amount" content="{_esc(str(price))}" />
  <meta property="product:price:currency" content="{_esc(currency)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{_esc(title)}" />
  <meta name="twitter:description" content="{_esc(desc)}" />
  <link rel="icon" href="{base}/assets/favicon-48.png" type="image/png" sizes="48x48" />
  <script type="application/ld+json">{ld_json}</script>
  <link rel="stylesheet" href="/css/styles.css?v=seo1" />
  <script>
    // Send shoppers into the live SPA product view
    (function () {{
      var target = {json.dumps(spa_url)};
      if (!/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|whatsapp|telegram/i.test(navigator.userAgent||"")) {{
        location.replace(target);
      }}
    }})();
  </script>
</head>
<body class="galaxy">
  <main class="page seo-bootstrap">
    <div class="page-inner">
      <p><a href="/">SubSaverPH</a> · <a href="/deals">All deals</a></p>
      <h1>{_esc(name)}</h1>
      <p><strong>{_esc(brand)}</strong> · {_esc(duration)} · {_esc(str(price))} {_esc(currency)}</p>
      <p>{_esc(desc)}</p>
      <h2>What's included</h2>
      <ul>{li_html or "<li>Digital prepaid access after payment</li>"}</ul>
      <h2>Buy online in the Philippines</h2>
      <p>
        SubSaverPH sells discounted prepaid digital subscriptions with instant digital delivery.
        Pay with card, GCash, Maya, and other methods shown at checkout.
      </p>
      <p><a class="btn solid" href="{_esc(spa_url)}">Open product &amp; buy</a>
         · <a href="/">Home</a> · <a href="/support">Support</a></p>
      <p class="muted">Not affiliated with {_esc(brand) or "the brand"}. Product names are trademarks of their owners.</p>
    </div>
  </main>
</body>
</html>"""
    resp = make_response(html)
    resp.headers["Content-Type"] = "text/html; charset=utf-8"
    resp.headers["X-Robots-Tag"] = "index, follow, max-image-preview:large, max-snippet:-1"
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp


@app.get("/<path:path>")
def public_static(path: str):
    # Don't shadow API
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    # SPA SEO shells already registered above; keep files available
    target = ROOT / path
    if not target.is_file():
        return jsonify({"error": "Not found"}), 404

    # Correct MIME + long cache for brand icons (helps Google/browser pick them up)
    mime = None
    lower = path.lower()
    if lower.endswith(".ico"):
        mime = "image/x-icon"
    elif lower.endswith(".png"):
        mime = "image/png"
    elif lower.endswith(".svg"):
        mime = "image/svg+xml"
    elif lower.endswith(".webmanifest") or lower.endswith("manifest.json"):
        mime = "application/manifest+json"

    resp = send_from_directory(ROOT, path, mimetype=mime)
    if any(
        lower.endswith(ext)
        for ext in (".ico", ".png", ".svg", ".webmanifest")
    ) or lower in ("favicon.ico", "logo.png", "og-image.png"):
        resp.headers["Cache-Control"] = "public, max-age=86400"
        resp.headers["Access-Control-Allow-Origin"] = "*"
    elif lower.endswith(".js") or lower.endswith(".css"):
        # Avoid serving mixed old/new JS after deploys (breaks SPA: blank products / dead buttons)
        resp.headers["Cache-Control"] = "public, max-age=120, must-revalidate"
        if lower.endswith(".js") and not mime:
            resp.headers["Content-Type"] = "text/javascript; charset=utf-8"
    return resp


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

