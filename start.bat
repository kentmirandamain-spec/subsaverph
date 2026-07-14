@echo off
cd /d "%~dp0"
echo.
echo  SubSaverPH
echo  http://localhost:8790
echo.
start "" "http://localhost:8790"
python -m http.server 8790
