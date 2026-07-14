# How instant delivery works (SubSaverPH)

## The flow

```
Customer pays  →  System confirms payment  →  Assigns code from stock  →  Shows code instantly
```

You already have steps 2–4 built in:

1. **Stock codes** in Admin → **Codes / Stock**
2. Customer checks out
3. Server takes 1 unused code per item
4. Success page shows the real codes immediately

---

## Host setup (required)

### 1. Start the live server

```
C:\Users\ADMIN\subsave\start-live.bat
```

### 2. Open admin

http://127.0.0.1:8790/admin  
Login: `admin` / `subsaverph`

### 3. Add products (if needed)

**Products** → **+ Add product**

### 4. Load codes (most important)

**Codes / Stock** → **Add codes** on a product → paste:

```
CODE-AAAA-1111
CODE-BBBB-2222
https://redeem.link/xyz
```

One code/link per line. Save.

### 5. Test buy

1. Shop → add product → Checkout  
2. Enter email → confirm  
3. Success page shows your stock code instantly  
4. Admin → **Orders** shows the sale  

---

## Payment modes

| Mode | What happens | Real money? |
|------|----------------|-------------|
| **instant_demo** (default now) | Confirms order + delivers code immediately | No card charge |
| **Real gateway** (PayMongo / Stripe / Maya) | Money collected first, then webhook delivers code | Yes |

### Current mode

`PAYMENT_MODE=instant_demo`  
→ Good for testing instant delivery.  
→ Not real bank/GCash money yet.

### To take real payments later (Philippines)

Popular options:

1. **PayMongo** — GCash, Maya, cards (PH-friendly)  
2. **Xendit** — similar  
3. **Stripe** — cards (availability depends on country)

Typical real setup:

1. Create PayMongo/Stripe account  
2. Put API keys in environment variables  
3. Checkout redirects to payment page  
4. Webhook `payment.paid` → call the same fulfill logic (reserve code + save order)  
5. Redirect customer to success page with codes  

I can wire PayMongo/Stripe when you have API keys.

---

## What you can sell with instant codes

Legal examples:

- Gift cards / redeem codes **you bought and own**
- Software licenses you are allowed to resell
- Access codes for products you control

**Caution:** Selling shared Netflix / account passwords often violates terms of service and can be illegal. Only sell what you have rights to deliver.

---

## Stock rules

- 1 purchase qty = 1 code from inventory  
- Sold codes cannot be reused  
- If stock = 0, checkout shows **Out of stock**  
- Always keep extra codes loaded for popular products  

---

## Admin checklist before going live

- [ ] Products have correct prices  
- [ ] Each product has enough **available** codes  
- [ ] Test a full checkout yourself  
- [ ] Change admin password  
- [ ] (Later) Connect real payment gateway  

---

## Customer experience

1. Add SuperGrok / Canva / etc. to cart  
2. Checkout → email  
3. Pay / confirm  
4. **Instant codes on screen** (copy + screenshot)  
5. Optional later: auto-email the same codes  
