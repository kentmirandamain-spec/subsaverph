# SubSaverPH — Live host website

## Start

```powershell
cd C:\Users\ADMIN\subsave
python server.py
```

Or double-click **`start-live.bat`**.

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8790/ | Public storefront |
| http://127.0.0.1:8790/admin | Host editor |

## Host login

- **Username:** `admin`
- **Password:** `subsaverph`

Change the password under **Account** in the admin panel.

## What the host can edit

- **Products** — add / edit / delete deals, prices, badges, hide/show
- **Site content** — hero title, lead text, mission, footer
- **Account** — admin password

Edits save to `data/store/deals.json` and `data/store/settings.json` and appear on the live store immediately after refresh.

## Notes

- Keep `python server.py` running while hosting.
- Default files are under `data/store/`.
- Public site still works offline with static `data/deals.js` fallback if the API is down.
