@echo off
setlocal
title PersonalFlix Launcher (Separate Windows)
cd /d "%~dp0"

echo ========================================================
echo       PersonalFlix - Start Frontend & Backend
echo ========================================================
echo.
echo [1/2] Launching Backend server in a separate window...
start "PersonalFlix Backend" cmd /k "cd /d \"%~dp0src-tauri\" && echo [Backend] Running Cargo... && cargo run"

echo [2/2] Launching Frontend dev server in a separate window...
start "PersonalFlix Frontend" cmd /k "cd /d \"%~dp0frontend\" && echo [Frontend] Running Vite... && npm run dev"

echo.
echo Both services have been started in separate windows:
echo - Frontend: http://localhost:5173
echo - Backend:  http://127.0.0.1:31731
echo.
echo Press any key to exit this launcher window...
pause >nul
