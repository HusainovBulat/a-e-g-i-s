@echo off
cd /d "%~dp0"
echo Stopping A.E.G.I.S. ...

rem Docker stack (the certificate volumes are kept, so phones stay trusted)
where docker >nul 2>nul && docker compose down 2>nul

rem Local Python / Node.js fallback
powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 8000, 3000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } | Where-Object { $_.ProcessName -match '^(python|node)' } | Stop-Process -Force -ErrorAction SilentlyContinue"

echo All A.E.G.I.S. services stopped.
pause
