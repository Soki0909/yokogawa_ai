@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [ERROR] Setup is not complete.
  echo Run: setup-production.cmd
  pause
  exit /b 1
)
set "HOST=127.0.0.1"
if not defined PORT set "PORT=3000"
set "AIVIS_ENGINE_URL=http://127.0.0.1:10101"
echo Starting Yokogawa AI in SINGLE-PC PRODUCTION MODE...
echo Network binding: 127.0.0.1 only
echo Admin  : http://localhost:%PORT%/admin
echo Display: http://localhost:%PORT%/display
node src/server.js
