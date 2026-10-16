@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [ERROR] Setup is not complete.
  echo Run: setup-production.cmd
  pause
  exit /b 1
)
echo Starting Yokogawa AI...
node src/server.js

