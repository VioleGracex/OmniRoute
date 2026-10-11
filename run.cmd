@echo off
title OmniRoute BEI Launcher
echo ================================================================
echo           Starting OmniRoute + BEI Bridge Sidecar
echo ================================================================
echo.

cd /d "%~dp0"
set OMNIROUTE_USE_TURBOPACK=0

echo [1/2] Launching BEI Bridge Sidecar (Port 58930)...
start "OmniRoute BEI Bridge (:58930)" /min node sidecars\omniroute-bei-bridge\server.mjs

echo [2/2] Launching OmniRoute Server (Port 20128)...
start "OmniRoute Server (:20128)" node scripts\dev\run-next.mjs dev

echo.
echo ================================================================
echo  All services started!
echo  - OmniRoute Web:    http://localhost:20128/dashboard
echo  - BEI Bridge API:   http://127.0.0.1:58930
echo.
echo  Remember to load the Chrome extension from:
echo  %~dp0extensions\omniroute-bei-extension
echo ================================================================
echo.
pause
