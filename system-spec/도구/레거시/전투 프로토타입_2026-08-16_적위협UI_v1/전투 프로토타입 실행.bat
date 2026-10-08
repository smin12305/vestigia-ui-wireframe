@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\vite\bin\vite.js" (
  echo 필요한 패키지를 처음 한 번 설치합니다.
  call npm install
)

start "Waredo Battle Server" /min node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5174
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5174/"

echo 전투 프로토타입을 열었습니다.
echo 이 창은 닫아도 됩니다.
timeout /t 3 /nobreak >nul
