# Philippine e-wallet payments (GCash, Maya, GrabPay, ShopeePay)

For Filipino shoppers, SubSaverPH uses **PayMongo** — the standard PH payment gateway for e-wallets.

## What customers see at checkout

| Method | Who uses it | Billed in |
|--------|-------------|-----------|
| **GCash** | Most common PH e-wallet | PHP |
| **Maya** (PayMaya) | Maya app users | PHP |
| **GrabPay** | Grab app wallet | PHP |
| **ShopeePay** | Shopee wallet | PHP |
| Card | Visa / Mastercard | via Stripe or PayMongo |

E-wallets always charge in **PHP** (cart converts automatically).

---

## Step 1 — Create a PayMongo account (required)

1. Open **https://dashboard.paymongo.com/register**
2. Sign up as a **Philippines** merchant (individual or business — follow PayMongo’s KYC)
3. Complete verification so **live** e-wallets can be activated
4. **Developers** → **API keys**

Copy:

- **Public key** — `pk_test_...` or `pk_live_...`
- **Secret key** — `sk_test_...` or `sk_live_...`

Start with **test** keys.

---

## Step 2 — Activate e-wallets in PayMongo

In the PayMongo dashboard:

1. Open **Payment methods** / **E-wallets** (wording may vary)
2. **Activate** the wallets you want:
   - GCash  
   - Maya  
   - GrabPay  
   - ShopeePay  
3. Accept each provider’s terms if asked  

If a wallet is not activated, checkout may error for that method only.

---

## Step 3 — Add keys on Render (live site)

1. **https://dashboard.render.com** → service **subsaverph**
2. **Environment** → add:

| Key | Value |
|-----|--------|
| `PAYMONGO_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `PAYMONGO_PUBLIC_KEY` | `pk_test_...` or `pk_live_...` |
| `PUBLIC_URL` | `https://subsaverph.onrender.com` |
| `PAYMONGO_REQUIRE_VERIFY` | `1` |
| `PAYMONGO_TRUST_RETURN` | `0` |

3. **Save** → wait for redeploy → status **Live**

### Local PC (optional)

Create `C:\Users\ADMIN\subsave\.env` (copy from `.env.example`) and set the same keys, then restart `python server.py`.

---

## Step 4 — Webhook (recommended)

So codes still deliver if the customer closes the browser after paying:

1. PayMongo → **Developers** → **Webhooks**
2. URL:

```text
https://subsaverph.onrender.com/api/webhooks/paymongo
```

3. Enable payment / checkout paid events  
4. Save  

---

## Step 5 — Confirm

Open:

```text
https://subsaverph.onrender.com/api/catalog
```

You should see something like:

```json
"paymongoEnabled": true,
"paymentMethods": [
  { "id": "gcash", "label": "GCash", "provider": "paymongo" },
  { "id": "paymaya", "label": "Maya", "provider": "paymongo" },
  { "id": "grab_pay", "label": "GrabPay", "provider": "paymongo" },
  { "id": "shopeepay", "label": "ShopeePay", "provider": "paymongo" }
]
```

Checkout should list **Philippine e-wallets (PHP)** first.

---

## Step 6 — Test

1. Admin → add stock codes for a product  
2. Store → add to cart → Checkout  
3. Choose **GCash** (or Maya / GrabPay / ShopeePay)  
4. Click **Continue to …**  
5. Complete payment on PayMongo’s page (test or live)  
6. Return → codes on success page  

Minimum for e-wallets: about **₱20**.

---

## Fees (approx. — check PayMongo Pricing)

Typical e-wallet fees (subject to change on paymongo.com/pricing):

- GCash, Maya, GrabPay, ShopeePay — percentage + fixed fee per successful payment  

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Only Card / Demo | `PAYMONGO_SECRET_KEY` missing or not redeployed |
| “not configured” | Secret key wrong or empty |
| One wallet fails | Activate that wallet in PayMongo dashboard |
| Min amount error | Cart under ₱20 — add items or use Card |
| Paid but no codes | Webhook URL + stock codes + Render logs |

---

## Legal / business note

To accept **real** money from Filipino customers you need:

1. PayMongo account in good standing  
2. **Live** keys (not only test)  
3. Activated e-wallet channels  
4. Accurate business / tax details as required by PayMongo  

Until keys are set, checkout still **shows** GCash / Maya / GrabPay / ShopeePay in **demo** mode (no real charge).
