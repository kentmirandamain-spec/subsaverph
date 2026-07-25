# Cryptomus — automatic crypto (alternative to NOWPayments)

Cryptomus is a **hosted automatic crypto checkout** (USDT, BTC, ETH, …).  
Customers pay on Cryptomus → webhook → codes released (same idea as NOWPayments).

You can use **Cryptomus only**, **NOWPayments only**, or **both** at checkout.

---

## 1. Create Cryptomus account

1. https://cryptomus.com/ → sign up  
2. Complete merchant verification if required  
3. Open merchant / project settings  
4. Copy:
   - **Merchant UUID**
   - **Payment API key** (payment key, not payout key)

---

## 2. Render environment

**Render → subsaverph → Environment → Add:**

```env
CRYPTOMUS_MERCHANT_UUID=your-merchant-uuid
CRYPTOMUS_API_KEY=your-payment-api-key
PUBLIC_URL=https://subsaverph.com
```

Optional:

```env
CRYPTOMUS_CURRENCY=USD
# CRYPTOMUS_TO_CURRENCY=USDT
# CRYPTOMUS_LIFETIME=3600
# CRYPTOMUS_SHOW=1
# CRYPTOMUS_TRUST_RETURN=0
```

**Save** → **Manual Deploy**.

---

## 3. Webhook / callback

In Cryptomus (or it is sent on each invoice as `url_callback`):

```text
https://subsaverph.com/api/webhooks/cryptomus
```

Test GET:

```text
https://subsaverph.com/api/webhooks/cryptomus
```

Should return `"ok": true`.

---

## 4. Verify

```text
https://subsaverph.com/api/health
```

Expect:

```json
"cryptomusEnabled": true
```

Checkout should list **Crypto (Cryptomus)** (or your Admin label).

---

## 5. Customer flow

1. Checkout → **Crypto (Cryptomus)**  
2. Redirect to Cryptomus pay page  
3. Pay with crypto  
4. Return to SubSaverPH success → codes  
5. Webhook also fulfills if return is slow  

---

## vs NOWPayments vs manual wallet

| | Cryptomus | NOWPayments | Manual wallet |
|--|-----------|-------------|-----------------|
| Auto codes | Yes | Yes | No (admin confirm) |
| Setup | Merchant UUID + API key | API key + IP whitelist | Address in Admin |
| Env | `CRYPTOMUS_*` | `NOWPAYMENTS_*` | `manualCryptoAddress` |

---

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Method not listed | Keys missing / wrong; check health `cryptomusEnabled` |
| HTTP 502 creating payment | Wrong API key type; use **payment** key |
| Paid but no codes | Check webhook URL; open success page again |
| Demo crypto still showing | Remove demo / ensure live keys set |

See also: `CRYPTO-SETUP.md` (NOWPayments), `CRYPTO-ALTERNATIVE.md` (manual wallet).
