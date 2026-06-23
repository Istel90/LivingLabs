@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"
echo Starting LivingLabs local platform...
call npm.cmd run platform:start:dev
echo.
echo Open these URLs after startup:
echo   Portal:              http://127.0.0.1:5173/tools#adaptation-support-tools
echo   Lead department:     http://127.0.0.1:5173/lead-department-tool
echo   Priority heatwave:   http://127.0.0.1:5175/priority-management-area/heatwave?regionCode=41110
echo.
echo Status check:
echo   npm run platform:status
echo.
pause
