@echo off
cd /d "%~dp0"
git add .
set /p msg="Mensaje de cambio (Enter para default): "
if "%msg%"=="" set msg=Actualizacion automatica
git commit -m "%msg%"
git push origin main
echo.
echo Listo, cambio enviado a GitHub y desplegando en VPS.
pause