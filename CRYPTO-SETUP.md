# Crypto payment setup (NOWPayments)

Crypto is always listed at **Checkout** under **Other methods**.

| Mode | When | What happens |
|------|------|----------------|
| **Demo** | No API key | Instant codes (no real crypto) |
| **Live** | `NOWPAYMENTS_API_KEY` set | Redirect → NOWPayments invoice → pay with USDT/BTC/ETH… → codes |

---

## 1. Create a NOWPayments account

1. Open **https://account.nowpayments.io/create-account** (or nowpayments.io → Sign up)
2. Complete registration / email verify
3. Optional: enable **Sandbox** in dashboard if you want test mode first  
   (NOWPayments may use the same API with sandbox flag depending on plan — use their docs)

---

## 2. Get your API key

1. Log in → **Settings** → **API keys**  
   (or https://account.nowpayments.io/store-settings )
2. Create / copy **API key**
3. Keep it secret (like a password)

---

## 3. Set environment variables (Render)

Render → **subsaverph** → **Environment**:

```env
NOWPAYMENTS_API_KEY=your_api_key_here
PUBLIC_URL=https://subsaverph.onrender.com
```

Optional:

```env
NOWPAYMENTS_API_BASE=https://api.nowpayments.io/v1
# Optional: force-display a known static egress IP (if you bought a static IP)
# SERVER_OUTBOUND_IP=x.x.x.x
# Only for debugging if IPN is slow (not recommended in production):
# CRYPTO_TRUST_RETURN=0
```

Save → wait for **redeploy**.

---

## 4. Whitelist your server IP in NOWPayments (important)

NOWPayments often requires your **server outbound IP** for API / payout security.

### Get your IP

After deploy, open either:

- https://subsaverph.onrender.com/api/nowpayments/ip  
- or https://subsaverph.onrender.com/api/health  

Copy the value of **`outboundIp`** (example: `35.xxx.xxx.xxx`).

### Add it in NOWPayments

1. Log in: https://account.nowpayments.io/  
2. **Settings** → **Payments** → **IP addresses** (or “Whitelist IPs”)  
3. **Add** the `outboundIp` you copied  
4. Save  

**Note:** Free Render may **change** the outbound IP after redeploys.  
If crypto breaks later, re-check `/api/nowpayments/ip` and update the whitelist.  
For a stable IP: paid Render static outbound IP, or set `SERVER_OUTBOUND_IP` if you have a fixed egress.

---

## 5. IPN / webhook (important for auto delivery)

In NOWPayments dashboard, set **IPN callback URL** to:

```text
https://subsaverph.onrender.com/api/webhooks/nowpayments
```

(Dashboard → Settings → Payments → Instant payment notifications)

The checkout also sends this URL on each invoice.

If you use Cloudflare or a firewall in front of the site, allow NOWPayments notification IPs (also listed on `/api/nowpayments/ip`):

```text
51.89.194.21
51.75.77.69
138.201.172.58
65.21.158.36
144.76.201.30
```

Webhook fulfills the order when status is `finished` / `confirmed` / `sending`.  
When the buyer returns to the site, `/api/checkout/complete` also checks payment status.

---

## 6. Customer flow

1. Cart → Checkout  
2. Choose **Crypto**  
3. **Continue to crypto pay**  
4. Pick coin (USDT, BTC, ETH, …) on NOWPayments page  
5. Send crypto  
6. After payment, return to SubSaverPH → codes on success page (+ email if configured)

---

## 7. Confirm it is live

Open: **https://subsaverph.onrender.com/api/health**

```json
"cryptoConfigured": true
```

Checkout help text should say NOWPayments is configured (not demo).

---

## 8. Test checklist

- [ ] Product has inventory codes  
- [ ] Order total at least ~$0.50 USD (NOWPayments minimums)  
- [ ] API key on Render + redeployed  
- [ ] Pay with a small amount of USDT (or sandbox if available)  
- [ ] Codes appear after return / IPN  

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Still “Crypto (demo)” | Key missing/wrong env name / deploy not done |
| NOWPayments HTTP 401 | Invalid API key |
| **HTTP 403 / Cloudflare Error 1010** | Cloudflare blocked Python’s default HTTP client. SubSaverPH uses **curl_cffi** (Chrome TLS) after deploy. Redeploy latest code; if still blocked, email NOWPayments support with your server IP / Render region. |
| Amount too low | Raise cart total |
| Payment not completed yet | Wait for network confirmations; refresh success page; check IPN URL |
| No email | `emailConfigured` + Resend/SMTP (separate) |

---

## Notes

- Charge is priced in **USD** on the invoice (converted from your cart)  
- Fees: see NOWPayments pricing; optional `is_fee_paid_by_user` in code  
- Keep stock filled in admin or orders fail after paid  
