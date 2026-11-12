@echo off
node "%~dp0scripts\start-local-test.mjs"
if errorlevel 1 pause
