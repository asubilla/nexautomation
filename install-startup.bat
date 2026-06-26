@echo off
:: ============================================================
:: Nex Automation - Complete Auto-Start Setup
:: Ek baar chalao — hamesha ke liye set ho jata hai
:: Admin ki zaroorat NAHI hai
:: ============================================================

echo.
echo  =========================================
echo   NEX AUTOMATION - Auto-Start Setup
echo  =========================================
echo.

:: 1. Registry Run key set karo (watchdog - har login pe)
reg add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" ^
  /v "NexAutomationServer" ^
  /t REG_SZ ^
  /d "cmd.exe /c start \"\" /min \"e:\\Nex Automation\\watchdog.bat\"" ^
  /f >nul 2>&1

echo [OK] Registry Run key: login pe auto-start

:: 2. Startup folder shortcut (backup method)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup\Nex Automation Server.lnk')); $sc.TargetPath = 'e:\Nex Automation\startup-server.bat'; $sc.WorkingDirectory = 'e:\Nex Automation'; $sc.WindowStyle = 7; $sc.Description = 'Nex Automation Local API Server'; $sc.Save()" >nul 2>&1

echo [OK] Startup folder shortcut: backup auto-start

:: 3. Watchdog abhi bhi start karo (current session)
start "" /min "e:\Nex Automation\watchdog.bat"

echo [OK] Watchdog started: background mein chal raha hai

echo.
echo  =========================================
echo   SETUP COMPLETE!
echo  =========================================
echo.
echo  Ab yeh scenarios cover ho gaye hain:
echo.
echo  * Light gayi laptop off  -^> wapas on karo, login karo
echo    Server auto-start hoga (Registry + Startup folder)
echo.
echo  * Pin/Lock screen         -^> Pin dalo
echo    Server auto-start hoga (Registry Run)
echo.
echo  * Sleep mode se uthna     -^> Server waise hi chal raha hoga
echo    Agar crash tha -^> Watchdog 5 min mein restart karega
echo.
echo  * Net cut/reconnect       -^> Server local pe chal raha hoga
echo    Net aane pe automatically kaam karega
echo.
echo  * Aap khud off karna chahein  -^> Laptop shut down karo
echo    Agla on hone pe phir start hoga
echo.
timeout /t 5 /nobreak >nul
