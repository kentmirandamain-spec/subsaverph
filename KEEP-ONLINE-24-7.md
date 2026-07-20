# Keep SubSaverPH online 24/7

## Important: admin PC does not host the live site

| What | Where it runs |
|------|----------------|
| **Public store** (customers) | **Render cloud** — 24/7 when not sleeping |
| **Admin panel** | Same Render URL `/admin` — you only need a browser to log in |
| **Your home PC** | Optional. You can shut it down; the live site keeps running |

You do **not** need `python server.py` on your computer for customers to shop.

---

## Why it sometimes feels “offline”

Render **Free** web services **sleep** after about 15 minutes with no traffic.  
The next visitor waits ~30–60 seconds while the app wakes up.

`render.yaml` currently has **`plan: free`**.

---

## Option A — Free keep-alive (enabled in this repo)

Two GitHub Actions ping your health URL on a staggered schedule:

| Workflow | File | Schedule |
|----------|------|----------|
| Keep Render awake | `.github/workflows/keep-alive.yml` | every ~5 min |
| Keep Render awake (offset) | `.github/workflows/keep-alive-offset.yml` | every ~5 min, offset by 2–3 min |

They hit:

- `https://subsaverph.com/api/health`
- `https://subsaverph.onrender.com/api/health`

### Enable / verify (one-time)

1. Open https://github.com/kentmirandamain-spec/subsaverph/actions  
2. If asked, **Allow Actions** / enable workflows  
3. Open **Keep Render awake** → **Run workflow** → confirm it turns green  
4. Optional backup: free monitor at https://uptimerobot.com every 5 minutes → same health URL  

### Optional custom URL

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **Variables**:

| Name | Value |
|------|--------|
| `KEEP_ALIVE_URL` | `https://subsaverph.com/api/health` |

### Limits (free tier)

- Usually keeps the free instance awake  
- GitHub cron can lag a few minutes  
- Occasional cold starts still possible if pings are delayed  

---

## Option B — True 24/7 (recommended for a live store)

Paid Render = **no sleep**, faster, more reliable for payments.

1. https://dashboard.render.com → **subsaverph**  
2. **Settings** → **Instance Type**  
3. Change **Free** → **Starter** (about **$7/month**)  
4. Save  

Or in `render.yaml`:

```yaml
plan: starter
```

Then commit + push and redeploy.

### Why pay for a store

- Always on (no 60s cold start)  
- Better for Stripe / GCash / PayPal checkout  
- Customers don’t bounce while waiting  

---

## Quick checks

| Check | URL |
|--------|-----|
| Health | https://subsaverph.com/api/health |
| Store | https://subsaverph.com/ |
| Admin | https://subsaverph.com/admin |
| GitHub Actions | https://github.com/kentmirandamain-spec/subsaverph/actions |

Healthy response looks like:

```json
{ "ok": true, "service": "SubSaverPH", ... }
```

---

## Summary

| Goal | Do this |
|------|---------|
| Site up when your PC is off | Already true on Render — do not rely on local `python server.py` |
| Free “mostly always on” | Keep-alive workflows (Option A) + enable GitHub Actions |
| True 24/7 store | Upgrade Render to **Starter** (Option B) |
