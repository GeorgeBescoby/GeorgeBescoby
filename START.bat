@echo off
echo ========================================
echo  B2B Lead Enrichment Platform
echo  Starting up...
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo First time setup detected!
    echo Installing dependencies... This will take 1-2 minutes.
    echo.
    call npm install
    echo.
    echo Installation complete!
    echo.
)

echo Starting the application...
echo.
echo Your browser will open automatically!
echo If not, go to: http://localhost:3000
echo.
echo ========================================
echo  Application is running!
echo  Press Ctrl+C to stop
echo ========================================
echo.

REM Start the development server
call npm run dev

pause
