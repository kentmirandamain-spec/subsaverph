# PayPal checkout setup (SubSaverPH)

PayPal is always listed at **Checkout** under **Other methods**.

| Mode | When | What happens |
|------|------|----------------|
| **Demo** | No PayPal keys | Instant codes (no real money) |
| **Live / Sandbox** | `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` set | Redirect → PayPal → capture → codes |

---

## 1. Create a PayPal app

1. Open [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications)
2. Log in with your PayPal business account
3. **Apps & Credentials**
4. Choose **Sandbox** first (testing), then **Live** when ready
5. Create an app (e.g. `SubSaverPH`)
6. Copy:
   - **Client ID**
   - **Secret**

---

## 2. Environment variables (Render or local `.env`)

```env
PAYPAL_CLIENT_ID=Ae...your_client_id...
PAYPAL_CLIENT_SECRET=EL...your_secret...
PAYPAL_MODE=sandbox
PUBLIC_URL=https://subsaverph.onrender.com
```

| Variable | Values |
|----------|--------|
| `PAYPAL_MODE` | `sandbox` (test) or `live` (real money) |
| `PUBLIC_URL` | Your public site URL (no trailing slash) |

On **Render** → your service → **Environment** → add the three vars → **Save** → redeploy.

Local:

```powershell
cd C:\Users\ADMIN\subsave
# put keys in .env then:
python server.py
```

---

## 3. Customer flow

1. Cart → **Checkout**
2. Choose **PayPal**
3. Click **Continue to PayPal**
4. Log in / pay on PayPal
5. PayPal returns to:  
   `https://YOUR-SITE/api/checkout/paypal/return?ref=...`
6. Site captures payment and shows codes on the success page

Cancel returns to checkout with `cancelled=1`.

---

## 4. Test (sandbox)

1. Create [Sandbox accounts](https://developer.paypal.com/dashboard/accounts) (buyer + business)
2. Set `PAYPAL_MODE=sandbox`
3. Use the **sandbox** Client ID / Secret
4. At checkout, pay with the **sandbox buyer** email/password

---

## 5. Go live

1. Switch dashboard to **Live** credentials
2. Set:

```env
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...live client id...
PAYPAL_CLIENT_SECRET=...live secret...
```

3. Redeploy and run a small real test order

---

## 6. Troubleshooting

| Issue | Fix |
|-------|-----|
| Only “PayPal (demo)” | Keys missing or not deployed on Render |
| Auth error | Wrong Client ID/Secret for the mode (sandbox vs live) |
| Payment not completed | Buyer cancelled, or capture failed — check Render logs |
| Return lands on blank page | Ensure `PUBLIC_URL` matches your live domain |

Health check:

```text
GET /api/health
```

Look for `"paypalConfigured": true`.

---

## Notes

- Digital goods: shipping is disabled (`NO_SHIPPING`)
- Unsupported display currencies convert to **USD** for PayPal charge when needed
- Codes still require **inventory stock** in admin
