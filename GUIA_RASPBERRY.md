<!--
  Copyright (c) 2026 Sebastian Herrera Betancur
  Biomicrosystems Research Group | Universidad de los Andes
  PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.
-->

# Guía de Configuración y Conexiones: Raspberry Pi

Esta guía describe cómo conectar los sensores y configurar la Raspberry Pi para ejecutar el servidor web de espectrofotometría.

## 🔌 Conexiones de Hardware (I2C y GPIO)

### 1. Cámara Térmica (MLX90640) - Bus I2C-1
Conecta la cámara térmica al bus I2C estándar de la Raspberry Pi:
*   **VCC** → 3.3V (Pin 1 o 17)
*   **GND** → Black/Ground (Cualquier Pin GND)
*   **SDA** → GPIO 2 (Pin 3)
*   **SCL** → GPIO 3 (Pin 5)

### 2. Espectrofotómetro (AS726X) - Bus I2C-22 (Software I2C)
Para este proyecto, usamos un bus I2C separado para evitar conflictos de direccionamiento y mejorar la estabilidad:
*   **VCC** → 3.3V
*   **GND** → Ground
*   **SDA** → GPIO 23 (Pin 16)
*   **SCL** → GPIO 24 (Pin 18)

### 3. LED Externo
*   **Control (Gate)** → GPIO 17 (Pin 11)
*   **VCC** → 5V o 3.3V (según potencia del LED)
*   **GND** → Ground

---

## ⚙️ Configuración del Sistema en Raspberry Pi

### 1. Habilitar I2C base
Ejecuta `sudo raspi-config` -> `Interfacing Options` -> `I2C` -> `Yes`.

### 2. Habilitar Bus secundario (I2C-22)
Para usar los pines GPIO 23 y 24 como bus I2C, añade esta línea al final del archivo de configuración del arranque:
```bash
sudo nano /boot/config.txt
```
Añade la siguiente línea:
`dtoverlay=i2c-gpio,bus=22,sda_pin=23,scl_pin=24`

### 3. Verificar Direcciones
Después de reiniciar, comprueba las direcciones detectadas:
*   `i2cdetect -y 1` (MLX90640 suele estar en 0x33)
*   `i2cdetect -y 22` (AS726X suele estar en 0x49)

---

## 🚀 Despliegue del Servidor Web Django

Hemos incluido un script de instalación automatizado:
1. Dale permisos de ejecución: `chmod +x setup_pi.sh`
2. Ejecútalo: `./setup_pi.sh`

El servidor se iniciará automáticamente en el puerto `8000`. Puedes acceder desde cualquier dispositivo en la misma red local usando la IP de la Raspberry (ej: `http://192.168.1.100:8000`).
