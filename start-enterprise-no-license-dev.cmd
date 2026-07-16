@echo off
setlocal
cd /d "%~dp0"
title Renyan Enterprise No License Dev
set "ELECTRON_IS_DEV=1"

call yarn dev-enterprise-no-license
set "exitCode=%ERRORLEVEL%"

if not "%exitCode%"=="0" (
  echo.
  echo Development environment exited with code %exitCode%.
  pause
)

exit /b %exitCode%
