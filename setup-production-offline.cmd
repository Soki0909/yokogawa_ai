@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-production-offline.ps1"
if errorlevel 1 exit /b 1
