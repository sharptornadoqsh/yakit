@echo off
setlocal
cd /d "%~dp0"
call "%~dp0start-client-dev.cmd"
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%
