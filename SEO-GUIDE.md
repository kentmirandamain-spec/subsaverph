# Make SubSaverPH searchable online (Google)

**Preferred public URL:** https://subsaverph.com  

(The old Render URL `https://subsaverph.onrender.com` should **301 redirect** to the custom domain.)

---

## Why Google still shows “onrender”

Google remembers the first URL it indexed. Changing domain does **not** update search results overnight.

| Fact | Detail |
|------|--------|
| Site SEO tags | Already point to `https://subsaverph.com/` (canonical, Open Graph, sitemap) |
| Old URL | May still appear for days–weeks until Google recrawls |
| Fix | Redirect + Search Console for **both** URLs + request indexing |

---

## Step 1 — Confirm technical setup (usually already done)

| Check | URL |
|-------|-----|
| Canonical | View source on https://subsaverph.com/ → `rel="canonical"` = `https://subsaverph.com/` |
| Sitemap | https://subsaverph.com/sitemap.xml |
| Robots | https://subsaverph.com/robots.txt → Sitemap line uses **subsaverph.com** |
| Redirect | https://subsaverph.onrender.com/ should **301** to https://subsaverph.com/ |

Render env:

| Key | Value |
|-----|--------|
| `PUBLIC_URL` | `https://subsaverph.com` (no trailing slash) |

---

## Step 2 — Google Search Console (required)

### A) Add the **new** domain

1. Open **https://search.google.com/search-console**  
2. **Add property** → **URL prefix** → `https://subsaverph.com`  
3. Verify (HTML tag or DNS)  
4. **Sitemaps** → submit: `sitemap.xml`  
5. **URL inspection** → `https://subsaverph.com/` → **Request indexing**

### B) Keep the **old** property (if you already verified onrender)

1. Open property `https://subsaverph.onrender.com`  
2. **Settings** → **Change of address** (if offered) → new site `https://subsaverph.com`  
3. Or: **URL inspection** on the old homepage → confirm it **redirects** to the new domain  
4. After redirect works, Google gradually replaces the old URL in results  

### C) Optional: Domain property

Add a **Domain** property for `subsaverph.com` (DNS TXT verify) so `www` + apex are covered.

---

## Step 3 — Searches you can use

```text
site:subsaverph.com
site:subsaverph.onrender.com
```

- New domain may show **0 results** for a while — normal  
- Old domain may still list until Google updates  

Brand search: `SubSaverPH` or `subsaverph`

---

## Step 4 — Help Google switch faster

| Action | Why |
|--------|-----|
| Share **https://subsaverph.com** only | New links teach Google the preferred URL |
| Keep site awake (keep-alive) | Free Render sleep = crawl failures |
| Don’t buy fake SEO links | Risk of penalty |
| Wait 3–14+ days | Typical recrawl window after redirect |

---

## Step 5 — Favicon next to Google results

Icons live under `/assets/`. After domain change, re-request indexing; favicon can lag behind the URL update.

---

## Checklist

- [ ] `PUBLIC_URL=https://subsaverph.com` on Render  
- [ ] https://subsaverph.onrender.com → 301 → subsaverph.com  
- [ ] GSC property for **https://subsaverph.com**  
- [ ] Sitemap submitted  
- [ ] Homepage **Request indexing**  
- [ ] Share only the custom domain going forward  

Indexing is not instant. Redirect + GSC is the correct path; there is no legitimate “instant replace” switch.
