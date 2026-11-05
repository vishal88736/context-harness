@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
if not exist "%~dp0runtime\node.exe" (
  echo The bundled Canopy runtime is missing. Extract the complete ZIP before launching.
  if not "%CANOPY_NO_PAUSE%"=="1" pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0scripts\launcher.mjs"
set "canopy_exit=%ERRORLEVEL%"
if not "%canopy_exit%"=="0" if not "%CANOPY_NO_PAUSE%"=="1" pause
exit /b %canopy_exit%
