"""
SubSaverPH marketplace helpers: sellers, fees, payout ledger.
Uses the same JSON store + lock as server.py.
"""

from __future__ import annotations

import re
import threading
import uuid
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any

from flask import jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent
STORE = ROOT / "data" / "store"
SELLERS_FILE = STORE / "sellers.json"
LEDGER_FILE = STORE / "payout_ledger.json"

# Rate limit: seller register / login
_SELLER_AUTH_HITS: dict[str, list[float]] = {}
_AUTH_WINDOW = 600.0
_AUTH_MAX = 20

DEFAULT_FEE_PERCENT = 20.0
PLATFORM_SELLER_ID = "platform"


def utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def read_json(path: Path, default):
    try:
        return __import__("json").loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.write_text(
        __import__("json").dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def load_sellers() -> list:
    data = read_json(SELLERS_FILE, [])
    return data if isinstance(data, list) else []


def save_sellers(sellers: list) -> None:
    write_json(SELLERS_FILE, sellers)


def load_ledger() -> list:
    data = read_json(LEDGER_FILE, [])
    return data if isinstance(data, list) else []


def save_ledger(rows: list) -> None:
    write_json(LEDGER_FILE, rows)


def get_seller(seller_id: str | None) -> dict | None:
    if not seller_id:
        return None
    for s in load_sellers():
        if s.get("id") == seller_id:
            return s
    return None


def get_seller_by_email(email: str) -> dict | None:
    e = (email or "").strip().lower()
    for s in load_sellers():
        if (s.get("email") or "").strip().lower() == e:
            return s
    return None


def seller_public_name(seller_id: str | None, fallback: str = "SubSaverPH") -> str:
    if not seller_id or seller_id == PLATFORM_SELLER_ID:
        return fallback
    s = get_seller(seller_id)
    if s and s.get("displayName"):
        return str(s["displayName"]).strip()
    if s and s.get("email"):
        return str(s["email"]).split("@")[0]
    return fallback


def fee_percent_from_settings(settings: dict | None) -> float:
    settings = settings or {}
    try:
        p = float(settings.get("platformFeePercent", DEFAULT_FEE_PERCENT))
    except (TypeError, ValueError):
        p = DEFAULT_FEE_PERCENT
    return max(0.0, min(100.0, p))


def compute_fee(gross: float, fee_percent: float) -> tuple[float, float, float]:
    """Return (gross, fee, net) rounded to 2 decimals."""
    g = round(float(gross or 0), 2)
    fee = round(g * float(fee_percent) / 100.0, 2)
    net = round(g - fee, 2)
    return g, fee, net


def ensure_marketplace_files() -> None:
    try:
        STORE.mkdir(parents=True, exist_ok=True)
        if not SELLERS_FILE.exists():
            write_json(SELLERS_FILE, [])
        if not LEDGER_FILE.exists():
            write_json(LEDGER_FILE, [])
    except OSError:
        pass


def migrate_marketplace(
    deals: list,
    inventory: dict,
    settings: dict,
) -> tuple[list, dict, dict, bool]:
    """
    Backfill sellerId / listingStatus / inventory sellerId / fee settings.
    Returns (deals, inventory, settings, changed).
    """
    changed = False
    ensure_marketplace_files()

    if "platformFeePercent" not in settings:
        settings["platformFeePercent"] = DEFAULT_FEE_PERCENT
        changed = True
    if "marketplaceEnabled" not in settings:
        settings["marketplaceEnabled"] = True
        changed = True

    new_deals = []
    for d in deals:
        if not isinstance(d, dict):
            continue
        dd = dict(d)
        if not dd.get("sellerId"):
            dd["sellerId"] = PLATFORM_SELLER_ID
            changed = True
        if not dd.get("listingStatus"):
            # existing catalog stays live
            dd["listingStatus"] = "live" if dd.get("active", True) else "paused"
            changed = True
        if not dd.get("sellerName"):
            if dd["sellerId"] == PLATFORM_SELLER_ID:
                dd["sellerName"] = settings.get("siteName") or "SubSaverPH"
            else:
                dd["sellerName"] = seller_public_name(dd["sellerId"])
            changed = True
        new_deals.append(dd)

    new_inv: dict = {}
    for pid, rows in (inventory or {}).items():
        if not isinstance(rows, list):
            new_inv[pid] = rows
            continue
        # Prefer deal's sellerId for backfill
        deal_seller = PLATFORM_SELLER_ID
        for d in new_deals:
            if d.get("id") == pid:
                deal_seller = d.get("sellerId") or PLATFORM_SELLER_ID
                break
        fixed = []
        for row in rows:
            if not isinstance(row, dict):
                fixed.append(
                    {
                        "code": str(row),
                        "status": "available",
                        "sellerId": deal_seller,
                        "addedAt": utc_now(),
                    }
                )
                changed = True
                continue
            r = dict(row)
            if not r.get("sellerId"):
                r["sellerId"] = deal_seller
                changed = True
            fixed.append(r)
        new_inv[pid] = fixed

    return new_deals, new_inv, settings, changed


def is_listing_public(deal: dict) -> bool:
    if not deal.get("active", True):
        return False
    status = (deal.get("listingStatus") or "live").lower()
    return status == "live"


def stock_count_for(
    inventory: dict, product_id: str, seller_id: str | None = None
) -> int:
    codes = inventory.get(product_id) or []
    n = 0
    for c in codes:
        if c.get("status", "available") != "available":
            continue
        if seller_id is not None and (c.get("sellerId") or PLATFORM_SELLER_ID) != seller_id:
            continue
        n += 1
    return n


def create_seller(
    *,
    email: str,
    password: str,
    display_name: str,
    phone: str = "",
    payout_method: str = "gcash",
    payout_details: str = "",
) -> dict:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        raise ValueError("Valid email required")
    if len(password or "") < 6:
        raise ValueError("Password must be at least 6 characters")
    if get_seller_by_email(email):
        raise ValueError("An account with this email already exists")
    seller = {
        "id": "sel_" + uuid.uuid4().hex[:12],
        "email": email,
        "passwordHash": generate_password_hash(password),
        "displayName": (display_name or email.split("@")[0]).strip()[:80],
        "phone": (phone or "").strip()[:40],
        "status": "pending",
        "payoutMethod": (payout_method or "gcash").strip().lower()[:20],
        "payoutDetails": (payout_details or "").strip()[:200],
        "createdAt": utc_now(),
        "approvedAt": None,
        "notes": "",
    }
    sellers = load_sellers()
    sellers.append(seller)
    save_sellers(sellers)
    return {k: v for k, v in seller.items() if k != "passwordHash"}


def verify_seller_login(email: str, password: str) -> dict | None:
    s = get_seller_by_email(email)
    if not s:
        return None
    if not check_password_hash(s.get("passwordHash") or "", password or ""):
        return None
    return s


def seller_balances(seller_id: str) -> dict:
    held = released = paid = 0.0
    rows = []
    for r in load_ledger():
        if r.get("sellerId") != seller_id:
            continue
        rows.append(r)
        st = r.get("status")
        net = float(r.get("net") or 0)
        if st == "held":
            held += net
        elif st == "released":
            released += net
        elif st == "paid":
            paid += net
    return {
        "held": round(held, 2),
        "released": round(released, 2),
        "paid": round(paid, 2),
        "currency": "PHP",
        "rows": rows,
    }


def append_ledger_for_order(order: dict) -> list:
    """
    Create held ledger rows from order sellerBreakdown.
    Skips if ledger already has rows for this orderId.
    Returns new rows.
    """
    order_id = order.get("id")
    if not order_id:
        return []
    ledger = load_ledger()
    if any(r.get("orderId") == order_id for r in ledger):
        return []
    created = []
    breakdown = order.get("sellerBreakdown") or []
    for b in breakdown:
        sid = b.get("sellerId") or PLATFORM_SELLER_ID
        # Platform keeps its own net accounting optional — still record for reporting
        row = {
            "id": "po_" + uuid.uuid4().hex[:12],
            "orderId": order_id,
            "sellerId": sid,
            "sellerName": b.get("sellerName") or seller_public_name(sid),
            "gross": float(b.get("gross") or 0),
            "fee": float(b.get("fee") or 0),
            "net": float(b.get("net") or 0),
            "currency": order.get("currency") or "PHP",
            "status": "held",
            "createdAt": utc_now(),
            "releasedAt": None,
            "paidAt": None,
            "adminNote": "",
            "releasedBy": None,
            "paidBy": None,
        }
        ledger.insert(0, row)
        created.append(row)
    if created:
        save_ledger(ledger[:2000])
    return created


def update_ledger_status(
    ledger_id: str,
    new_status: str,
    *,
    admin_user: str = "",
    note: str = "",
) -> dict:
    allowed = {"held", "released", "paid", "cancelled"}
    if new_status not in allowed:
        raise ValueError("Invalid status")
    ledger = load_ledger()
    for i, r in enumerate(ledger):
        if r.get("id") != ledger_id:
            continue
        cur = r.get("status")
        if new_status == "released" and cur not in ("held",):
            raise ValueError(f"Cannot release from status {cur}")
        if new_status == "paid" and cur not in ("released", "held"):
            raise ValueError(f"Cannot mark paid from status {cur}")
        if new_status == "cancelled" and cur == "paid":
            raise ValueError("Cannot cancel a paid payout")
        r = dict(r)
        r["status"] = new_status
        if note:
            r["adminNote"] = (note or "")[:300]
        if new_status == "released":
            r["releasedAt"] = utc_now()
            r["releasedBy"] = admin_user
        if new_status == "paid":
            if not r.get("releasedAt"):
                r["releasedAt"] = utc_now()
                r["releasedBy"] = admin_user
            r["paidAt"] = utc_now()
            r["paidBy"] = admin_user
        if new_status == "cancelled":
            r["releasedAt"] = r.get("releasedAt")
        ledger[i] = r
        save_ledger(ledger)
        return r
    raise ValueError("Payout not found")


def rate_limit_seller_auth() -> bool:
    """Return True if allowed, False if blocked."""
    ip = (request.headers.get("CF-Connecting-IP") or request.remote_addr or "unknown").strip()
    now = __import__("time").time()
    hits = [t for t in _SELLER_AUTH_HITS.get(ip, []) if now - t < _AUTH_WINDOW]
    if len(hits) >= _AUTH_MAX:
        _SELLER_AUTH_HITS[ip] = hits
        return False
    hits.append(now)
    _SELLER_AUTH_HITS[ip] = hits
    return True


def require_seller(fn):
    """Logged-in seller (any status)."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        sid = session.get("seller_id")
        if not sid:
            return jsonify({"error": "Unauthorized"}), 401
        s = get_seller(sid)
        if not s:
            session.pop("seller_id", None)
            session.pop("seller_email", None)
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper


def require_approved_seller(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        sid = session.get("seller_id")
        if not sid:
            return jsonify({"error": "Unauthorized"}), 401
        s = get_seller(sid)
        if not s:
            session.pop("seller_id", None)
            return jsonify({"error": "Unauthorized"}), 401
        if s.get("status") != "approved":
            return (
                jsonify(
                    {
                        "error": "Seller account not approved yet",
                        "status": s.get("status"),
                    }
                ),
                403,
            )
        return fn(*args, **kwargs)

    return wrapper


def public_seller_dict(s: dict) -> dict:
    return {
        "id": s.get("id"),
        "email": s.get("email"),
        "displayName": s.get("displayName"),
        "phone": s.get("phone"),
        "status": s.get("status"),
        "payoutMethod": s.get("payoutMethod"),
        "payoutDetails": s.get("payoutDetails"),
        "createdAt": s.get("createdAt"),
        "approvedAt": s.get("approvedAt"),
        "notes": s.get("notes") if session.get("admin") else None,
    }


def build_order_fee_fields(
    line_results: list[dict],
    fee_percent: float,
    site_name: str = "SubSaverPH",
) -> tuple[list[dict], list[dict], float, float]:
    """
    Mutates line_results with seller/fee fields.
    Returns (line_results, seller_breakdown, fee_total, net_total).
    """
    by_seller: dict[str, dict] = {}
    fee_total = 0.0
    net_total = 0.0
    for line in line_results:
        sid = line.get("sellerId") or PLATFORM_SELLER_ID
        sname = line.get("sellerName") or seller_public_name(sid, site_name)
        price = float(line.get("price") or 0)
        qty = int(line.get("qty") or 1)
        gross, fee, net = compute_fee(price * qty, fee_percent)
        line["sellerId"] = sid
        line["sellerName"] = sname
        line["lineGross"] = gross
        line["platformFee"] = fee
        line["sellerNet"] = net
        line["feePercent"] = fee_percent
        fee_total += fee
        net_total += net
        if sid not in by_seller:
            by_seller[sid] = {
                "sellerId": sid,
                "sellerName": sname,
                "gross": 0.0,
                "fee": 0.0,
                "net": 0.0,
                "payoutStatus": "held",
            }
        by_seller[sid]["gross"] = round(by_seller[sid]["gross"] + gross, 2)
        by_seller[sid]["fee"] = round(by_seller[sid]["fee"] + fee, 2)
        by_seller[sid]["net"] = round(by_seller[sid]["net"] + net, 2)
    breakdown = list(by_seller.values())
    return line_results, breakdown, round(fee_total, 2), round(net_total, 2)
