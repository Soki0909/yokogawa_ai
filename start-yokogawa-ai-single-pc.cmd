@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [ERROR] Setup is not complete.
  echo Run: npm install
  pause
  exit /b 1
)
set "HOST=127.0.0.1"
echo Starting Yokogawa AI in SINGLE-PC PRODUCTION MODE...
echo Network binding: 127.0.0.1 only
echo Admin  : http://localhost:3000/admin
echo Display: http://localhost:3000/display
npm start
