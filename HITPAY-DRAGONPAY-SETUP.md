# HitPay + Dragonpay setup (SubSaverPH)

Both appear under **Checkout → Other methods**.

| Method | Live when… | Demo when… |
|--------|------------|------------|
| **HitPay** | `HITPAY_API_KEY` set | Key missing |
| **Dragonpay** | `DRAGONPAY_MERCHANT_ID` + `DRAGONPAY_PASSWORD` set | Keys missing |

Stripe stays hidden. PayPal / crypto still work as before.

---

## A) HitPay

### 1. Create account
1. https://hitpayapp.com/ (or dashboard.hit-pay.com)  
2. Choose **Philippines** if available  
3. Complete business / KYC (DTI + BIR usually required for full methods)

### 2. API keys
1. Dashboard → **Settings → API Keys**  
2. Copy **API Key**  
3. Copy **Salt** (for webhooks)  
4. Use **Sandbox** first, then Live

### 3. Render environment

```env
HITPAY_API_KEY=your_api_key
HITPAY_SALT=your_salt
HITPAY_MODE=sandbox
PUBLIC_URL=https://subsaverph.onrender.com
# HITPAY_TRUST_RETURN=1
```

| Value | Meaning |
|-------|---------|
| `HITPAY_MODE=sandbox` | `api.sandbox.hit-pay.com` |
| `HITPAY_MODE=live` | `api.hit-pay.com` |

### 4. Webhook (required for reliable fulfillment)
1. HitPay → **Developers → Webhook Endpoints**  
2. New webhook URL:

```text
https://subsaverph.onrender.com/api/webhooks/hitpay
```

3. Event: **`payment_request.completed`** (and related completed events)  
4. Save  

### 5. Test
Checkout → **HitPay** → pay on HitPay page → return → codes.

Health check: `"hitpayConfigured": true` on `/api/health`.

---

## B) Dragonpay

### 1. Merchant account
1. https://www.dragonpay.ph/  
2. Sign up as merchant / request API access  
3. You receive:
   - **Merchant ID**
   - **Password** (API / collection password)  
4. Test credentials for sandbox: `test.dragonpay.ph`

### 2. Render environment

```env
DRAGONPAY_MERCHANT_ID=your_merchant_id
DRAGONPAY_PASSWORD=your_api_password
DRAGONPAY_MODE=test
PUBLIC_URL=https://subsaverph.onrender.com
# DRAGONPAY_TRUST_RETURN=1
```

| Value | Pay URL |
|-------|---------|
| `DRAGONPAY_MODE=test` | `https://test.dragonpay.ph/Pay.aspx` |
| `DRAGONPAY_MODE=live` | `https://gw.dragonpay.ph/Pay.aspx` |

### 3. Postback URL (in Dragonpay merchant portal)
Set collection **postback / notify URL** to:

```text
https://subsaverph.onrender.com/api/webhooks/dragonpay
```

Optional return URL (if portal has a field):

```text
https://subsaverph.onrender.com/api/checkout/dragonpay/return
```

### 4. Test
Checkout → **Dragonpay** → pick GCash/Maya/bank/OTC → pay → return → codes.

Health: `"dragonpayConfigured": true`.

---

## C) Customer flow

1. Cart → Checkout  
2. Choose **HitPay** or **Dragonpay**  
3. Redirect to provider  
4. Pay  
5. Webhook / return → success page with codes  

---

## D) Without merchant approval yet

Both methods still show as **(demo)** so you can test the UI.  
Demo does **not** charge real money.

Apply for HitPay + Dragonpay with your **DTI National** registration + BIR when ready, then paste keys.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Still demo | Keys missing / wrong env names / not redeployed |
| HitPay invalid API key | Sandbox key with live mode (or reverse) |
| Dragonpay digest error | Wrong password; amount must be `##.##` PHP |
| Paid but no codes | Check webhook URL; refresh success page; stock codes in admin |

---

## Related

- PayPal: `PAYPAL-SETUP.md`  
- Crypto: `CRYPTO-SETUP.md`  
- Overview: `PAYMENTS-SETUP.md`  
