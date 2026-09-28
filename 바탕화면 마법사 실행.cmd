@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  call npm ci
  if errorlevel 1 goto failed
  node node_modules\electron\install.js
  if errorlevel 1 goto failed
)
call npm run build:desktop
if errorlevel 1 goto failed
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0desktop\main.mjs"
exit /b 0
:failed
echo Could not start Remi Magic. Install Node.js 22.12 or later, then retry.
pause
exit /b 1
