# SubSaverPH AI Chatbot (SpaceXAI)

Floating chat on the storefront answers product, CapCut rules, payment, and delivery questions.

## Provider

- **SpaceXAI** via xAI API (`https://api.x.ai/v1`)
- Default model: **`grok-4.5`**
- Key: **`XAI_API_KEY`** (server-side only — never put this in the browser)
- **Store & FAQ only** — products, checkout, delivery, rules, refunds, support. Off-topic questions are refused.
- Tools default **off** (`XAI_CHAT_TOOLS=0`). Optional admin FAQ text: settings key `chatbotFaq`.

## Render / server env

```
XAI_API_KEY=xai-...
# optional:
XAI_MODEL=grok-4.5
XAI_BASE_URL=https://api.x.ai/v1
XAI_CHAT_TOOLS=0
```

Get a key: https://console.x.ai — improves store/FAQ answers (still not a general chatbot).

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
