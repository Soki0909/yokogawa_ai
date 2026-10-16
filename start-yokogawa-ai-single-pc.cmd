@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [ERROR] Setup is not complete.
  echo Run: setup-production-offline.cmd
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
set "YOKOGAWA_NODE=node"
if exist "%~dp0.runtime\node-v22.15.0-win-x64\node.exe" set "YOKOGAWA_NODE=%~dp0.runtime\node-v22.15.0-win-x64\node.exe"
"%YOKOGAWA_NODE%" src/server.js
