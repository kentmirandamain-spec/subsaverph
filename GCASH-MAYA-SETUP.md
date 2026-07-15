# Add GCash + Maya (PayMaya) — step by step

SubSaverPH uses **PayMongo** for GCash and Maya.  
**Stripe** stays for Card. Both can run at the same time.

---

## What you’ll get at checkout

| Method | Provider |
|--------|----------|
| Card | Stripe |
| **GCash** | PayMongo |
| **Maya** (PayMaya) | PayMongo |

---

## Step 1 — Create a PayMongo account

1. Open **https://dashboard.paymongo.com**  
2. **Sign up** (Philippines business / individual as required)  
3. Complete any verification PayMongo asks for  
4. Open **Developers** → **API keys**

Copy:

- **Public key** → starts with `pk_test_...` or `pk_live_...`  
- **Secret key** → starts with `sk_test_...` or `sk_live_...`

Use **test** keys first.

---

## Step 2 — Add keys on Render

1. Open **https://dashboard.render.com**  
2. Click service **subsaverph**  
3. **Environment** → **Add Environment Variable**

| Key | Value |
|-----|--------|
| `PAYMONGO_SECRET_KEY` | `sk_test_...` (or live) |
| `PAYMONGO_PUBLIC_KEY` | `pk_test_...` (or live) |
| `PUBLIC_URL` | `https://subsaverph.onrender.com` |
| `PAYMONGO_REQUIRE_VERIFY` | `1` |
| `PAYMONGO_TRUST_RETURN` | `0` |

Keep your existing Stripe keys. Do **not** remove them.

4. **Save Changes**  
5. Wait for **Live** redeploy  

---

## Step 3 — Webhook (recommended)

So codes still deliver if the browser closes after pay:

1. PayMongo Dashboard → **Developers** → **Webhooks**  
2. **Add endpoint**  
3. URL:

```text
https://subsaverph.onrender.com/api/webhooks/paymongo
```

4. Enable events for checkout / payment paid (as shown in their UI)  
5. Save  

---

## Step 4 — Confirm on the site

1. Open:

```text
https://subsaverph.onrender.com/api/catalog
```

2. Look for:

```json
"paymongoEnabled": true,
"paymentMethods": [
  { "id": "card", "label": "Card", "provider": "stripe" },
  { "id": "gcash", "label": "GCash", "provider": "paymongo" },
  { "id": "paymaya", "label": "Maya", "provider": "paymongo" }
]
```

3. Checkout page should show **Card**, **GCash**, and **Maya**.

---

## Step 5 — Test

1. Admin → add **stock codes** for a product  
2. Store → add product → Checkout  
3. Choose **GCash** or **Maya**  
4. Click **Continue to GCash** / **Continue to Maya**  
5. You should open **PayMongo’s** payment page  
6. Complete test payment (PayMongo test mode)  
7. Return → codes on success page (+ email if configured)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Only Card shows | `PAYMONGO_SECRET_KEY` missing or service not redeployed |
| Error “PayMongo not configured” | Secret key wrong / not saved |
| Minimum amount error | Cart under ₱20 — add items or use Card |
| Paid but no codes | Check webhook URL; stock available; Render logs |
| Wrong currency | GCash/Maya always bill in **PHP** (auto-converted) |

---

## Notes

- GCash / Maya need a **PayMongo** account (PH).  
- Stripe does **not** process GCash/Maya on this app.  
- Test keys first, then switch to `sk_live_` / `pk_live_` for real money.  
