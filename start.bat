@echo off
setlocal
title PersonalFlix
cd /d "%~dp0"

echo ========================================================
echo             PersonalFlix - Desktop Launcher
echo ========================================================
echo.
echo Starting both Frontend (Vite dev server) and Backend (Rust/Axum)...
echo.
echo Frontend Dev URL: http://localhost:5173
echo Backend API URL:  http://127.0.0.1:31731
echo.

npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%.
    pause
)
