# Semaphore SMS (SubSaverPH merchant alerts)

When a customer **pays with e-wallet** (or submits a GCash/Maya reference), SubSaverPH can **SMS you** via **Semaphore** (Philippines).

You also get an **email** to your owner inbox (separate setup).

---

## 1. Create a Semaphore account

1. Open **https://semaphore.co** and sign up  
2. Buy credits (prepaid SMS)  
3. **Dashboard → API** → copy your **API key**  
4. **Sender names** → register a sender (e.g. `SUBSAVERPH`) and wait for approval if required  
   - Without an approved sender name, API may fail  
   - Max **11 characters**

---

## 2. Put your mobile number in Admin

1. Open **https://subsaverph.com/admin** (or your live admin URL)  
2. **Brand & contact → Owner mobile**  
3. Use a PH number, e.g. `09171234567` or `+639171234567`  
4. **Save all site content**

You can also set the number only on Render:

| Key | Example |
|-----|---------|
| `OWNER_MOBILE` | `09171234567` |

`OWNER_MOBILE` overrides Admin if both are set.

---

## 3. Environment variables on Render

**Render → your service → Environment → Add:**

| Key | Required | Value |
|-----|----------|--------|
| `SEMAPHORE_API_KEY` | **Yes** | your Semaphore API key |
| `SEMAPHORE_SENDER` | Recommended | approved sender, e.g. `SUBSAVERPH` (max 11 chars) |
| `OWNER_MOBILE` | Optional | if not set in Admin |

**Save** → wait for redeploy (or **Manual Deploy**).

Do **not** commit the real API key into git.

---

## 4. Verify

Open:

```text
https://subsaverph.com/api/health
```

(or `https://YOUR-APP.onrender.com/api/health`)

You want:

```json
"ownerMobileConfigured": true,
"smsConfigured": true,
"smsProvider": "semaphore"
```

---

## 5. Test SMS from admin (optional)

If you are logged into admin, you can POST a test (browser console or Postman):

```http
POST /api/admin/test-sms
Content-Type: application/json
Cookie: (your admin session)

{}
```

Or with a number:

```json
{ "to": "09171234567", "message": "SubSaverPH test SMS" }
```

Success response includes `"ok": true` and Semaphore’s reply.

---

## 6. Real flow test

1. Customer checks out with **GCash/Maya (QR)**  
2. Customer pays and **submits payment reference** on the site  
3. You should get:
   - **SMS** on your mobile (Semaphore)  
   - **Email** on owner inbox (if email is configured)  
4. Open **Admin → Orders** → **Confirm payment** when you see the transfer  

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `smsConfigured: false` | Missing `SEMAPHORE_API_KEY` on Render, or no owner mobile |
| `ownerMobileConfigured: false` | Set Admin **Owner mobile** or `OWNER_MOBILE` |
| API error about sender name | Register/approve sender in Semaphore; set `SEMAPHORE_SENDER` |
| No SMS but email works | Check Semaphore credits; check Render logs for `semaphore` detail |
| Wrong number format | Use `09xxxxxxxxx` or `+639xxxxxxxxx` |

---

## Security

- Keep `SEMAPHORE_API_KEY` only in Render Environment  
- Owner SMS goes only to **your** number (owner mobile), not to customers  
