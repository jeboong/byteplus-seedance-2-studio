@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title BytePlus Seedance 2.0 Studio

cd /d "%~dp0"

echo ========================================
echo  BytePlus Seedance 2.0 Studio
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Install dependencies if missing
if not exist "node_modules" (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM Free port 3030 if occupied
echo [INFO] Checking port 3030...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3030 " ^| findstr "LISTENING"') do (
    echo [INFO] Port 3030 is in use by PID %%a. Terminating...
    taskkill /pid %%a /f >nul 2>nul
)

REM Open browser after short delay
echo [INFO] Starting dev server on port 3030...
start "" /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3030"

REM Run dev server (foreground - close window to stop)
call npx next dev --port 3030

pause
