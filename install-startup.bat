@echo off
:: ============================================================
:: Nex Automation - Auto-Start Installer
:: Ek baar chalao — server hamesha Windows start pe chalne laga
:: ============================================================

setlocal

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_PATH=e:\Nex Automation\startup-server.bat"
set "SHORTCUT_NAME=Nex Automation Server.lnk"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\%SHORTCUT_NAME%"

echo.
echo  =========================================
echo   NEX AUTOMATION - Auto-Start Installer
echo  =========================================
echo.

:: Check if already installed
if exist "%SHORTCUT_PATH%" (
    echo  [OK] Auto-start already installed!
    echo  Server will start automatically on Windows login.
    echo.
    goto :done
)

:: Create shortcut via PowerShell
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$sc = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
    "$sc.TargetPath = '%SCRIPT_PATH%'; " ^
    "$sc.WorkingDirectory = 'e:\Nex Automation'; " ^
    "$sc.WindowStyle = 7; " ^
    "$sc.Description = 'Nex Automation Local API Server'; " ^
    "$sc.Save()"

if exist "%SHORTCUT_PATH%" (
    echo  [OK] Auto-start installed successfully!
    echo.
    echo  Ab jab bhi aap Windows pe login karoge,
    echo  server automatically background mein start ho jaye ga.
    echo.
    echo  Aur jab bhi nexautomation.pages.dev khulega
    echo  server already ready hoga!
    echo.
) else (
    echo  [ERROR] Shortcut create nahi ho saka.
    echo  Manually karo: startup-server.bat ko yahan copy karo:
    echo  %STARTUP_FOLDER%
)

:done
echo.
echo  Test ke liye "auto-start-guard.bat" chalao.
echo.
pause
endlocal
