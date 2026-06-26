@echo off
title Nex AI Clipping
cd /d "%~dp0"
echo.
echo  ==========================================
echo   Nex AI Clipping - Starting...
echo  ==========================================
echo.

if not exist "venv\Scripts\python.exe" (
    echo  [ERROR] Virtual environment not found!
    echo  Please run: python -m venv venv
    echo  Then run:   venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

venv\Scripts\python.exe main.py

echo.
echo  ==========================================
echo   Done! Press any key to exit...
echo  ==========================================
pause
