@echo off
cd /d "%~dp0"
where python >nul 2>&1
if %errorlevel% equ 0 (
  python start.py
) else (
  where py >nul 2>&1
  if %errorlevel% equ 0 (
    py -3 start.py
  ) else (
    echo Python was not found. Install Python 3 from python.org and try again.
    pause
  )
)
