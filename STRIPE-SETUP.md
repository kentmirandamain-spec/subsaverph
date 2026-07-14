# Stripe + instant code delivery (SubSaverPH)

## Customer flow

1. Customer checks out on your site  
2. Redirected to **Stripe Checkout** (card payment)  
3. Pays successfully  
4. Returns to your site  
5. **Codes delivered instantly** from your stock  

---

## 1. Create Stripe account

1. https://dashboard.stripe.com/register  
2. Open **Developers → API keys**  
3. Copy:
   - **Publishable key** → `pk_test_...`
   - **Secret key** → `sk_test_...`

Use **test keys** first. Switch to **live keys** when ready for real money.

---

## 2. Set environment variables (Windows)

### Option A — PowerShell (this session)

```powershell
cd C:\Users\ADMIN\subsave
$env:PAYMENT_MODE = "stripe"
$env:STRIPE_SECRET_KEY = "sk_test_YOUR_SECRET"
$env:STRIPE_PUBLISHABLE_KEY = "pk_test_YOUR_PUBLISHABLE"
$env:PUBLIC_URL = "http://127.0.0.1:8790"
python server.py
```

### Option B — Render

Dashboard → your service → **Environment**:

| Key | Value |
|-----|--------|
| `PAYMENT_MODE` | `stripe` |
| `STRIPE_SECRET_KEY` | `sk_live_...` or `sk_test_...` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` |
| `PUBLIC_URL` | `https://YOUR-APP.onrender.com` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (after step 3) |
| `FORCE_HTTPS` | `1` |

---

## 3. Webhook (recommended for production)

Delivers codes even if the browser closes after payment.

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**  
2. URL:

   `https://YOUR-APP.onrender.com/api/webhooks/stripe`

3. Event: **`checkout.session.completed`**  
4. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### Local webhook testing (optional)

```powershell
stripe listen --forward-to localhost:8790/api/webhooks/stripe
```

(Install Stripe CLI: https://stripe.com/docs/stripe-cli)

---

## 4. Load product codes

Admin → **Codes / Stock** → add codes for each product  
Without stock → **SOLD OUT** / checkout fails  

---

## 5. Test card numbers (test mode)

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Decline |

Any future expiry, any CVC, any ZIP.

---

## 6. How to know Stripe is on

Checkout button says:

**Pay with Stripe · ₱…**

If keys are missing, it stays on demo mode:

**Pay · Get codes instantly** (no real charge)

---

## API endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/checkout/stripe` | Create Stripe Checkout session |
| `GET /api/checkout/session/<id>` | After redirect — fulfill + return codes |
| `POST /api/webhooks/stripe` | Webhook fulfill |
| `GET /api/payments/config` | Mode + publishable key |

---

## Security notes

- Never put `sk_` secret keys in frontend JavaScript  
- Use **test** keys until you are ready  
- Only sell codes you are allowed to sell  

---

## Quick checklist

- [ ] Stripe account + test keys  
- [ ] Env vars set  
- [ ] Server restarted  
- [ ] Codes loaded in Admin  
- [ ] Test buy with `4242…`  
- [ ] Codes show on success page  
- [ ] Webhook set for production  
