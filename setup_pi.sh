#!/bin/bash
# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

# --- Colores para el log ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   DESPLIEGUE AUTOMÁTICO: ESPECTROFOTÓMETRO WEB    ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Verificar si estamos en el directorio correcto
if [ ! -f "manage.py" ]; then
    echo -e "${RED}Error: No se encuentra manage.py. Ejecuta esto en la raíz del proyecto.${NC}"
    exit 1
fi

# 2. Actualizar sistema e instalar librerías base de Linux
echo -e "${YELLOW}1. Instalando dependencias del sistema...${NC}"
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv i2c-tools libatlas3-base

# 3. Configurar entorno virtual (Recomendado)
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}2. Creando entorno virtual (.venv)...${NC}"
    python3 -m venv .venv
fi
source .venv/bin/activate

# 4. Instalar dependencias de Python
echo -e "${YELLOW}3. Instalando librerías de Python desde requirements.txt...${NC}"
pip install --upgrade pip
pip install -r requirements.txt

# Instalar librerías específicas de hardware para Raspberry
echo -e "${YELLOW}4. Instalando controladores de hardware (I2C/GPIO)...${NC}"
pip install smbus2 RPi.GPIO adafruit-circuitpython-mlx90640

# 5. Configuración de Base de Datos
echo -e "${YELLOW}5. Aplicando migraciones de Django...${NC}"
python manage.py makemigrations
python manage.py migrate

# 6. Recordatorio de I2C (Crucial para este proyecto)
echo -e "${BLUE}====================================================${NC}"
echo -e "${YELLOW}RECORDATORIO IMPORTANTE PARA HARDWARE:${NC}"
echo -e "1. Asegúrate de que el I2C esté habilitado: ${GREEN}sudo raspi-config${NC}"
echo -e "2. Para el bus I2C-22 (AS726X), debes añadir esto a /boot/config.txt:"
echo -e "   ${GREEN}dtoverlay=i2c-gpio,bus=22,sda_pin=23,scl_pin=24${NC}"
echo -e "3. Reinicia la Raspberry después de cambiar la configuración."
echo -e "${BLUE}====================================================${NC}"

# 7. Ejecutar Servidor
echo -e "${YELLOW}6. Cerrando instancias previas del servidor...${NC}"
pkill -f "manage.py runserver" || true
fuser -k 8000/tcp 2>/dev/null || true
sleep 1

echo -e "${GREEN}Despliegue completado con éxito.${NC}"
echo -e "Iniciando servidor en puerto 8000 (Visible en red local)..."
python manage.py runserver 0.0.0.0:8000
