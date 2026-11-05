@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Motor de Mesa de Calco
set "VENV=%~dp0.venv-motor"
set "PY=%VENV%\Scripts\python.exe"
if exist "%VENV%\instalado.ok" goto iniciar

echo.
echo  Primera vez: hay que preparar el motor local de Mesa de Calco.
echo  Se creara un entorno de Python en la carpeta .venv-motor y se descargaran
echo  desde internet [PyPI] las librerias de requirements.txt: rembg, onnxruntime,
echo  opencv, numpy y pillow. Ocupan unos 500 MB y solo se descargan una vez.
echo  El modelo para quitar fondos NO se descarga ahora: el editor te pedira
echo  permiso antes de bajarlo.
echo.
choice /C SN /M " Continuar"
if errorlevel 2 goto fin

set "BASEPY="
where py >nul 2>nul
if not errorlevel 1 set "BASEPY=py -3"
if defined BASEPY goto crear
where python >nul 2>nul
if not errorlevel 1 set "BASEPY=python"
if not defined BASEPY goto sinpython

:crear
%BASEPY% -m venv "%VENV%"
if errorlevel 1 goto error
"%PY%" -m pip install --disable-pip-version-check -r "%~dp0requirements.txt"
if errorlevel 1 goto error
echo ok> "%VENV%\instalado.ok"

:iniciar
"%PY%" "%~dp0motor.py" --abrir-editor
goto fin

:sinpython
echo.
echo  No encontre Python 3. Instalalo desde https://www.python.org
echo  [marca "Add python.exe to PATH"] y vuelve a abrir este archivo.
goto fin

:error
echo.
echo  La instalacion fallo. Revisa tu conexion a internet y vuelve a intentarlo.
echo  Si el problema sigue, borra la carpeta .venv-motor y abre este archivo otra vez.

:fin
echo.
pause
