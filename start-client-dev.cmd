@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Renyan Client Hot Reload
set "ELECTRON_IS_DEV=1"
set "REACT_APP_PLATFORM=enterprise"
set "REACT_APP_REQUIRE_ENTERPRISE_LICENSE=false"
set "REACT_APP_SKIP_DEV_TYPE_CHECK=true"
set "DISABLE_ESLINT_PLUGIN=true"
set "BROWSERSLIST_IGNORE_OLD_DATA=true"
set "exitCode=0"

echo 正在检查睿眼企业版免授权开发环境。
echo.

where yarn >nul 2>&1
if errorlevel 1 (
  set "exitCode=9009"
  echo 未找到 Yarn，请安装 Yarn 1.x 并确认其已加入环境变量。
  goto :finish
)

if not exist "package.json" (
  set "exitCode=2"
  echo 当前目录缺少 package.json，无法启动开发环境。
  goto :finish
)

if not exist "node_modules\.bin\concurrently.cmd" (
  set "exitCode=2"
  echo 根目录依赖尚未安装，请在项目目录执行 yarn。
  goto :finish
)

set "occupiedPorts="
netstat -ano -p tcp 2>nul | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 set "occupiedPorts=3000"
netstat -ano -p tcp 2>nul | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 set "occupiedPorts=%occupiedPorts% 5173"

if defined occupiedPorts (
  set "exitCode=2"
  echo 检测到端口%occupiedPorts%已被占用，开发客户端可能已经启动。
  echo 请保留现有开发窗口，或结束对应会话后再次启动。
  goto :finish
)

echo 正在启动主界面、引擎启动界面和桌面客户端。
echo 首次编译需要等待一段时间；热更新期间此窗口会持续保持打开。
echo 关闭桌面客户端或按 Ctrl+C 可以结束开发会话。
echo.

call yarn dev-enterprise-no-license
set "exitCode=%ERRORLEVEL%"

:finish
echo.
if "%exitCode%"=="0" (
  echo 开发环境已经结束。
) else (
  echo 开发环境已经退出，退出码为 %exitCode%。
)
echo 按任意键关闭此窗口。
if not "%RENYAN_DEV_NO_PAUSE%"=="1" pause >nul

endlocal & exit /b %exitCode%
