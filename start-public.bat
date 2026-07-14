@echo off
cd /d "%~dp0"
echo.
echo  SubSaverPH — Public URL (Cloudflare Tunnel)
echo  1) Starts the live server on port 8790
echo  2) Opens a public https://....trycloudflare.com link
echo.
echo  Keep this window open while you want the site online.
echo.

start "SubSaverPH Server" cmd /c "python server.py"
timeout /t 3 /nobreak >nul

echo  Creating public tunnel...
echo  Copy the https://....trycloudflare.com URL from the output below.
echo.

cloudflared tunnel --url http://127.0.0.1:8790
