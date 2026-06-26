@echo off
:: Run as Administrator
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting admin rights...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Registering Nex Automation Task Scheduler tasks...

:: Remove old task if exists
schtasks /delete /tn "NexAutomationServer" /f >nul 2>&1
schtasks /delete /tn "NexAutomationServerRepeat" /f >nul 2>&1

:: Task 1: On user logon (covers: laptop on + pin code login)
schtasks /create ^
  /tn "NexAutomationServer" ^
  /tr "cmd.exe /c \"e:\Nex Automation\auto-start-guard.bat\"" ^
  /sc onlogon ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /delay 0000:10 ^
  /f

:: Task 2: Repeat every 5 minutes all day (covers: sleep wake, crash recovery, net reconnect)
schtasks /create ^
  /tn "NexAutomationServerRepeat" ^
  /tr "cmd.exe /c \"e:\Nex Automation\auto-start-guard.bat\"" ^
  /sc minute ^
  /mo 5 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if errorlevel 1 (
    echo.
    echo ERROR: Task register nahi ho saka.
    echo Manually karo: Task Scheduler > Create Basic Task
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   SUCCESS! Auto-start fully configured!
echo ==========================================
echo.
echo Server ab start hoga jab:
echo   * Laptop on ho ^(power wapas aaye^)
echo   * Pin/Password dalo lock screen pe
echo   * Sleep se uthne ke baad
echo   * Har 5 minute mein check hoga
echo.
pause
