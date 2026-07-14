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

ROOT = Path(__file__).resolve().parent
STORE = ROOT / "data" / "store"
DEALS_FILE = STORE / "deals.json"
SETTINGS_FILE = STORE / "settings.json"
AUTH_FILE = STORE / "auth.json"

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
    STORE.mkdir(parents=True, exist_ok=True)
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


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
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
    return jsonify({"ok": True, "service": "SubSaverPH"})


@app.get("/api/deals")
def api_deals():
    return jsonify({"deals": load_deals(include_inactive=False)})


@app.get("/api/settings")
def api_settings():
    return jsonify({"settings": load_settings()})


@app.get("/api/catalog")
def api_catalog():
    deals = load_deals(include_inactive=False)
    brands = sorted({d.get("brand", "") for d in deals if d.get("brand")})
    categories = sorted({d.get("category", "") for d in deals if d.get("category")})
    return jsonify(
        {
            "deals": deals,
            "settings": load_settings(),
            "brands": ["All", *brands],
            "categories": ["All", *categories],
        }
    )


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
    ensure_store()
    import os

    port = int(os.environ.get("PORT", "8790"))
    print("=" * 50)
    print("  SubSaverPH LIVE")
    print(f"  Store : http://127.0.0.1:{port}/")
    print(f"  Admin : http://127.0.0.1:{port}/admin")
    print("  Login : admin / subsaverph")
    print("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=False)


# Ensure data store exists when started via gunicorn
ensure_store()

if __name__ == "__main__":
    main()
