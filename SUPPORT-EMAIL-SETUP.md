# Create a real support@subsaverph.com

You **cannot** create `support@subsaverph.com` while the site only lives on  
`subsaverph.onrender.com`. Email addresses after the `@` need a **domain you own**.

| Piece | What it is | Cost |
|--------|------------|------|
| Domain `subsaverph.com` | You own the name | ~$8–15 / year |
| Mailbox / routing | Receives mail to support@… | Free options exist |
| Sending (orders / replies) | Outbound mail as support@… | Free tier possible |

---

## Recommended path (cheapest real setup)

### Step 1 — Buy the domain

Buy **subsaverph.com** (or `.shop` / `.ph` if `.com` is taken):

- [Cloudflare Registrar](https://dash.cloudflare.com/) (often best price + easy DNS)
- [Porkbun](https://porkbun.com/)
- [Namecheap](https://www.namecheap.com/)

After purchase, **add the domain to Cloudflare** (free plan) and set the nameservers Cloudflare shows you.

### Step 2 — Create support@ with Cloudflare Email Routing (free)

This gives you a **real** address that **forwards** to your personal Gmail (or any inbox).

1. Cloudflare dashboard → select **subsaverph.com**
2. Left menu → **Email** → **Email Routing**
3. Click **Get started** / **Enable Email Routing**
4. Add destination address = **your real Gmail** (e.g. `you@gmail.com`)  
   → confirm the verification email Cloudflare sends
5. **Routing rules** → **Create address**:
   - Custom address: `support`
   - Action: **Send to** → your Gmail
6. Save

You now receive mail sent to:

```text
support@subsaverph.com
```

in your Gmail inbox.

### Step 3 — Reply / send as support@subsaverph.com (optional but useful)

#### A) Gmail “Send mail as” (good for manual support replies)

1. Gmail → ⚙️ → **See all settings** → **Accounts and Import**
2. **Send mail as** → **Add another email address**
3. Name: `SubSaverPH Support`  
   Email: `support@subsaverph.com`
4. SMTP (Cloudflare does not provide SMTP for routing-only).  
   Use one of:
   - **Resend SMTP** (after domain verify) — see Step 4  
   - Or a free Zoho Mail mailbox on the domain

#### B) Zoho Mail free plan (real mailbox on your domain)

1. https://www.zoho.com/mail/zohomail-pricing.html → free forever (limited users)
2. Add domain `subsaverph.com`, verify DNS (MX records)
3. Create user `support@subsaverph.com`
4. Use Zoho webmail or Gmail “Send mail as” with Zoho SMTP

### Step 4 — Site order emails (Resend + your domain)

So customers get invoices **from** SubSaverPH:

1. https://resend.com → sign up  
2. **Domains** → add `subsaverph.com` → add the DNS records Resend shows (in Cloudflare DNS)  
3. Create API key  
4. On **Render** → your web service → **Environment**:

| Key | Value |
|-----|--------|
| `RESEND_API_KEY` | `re_...` |
| `MAIL_FROM` | `SubSaverPH <support@subsaverph.com>` |
| `MAIL_FROM_NAME` | `SubSaverPH` |
| `MAIL_REPLY_TO` | `support@subsaverph.com` |

5. Redeploy Render  
6. Check: https://subsaverph.onrender.com/api/health → `"emailConfigured": true`

---

## Point website at the domain (optional, recommended)

After you own `subsaverph.com`:

1. Render → service → **Custom Domains** → add `subsaverph.com` and `www`
2. Cloudflare DNS → CNAME/A records Render gives you  
3. Site becomes `https://subsaverph.com` (better for trust + Google)

---

## What I can do in the project for you

Already on the site: links/text use `support@subsaverph.com`.

After **you** finish Steps 1–2 (domain + routing), tell me:

1. Domain is purchased: `subsaverph.com` (or the name you bought)  
2. Your personal Gmail that should receive support mail  

Then I can:

- Confirm DNS / Email Routing checklist with you  
- Wire Resend env vars instructions for Render  
- Update the live site domain in SEO/footer if you switch off `.onrender.com`

---

## Checklist

- [ ] Domain purchased  
- [ ] Domain on Cloudflare (nameservers active)  
- [ ] Email Routing enabled  
- [ ] `support@…` → your Gmail  
- [ ] Test: send email TO support@ from another account  
- [ ] (Optional) Resend domain verified for outbound  
- [ ] (Optional) Custom domain on Render  

**I cannot create the address from this PC alone** — registrars and Cloudflare need your account and (for the domain) a payment. Follow Steps 1–2 above; when the domain is yours, we finish the rest together.
