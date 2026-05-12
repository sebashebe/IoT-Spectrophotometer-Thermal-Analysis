# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import time
import struct
import threading
import numpy as np
from queue import Queue, Full, Empty
try:
    from smbus2 import SMBus
    SMBUS_AVAILABLE = True
except ImportError:
    SMBUS_AVAILABLE = False
try:
    import board
    import busio
    import adafruit_mlx90640
    ADAFRUIT_AVAILABLE = True
except ImportError:
    ADAFRUIT_AVAILABLE = False
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
AS726X_ADDR = 0x49
STATUS_REG = 0x00
WRITE_REG = 0x01
READ_REG = 0x02
TX_VALID = 0x02
RX_VALID = 0x01
SPECTRO_BUS = 22
THERMAL_BUS = 1
LED_PIN = 17
class SpectrometerI2C:
    def __init__(self, bus_number=SPECTRO_BUS):
        self.bus_number = bus_number
        self.bus = None
        self._lock = threading.Lock()
        self._connected = False
    def connect(self):
        if not SMBUS_AVAILABLE:
            raise ImportError("Librería smbus2 no instalada. Ejecutar: pip install smbus2")
        try:
            self.bus = SMBus(self.bus_number)
            try:
                self._virtual_write(0x07, 0x00)
            except IOError:
                pass
            self._virtual_write(0x05, 0x28)
            self._connected = True
            return True
        except Exception as e:
            self._connected = False
            raise ConnectionError(f"Error al conectar al AS726X en bus {self.bus_number}: {e}")
    def disconnect(self):
        if self.bus:
            try:
                self._virtual_write(0x07, 0x00)
            except:
                pass
            try:
                self.bus.close()
            except:
                pass
        self.bus = None
        self._connected = False
    @property
    def is_connected(self):
        return self._connected and self.bus is not None
    def _virtual_write(self, addr, value):
        with self._lock:
            for _ in range(50):
                status = self.bus.read_byte_data(AS726X_ADDR, STATUS_REG)
                if (status & TX_VALID) == 0:
                    break
                time.sleep(0.001)
            else:
                raise IOError("Timeout I2C: Buffer TX lleno (Write Address)")
            self.bus.write_byte_data(AS726X_ADDR, WRITE_REG, addr | 0x80)
            for _ in range(50):
                status = self.bus.read_byte_data(AS726X_ADDR, STATUS_REG)
                if (status & TX_VALID) == 0:
                    break
                time.sleep(0.001)
            else:
                raise IOError("Timeout I2C: Buffer TX lleno (Write Value)")
            self.bus.write_byte_data(AS726X_ADDR, WRITE_REG, value)
    def _virtual_read(self, addr):
        with self._lock:
            for _ in range(50):
                status = self.bus.read_byte_data(AS726X_ADDR, STATUS_REG)
                if (status & TX_VALID) == 0:
                    break
                time.sleep(0.001)
            else:
                raise IOError("Timeout I2C: Buffer TX lleno (Read Address)")
            self.bus.write_byte_data(AS726X_ADDR, WRITE_REG, addr)
            for _ in range(50):
                status = self.bus.read_byte_data(AS726X_ADDR, STATUS_REG)
                if (status & RX_VALID) != 0:
                    break
                time.sleep(0.001)
            else:
                raise IOError("Timeout I2C: No hay datos (RX Empty)")
            return self.bus.read_byte_data(AS726X_ADDR, READ_REG)
    def _wait_for_data_ready(self, timeout_ms=3000):
        start = time.time()
        while (time.time() - start) * 1000 < timeout_ms:
            try:
                control = self._virtual_read(0x04)
                if control & 0x02:
                    return True
            except IOError:
                pass
            time.sleep(0.05)
        return False
    def read_calibrated_data(self):
        if not self.is_connected:
            raise ConnectionError("Sensor no conectado")
        self._virtual_write(0x04, 0x28)
        if not self._wait_for_data_ready():
            raise IOError("El sensor no completó la integración.")
        offsets = [0x14, 0x18, 0x1C, 0x20, 0x24, 0x28]
        values = []
        for off in offsets:
            b = [self._virtual_read(off + i) for i in range(4)]
            val = struct.unpack('>f', bytes(b))[0]
            values.append(val)
        return values
class ThermalCamera:
    def __init__(self, bus_number=THERMAL_BUS):
        self.bus_number = bus_number
        self.mlx = None
        self._running = False
        self._acquiring = False
        self._thread = None
        self._lock = threading.Lock()
        self.frame_buffer = [0] * 768
        self.current_frame = None
        self._connected = False
    def connect(self):
        if not ADAFRUIT_AVAILABLE:
            raise ImportError(
                "Librería Adafruit MLX90640 no instalada.\n"
                "Ejecutar: pip install adafruit-circuitpython-mlx90640"
            )
        try:
            i2c = busio.I2C(board.SCL, board.SDA, frequency=400000)
            self.mlx = adafruit_mlx90640.MLX90640(i2c)
            self.mlx.refresh_rate = adafruit_mlx90640.RefreshRate.REFRESH_2_HZ
            self._connected = True
            return True
        except Exception as e:
            self._connected = False
            raise ConnectionError(f"Error iniciando MLX90640: {e}")
    def start_acquisition(self):
        if not self._connected:
            raise ConnectionError("MLX90640 no conectado")
        self._running = True
        self._acquiring = True
        self._thread = threading.Thread(target=self._acquisition_loop, daemon=True)
        self._thread.start()
    def stop_acquisition(self):
        self._acquiring = False
        self._running = False
        if self._thread:
            self._thread.join(timeout=3.0)
            self._thread = None
    def disconnect(self):
        self.stop_acquisition()
        self.mlx = None
        self._connected = False
    @property
    def is_connected(self):
        return self._connected and self.mlx is not None
    def _acquisition_loop(self):
        while self._running and self._acquiring:
            try:
                self.mlx.getFrame(self.frame_buffer)
                frame_np = np.array(self.frame_buffer, dtype=np.float32).reshape(24, 32)
                frame_np = np.ascontiguousarray(frame_np)
                with self._lock:
                    self.current_frame = frame_np
            except RuntimeError:
                time.sleep(0.05)
                continue
            except Exception:
                self._acquiring = False
                break
    def get_frame(self):
        with self._lock:
            if self.current_frame is not None:
                return self.current_frame.tolist()
        return None
    def get_stats(self):
        with self._lock:
            if self.current_frame is not None:
                frame = self.current_frame
                return {
                    'min': float(np.min(frame)),
                    'max': float(np.max(frame)),
                    'mean': float(np.mean(frame)),
                }
        return None
class GPIOController:
    def __init__(self, pin=LED_PIN):
        self.pin = pin
        self._initialized = False
    def setup(self):
        if not GPIO_AVAILABLE:
            return False
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.pin, GPIO.OUT)
            GPIO.output(self.pin, GPIO.LOW)
            self._initialized = True
            return True
        except Exception:
            return False
    def led_on(self):
        if GPIO_AVAILABLE and self._initialized:
            try:
                GPIO.output(self.pin, GPIO.HIGH)
                return True
            except:
                pass
        return False
    def led_off(self):
        if GPIO_AVAILABLE and self._initialized:
            try:
                GPIO.output(self.pin, GPIO.LOW)
                return True
            except:
                pass
        return False
    def cleanup(self):
        if GPIO_AVAILABLE and self._initialized:
            try:
                GPIO.cleanup()
            except:
                pass
import os
import sys
if os.environ.get('EMULATE_SENSORS') == '1' and sys.platform == 'win32':
    from .emulators import MockSpectrometer, MockThermalCamera, MockGPIO
    _spectrometer = MockSpectrometer(bus_number=SPECTRO_BUS)
    _thermal_camera = MockThermalCamera(bus_number=THERMAL_BUS)
    _gpio = MockGPIO(pin=LED_PIN)
    SMBUS_AVAILABLE = True
    ADAFRUIT_AVAILABLE = True
    GPIO_AVAILABLE = True
else:
    _spectrometer = SpectrometerI2C(bus_number=SPECTRO_BUS)
    _thermal_camera = ThermalCamera(bus_number=THERMAL_BUS)
    _gpio = GPIOController(pin=LED_PIN)
_gpio.setup()
def get_spectrometer():
    return _spectrometer
def get_thermal_camera():
    return _thermal_camera
def get_gpio():
    return _gpio
def is_hardware_available():
    return {
        'smbus2': SMBUS_AVAILABLE,
        'adafruit_mlx90640': ADAFRUIT_AVAILABLE,
        'rpi_gpio': GPIO_AVAILABLE,
    }