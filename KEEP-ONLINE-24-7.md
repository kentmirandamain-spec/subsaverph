# Keep SubSaverPH online 24/7

## Why it goes offline

Render **Free** web services **sleep** after about 15 minutes with no traffic.  
The next visitor waits ~30–60 seconds while the app wakes up.

Your service is currently on **`plan: free`** in `render.yaml`.

---

## Option A — Free keep-alive (already added)

A GitHub Action pings your site every **5 minutes**:

`.github/workflows/keep-alive.yml`  
→ `https://subsaverph.onrender.com/api/health`

### Enable it

1. Push is already on GitHub (or run `git push`)
2. Open: https://github.com/kentmirandamain-spec/subsaverph/actions  
3. Allow Actions if GitHub asks  
4. Open workflow **Keep Render awake** → **Run workflow** (test once)

### Optional custom URL

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **Variables**:

| Name | Value |
|------|--------|
| `KEEP_ALIVE_URL` | `https://subsaverph.onrender.com/api/health` |

### Limits

- Free and usually keeps the free instance awake  
- GitHub cron can lag a few minutes  
- Render may still change free-tier rules later  

Also free: **https://uptimerobot.com** → monitor every 5 min → same health URL.

---

## Option B — Real 24/7 (recommended for a store)

Paid Render = no sleep, faster, more reliable for payments.

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
- Better for Stripe / GCash checkout  
- Customers don’t bounce while waiting  

---

## Quick checks

| Check | URL |
|--------|-----|
| Health | https://subsaverph.onrender.com/api/health |
| Store | https://subsaverph.onrender.com/ |
| GitHub Actions | https://github.com/kentmirandamain-spec/subsaverph/actions |

Healthy response looks like:

```json
{ "ok": true, "service": "SubSaverPH", ... }
```

---

## Summary

| Goal | Do this |
|------|---------|
| Free “mostly always on” | Keep-alive workflow (Option A) |
| True 24/7 store | Upgrade Render to **Starter** (Option B) |
