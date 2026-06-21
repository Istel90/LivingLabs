@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo [LivingLabs] Stopping local platform servers...
echo.

call npm.cmd run platform:stop

taskkill /FI "WINDOWTITLE eq LivingLabs Portal 4173*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LivingLabs Survey 4174*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LivingLabs Internal Tools 4175*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LivingLabs VWorld Proxy 4176*" /T /F >nul 2>&1

echo.
echo Stop request completed.
echo.
pause
