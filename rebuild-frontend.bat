@echo off
title Rebuilding Frontend...
echo.
echo  Building frontend (wait ~2 minutes)...
echo.

cd /d "e:\Nex Automation\artifacts\nex-automation"
set PORT=8081
set BASE_PATH=/
set API_PORT=8081
set NODE_ENV=production

call npx --no vite build --config vite.config.ts

echo.
if errorlevel 1 (
    echo  BUILD FAILED - check errors above
) else (
    echo  BUILD DONE - run start.bat to launch
)
echo.
pause
