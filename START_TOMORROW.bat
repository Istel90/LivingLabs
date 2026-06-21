@echo off
cd /d E:\40_LocalPython\LivingLabs
echo Starting LivingLabs local platform...
call npm run platform:start
echo.
echo Open these URLs after startup:
echo   Portal:              http://127.0.0.1:4173/tools#adaptation-support-tools
echo   Lead department:     http://127.0.0.1:4173/lead-department-tool
echo   Priority heatwave:   http://127.0.0.1:4175/priority-management-area/heatwave?regionCode=41110
echo.
echo Status check:
echo   npm run platform:status
echo.
pause
