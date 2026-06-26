@echo off
:: ============================================================
:: Nex Automation - Auto-Start Guard
:: Yeh script ensure karta hai k sirf ek hi server chal raha ho
:: Agar server pehle se chal raha hai to kuch nahi karta.
:: ============================================================

setlocal

set "LOCK_FILE=%TEMP%\nex_automation.lock"
set "SERVER_DIR=e:\Nex Automation\artifacts\api-server"
set "PID_FILE=%TEMP%\nex_automation_pid.txt"

:: Check karo k koi pehle se chal raha hai (PID file check)
if exist "%PID_FILE%" (
    set /p SAVED_PID=<"%PID_FILE%"
    :: Check k woh PID abhi bhi alive hai
    tasklist /FI "PID eq %SAVED_PID%" 2>nul | findstr /I "node.exe" >nul 2>&1
    if not errorlevel 1 (
        :: Server pehle se chal raha hai — kuch mat karo
        exit /b 0
    )
    :: PID stale hai — delete karo
    del "%PID_FILE%" >nul 2>&1
)

:: Port 80 pe check karo (listener hai ya nahi)
netstat -ano 2>nul | findstr /R "\<80\>" | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
    :: Koi pehle se port 80 use kar raha hai — server already running
    exit /b 0
)

:: Server chal nahi raha — start karo
echo Starting Nex Automation server...

:: Migrate karo pehle (silent)
pushd "%SERVER_DIR%"
node --env-file=.env migrate.mjs >nul 2>&1

:: Server background mein start karo, PID save karo
start /B "" node --env-file=.env --enable-source-maps ./dist/index.mjs >"%TEMP%\nex_server.log" 2>&1

:: PID dhundo aur save karo
timeout /t 2 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr /R "\<80\>" ^| findstr LISTENING') do (
    echo %%a > "%PID_FILE%"
    goto :done
)
:done

endlocal
exit /b 0
