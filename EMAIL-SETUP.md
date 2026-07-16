# Receive email after purchase

After a successful payment, SubSaverPH:

1. Assigns stock codes to the order  
2. Shows them on the success page  
3. **Emails an invoice + the same codes** to the **customer’s checkout email**  
4. Optionally **BCC’s you** (store owner) so you also get a copy  

Live check: https://subsaverph.onrender.com/api/health  
→ `"emailConfigured": true` means the server can send mail.

---

## How the customer gets the email

1. Buyer enters their **email** at checkout (required).  
2. They complete payment (Card / GCash / Maya / etc.).  
3. Server fulfills order → calls email sender.  
4. Customer receives: **order ID, items, access codes**.  
5. Success page says if email was sent. Tell them to check **Inbox + Spam**.

---

## Setup on Render (production)

### Option A — Resend (easiest)

1. Sign up: https://resend.com  
2. **API Keys** → create key → copy `re_...`  
3. For testing you can send from: `SubSaverPH <onboarding@resend.dev>`  
4. For production: **Domains** → verify your domain (e.g. subsaverph.com)  

Render → **subsaverph** → **Environment**:

| Key | Value |
|-----|--------|
| `RESEND_API_KEY` | `re_...` |
| `MAIL_FROM` | `SubSaverPH <onboarding@resend.dev>` (or `you@yourdomain.com` after verify) |
| `MAIL_FROM_NAME` | `SubSaverPH` |
| `MAIL_REPLY_TO` | your Gmail (customer replies go here) |
| `ORDER_NOTIFY_EMAIL` | your Gmail (you get a BCC copy of every order) |

**Save** → wait for redeploy.

### Option B — Gmail SMTP

1. Google Account → **Security** → turn on **2-Step Verification**  
2. **App passwords** → create one for “Mail”  
3. Render env:

| Key | Value |
|-----|--------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `you@gmail.com` |
| `SMTP_PASSWORD` | 16-char app password |
| `SMTP_FROM` | `you@gmail.com` |
| `SMTP_TLS` | `1` |
| `MAIL_FROM_NAME` | `SubSaverPH` |
| `ORDER_NOTIFY_EMAIL` | `you@gmail.com` |

---

## You (seller) also receive email

Set **one** of these to your inbox:

- `ORDER_NOTIFY_EMAIL=you@gmail.com` (preferred)  
- or `MAIL_NOTIFY_TO=you@gmail.com`  
- or `MAIL_REPLY_TO=you@gmail.com` (also used as Reply-To for customers)

You get a **BCC copy** of the same invoice the customer gets (with codes).

---

## Verify

```text
https://subsaverph.onrender.com/api/health
```

Must show:

```json
"emailConfigured": true
```

Then:

1. Put stock codes on a product (Admin → Codes / Stock)  
2. Buy with **test** card or demo  
3. Use a real inbox you can open at checkout  
4. Check success page: “Invoice + access codes were emailed…”  
5. Open that inbox (+ spam)

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `emailConfigured: false` | Missing `RESEND_API_KEY` or SMTP vars on Render |
| Customer no email | Check spam; Resend may only allow verified recipients on free test from |
| Resend “domain not verified” | Verify domain, or use `onboarding@resend.dev` for tests |
| Codes on site but no email | Look at order in Admin → Orders (`emailSent`, `emailDetail`) |
| You don’t get a copy | Set `ORDER_NOTIFY_EMAIL` to your address |

---

## Notes

- Without email configured, orders still work; codes still show on the success page.  
- Email is best-effort; always show codes on-site too.  
- For reliable delivery to any customer, verify a real domain on Resend (or use SMTP from Gmail).  
