@echo off
echo ========================================
echo   Visa Application Helper - Setup
echo ========================================
echo.

echo Checking for Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found: 
node --version

echo.
echo Installing dependencies (this may take a few minutes)...
call npm install

if errorlevel 1 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo To start the application, run:
echo   npm start
echo.
echo To start in development mode with DevTools:
echo   npm run dev
echo.
pause
