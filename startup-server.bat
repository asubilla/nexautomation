@echo off
:: ============================================================
:: Nex Automation - Windows Startup Script
:: Yeh script Windows Startup folder mein add karo.
:: Automatically background mein server start karta hai.
:: ============================================================
:: 
:: Setup karne ke liye:
::   1. Win+R -> shell:startup -> Enter
::   2. Is file ka shortcut wahan paste karo
::      ya "install-startup.bat" run karo
:: ============================================================

:: 5 second wait karo taake network ready ho
ping 127.0.0.1 -n 6 >nul 2>&1

:: Guard script call karo (duplicate check + start)
call "e:\Nex Automation\auto-start-guard.bat"
