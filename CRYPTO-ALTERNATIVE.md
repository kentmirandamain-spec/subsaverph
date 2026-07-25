# Alternative crypto payment (direct wallet)

SubSaverPH supports **two** crypto options:

| Method | How it works | Setup |
|--------|----------------|--------|
| **Crypto (NOWPayments)** | Auto redirect · API key on Render | `CRYPTO-SETUP.md` |
| **Crypto wallet (manual)** | Customer sends to **your** address · pastes TXID · you Confirm | This file |

## Enable direct wallet

1. **Admin → Site content → 4c · Crypto**
2. Check **Enable crypto wallet at checkout**
3. Set:
   - **Network** e.g. `USDT (TRC20)`
   - **Wallet address** (your real receiving address)
   - Optional QR URL / note
4. **Save all site content**

Checkout will show **Crypto wallet** (or your custom label).

## Customer flow

1. Checkout → **Crypto wallet**
2. Sees amount (PHP), network, wallet address (copy)
3. Sends crypto on the **correct network**
4. Submits **TXID**
5. You get email alert (if owner inbox configured)
6. **Admin → Orders → Confirm & deliver** after you see the TX on-chain

## Notes

- Wrong network = funds can be lost — network text is shown clearly.
- PHP amount is displayed; customer converts using their exchange rate.
- Can run **together** with NOWPayments (two different checkout methods).
- Env overrides: `MANUAL_CRYPTO_ADDRESS`, `MANUAL_CRYPTO_NETWORK`, `MANUAL_CRYPTO_ENABLED`, etc.
