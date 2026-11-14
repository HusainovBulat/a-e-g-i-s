@echo off
setlocal
cd /d "%~dp0"
title A.E.G.I.S. Base Server

if not exist ".env" copy ".env.example" ".env" >nul

rem Host LAN addresses for the phone QR code (the container cannot see them itself).
set "AEGIS_PUBLIC_HOSTS="
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback' }).IPAddress -join ','"`) do set "AEGIS_PUBLIC_HOSTS=%%a"

where docker >nul 2>nul
if errorlevel 1 goto :python

docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not running. Starting it...
  start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  for /l %%i in (1,1,60) do (
    docker info >nul 2>nul && goto :docker_up
    ping -n 3 127.0.0.1 >nul
  )
  echo Docker did not start. Falling back to local Python.
  goto :python
)
:docker_up
echo Building and starting A.E.G.I.S. (first run takes ~1-2 min)...
docker compose up -d --build || goto :fail
echo Waiting for the server...
for /l %%i in (1,1,90) do (
  curl -s http://localhost:8000/health >nul 2>nul && goto :ready
  ping -n 2 127.0.0.1 >nul
)
goto :fail

:ready
call :urls
echo  Stop with stop.bat   ^|   Logs: docker compose logs -f
start "" http://localhost:8000/docs
pause
exit /b 0

:python
where python >nul 2>nul || (echo Install Docker Desktop or Python 3.11+ first. & pause & exit /b 1)
if not exist ".venv" python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt || goto :fail
call :urls
start "" http://localhost:8000/docs
python run.py
exit /b 0

:urls
echo.
echo  A.E.G.I.S. is running:  http://localhost:8000/docs
echo  Phone / console on the same Wi-Fi:
if defined AEGIS_PUBLIC_HOSTS for %%h in (%AEGIS_PUBLIC_HOSTS:,= %) do echo    http://%%h:8000   ws://%%h:8000/ws/sensors
echo.
exit /b 0

:fail
echo Failed to start. See: docker compose logs
pause
exit /b 1
