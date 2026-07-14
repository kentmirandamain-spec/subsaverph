@echo off
cd /d "%~dp0"
echo.
echo  SubSaverPH LIVE SERVER
echo  Store : http://127.0.0.1:8790/
echo  Admin : http://127.0.0.1:8790/admin
echo  Login : admin / subsaverph
echo.
start "" "http://127.0.0.1:8790/admin"
python server.py
