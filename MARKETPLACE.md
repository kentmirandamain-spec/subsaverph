# SubSaverPH Marketplace (sellers)

## How it works

1. Sellers register at **`/seller`**
2. You **approve** them in Admin → **Sellers**
3. Sellers create products (status **pending**)
4. You approve listings in Admin → **Listing queue** → **Approve live**
5. Sellers add stock (codes / `user:pass`)
6. Buyers pay the platform (same checkout as before)
7. Codes deliver instantly; seller net is **held** (default fee **20%**)
8. Admin → **Payouts** → **Release** → send GCash offline → **Mark paid**

## Your cut

- Set **Platform fee %** under Admin → Site content → Marketplace
- Example: sale ₱399, fee 20% → you **₱79.80**, seller **₱319.20**

## Refunds

1. Refund the buyer in Stripe / PayMongo / Xendit / PayPal
2. In Admin → Payouts, **Cancel** the matching held/released row so you do not pay the seller

## URLs

| Who | URL |
|-----|-----|
| Store | `/` |
| Admin | `/admin` |
| Seller portal | `/seller` |
