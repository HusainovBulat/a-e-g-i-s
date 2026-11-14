@echo off
rem ===========================================================================
rem  A.E.G.I.S. one-click start (Windows): just double-click this file.
rem    * Docker Desktop (recommended): backend + console + HTTPS proxy for phones,
rem      certificates are created automatically inside Docker (no mkcert, no admin).
rem    * No Docker: local Python 3.11+ and Node.js 20+ (phones over plain HTTP).
rem  Re-run it on a new network (venue Wi-Fi / hotspot): links and the certificate
rem  are refreshed for the new IPs, phones keep trusting the same CA.
rem ===========================================================================
setlocal EnableExtensions
cd /d "%~dp0"
title A.E.G.I.S. Mission Control

if not exist ".env" if exist ".env.example" copy ".env.example" ".env" >nul

rem Laptop LAN addresses for the phone QR code and certificate (containers cannot see them).
set "AEGIS_PUBLIC_HOSTS="
for /f "usebackq delims=" %%a in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\lan-ips.ps1" 2^>nul`) do set "AEGIS_PUBLIC_HOSTS=%%a"
set "HOSTLIST="
if defined AEGIS_PUBLIC_HOSTS set "HOSTLIST=%AEGIS_PUBLIC_HOSTS:,= %"

rem Phones must get through Windows Firewall (one-time UAC prompt, rule "A.E.G.I.S. demo").
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\firewall.ps1"
if errorlevel 1 (
  echo   ! Windows Firewall rule was not added: phones will not reach this laptop.
  echo   ! Run start.bat again and press "Yes" in the Windows prompt.
)

call :ensure_docker
if errorlevel 1 goto :python

rem ------------------------------------------------------------------ Docker
echo.
echo [1/3] Building images (first run takes 3-5 min, later a few seconds)...
docker compose build
if errorlevel 1 goto :fail

echo.
echo [2/3] Starting the HTTPS proxy for phones...
set "AEGIS_PHONE_HTTPS=1"
docker compose up -d --force-recreate certs proxy
if not errorlevel 1 goto :proxy_ok
set "AEGIS_PHONE_HTTPS=0"
docker compose rm -sf proxy >nul 2>nul
echo.
echo   ! Ports 80/443 are busy (IIS, Skype, another web server?).
echo   ! Continuing without HTTPS: phones use http://^<ip^>:3000/phone, iPhone motion sensors are off.
:proxy_ok

echo.
echo [3/3] Starting backend + console...
docker compose up -d aegis console
if errorlevel 1 goto :fail

call :wait_ready
if errorlevel 1 goto :fail
call :urls
echo   Logs: docker compose logs -f
echo   Stop: double-click stop.bat  (you can close this window, the demo keeps running)
echo.
start "" http://localhost:3000
pause
exit /b 0

rem ------------------------------------------------------- Python fallback
:python
echo.
echo Docker is not available - starting locally with Python + Node.js.
echo (For the full demo incl. iPhone motion sensors install Docker Desktop: https://www.docker.com/products/docker-desktop/)
echo.
set "AEGIS_PHONE_HTTPS="
set "PY="
rem "python" may be the Microsoft Store stub, so actually run each candidate.
for %%c in ("py -3" "python" "python3") do if not defined PY (
  %%~c -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul && set "PY=%%~c"
)
if not defined PY (
  echo Neither Docker nor Python 3.11+ was found.
  echo Install Docker Desktop ^(recommended^) or Python 3.11+ and Node.js 20+, then run start.bat again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required for the web console: https://nodejs.org
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  %PY% -m venv .venv || goto :fail
)
echo Installing Python packages...
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt || goto :fail
if not exist "frontend\node_modules" (
  echo Installing web console packages...
  pushd frontend
  call npm ci --no-audit --no-fund
  if errorlevel 1 (popd & goto :fail)
  popd
)

start "A.E.G.I.S. Backend (close to stop)" /d "%~dp0" cmd /k ".venv\Scripts\python.exe run.py"
start "A.E.G.I.S. Console (close to stop)" /d "%~dp0frontend" cmd /k "npm run dev"

call :wait_ready
if errorlevel 1 goto :fail
call :urls
echo   Stop: double-click stop.bat or close the Backend / Console windows
echo.
start "" http://localhost:3000
pause
exit /b 0

rem ------------------------------------------------------------- helpers
:ensure_docker
where docker >nul 2>nul || exit /b 1
docker info >nul 2>nul && exit /b 0
set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not exist "%DD%" (
  echo Docker is installed but not running.
  exit /b 1
)
echo Docker Desktop is not running - starting it, this can take a minute...
start "" "%DD%"
for /l %%i in (1,1,90) do (
  ping -n 3 127.0.0.1 >nul
  docker info >nul 2>nul && exit /b 0
)
echo Docker Desktop did not start in time.
exit /b 1

:wait_ready
echo.
echo Waiting for the services to come up...
for /l %%i in (1,1,180) do (
  curl -sf http://localhost:8000/health >nul 2>nul && curl -sf http://localhost:3000 >nul 2>nul && exit /b 0
  ping -n 2 127.0.0.1 >nul
)
echo Services did not answer within 3 minutes.
exit /b 1

:urls
echo.
echo  =====================================================================
echo   A.E.G.I.S. Mission Control is running
echo.
echo   Laptop console:  http://localhost:3000
echo   API / Swagger:   http://localhost:8000/docs
echo.
if not defined HOSTLIST (
  echo   Phones: no Wi-Fi / LAN connection found. Connect the laptop and run start.bat again.
  goto :urls_end
)
if "%AEGIS_PHONE_HTTPS%"=="1" goto :urls_https
echo   Phone sensor page ^(same Wi-Fi, or scan the QR code in the console^):
for %%h in (%HOSTLIST%) do echo     http://%%h:3000/phone
goto :urls_end
:urls_https
echo   Phone sensor page ^(same Wi-Fi, or scan the QR code in the console^):
for %%h in (%HOSTLIST%) do echo     https://%%h/phone
echo.
echo   iPhone, one time per phone ^(needed for fall / tilt sensors^):
for %%h in (%HOSTLIST%) do echo     1. Safari: http://%%h/aegis-rootCA.crt  -^>  Allow
echo     2. Settings -^> Profile Downloaded -^> Install
echo     3. Settings -^> General -^> About -^> Certificate Trust Settings -^> enable "AEGIS Demo Local CA"
echo     4. Open the phone page and tap "Enable motion"
echo   Android: open the phone page, tap Advanced -^> Proceed.
:urls_end
echo  =====================================================================
echo.
exit /b 0

:fail
echo.
echo Failed to start. Details: docker compose logs   (or the Backend / Console windows)
pause
exit /b 1
