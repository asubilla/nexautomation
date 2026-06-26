@echo off
:: ============================================================
:: Nex Automation - Background Watchdog
:: Yeh script server process ko monitor karta hai
:: Agar server band ho jaye to restart karta hai
:: Sleep/wake aur net reconnect ke baad bhi kaam karta hai
:: ============================================================
:: Yeh script khud hi loop mein chalta hai — band mat karna!

:loop
:: Guard script chalao (port check + start if needed)
call "e:\Nex Automation\auto-start-guard.bat"

:: 5 minute wait karo (300 seconds)
timeout /t 300 /nobreak >nul 2>&1

goto :loop
