@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   ETL Test Case Generator
echo ============================================
echo.

where node >nul 2>nul
if !errorlevel! neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo [ERROR] Node.js was not found on this system.
        echo Please install Node.js LTS from https://nodejs.org/ then run this file again.
        echo.
        pause
        exit /b 1
    )
)

if not exist "node_modules" (
    echo Dependencies not found next to this file - installing now, this may take a few minutes...
    echo ^(This requires an internet connection. If you copied the node_modules folder along
    echo  with the project, this step will be skipped entirely.^)
    echo.
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] npm install failed. See the messages above.
        pause
        exit /b 1
    )
)

echo Starting the app...
echo Once you see a "Local:" address below, open it in your web browser.
echo Keep this window open while you use the app. Press Ctrl+C to stop the server.
echo.

where npm >nul 2>nul
if !errorlevel! neq 0 (
    echo npm was not found or is blocked on this system - starting Vite directly via node instead.
    echo.
    node node_modules\vite\bin\vite.js
) else (
    call npm run dev
)

pause
