# Make SubSaverPH searchable online (Google)

Your site is public at **https://subsaverph.onrender.com** — but Google will not rank it until it **discovers and indexes** the pages.

---

## Step 1 — Technical SEO (already in the project)

| File / tag | Purpose |
|------------|---------|
| `robots.txt` | Tells bots what to crawl; points to sitemap |
| `sitemap.xml` | List of important URLs for Google |
| Meta title + description | Snippet shown in search results |
| Open Graph tags | Nice previews when shared on social apps |
| `canonical` | Main preferred URL |

After deploy, check:

- https://subsaverph.onrender.com/robots.txt  
- https://subsaverph.onrender.com/sitemap.xml  

---

## Step 2 — Google Search Console (required)

1. Open **https://search.google.com/search-console**  
2. Sign in with Google  
3. Click **Add property**  
4. Choose **URL prefix**  
5. Enter: `https://subsaverph.onrender.com`  
6. Verify ownership — easiest: **HTML tag**  
   - Copy the meta tag Google shows  
   - Add it to `index.html` `<head>` (or ask me to add it)  
   - Redeploy, then click **Verify**  
7. Left menu → **Sitemaps**  
8. Submit: `sitemap.xml`  
9. Left menu → **URL inspection**  
10. Paste `https://subsaverph.onrender.com/` → **Request indexing**

Indexing can take **days to a few weeks**.

---

## Step 3 — Bing (optional but free)

1. **https://www.bing.com/webmasters**  
2. Add site → same URL  
3. Submit the same sitemap  

---

## Step 4 — Help Google find you (content + links)

Search engines rank sites people use and link to.

| Action | Example |
|--------|---------|
| Share the link | Facebook, TikTok, X, groups, bio links |
| Use clear words on the site | “discounted SuperGrok Philippines”, “GCash” |
| Keep the site online | Free keep-alive or paid Render (see KEEP-ONLINE-24-7.md) |
| Custom domain later | e.g. `subsaverph.com` looks more trusted |
| Don’t buy fake “instant rank” spam | Can get the site banned |

Search for your brand:

```text
site:subsaverph.onrender.com
```

When Google has indexed you, that shows results.

---

## Step 5 — What you can expect

| Search | Likelihood |
|--------|------------|
| `SubSaverPH` (brand) | Good after indexing + a few links |
| `cheap Netflix Philippines` | Hard — big brands dominate; may take time |
| Social share clicks | Immediate traffic without Google |

`.onrender.com` free URLs often rank **weaker** than a real domain. A custom domain + Search Console is the upgrade path.

---

## Limits of this site type

SubSaverPH uses **hash routes** (`#/deals`). Google mainly indexes the **homepage shell**.  
That’s fine for brand search; for richer SEO later, switch to path routes (`/deals`) or server-rendered pages.

---

## Checklist

- [x] Site Live on Render  
- [x] `/robots.txt` and `/sitemap.xml` open in browser  
- [x] On-page SEO (title, description, JSON-LD, crawlable homepage text)  
- [ ] Google Search Console property verified  
- [ ] Sitemap submitted (`sitemap.xml`)  
- [ ] Homepage “Request indexing”  
- [ ] Share link on socials (helps rankings later)  
- [ ] (Optional) Custom domain  

---

## Legal / policy note

If you sell third-party brand subscriptions, Google Ads and some directories may restrict ads. Organic search still works, but use accurate, honest product copy.
