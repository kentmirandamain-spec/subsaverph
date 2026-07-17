# LiqPay setup (SubSaverPH)

**LiqPay** is a hosted payment page (cards and other methods available on your LiqPay account).  
It appears under **Checkout → Other methods**.

| Mode | When | Behavior |
|------|------|----------|
| **Demo** | Keys not set | Instant test codes |
| **Live / Sandbox** | `LIQPAY_PUBLIC_KEY` + `LIQPAY_PRIVATE_KEY` set | Redirect → LiqPay → pay → return with codes |

---

## 1. Create LiqPay merchant account

1. Open **https://www.liqpay.ua/** (or company LiqPay portal for your region)
2. Register / log in as a **merchant / business**
3. Complete verification (LiqPay is primarily for **Ukraine / UAH and related** — confirm they accept your country and product type)
4. Open the shop / API section

---

## 2. Get API keys

1. In LiqPay cabinet → **API** / **Integration** / shop settings  
2. Copy:
   - **Public key** (often starts with `i` or sandbox prefix)
   - **Private key** (secret — never put in frontend JS)

Sandbox keys are for testing; production keys for real money.

---

## 3. Render environment variables

```env
LIQPAY_PUBLIC_KEY=your_public_key
LIQPAY_PRIVATE_KEY=your_private_key
PUBLIC_URL=https://subsaverph.onrender.com
# Optional: allow return without waiting for server_url (default 1)
# LIQPAY_TRUST_RETURN=1
```

Save → redeploy.

---

## 4. Callback URLs (auto-sent by SubSaverPH)

| Type | URL |
|------|-----|
| **server_url** (webhook) | `https://subsaverph.onrender.com/api/webhooks/liqpay` |
| **result_url** (buyer return) | `https://subsaverph.onrender.com/api/checkout/liqpay/return?ref=…` |

You can open the webhook in a browser to check it is live:

```text
https://subsaverph.onrender.com/api/webhooks/liqpay
```

Should show `"ok": true`.

---

## 5. Customer flow

1. Cart → Checkout → **LiqPay**  
2. **Continue to LiqPay**  
3. Site opens an auto-submit form → LiqPay payment page  
4. Customer pays  
5. LiqPay notifies `server_url` + customer returns → codes on success page  

---

## 6. Confirm

https://subsaverph.onrender.com/api/health  

```json
"liqpayConfigured": true
```

---

## Important notes

- LiqPay is **not a PH GCash gateway**. It is mainly card/wallet rails supported by LiqPay (often UAH/EUR/USD).  
- For Filipino GCash/Maya you still need PH gateways (or manual).  
- Test with **sandbox keys** first if LiqPay provides them.  
- Keep inventory stock filled for products you sell.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Still “LiqPay (demo)” | Keys not on Render / wrong names / no redeploy |
| Bad signature on webhook | Wrong private key; match public/private pair |
| Redirect fails | Check `PUBLIC_URL` is `https://subsaverph.onrender.com` |
| Account rejected | LiqPay may not onboard PH-only digital code shops — contact their support |

---

## Related

- PayPal: `PAYPAL-SETUP.md`  
- Crypto: `CRYPTO-SETUP.md`  
- Overview: `PAYMENTS-SETUP.md`  
