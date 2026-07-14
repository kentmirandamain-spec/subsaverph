# Multi-payment setup (Card, GCash, Maya, PayPal, Crypto)

Checkout shows all enabled methods. After payment succeeds, **codes deliver instantly**.

| Method | Provider | Env keys |
|--------|----------|----------|
| **Card** | Stripe (preferred) or PayMongo | `STRIPE_*` or `PAYMONGO_*` |
| **GCash** | PayMongo | `PAYMONGO_SECRET_KEY` |
| **Maya** | PayMongo | `PAYMONGO_SECRET_KEY` |
| **PayPal** | PayPal | `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` |
| **Crypto** | NOWPayments | `NOWPAYMENTS_API_KEY` |

If **no keys** are set, methods still appear in **demo mode** (no real money, instant codes).

---

## Render env vars (recommended)

`PUBLIC_URL` = your Render URL, e.g. `https://subsaverph.onrender.com`

### Stripe (Card)
```
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_PUBLISHABLE_KEY=pk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_...
```
Webhook: `https://YOUR-APP.onrender.com/api/webhooks/stripe`  
Event: `checkout.session.completed`

### PayMongo (GCash + Maya + optional card)
```
PAYMONGO_SECRET_KEY=sk_test_or_live
PAYMONGO_PUBLIC_KEY=pk_test_or_live
```
Webhook: `https://YOUR-APP.onrender.com/api/webhooks/paymongo`

### PayPal
```
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=sandbox
```
Use `live` when going live.

### Crypto (NOWPayments)
```
NOWPAYMENTS_API_KEY=...
```
IPN: `https://YOUR-APP.onrender.com/api/webhooks/nowpayments`

---

## Local `.env` example

See `.env.example`. Then:

```powershell
cd C:\Users\ADMIN\subsave
python server.py
```

---

## Customer experience

1. Cart → Checkout  
2. Pick **Card / GCash / Maya / PayPal / Crypto**  
3. Redirect to provider  
4. Pay  
5. Return → **codes on success page**

---

## Webhook URLs (Render)

Replace with your real app name:

| Provider | URL |
|----------|-----|
| Stripe | `https://YOUR-APP.onrender.com/api/webhooks/stripe` |
| PayMongo | `https://YOUR-APP.onrender.com/api/webhooks/paymongo` |
| Crypto | `https://YOUR-APP.onrender.com/api/webhooks/nowpayments` |

Also set:

```
PUBLIC_URL=https://YOUR-APP.onrender.com
```

---

## Notes

- **GCash / Maya** need a **PayMongo** business account (PH).  
- **Card** works best with **Stripe**.  
- **PayPal** needs a PayPal Developer app.  
- **Crypto** needs NOWPayments (or similar).  
- Always keep **Codes / Stock** filled or products show **SOLD OUT**.  
