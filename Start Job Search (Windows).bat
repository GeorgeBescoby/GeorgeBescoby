@echo off
REM Double-click this file to start the job search tool.
cd /d "%~dp0"

set PY=
where py >nul 2>nul && set PY=py
if not defined PY ( where python >nul 2>nul && set PY=python )
if not defined PY (
  echo Python isn't installed yet.
  echo Download it from https://www.python.org/downloads/ - when installing, tick "Add python.exe to PATH".
  echo Then double-click this file again.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo First-time setup ^(takes a minute^)...
  %PY% -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
  ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
  if errorlevel 1 (
    rmdir /s /q .venv
    echo Setup failed - see the message above.
    pause
    exit /b 1
  )
)

echo.
echo Job search is starting - your browser will open in a moment.
echo Keep this window open while you use it. Close it when you're done.
echo.
".venv\Scripts\python.exe" -m linkedin_jobs serve
pause
