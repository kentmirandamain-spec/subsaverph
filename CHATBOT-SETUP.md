# SubSaverPH AI Chatbot (SpaceXAI)

Floating chat on the storefront answers product, CapCut rules, payment, and delivery questions.

## Provider

- **SpaceXAI** via xAI API (`https://api.x.ai/v1`)
- Default model: **`grok-4.5`**
- Key: **`XAI_API_KEY`** (server-side only — never put this in the browser)
- **Store & FAQ only** — products, checkout, delivery, rules, refunds, support. Off-topic questions are refused.
- Tools default **off** (`XAI_CHAT_TOOLS=0`). Optional admin FAQ text: settings key `chatbotFaq`.

## Render / server env (live site https://subsaverph.com)

1. Get a key: https://console.x.ai → API keys  
2. Render Dashboard → your **subsaverph** service → **Environment**  
3. Add:

| Key | Value |
|-----|--------|
| `XAI_API_KEY` | `xai-...` (your secret key) |
| `XAI_MODEL` | `grok-4.5` (optional) |

4. **Save** → service redeploys  
5. Check: open the site → Help chat → header should mention Grok / AI when configured  
6. Or: `GET https://subsaverph.com/api/chat/status` → `"aiConfigured": true`

### Local `.env`

```
XAI_API_KEY=xai-...
XAI_MODEL=grok-4.5
```

Copy from `.env.example`, never commit `.env`.

| Mode | When |
|------|------|
| **AI store FAQ** | `XAI_API_KEY` set — Grok answers shop questions only |
| **Fallback tips** | No key / API down — CapCut, refunds, payments, delivery tips only |

## API

- `GET /api/chat/status` — `{ aiConfigured, provider }`
- `POST /api/chat` — `{ messages: [{ role, content }] }` or `{ message: "..." }`

## Files

- `chatbot.py` — system prompt + xAI call
- `js/chatbot.js` — floating widget
- `server.py` — `/api/chat` routes
