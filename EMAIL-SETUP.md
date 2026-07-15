# Email invoice + codes (after payment)

After a successful payment, SubSaverPH:

1. Assigns stock codes to the order  
2. Shows them on the success page  
3. **Emails an invoice with the same codes** to the customer  

## Render environment variables

Add **one** of these options in Render → Environment, then **redeploy**.

### Option A — Resend (easiest on Render)

1. Sign up: https://resend.com  
2. Create an API key  
3. (Production) Verify your domain, or use `onboarding@resend.dev` for tests  

| Key | Example |
|-----|---------|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `MAIL_FROM` | `SubSaverPH <onboarding@resend.dev>` |
| `MAIL_FROM_NAME` | `SubSaverPH` |
| `MAIL_REPLY_TO` | your real support email |

### Option B — SMTP (Gmail / Outlook / etc.)

| Key | Example (Gmail) |
|-----|-----------------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `you@gmail.com` |
| `SMTP_PASSWORD` | Gmail **App Password** (not your normal password) |
| `SMTP_FROM` | `you@gmail.com` |
| `SMTP_TLS` | `1` |
| `MAIL_FROM_NAME` | `SubSaverPH` |

Gmail: Google Account → Security → 2-Step Verification → App passwords.

## Check it works

```text
GET https://subsaverph.onrender.com/api/health
```

Should include `"emailConfigured": true`.

Complete a test Stripe payment; the customer email should receive:

- Order / invoice details  
- Product names  
- **Access codes**  

## Notes

- If email is not configured, orders still succeed and codes still show on the website.  
- Failed sends are stored on the order (`emailSent: false`, `emailDetail`).  
- Check spam if the message does not arrive.  
