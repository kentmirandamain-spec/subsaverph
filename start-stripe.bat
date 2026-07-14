@echo off
cd /d "%~dp0"
echo.
echo  SubSaverPH + Stripe
echo.
echo  1. Create .env from .env.example and paste your Stripe keys
echo  2. Or set keys in this window before starting
echo.
if not exist ".env" (
  echo  No .env file found. Copy .env.example to .env and add:
  echo    STRIPE_SECRET_KEY=sk_test_...
  echo    STRIPE_PUBLISHABLE_KEY=pk_test_...
  echo    PAYMENT_MODE=stripe
  echo    PUBLIC_URL=http://127.0.0.1:8790
  echo.
)
set PAYMENT_MODE=stripe
if "%PUBLIC_URL%"=="" set PUBLIC_URL=http://127.0.0.1:8790
echo  Starting server...
echo  Store : http://127.0.0.1:8790/
echo  Admin : http://127.0.0.1:8790/admin
echo.
start "" "http://127.0.0.1:8790/"
python server.py
