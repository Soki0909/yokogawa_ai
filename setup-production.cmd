@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Install Node.js 20 or later first.
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 exit /b 1
call npm ci --omit=dev
if errorlevel 1 exit /b 1
node scripts/verify-production-portability.mjs
if errorlevel 1 exit /b 1
echo Setup complete. Run start-yokogawa-ai-single-pc.cmd.
