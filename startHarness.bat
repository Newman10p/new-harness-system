@echo off
REM Jarvis Harness Startup Script for Windows
REM This script starts the wake-word listener and the harness.
REM Place this file in shell:startup folder for auto-start on boot:
REM   Press Windows+R, type: shell:startup, and place this .bat file there.

cd /d "%~dp0"
npm start
pause
