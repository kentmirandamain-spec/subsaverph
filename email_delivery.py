"""
SubSaverPH — order invoice email with digital codes.

Configure one of:
  A) SMTP (Gmail, Outlook, SendGrid SMTP, Mailgun, etc.)
     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
  B) Resend API
     RESEND_API_KEY, MAIL_FROM (optional)

Optional:
  MAIL_FROM_NAME=SubSaverPH
  MAIL_REPLY_TO=support@example.com
"""

from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from html import escape
from typing import Any


def mail_configured() -> bool:
    if (os.environ.get("RESEND_API_KEY") or "").strip():
        return True
    host = (os.environ.get("SMTP_HOST") or "").strip()
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASSWORD") or "").strip()
    return bool(host and user and password)


def _from_address() -> str:
    """Bare email only (never 'Name <email>')."""
    raw = (
        (os.environ.get("SMTP_FROM") or "").strip()
        or (os.environ.get("MAIL_FROM") or "").strip()
        or (os.environ.get("SMTP_USER") or "").strip()
        or "noreply@subsaverph.local"
    )
    # Accept "Name <user@domain>" or bare address
    if "<" in raw and ">" in raw:
        try:
            return raw.split("<", 1)[1].split(">", 1)[0].strip()
        except Exception:
            pass
    return raw


def _from_header() -> str:
    """Full From header: Name <email@domain>."""
    raw = (
        (os.environ.get("SMTP_FROM") or "").strip()
        or (os.environ.get("MAIL_FROM") or "").strip()
    )
    # Already a full "Name <email>" value — use as-is
    if raw and "<" in raw and ">" in raw and "@" in raw:
        return raw
    name = (os.environ.get("MAIL_FROM_NAME") or "SubSaverPH").strip()
    return formataddr((name, _from_address()))


def _format_money(amount: float, currency: str) -> str:
    cur = (currency or "USD").upper()
    try:
        n = float(amount)
    except (TypeError, ValueError):
        n = 0.0
    if cur == "PHP":
        return f"₱{n:,.2f}"
    if cur == "USD":
        return f"${n:,.2f}"
    return f"{n:,.2f} {cur}"


def _line_amount(item: dict) -> float:
    try:
        return float(item.get("price") or 0) * int(item.get("qty") or 1)
    except (TypeError, ValueError):
        return 0.0


def _parse_cred_from_string(raw: str) -> dict[str, str]:
    """Best-effort parse of username/password from a stock string."""
    import re

    text = str(raw or "").strip()
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
        a, b = [x.strip() for x in text.split("|", 1)]
        if a and b:
            return {"username": a, "password": b, "raw": text, "code": ""}
    if " / " in text:
        a, b = [x.strip() for x in text.split(" / ", 1)]
        if a and b:
            return {"username": a, "password": b, "raw": text, "code": ""}
    if text.count(":") == 1:
        a, b = [x.strip() for x in text.split(":", 1)]
        if a and b and " " not in a:
            return {"username": a, "password": b, "raw": text, "code": ""}
    return {"username": "", "password": "", "raw": text, "code": text}


def _item_credentials(item: dict) -> list[dict[str, str]]:
    """Normalize credentials list for an order line item."""
    creds = item.get("credentials")
    out: list[dict[str, str]] = []
    if isinstance(creds, list) and creds:
        for c in creds:
            if isinstance(c, dict):
                out.append(
                    {
                        "username": str(c.get("username") or c.get("user") or "").strip(),
                        "password": str(c.get("password") or c.get("pass") or "").strip(),
                        "raw": str(c.get("raw") or c.get("code") or "").strip(),
                        "code": str(c.get("code") or "").strip(),
                    }
                )
            else:
                out.append(_parse_cred_from_string(str(c)))
        return out
    for c in item.get("codes") or []:
        if isinstance(c, dict):
            out.append(
                {
                    "username": str(c.get("username") or "").strip(),
                    "password": str(c.get("password") or "").strip(),
                    "raw": str(c.get("raw") or c.get("code") or "").strip(),
                    "code": str(c.get("code") or "").strip(),
                }
            )
        else:
            out.append(_parse_cred_from_string(str(c)))
    return out


def _cred_box_html(label: str, value: str) -> str:
    v = escape(value or "—")
    return (
        f'<div style="margin:8px 0 0">'
        f'<div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px">{escape(label)}</div>'
        f'<div style="font-family:ui-monospace,Consolas,monospace;background:#111;color:#fff;'
        f'padding:12px 14px;border:1px solid #333;letter-spacing:0.02em;word-break:break-all">{v}</div>'
        f"</div>"
    )


def build_invoice_content(order: dict[str, Any]) -> tuple[str, str, str]:
    """Return (subject, plain_text, html) with payment ID + username/password + product details."""
    order_id_raw = str(order.get("id") or "")
    payment_id_raw = str(
        order.get("providerRef")
        or order.get("stripeSessionId")
        or order.get("stripePaymentIntent")
        or order_id_raw
        or ""
    )
    order_id = escape(order_id_raw)
    payment_id = escape(payment_id_raw)
    email = escape(str(order.get("email") or ""))
    name = escape(str(order.get("name") or "Customer"))
    currency = str(order.get("currency") or "USD").upper()
    created = escape(str(order.get("createdAt") or "")[:19].replace("T", " "))
    method = escape(str(order.get("method") or order.get("paymentMode") or "card"))
    provider = escape(str(order.get("paymentMode") or order.get("method") or "—"))
    items = order.get("items") or []

    subject = f"SubSaverPH Payment {order_id_raw or payment_id_raw} — login details"

    # Plain text
    lines = [
        "SubSaverPH — Payment confirmed",
        "=" * 44,
        f"Order ID:     {order_id_raw or '—'}",
        f"Payment ID:   {payment_id_raw or '—'}",
        f"Date (UTC):   {order.get('createdAt') or '—'}",
        f"Customer:     {order.get('name') or '—'}",
        f"Email:        {order.get('email') or '—'}",
        f"Payment:      {order.get('method') or order.get('paymentMode') or '—'}",
        f"Currency:     {currency}",
        "",
        "PRODUCTS & LOGIN DETAILS",
        "-" * 44,
    ]
    for it in items:
        qty = int(it.get("qty") or 1)
        price = float(it.get("price") or 0)
        base = (it.get("priceBase") or currency).upper()
        lines.append(f"Product:  {it.get('name') or 'Plan'}")
        if it.get("brand"):
            lines.append(f"Brand:    {it.get('brand')}")
        if it.get("category"):
            lines.append(f"Category: {it.get('category')}")
        lines.append(f"Duration: {it.get('duration') or '—'}")
        lines.append(f"Delivery: {it.get('delivery') or 'Instant digital'}")
        if it.get("accountType"):
            lines.append(f"Account:  {it.get('accountType')}")
        if it.get("validity"):
            lines.append(f"Validity: {it.get('validity')}")
        lines.append(f"Qty:      {qty}")
        lines.append(f"Price:    {_format_money(price, base)} each")
        if it.get("description"):
            lines.append(f"Details:  {it.get('description')}")
        if it.get("howToRedeem"):
            lines.append("How to use:")
            for hl in str(it.get("howToRedeem")).splitlines():
                if hl.strip():
                    lines.append(f"  - {hl.strip()}")
        if it.get("importantNotes"):
            lines.append("Important:")
            for hl in str(it.get("importantNotes")).splitlines():
                if hl.strip():
                    lines.append(f"  - {hl.strip()}")
        creds = _item_credentials(it)
        if creds:
            for i, cr in enumerate(creds, 1):
                label = f"Login #{i}" if len(creds) > 1 else "Login"
                lines.append(f"  --- {label} ---")
                if cr.get("username") or cr.get("password"):
                    lines.append(f"  Username: {cr.get('username') or '—'}")
                    lines.append(f"  Password: {cr.get('password') or '—'}")
                elif cr.get("code") or cr.get("raw"):
                    lines.append(f"  Access code: {cr.get('code') or cr.get('raw')}")
        else:
            lines.append("  Login: (contact support — nothing assigned)")
        lines.append("")
    lines.extend(
        [
            "-" * 44,
            "IMPORTANT",
            "- Do not change username, password, billing address, or subscription.",
            "- Breaking these rules voids refunds (except defective / not delivered product).",
            "- Save this email. Use logins only as provided.",
            "",
            f"Support: reply to this email and include Order ID {order_id_raw or payment_id_raw}.",
            "SubSaverPH is not affiliated with xAI, Canva, CapCut, Netflix, or YouTube.",
            "",
            "Thank you for your purchase.",
        ]
    )
    text = "\n".join(lines)

    # HTML invoice
    item_rows = []
    for it in items:
        qty = int(it.get("qty") or 1)
        price = float(it.get("price") or 0)
        base = (it.get("priceBase") or currency).upper()
        creds = _item_credentials(it)
        login_blocks = []
        if creds:
            for i, cr in enumerate(creds, 1):
                head = f"Login #{i}" if len(creds) > 1 else "Your login"
                if cr.get("username") or cr.get("password"):
                    login_blocks.append(
                        f'<div style="margin-top:12px;padding:12px;border:1px solid #333;background:#0d0d0d">'
                        f'<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px">{escape(head)}</div>'
                        f'{_cred_box_html("Username / Email", cr.get("username") or "—")}'
                        f'{_cred_box_html("Password", cr.get("password") or "—")}'
                        f"</div>"
                    )
                else:
                    login_blocks.append(
                        f'<div style="margin-top:12px;padding:12px;border:1px solid #333;background:#0d0d0d">'
                        f'<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px">{escape(head)}</div>'
                        f'{_cred_box_html("Access code", cr.get("code") or cr.get("raw") or "—")}'
                        f"</div>"
                    )
        else:
            login_blocks.append(
                '<div style="color:#c44;margin-top:10px">No login assigned — contact support with your Order ID / Payment ID.</div>'
            )

        detail_bits = []
        if it.get("brand"):
            detail_bits.append(escape(str(it.get("brand"))))
        if it.get("category"):
            detail_bits.append(escape(str(it.get("category"))))
        if it.get("duration"):
            detail_bits.append(escape(str(it.get("duration"))))
        detail_bits.append(f"Qty {qty}")
        detail_bits.append(f"{_format_money(price, base)} each")
        meta_line = " · ".join(detail_bits)

        extra_html = ""
        if it.get("accountType"):
            extra_html += f'<div style="color:#999;font-size:13px;margin-top:6px">Account type: {escape(str(it.get("accountType")))}</div>'
        if it.get("validity"):
            extra_html += f'<div style="color:#999;font-size:13px;margin-top:4px">Validity: {escape(str(it.get("validity")))}</div>'
        if it.get("description"):
            extra_html += f'<div style="color:#aaa;font-size:13px;margin-top:8px;line-height:1.5">{escape(str(it.get("description")))}</div>'
        if it.get("howToRedeem"):
            extra_html += (
                '<div style="margin-top:10px">'
                '<div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888">How to use</div>'
                f'<div style="color:#ccc;font-size:13px;margin-top:4px;white-space:pre-wrap;line-height:1.5">{escape(str(it.get("howToRedeem")))}</div>'
                "</div>"
            )
        if it.get("importantNotes"):
            extra_html += (
                '<div style="margin-top:10px">'
                '<div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888">Important notes</div>'
                f'<div style="color:#ccc;font-size:13px;margin-top:4px;white-space:pre-wrap;line-height:1.5">{escape(str(it.get("importantNotes")))}</div>'
                "</div>"
            )
        if it.get("delivery"):
            extra_html += f'<div style="color:#999;font-size:12px;margin-top:8px">Delivery: {escape(str(it.get("delivery")))}</div>'

        item_rows.append(
            f"""
            <tr>
              <td style="padding:18px 0;border-bottom:1px solid #222;vertical-align:top">
                <div style="font-weight:700;color:#fff;font-size:16px">{escape(str(it.get("name") or "Plan"))}</div>
                <div style="color:#999;font-size:13px;margin-top:4px">{meta_line}</div>
                {extra_html}
                <div style="margin-top:14px">
                  <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#fff;font-weight:600;margin-bottom:2px">Login details</div>
                  {"".join(login_blocks)}
                </div>
              </td>
            </tr>"""
        )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#0a0a0a;border:1px solid #2a2a2a">
        <tr><td style="padding:28px 28px 12px">
          <div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#888">SubSaverPH</div>
          <h1 style="margin:10px 0 0;font-size:22px;letter-spacing:0.06em;text-transform:uppercase">Payment confirmed</h1>
          <p style="margin:12px 0 0;color:#aaa;font-size:14px;line-height:1.5">
            Hi {name or "there"}, your payment is confirmed. Below are your <strong style="color:#fff">Payment ID</strong>,
            product details, and <strong style="color:#fff">username &amp; password</strong>.
          </p>
        </td></tr>
        <tr><td style="padding:8px 28px 16px">
          <table width="100%" style="font-size:13px;color:#aaa;border:1px solid #333;background:#111">
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #222">Order ID</td>
              <td align="right" style="padding:12px 14px;border-bottom:1px solid #222;color:#fff;font-weight:700;font-family:ui-monospace,Consolas,monospace">{order_id or "—"}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #222">Payment ID</td>
              <td align="right" style="padding:12px 14px;border-bottom:1px solid #222;color:#fff;font-weight:700;font-family:ui-monospace,Consolas,monospace;word-break:break-all">{payment_id or "—"}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #222">Date (UTC)</td>
              <td align="right" style="padding:12px 14px;border-bottom:1px solid #222;color:#fff">{created or "—"}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;border-bottom:1px solid #222">Customer email</td>
              <td align="right" style="padding:12px 14px;border-bottom:1px solid #222;color:#fff">{email}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px">Payment method</td>
              <td align="right" style="padding:12px 14px;color:#fff">{method} · {escape(currency)} · {provider}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px">
          <div style="height:1px;background:#222"></div>
        </td></tr>
        <tr><td style="padding:8px 28px 20px">
          <table width="100%" cellspacing="0" cellpadding="0">
            {"".join(item_rows)}
          </table>
        </td></tr>
        <tr><td style="padding:8px 28px 28px">
          <p style="margin:0 0 10px;color:#888;font-size:12px;line-height:1.55">
            <strong style="color:#ccc">Rules:</strong> Do not change username, password, billing address, or subscription.
            Breaking rules voids refunds. Refunds only if the product is defective or not delivered.
          </p>
          <p style="margin:0;color:#888;font-size:12px;line-height:1.55">
            Save this email. Not affiliated with listed brands.
            Support: reply with <strong style="color:#fff">Order ID {order_id or "—"}</strong>
            / <strong style="color:#fff">Payment ID {payment_id or "—"}</strong>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, text, html


def _notify_emails() -> list[str]:
    """Optional merchant inboxes that get a BCC copy of each order invoice."""
    raw = (
        (os.environ.get("ORDER_NOTIFY_EMAIL") or "").strip()
        or (os.environ.get("MAIL_NOTIFY_TO") or "").strip()
        or (os.environ.get("MAIL_REPLY_TO") or "").strip()
    )
    if not raw:
        return []
    out = []
    for part in raw.replace(";", ",").split(","):
        e = part.strip()
        if e and "@" in e:
            out.append(e)
    return out


def _resend_http_post(api_key: str, payload: dict) -> tuple[int, str]:
    """
    POST to Resend API. Cloudflare often blocks stock Python urllib (Error 1010).
    Prefer curl_cffi (Chrome TLS), then requests, then urllib.
    Returns (status_code, response_text).
    """
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "SubSaverPH/1.0 (+https://subsaverph.com; Resend client)",
    }
    timeout = 20

    # 1) curl_cffi — bypasses Cloudflare bot filter (same fix as NOWPayments)
    try:
        from curl_cffi import requests as cf_requests

        r = cf_requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=timeout,
            impersonate="chrome120",
        )
        return int(r.status_code), (r.text or "")[:800]
    except Exception:
        pass

    # 2) requests
    try:
        import requests

        r = requests.post(url, headers=headers, json=payload, timeout=timeout)
        return int(r.status_code), (r.text or "")[:800]
    except Exception:
        pass

    # 3) urllib fallback
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(resp.status), resp.read().decode("utf-8", errors="replace")[:800]
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        return int(e.code), err[:800]
    except Exception as e:
        return 0, f"Resend network error: {e}"


def _send_via_resend(
    to_email: str,
    subject: str,
    text: str,
    html: str,
    *,
    bcc: list[str] | None = None,
) -> tuple[bool, str]:
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    if not api_key:
        return False, "RESEND_API_KEY not set"
    from_hdr = _from_header()
    if "<" not in from_hdr:
        from_hdr = f"SubSaverPH <{_from_address()}>"
    payload = {
        "from": from_hdr,
        "to": [to_email],
        "subject": subject,
        "text": text,
        "html": html,
    }
    reply = (os.environ.get("MAIL_REPLY_TO") or "").strip()
    if reply:
        payload["reply_to"] = reply
    bcc_list = [e for e in (bcc or []) if e.lower() != to_email.lower()]
    if bcc_list:
        payload["bcc"] = bcc_list

    status, raw = _resend_http_post(api_key, payload)
    if status and 200 <= status < 300:
        return True, raw[:300]

    # Cloudflare Error 1010 (bot blocked) — often returned as HTML or short text
    low = (raw or "").lower()
    if (
        status == 403
        and ("1010" in (raw or "") or "cloudflare" in low or "<!doctype" in low)
    ):
        return (
            False,
            "Resend blocked by Cloudflare (Error 1010) from this server IP. "
            "Server will retry with Chrome TLS (curl_cffi). "
            "If this persists after deploy, confirm curl_cffi is installed on Render. "
            f"Detail: {raw[:200]}",
        )

    if status == 0:
        return False, raw or "Resend request failed"

    if "<!DOCTYPE" in (raw or "") or "<html" in low:
        return (
            False,
            f"Resend HTTP {status}: provider/proxy returned HTML (not JSON). "
            "Often Cloudflare bot block — redeploy with curl_cffi.",
        )

    return False, f"Resend HTTP {status}: {raw[:400]}"


def _send_via_smtp(
    to_email: str,
    subject: str,
    text: str,
    html: str,
    *,
    bcc: list[str] | None = None,
) -> tuple[bool, str]:
    host = (os.environ.get("SMTP_HOST") or "").strip()
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASSWORD") or "").strip()
    use_ssl = (os.environ.get("SMTP_SSL") or "").strip() in ("1", "true", "yes")
    use_tls = (os.environ.get("SMTP_TLS") or "1").strip().lower() not in ("0", "false", "no")

    if not host or not user or not password:
        return False, "SMTP_HOST / SMTP_USER / SMTP_PASSWORD not fully set"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = _from_header()
    msg["To"] = to_email
    reply = (os.environ.get("MAIL_REPLY_TO") or "").strip()
    if reply:
        msg["Reply-To"] = reply
    bcc_list = [e for e in (bcc or []) if e.lower() != to_email.lower()]
    if bcc_list:
        msg["Bcc"] = ", ".join(bcc_list)
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    recipients = [to_email] + bcc_list
    try:
        if use_ssl or port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=30, context=context) as smtp:
                smtp.login(user, password)
                smtp.sendmail(_from_address(), recipients, msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as smtp:
                smtp.ehlo()
                if use_tls:
                    context = ssl.create_default_context()
                    smtp.starttls(context=context)
                    smtp.ehlo()
                smtp.login(user, password)
                smtp.sendmail(_from_address(), recipients, msg.as_string())
        return True, "smtp ok"
    except Exception as e:
        return False, f"SMTP error: {e}"


def _is_public_brand_address(addr: str) -> bool:
    """support@subsaverph.com has no mailbox until Email Routing is set — don't deliver here."""
    a = (addr or "").strip().lower()
    return a.endswith("@subsaverph.com") or a.endswith("@subsaverph.onrender.com")


def support_inbox() -> str:
    """
    Where customer support form messages are delivered (your real Outlook/Gmail).
    Skips brand addresses like support@subsaverph.com (they bounce: Address not found).
    """
    for key in (
        "SUPPORT_INBOX",
        "ORDER_NOTIFY_EMAIL",
        "MAIL_NOTIFY_TO",
        "MAIL_REPLY_TO",
    ):
        v = (os.environ.get(key) or "").strip()
        if not v or "@" not in v:
            continue
        # first address if comma-separated
        first = v.replace(";", ",").split(",")[0].strip()
        if first and not _is_public_brand_address(first):
            return first
        # If only brand address, keep looking for a real inbox
    return ""


def send_support_message(
    *,
    from_email: str,
    from_name: str,
    subject: str,
    message: str,
    order_id: str = "",
    to_override: str = "",
) -> dict[str, Any]:
    """
    Deliver a customer support form message to the store owner inbox.
    Uses Resend/SMTP (same as invoices). Does not require support@ MX to work.
    """
    from_email = (from_email or "").strip()
    if not from_email or "@" not in from_email:
        return {"ok": False, "detail": "Valid customer email is required"}

    if not mail_configured():
        return {
            "ok": False,
            "detail": "Email not configured on server (RESEND_API_KEY or SMTP_*)",
            "skipped": True,
        }

    to_addr = (to_override or "").strip() or support_inbox()
    if not to_addr or "@" not in to_addr:
        return {
            "ok": False,
            "detail": (
                "No support inbox configured. Set SUPPORT_INBOX or ORDER_NOTIFY_EMAIL "
                "on Render to your Outlook/Gmail address."
            ),
        }

    name = (from_name or "Customer").strip() or "Customer"
    subj_raw = (subject or "Support request").strip() or "Support request"
    oid = (order_id or "").strip()
    msg = (message or "").strip()
    if len(msg) < 5:
        return {"ok": False, "detail": "Message is too short"}
    if len(msg) > 5000:
        msg = msg[:5000]

    subject_line = f"[SubSaverPH Support] {subj_raw}"
    if oid:
        subject_line += f" · Order {oid}"

    text = "\n".join(
        [
            "New support message from the website form",
            "=" * 44,
            f"From name:  {name}",
            f"From email: {from_email}",
            f"Order ID:   {oid or '—'}",
            f"Subject:    {subj_raw}",
            "",
            "Message:",
            msg,
            "",
            "=" * 44,
            "Reply directly to this email to answer the customer.",
        ]
    )
    html = f"""<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#eee;padding:20px">
    <div style="max-width:560px;margin:0 auto;border:1px solid #333;padding:20px;background:#111">
      <p style="letter-spacing:0.15em;text-transform:uppercase;color:#888;font-size:12px">SubSaverPH Support</p>
      <h1 style="font-size:18px;margin:8px 0 16px">Website contact form</h1>
      <table style="width:100%;font-size:14px;color:#ccc">
        <tr><td style="padding:6px 0;color:#888">From</td><td style="padding:6px 0;color:#fff">{escape(name)} &lt;{escape(from_email)}&gt;</td></tr>
        <tr><td style="padding:6px 0;color:#888">Order ID</td><td style="padding:6px 0;color:#fff">{escape(oid or "—")}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Subject</td><td style="padding:6px 0;color:#fff">{escape(subj_raw)}</td></tr>
      </table>
      <div style="margin-top:16px;padding:14px;border:1px solid #333;background:#0d0d0d;white-space:pre-wrap;line-height:1.5;color:#ddd">{escape(msg)}</div>
      <p style="margin-top:16px;font-size:12px;color:#888">Reply to this email to respond to the customer.</p>
    </div></body></html>"""

    # Force reply-to customer so you can answer them
    old_reply = os.environ.get("MAIL_REPLY_TO")
    try:
        os.environ["MAIL_REPLY_TO"] = from_email
        if (os.environ.get("RESEND_API_KEY") or "").strip():
            ok, detail = _send_via_resend(to_addr, subject_line, text, html, bcc=None)
            provider = "resend"
        else:
            ok, detail = _send_via_smtp(to_addr, subject_line, text, html, bcc=None)
            provider = "smtp"
    finally:
        if old_reply is None:
            os.environ.pop("MAIL_REPLY_TO", None)
        else:
            os.environ["MAIL_REPLY_TO"] = old_reply

    return {
        "ok": ok,
        "provider": provider,
        "detail": detail,
        "to": to_addr,
    }


def send_order_invoice(
    order: dict[str, Any],
    *,
    skip_notify: bool = False,
) -> dict[str, Any]:
    """
    Send invoice + codes to the customer email.
    Optional BCC to ORDER_NOTIFY_EMAIL / MAIL_NOTIFY_TO / MAIL_REPLY_TO (you receive a copy).
    Set skip_notify=True for admin test emails (no BCC).
    Returns { ok, provider, detail, skipped?, notified? }
    """
    to_email = (order.get("email") or "").strip()
    if not to_email or "@" not in to_email:
        return {"ok": False, "provider": None, "detail": "No valid customer email"}

    if not mail_configured():
        return {
            "ok": False,
            "provider": None,
            "detail": "Email not configured (set RESEND_API_KEY or SMTP_*)",
            "skipped": True,
        }

    try:
        subject, text, html = build_invoice_content(order)
    except Exception as e:
        return {
            "ok": False,
            "provider": None,
            "detail": f"Failed building invoice content: {e}",
        }

    notify = [] if skip_notify else _notify_emails()

    if (os.environ.get("RESEND_API_KEY") or "").strip():
        ok, detail = _send_via_resend(to_email, subject, text, html, bcc=notify)
        # Helpful hints (avoid conflating CF 1010 with Resend testing limits)
        if not ok and detail:
            dlow = detail.lower()
            if "1010" in detail or "cloudflare" in dlow:
                detail = (
                    f"{detail} | Tip: This is a Cloudflare bot block on the server→Resend "
                    "connection (not your inbox). Latest code uses curl_cffi Chrome TLS."
                )
            elif (
                "422" in detail
                or "only send testing" in dlow
                or "not verified" in dlow
                or "validation" in dlow
            ):
                detail = (
                    f"{detail} | Tip: With Resend testing, send only to the email on your "
                    "Resend account, or set MAIL_FROM to a verified domain "
                    f"(e.g. support@subsaverph.com). Current From: {_from_header()}"
                )
        return {
            "ok": ok,
            "provider": "resend",
            "detail": detail,
            "notified": bool(ok and notify),
            "notifyTo": notify if ok else [],
            "fromAddress": _from_header(),
        }

    ok, detail = _send_via_smtp(to_email, subject, text, html, bcc=notify)
    return {
        "ok": ok,
        "provider": "smtp",
        "detail": detail,
        "notified": bool(ok and notify),
        "notifyTo": notify if ok else [],
        "fromAddress": _from_header(),
    }
