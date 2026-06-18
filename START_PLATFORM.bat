@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo [LivingLabs] Starting local platform servers...
echo.

if not exist "%ROOT%dist\index.html" goto build
if not exist "%ROOT%Survey platform for collaboration\dist\index.html" goto build
if not exist "%ROOT%riskmap-core-main\.svelte-kit\output\server\index.js" goto build_done
goto start_servers

:build
echo Build output is missing. Running npm run build:all first.
call npm.cmd run build:all
if errorlevel 1 (
  echo.
  echo Build failed. Please check the messages above.
  pause
  exit /b 1
)

:build_done
if not exist "%ROOT%riskmap-core-main\.svelte-kit\output\server\index.js" (
  echo Build output for internal tools is missing. Running npm run build:all first.
  call npm.cmd run build:all
  if errorlevel 1 (
    echo.
    echo Build failed. Please check the messages above.
    pause
    exit /b 1
  )
)

:start_servers
start "LivingLabs Portal 4173" /D "%ROOT%" cmd /k npm.cmd run preview:local
start "LivingLabs Survey 4174" /D "%ROOT%Survey platform for collaboration" cmd /k npm.cmd run preview:local
start "LivingLabs Internal Tools 4175" /D "%ROOT%riskmap-core-main" cmd /k npm.cmd run preview:local

echo Portal:         http://127.0.0.1:4173/
echo Survey:         http://127.0.0.1:4174/
echo Internal tools: http://127.0.0.1:4175/
echo.
echo Keep the three server windows open while using the platform.
echo Use STOP_PLATFORM.bat to stop them.
echo.
pause
