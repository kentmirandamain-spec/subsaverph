# Wire Xendit into SubSaverPH (Philippines)

Xendit is an alternative (or companion) to PayMongo for Filipino shoppers.

| Method on checkout | Xendit channel |
|--------------------|----------------|
| GCash | `GCASH` |
| Maya | `PAYMAYA` |
| GrabPay | `GRABPAY` |
| ShopeePay | `SHOPEEPAY` |
| Card (if no Stripe) | `CREDIT_CARD` |
| **Xendit Checkout** | Hosted page with multiple channels |

---

## Step 1 — Create a Xendit account

1. Open **https://dashboard.xendit.co/register**  
2. Register as a **Philippines** business / individual  
3. Complete KYC verification for **live** payments  
4. Open **Settings → API Keys**

Copy:

- **Secret key** → starts with `xnd_development_...` (test) or `xnd_production_...` (live)

You only need the **secret key** for this integration (server-side).

---

## Step 2 — Activate payment channels

In Xendit Dashboard:

1. **Payment Channels** / **Accept payments**  
2. Enable **GCash, Maya (PayMaya), GrabPay, ShopeePay** (and cards if you want)  
3. Accept any channel terms  

---

## Step 3 — Env vars on Render

**https://dashboard.render.com** → **subsaverph** → **Environment**:

| Key | Value |
|-----|--------|
| `XENDIT_SECRET_KEY` | `xnd_development_...` or `xnd_production_...` |
| `PUBLIC_URL` | `https://subsaverph.onrender.com` |
| `XENDIT_REQUIRE_VERIFY` | `1` |
| `EWALLET_PROVIDER` | `xendit` **or** `auto` |

### If you have both PayMongo and Xendit

| `EWALLET_PROVIDER` | Behavior |
|--------------------|----------|
| `auto` (default) | Prefer **PayMongo** for GCash/Maya/… if PayMongo keys exist; else Xendit |
| `xendit` | Force GCash/Maya/GrabPay/ShopeePay through **Xendit** |
| `paymongo` | Force those methods through **PayMongo** |

Even with PayMongo preferred, checkout still shows **Xendit Checkout** (multi-wallet hosted page) when Xendit keys are set.

---

## Step 4 — Webhook / callback (required for reliable delivery)

1. Xendit Dashboard → **Settings → Callbacks** (or Webhooks)  
2. **Invoice paid** callback URL:

```text
https://subsaverph.onrender.com/api/webhooks/xendit
```

3. Optional: set a **callback verification token**  
4. Put the same value on Render:

```text
XENDIT_CALLBACK_TOKEN=your-token-here
```

Events to care about: invoice **PAID** / **SETTLED**.

---

## Step 5 — Confirm

```text
https://subsaverph.onrender.com/api/health
```

Should include:

```json
"xenditConfigured": true,
"ewalletProvider": "xendit"
```

(or `"ewalletProvider": "paymongo"` if PayMongo is preferred in auto mode)

Catalog:

```text
https://subsaverph.onrender.com/api/catalog
```

Look for methods with `"provider": "xendit"`.

---

## Customer flow

1. Cart → Checkout  
2. Choose **GCash / Maya / GrabPay / ShopeePay** or **Xendit Checkout**  
3. Redirect to Xendit invoice page  
4. Pay in the wallet/app  
5. Return → codes on success page (+ email if configured)

Minimum for e-wallets: about **₱20**.

---

## Local test

```env
XENDIT_SECRET_KEY=xnd_development_xxx
PUBLIC_URL=http://127.0.0.1:8790
EWALLET_PROVIDER=xendit
XENDIT_REQUIRE_VERIFY=1
```

```powershell
cd C:\Users\ADMIN\subsave
python server.py
```

Use Xendit **test mode** payment flows from their docs.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `xenditConfigured: false` | Missing `XENDIT_SECRET_KEY` on Render |
| E-wallets still say PayMongo | Set `EWALLET_PROVIDER=xendit` or remove PayMongo keys |
| Channel not available | Activate that channel in Xendit dashboard |
| Paid but no codes | Webhook URL + stock codes; check `XENDIT_CALLBACK_TOKEN` |
| Amount errors | Cart total in PHP; e-wallet min ₱20 |

---

## Security notes

- Never put the **secret key** in frontend JS — only on the server (Render env).  
- Prefer webhook + `XENDIT_REQUIRE_VERIFY=1` so codes only release after paid confirmation.  
