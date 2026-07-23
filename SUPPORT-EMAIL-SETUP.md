# Support email setup

## Two different addresses (important)

| Address | Role |
|---------|------|
| **support@subsaverph.com** | Public address shown to customers (needs Cloudflare Email Routing to forward) |
| **subsaver@outlook.com** | **Your real inbox** — website contact form + order BCC should arrive here |

The website form does **not** send to `support@subsaverph.com` by default (that address has no mailbox until routing is set and would bounce).  
It sends to **Owner inbox** / `SUPPORT_INBOX` → **subsaver@outlook.com**.

| Where | Link |
|--------|------|
| Support page | https://subsaverph.com/#/support |
| Footer | “Contact support” + email |
| Admin → Support inbox | Saved form tickets even if email fails |
| After purchase | “Email support” with Order ID filled in |

---

## Fix: form messages → Outlook (required)

### A) Admin (easiest)

1. Open **https://subsaverph.com/admin**  
2. **Site content → 11 · Brand & contact**  
3. **Owner inbox** = `subsaver@outlook.com`  
4. **Save all site content**

### B) Render Environment (recommended, survives settings resets)

Render → service **subsaverph** → **Environment** → add:

| Key | Value |
|-----|--------|
| `SUPPORT_INBOX` | `subsaver@outlook.com` |
| `ORDER_NOTIFY_EMAIL` | `subsaver@outlook.com` |
| `MAIL_REPLY_TO` | `subsaver@outlook.com` |

Keep your existing `RESEND_API_KEY` (or SMTP_*) so email can send.

### C) Test

1. Open https://subsaverph.com/#/support  
2. Submit the form with a **different** email as the customer  
3. Check **subsaver@outlook.com** (Inbox + **Junk**) within a minute  
4. Also check Admin → **Support inbox** (messages are saved even if mail fails)

### Outlook tips

- Check **Junk / Other**  
- Add `onboarding@resend.dev` or your `MAIL_FROM` domain to safe senders  
- Subject looks like: `[SubSaverPH Support] …`

---

## Create the inbox (free) — Cloudflare Email Routing

You already own **subsaverph.com**. Do this once:

### 1. Enable Email Routing

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/)  
2. Select domain **subsaverph.com**  
3. Left menu → **Email** → **Email Routing**  
4. Click **Get started** / **Enable Email Routing**  
5. Cloudflare will add the required **MX** DNS records (accept if asked)

### 2. Add your personal inbox as destination

1. **Destination addresses** → **Add**  
2. Enter your real Gmail (or Outlook), e.g. `you@gmail.com`  
3. Open Gmail and **confirm** the verification link from Cloudflare  

### 3. Create the public address

1. **Routing rules** → **Create address**  
2. Custom address: `support`  
   → full address becomes **support@subsaverph.com**  
3. Action: **Send to** → your Gmail  
4. Save  

### 4. Test

From a **different** email account, send a message to:

```text
support@subsaverph.com
```

It should arrive in your Gmail within a minute (check spam).

---

## Optional: reply *as* support@subsaverph.com

Cloudflare Email Routing only **receives** mail. To **send** from support@:

### Option A — Resend (recommended with your order emails)

1. Resend → **Domains** → add `subsaverph.com` → add DNS records  
2. Render → Environment:

| Key | Value |
|-----|--------|
| `MAIL_FROM` | `SubSaverPH <support@subsaverph.com>` |
| `MAIL_REPLY_TO` | `support@subsaverph.com` |
| `ORDER_NOTIFY_EMAIL` | your Gmail (BCC of every order) |
| `RESEND_API_KEY` | your `re_...` key |

Customers can reply to order emails and it goes to support@.

### Option B — Zoho Mail free

Create a real mailbox `support@subsaverph.com` on Zoho (domain MX must point to Zoho — conflicts with Cloudflare Routing; pick one approach).

---

## Site settings (already set)

Admin → **Site content**:

| Field | Value |
|-------|--------|
| Support email | `support@subsaverph.com` |
| Footer support | `support@subsaverph.com` |

---

## Checklist

- [ ] Cloudflare Email Routing enabled  
- [ ] Destination Gmail verified  
- [ ] Rule: `support@subsaverph.com` → Gmail  
- [ ] Test email received  
- [ ] Render: `MAIL_REPLY_TO=support@subsaverph.com`  
- [ ] Open https://subsaverph.com/#/support — address looks correct  

When routing works, customers email **support@subsaverph.com** and you answer from Gmail.
