# SubSaverPH Free Help Chat

Floating **Help** chat for customers. **Free by default** — no paid AI credits required.

## How it works

| Mode | When | Cost |
|------|------|------|
| **Free local assistant** (default) | Always | **$0** |
| Optional Groq cloud | `USE_CLOUD_CHAT=1` + `GROQ_API_KEY` | Free tier |
| Optional Gemini cloud | `USE_CLOUD_CHAT=1` + `GEMINI_API_KEY` | Free tier |
| Optional Grok (xAI) | `USE_CLOUD_CHAT=1` + `XAI_API_KEY` + credits | Paid |

Default answers use your live **catalog + store FAQ** (products, CapCut rules, payment, delivery, refunds).

## Default (recommended) — free, no keys

Nothing required. Deploy and use Help chat.

Optional hard-force free:

```
FREE_CHAT_ONLY=1
```

## Optional free cloud LLMs (smarter wording)

### Groq (free tier)

1. https://console.groq.com → API key  
2. Env:

```
USE_CLOUD_CHAT=1
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

### Google Gemini (free tier)

1. https://aistudio.google.com/apikey  
2. Env:

```
USE_CLOUD_CHAT=1
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```


### xAI Grok (paid credits)

```
USE_CLOUD_CHAT=1
XAI_API_KEY=xai-...
XAI_MODEL=grok-4.5
```

## API

- `GET /api/chat/status` → `{ free, provider, cloudConfigured }`
- `POST /api/chat` → `{ messages: [...] }` or `{ message: "..." }`

## Scope

Store customer questions only (products, checkout, delivery, rules, refunds, support).
