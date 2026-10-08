@echo off
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required for developer mode.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing required packages...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)

start "Waredo Battle v2 Experiment Server" /min node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5176
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5176/"
exit /b 0
