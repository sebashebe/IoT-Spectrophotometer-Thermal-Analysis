@echo off
echo ====================================================
echo    EJECUCION AUTOMATICA: ESPECTROFOTOMETRO WEB
echo ====================================================

if not exist .venv (
    echo [SETUP] Creando entorno virtual...
    python -m venv .venv
)

echo [SETUP] Activando entorno virtual...
call .venv\Scripts\activate

echo [SETUP] Verificando dependencias...
pip install -r requirements.txt

echo [SETUP] Aplicando migraciones...
python manage.py migrate

echo [RUN] Limpiando puerto 8000...
for /f "tokens=5" %%T in ('netstat -a -n -o ^| findstr :8000') do taskkill /f /pid %%T 2>nul

echo [RUN] Iniciando servidor (modo desarrollo + emulación)...
set DJANGO_ENV=development
set EMULATE_SENSORS=1
python manage.py runserver 0.0.0.0:8000

pause
