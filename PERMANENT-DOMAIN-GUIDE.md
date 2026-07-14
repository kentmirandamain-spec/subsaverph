# Permanent custom domain for SubSaverPH

A **permanent custom domain** (example: `https://subsaverph.com`) needs two things:

1. **A domain you own** (bought once, ~$8–15/year)
2. **Cloudflare free plan** + named tunnel (already installed on this PC)

---

## Option A — Your own domain (recommended)

### 1. Buy a domain

Good registrars:

- [Cloudflare Registrar](https://dash.cloudflare.com/) (often cheapest, easy DNS)
- [Namecheap](https://www.namecheap.com/)
- [Porkbun](https://porkbun.com/)

Suggested names:

- `subsaverph.com`
- `subsaverph.shop`
- `subsaver.ph` (if available)

### 2. Add domain to Cloudflare

1. Create free account: https://dash.cloudflare.com/sign-up  
2. **Add a site** → enter your domain  
3. Change nameservers at your registrar to Cloudflare’s  
4. Wait until status is **Active**

### 3. Run the setup script (on this PC)

```powershell
cd C:\Users\ADMIN\subsave
powershell -ExecutionPolicy Bypass -File .\setup-permanent-domain.ps1
```

The script will:

1. Open Cloudflare login in your browser  
2. Ask for your domain (e.g. `subsaverph.com`)  
3. Create a **named tunnel** (`subsaverph`)  
4. Create DNS records for `@` and `www`  
5. Write `start-permanent.bat`

### 4. Go live every time

Double-click:

```
C:\Users\ADMIN\subsave\start-permanent.bat
```

That starts:

- Flask site on `http://127.0.0.1:8790`
- Cloudflare tunnel → **https://yourdomain.com**

### Your permanent links (after setup)

| Page | URL |
|------|-----|
| Store | `https://YOUR_DOMAIN/` |
| Admin | `https://YOUR_DOMAIN/admin` |
| Search | `https://YOUR_DOMAIN/#/search` |

Admin login: `admin` / `subsaverph`

---

## Option B — Free permanent-ish URL (no domain purchase)

Deploy to **Render** free tier → something like:

`https://subsaverph.onrender.com`

1. Push `C:\Users\ADMIN\subsave` to GitHub  
2. Go to https://dashboard.render.com → **New Blueprint**  
3. Use `deploy/render.yaml`  
4. After deploy, open the Render URL  

Note: free tier may sleep after idle; first load can be slow.

Files ready:

- `deploy/render.yaml`
- `deploy/Dockerfile`
- `requirements.txt` (includes gunicorn)

---

## Option C — Temporary public URL (already used)

```
cloudflared tunnel --url http://127.0.0.1:8790
```

Gives a random `https://….trycloudflare.com` that **changes** each restart.

---

## Checklist for permanent custom domain

- [ ] Domain purchased  
- [ ] Domain added to Cloudflare (nameservers active)  
- [ ] Ran `setup-permanent-domain.ps1`  
- [ ] `start-permanent.bat` running  
- [ ] Visit `https://yourdomain.com`  

---

## Need help?

Tell me your domain (e.g. `subsaverph.com`) after you buy it and add it to Cloudflare — then we can finish DNS/tunnel wiring together.
