@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
  echo [ERROR] Setup is not complete.
  echo Run: setup-production-offline.cmd
  pause
  exit /b 1
)
echo Starting Yokogawa AI...
set "YOKOGAWA_NODE=node"
if exist "%~dp0.runtime\node-v22.15.0-win-x64\node.exe" set "YOKOGAWA_NODE=%~dp0.runtime\node-v22.15.0-win-x64\node.exe"
"%YOKOGAWA_NODE%" src/server.js

