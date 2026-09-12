@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [ERROR] Setup is not complete.
  echo Run: npm install
  pause
  exit /b 1
)
echo Starting Yokogawa AI...
npm start

