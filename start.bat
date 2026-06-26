@echo off
title Nex Automation - Launcher

echo.
echo  ================================
echo   NEX AUTOMATION - Starting...
echo  ================================
echo.

:: Kill existing process on port 80
echo Clearing port 80...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R "\<80\>" ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak > nul

:: Always rebuild frontend so VITE_API_BASE_URL bakes in correctly
echo Building frontend (this ensures TikTok OAuth URL is set correctly)...
cd /d "e:\Nex Automation\artifacts\nex-automation"
set PORT=80
set BASE_PATH=/
set API_PORT=80
set NODE_ENV=production
set VITE_API_BASE_URL=http://localhost:80
call npx --no vite build --config vite.config.ts

:: Start server in a new window that stays open
echo Starting server...
start "Nex Automation Server (keep open)" cmd /k "title Nex Automation Server && cd /d "e:\Nex Automation\artifacts\api-server" && echo. && echo  Server running at http://nexautomation.pages.dev && echo  Do NOT close this window! && echo. && node --env-file=.env migrate.mjs && node --env-file=.env --enable-source-maps ./dist/index.mjs"


:: Wait for server
timeout /t 5 /nobreak > nul

:: Open browser
start http://nexautomation.pages.dev

echo.
echo  ================================
echo   Server started!
echo   URL: http://nexautomation.pages.dev
echo   
echo   Server window ko band mat karo.
echo   Yeh launcher window band ho sakti hai.
echo  ================================
echo.
timeout /t 5 /nobreak > nul
