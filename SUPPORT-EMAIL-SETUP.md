# Support email: support@subsaverph.com

Your store already shows this address to customers:

```text
support@subsaverph.com
```

| Where | Link |
|--------|------|
| Support page | https://subsaverph.com/#/support |
| Footer | “Contact support” + email |
| After purchase | “Email support” with Order ID filled in |
| Checkout rules | Mentions support email |

**Creating the mailbox** is done in Cloudflare (or another host) — the website cannot invent a real inbox by itself.

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
