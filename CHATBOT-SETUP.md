# SubSaverPH AI Chatbot (SpaceXAI)

Floating chat on the storefront answers product, CapCut rules, payment, and delivery questions.

## Provider

- **SpaceXAI** via xAI API (`https://api.x.ai/v1`)
- Default model: **`grok-4.5`**
- Key: **`XAI_API_KEY`** (server-side only — never put this in the browser)

## Render / server env

```
XAI_API_KEY=xai-...
# optional:
XAI_MODEL=grok-4.5
XAI_BASE_URL=https://api.x.ai/v1
```

Get a key: https://console.x.ai

## Behavior

| Mode | When |
|------|------|
| **Full AI** | `XAI_API_KEY` is set |
| **Fallback tips** | No key / API error — CapCut rules, refunds, delivery FAQ still work |

## API

- `GET /api/chat/status` — `{ aiConfigured, provider }`
- `POST /api/chat` — `{ messages: [{ role, content }] }` or `{ message: "..." }`

## Files

- `chatbot.py` — system prompt + xAI call
- `js/chatbot.js` — floating widget
- `server.py` — `/api/chat` routes
