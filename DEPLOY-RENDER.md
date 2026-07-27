# Deploy SubSaverPH on Render (free permanent URL)

You will get a URL like:

**https://subsaverph.onrender.com**

---

## One-time setup (about 10 minutes)

### 1. Install Git (if needed)

Download: https://git-scm.com/download/win  
Install with default options, then **restart the terminal**.

### 2. Create a GitHub account + new repo

1. https://github.com/signup  
2. https://github.com/new  
3. Name: `subsaverph`  
4. Public  
5. **Do not** add README  
6. Create repository  

### 3. Push this project to GitHub

Open **PowerShell** in `C:\Users\ADMIN\subsave` and run (replace `YOUR_GITHUB_USERNAME`):

```powershell
cd C:\Users\ADMIN\subsave
git init
git add .
git commit -m "SubSaverPH live store for Render"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/subsaverph.git
git push -u origin main
```

### 4. Deploy on Render

1. Sign up: https://dashboard.render.com/register  
2. **New +** → **Web Service**  
3. Connect **GitHub** → select `subsaverph`  
4. Settings:

| Field | Value |
|--------|--------|
| Name | `subsaverph` |
| Region | Singapore (or closest) |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn -b 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120 server:app` |
| Instance | **Free** |

5. Environment variables:

| Key | Value |
|-----|--------|
| `SECRET_KEY` | any long random string |
| `FORCE_HTTPS` | `1` |

6. Click **Create Web Service**  
7. Wait for status **Live** (first build ~3–5 minutes)

### 5. Your permanent free URLs

| Page | URL |
|------|-----|
| Store | `https://subsaverph.onrender.com/` |
| Admin | `https://subsaverph.onrender.com/admin` |
| Search | `https://subsaverph.onrender.com/#/search` |

**Admin login:** `admin` / `subsaverph`

---

## Notes

- **Free tier sleeps** after ~15 minutes idle. First visit after sleep can take 30–60 seconds.
- **Stay online:** see **KEEP-ONLINE-24-7.md** (GitHub keep-alive ping, or upgrade to Render Starter ~$7/mo for real 24/7).
- **Admin edits reset on free Render** unless you make storage durable (see below). Redeploys and free-tier sleep wipe local `data/store/` and custom uploads.
- To update the site: change files → `git push` → Render auto-redeploys.

### Keep admin data after redeploy (recommended)

**Option A — GitHub store sync (works on free plan)**

1. GitHub → Settings → Developer settings → Personal access tokens  
2. Create a token with `repo` write access to `subsaverph`  
3. Render → Environment → add:

```env
GITHUB_STORE_TOKEN=ghp_your_token_here
GITHUB_STORE_REPO=kentmirandamain-spec/subsaverph
GITHUB_STORE_BRANCH=main
```

4. Save → Manual Deploy  
5. Admin dashboard should show “Store sync is on”. After you save products/settings/stock, files under `data/store/` are pushed back to GitHub so the next deploy keeps them.

**Option B — Persistent disk (Render Starter+)**

1. Upgrade the web service off Free  
2. Add a disk mounted at `/var/data`  
3. Set:

```env
STORE_DIR=/var/data/store
```

---

## Optional: Blueprint deploy

If the repo is connected, you can also use **New → Blueprint** and select this repo — it reads `render.yaml`.
