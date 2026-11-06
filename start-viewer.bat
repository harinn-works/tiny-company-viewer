@echo off
rem TinyCompany Viewer launcher (Windows): double-click this file.
cd /d %~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\static-server.ps1"
pause
