@echo off
setlocal
cd /d "%~dp0"
title A.E.G.I.S. Mission Control

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
echo Building and starting A.E.G.I.S. backend + console (first run takes ~3-5 min)...
docker compose up -d --build || goto :fail
echo Waiting for the services...
for /l %%i in (1,1,120) do (
  curl -sf http://localhost:3000 >nul 2>nul && curl -sf http://localhost:8000/health >nul 2>nul && goto :ready
  ping -n 2 127.0.0.1 >nul
)
goto :fail

:ready
call :urls
echo  Stop with stop.bat   ^|   Logs: docker compose logs -f
start "" http://localhost:3000
pause
exit /b 0

:python
where python >nul 2>nul || (echo Install Docker Desktop or Python 3.11+ first. & pause & exit /b 1)
if not exist ".venv" python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt || goto :fail
where npm >nul 2>nul || (echo Install Node.js 20+ for the web console. & pause & exit /b 1)
if not exist "frontend
ode_modules" (
  echo Installing web console dependencies...
  pushd frontend
  call npm ci --no-audit --no-fund || (popd & goto :fail)
  popd
)
call :urls

echo Starting A.E.G.I.S. Backend (port 8000)...
start "A.E.G.I.S. Backend (FastAPI)" cmd /c "cd /d "%~dp0" && .venv\Scripts\python.exe run.py"

echo Starting A.E.G.I.S. Web Console (port 3000)...
start "A.E.G.I.S. Frontend (Next.js)" cmd /c "cd /d "%~dp0\frontend" && npm run dev"

echo Waiting for services to initialize...
ping -n 4 127.0.0.1 >nul

start "" http://localhost:3000
echo.
echo ========================================================
echo  A.E.G.I.S. Mission Control is running!
echo  Web Console: http://localhost:3000
echo  FastAPI Docs: http://localhost:8000/docs
echo  To stop all services: run stop.bat
echo ========================================================
pause
exit /b 0

:urls
echo.
echo  Web console:   http://localhost:3000
echo  API / Swagger: http://localhost:8000/docs
echo  Phone sensor simulator (same Wi-Fi):
if defined AEGIS_PUBLIC_HOSTS for %%h in (%AEGIS_PUBLIC_HOSTS:,= %) do echo    http://%%h:3000/phone
echo.
exit /b 0

:fail
echo Failed to start. See: docker compose logs
pause
exit /b 1
