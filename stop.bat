@echo off
cd /d "%~dp0"
echo Stopping A.E.G.I.S. containers and local servers...

docker compose down 2>nul

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 3000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo All A.E.G.I.S. processes stopped.
pause
