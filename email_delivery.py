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
    return (
        (os.environ.get("SMTP_FROM") or "").strip()
        or (os.environ.get("MAIL_FROM") or "").strip()
        or (os.environ.get("SMTP_USER") or "").strip()
        or "noreply@subsaverph.local"
    )


def _from_header() -> str:
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


def build_invoice_content(order: dict[str, Any]) -> tuple[str, str, str]:
    """Return (subject, plain_text, html)."""
    order_id = escape(str(order.get("id") or ""))
    email = escape(str(order.get("email") or ""))
    name = escape(str(order.get("name") or "Customer"))
    currency = str(order.get("currency") or "USD").upper()
    created = escape(str(order.get("createdAt") or "")[:19].replace("T", " "))
    method = escape(str(order.get("method") or order.get("paymentMode") or "card"))
    items = order.get("items") or []

    subject = f"SubSaverPH Invoice {order.get('id') or ''} — your access codes"

    # Plain text
    lines = [
        "SubSaverPH — Order invoice",
        "=" * 40,
        f"Order ID: {order.get('id')}",
        f"Date: {order.get('createdAt')}",
        f"Customer: {order.get('name') or '—'}",
        f"Email: {order.get('email')}",
        f"Payment: {order.get('method') or order.get('paymentMode')}",
        f"Currency: {currency}",
        "",
        "ITEMS & ACCESS CODES",
        "-" * 40,
    ]
    total = 0.0
    for it in items:
        qty = int(it.get("qty") or 1)
        price = float(it.get("price") or 0)
        base = (it.get("priceBase") or currency).upper()
        line_total = price * qty
        total += line_total if base == currency else line_total
        lines.append(f"{it.get('name')}  x{qty}")
        lines.append(f"  Duration: {it.get('duration') or '—'}")
        lines.append(f"  Price: {_format_money(price, base)} each")
        codes = it.get("codes") or []
        if codes:
            for c in codes:
                lines.append(f"  CODE: {c}")
        else:
            lines.append("  CODE: (contact support — no stock assigned)")
        lines.append("")
    lines.extend(
        [
            "-" * 40,
            "Redeem each code on the official service website/app.",
            "Keep this email — codes are shown once for your records.",
            "",
            "Not affiliated with xAI, Canva, CapCut, Netflix, or YouTube.",
            "SubSaverPH support: reply to this email if configured.",
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
        codes = it.get("codes") or []
        code_html = (
            "".join(
                f'<div style="font-family:ui-monospace,Consolas,monospace;background:#111;color:#fff;'
                f'padding:10px 12px;margin:6px 0;border:1px solid #333;letter-spacing:0.04em;'
                f'word-break:break-all">{escape(str(c))}</div>'
                for c in codes
            )
            if codes
            else '<div style="color:#c00">No code assigned — contact support with your order ID.</div>'
        )
        item_rows.append(
            f"""
            <tr>
              <td style="padding:16px 0;border-bottom:1px solid #222;vertical-align:top">
                <div style="font-weight:700;color:#fff;font-size:15px">{escape(str(it.get("name") or "Plan"))}</div>
                <div style="color:#999;font-size:13px;margin-top:4px">
                  {escape(str(it.get("duration") or ""))} · Qty {qty} · {_format_money(price, base)} each
                </div>
                <div style="margin-top:10px">
                  <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:4px">Access code(s)</div>
                  {code_html}
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
          <h1 style="margin:10px 0 0;font-size:22px;letter-spacing:0.06em;text-transform:uppercase">Invoice &amp; codes</h1>
          <p style="margin:12px 0 0;color:#aaa;font-size:14px;line-height:1.5">
            Hi {name or "there"}, payment is confirmed. Your digital access codes are below.
          </p>
        </td></tr>
        <tr><td style="padding:8px 28px 16px">
          <table width="100%" style="font-size:13px;color:#aaa">
            <tr><td style="padding:4px 0">Order</td><td align="right" style="color:#fff;font-weight:600">{order_id}</td></tr>
            <tr><td style="padding:4px 0">Date (UTC)</td><td align="right" style="color:#fff">{created or "—"}</td></tr>
            <tr><td style="padding:4px 0">Email</td><td align="right" style="color:#fff">{email}</td></tr>
            <tr><td style="padding:4px 0">Payment</td><td align="right" style="color:#fff">{method} · {escape(currency)}</td></tr>
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
          <p style="margin:0;color:#888;font-size:12px;line-height:1.55">
            Redeem codes on the official service. Save this email. Not affiliated with listed brands.
            If something is wrong, reply with order <strong style="color:#fff">{order_id}</strong>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return subject, text, html


def _send_via_resend(to_email: str, subject: str, text: str, html: str) -> tuple[bool, str]:
    api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    if not api_key:
        return False, "RESEND_API_KEY not set"
    payload = {
        "from": _from_header() if "<" in _from_header() else f"SubSaverPH <{_from_address()}>",
        "to": [to_email],
        "subject": subject,
        "text": text,
        "html": html,
    }
    reply = (os.environ.get("MAIL_REPLY_TO") or "").strip()
    if reply:
        payload["reply_to"] = reply
    # Resend expects from as "Name <email@domain>"
    if "from" in payload and "<" not in str(payload["from"]):
        payload["from"] = f"SubSaverPH <{payload['from']}>"

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return True, raw[:300]
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        return False, f"Resend HTTP {e.code}: {err[:400]}"
    except Exception as e:
        return False, f"Resend error: {e}"


def _send_via_smtp(to_email: str, subject: str, text: str, html: str) -> tuple[bool, str]:
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
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        if use_ssl or port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, timeout=30, context=context) as smtp:
                smtp.login(user, password)
                smtp.sendmail(_from_address(), [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=30) as smtp:
                smtp.ehlo()
                if use_tls:
                    context = ssl.create_default_context()
                    smtp.starttls(context=context)
                    smtp.ehlo()
                smtp.login(user, password)
                smtp.sendmail(_from_address(), [to_email], msg.as_string())
        return True, "smtp ok"
    except Exception as e:
        return False, f"SMTP error: {e}"


def send_order_invoice(order: dict[str, Any]) -> dict[str, Any]:
    """
    Send invoice + codes to order email.
    Returns { ok, provider, detail, skipped? }
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

    subject, text, html = build_invoice_content(order)

    # Prefer Resend if key present
    if (os.environ.get("RESEND_API_KEY") or "").strip():
        ok, detail = _send_via_resend(to_email, subject, text, html)
        return {"ok": ok, "provider": "resend", "detail": detail}

    ok, detail = _send_via_smtp(to_email, subject, text, html)
    return {"ok": ok, "provider": "smtp", "detail": detail}
