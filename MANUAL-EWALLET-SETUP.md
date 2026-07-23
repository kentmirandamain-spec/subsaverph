# Manual GCash / Maya payment (QR code)

Accept e-wallet payments **without PayMongo or Xendit**.  
Customers **scan your QR**, pay, submit a reference → you confirm in Admin → codes unlock.

## Customer flow

1. Checkout → **GCash (QR)** or **Maya (QR)**  
2. See amount + your QR image + Order ID  
3. Scan with GCash/Maya and pay the **exact** amount  
4. Paste the transfer reference on the success page  
5. After you confirm, they refresh and get login codes  

## Setup (Admin — recommended)

1. Open **http://127.0.0.1:8790/admin** (or your live `/admin`)  
2. Log in  
3. **Site content → 4b · Manual GCash / Maya (QR pay)**  
4. For each wallet you accept:
   - Optional account name  
   - **Upload QR** image (PNG/JPG/WEBP), **or** paste an image URL  
5. Keep **Enable QR e-wallet** checked  
6. **Save** site content  

Checkout only shows wallets that have a QR image.

### Getting a QR image

- **GCash**: app → Profile / Receive money → save or screenshot QR  
- **Maya**: app → Receive / QR → save image  
- Prefer a clear square crop (no glare)

## Setup (optional: environment)

```env
MANUAL_EWALLET_ENABLED=1
MANUAL_GCASH_QR_URL=/assets/qr/gcash-qr.png
MANUAL_GCASH_NAME=Your Name
MANUAL_MAYA_QR_URL=/assets/qr/maya-qr.png
MANUAL_MAYA_NAME=Your Name
MANUAL_EWALLET_NOTE=Scan the QR. Pay exact amount. Put Order ID in the message.
```

Env values override Admin settings when set.  
You can also drop files into `assets/qr/` and set the URL to `/assets/qr/filename.png`.

## Confirm orders

1. **Admin → Orders / Sales**  
2. Status `awaiting_payment` or `payment_submitted`  
3. Match the customer’s reference to your GCash/Maya history  
4. **Confirm payment** → codes reserved + emailed  

Pending orders do **not** count in P&L until status is `paid`.

## Notes

- Codes are reserved only after you confirm  
- Amount is always in **PHP**  
- Can run alongside gateway methods if those are also configured  
- Phone numbers are no longer required — QR only  
