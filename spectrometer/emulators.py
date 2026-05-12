# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import time
import random
import threading
import numpy as np
class MockSpectrometer:
    def __init__(self, bus_number=22):
        self.bus_number = bus_number
        self._connected = False
    def connect(self):
        self._connected = True
        return True
    def disconnect(self):
        self._connected = False
    @property
    def is_connected(self):
        return self._connected
    def read_calibrated_data(self):
        if not self._connected:
            raise ConnectionError("Emulador: Sensor no conectado")
        time.sleep(0.12)
        base = [15.0, 42.0, 68.0, 85.0, 45.0, 20.0]
        return [max(0, b + random.uniform(-b*0.02, b*0.02)) for b in base]
class MockThermalCamera:
    def __init__(self, bus_number=1):
        self.bus_number = bus_number
        self._connected = False
        self._running = False
        self._acquiring = False
        self._thread = None
        self._lock = threading.Lock()
        self.current_frame = None
    def connect(self):
        self._connected = True
        return True
    def start_acquisition(self):
        if not self._connected:
            raise ConnectionError("Emulador: Cámra térmica no conectada")
        self._running = True
        self._acquiring = True
        self._thread = threading.Thread(target=self._acquisition_loop, daemon=True)
        self._thread.start()
    def stop_acquisition(self):
        self._acquiring = False
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
            self._thread = None
    def disconnect(self):
        self.stop_acquisition()
        self._connected = False
    @property
    def is_connected(self):
        return self._connected
    def _acquisition_loop(self):
        while self._running and self._acquiring:
            base_temp = 22.0
            noise = np.random.normal(0, 0.3, (24, 32))
            x_c = 16.0 + np.random.normal(0, 0.5)
            y_c = 12.0 + np.random.normal(0, 0.5)
            y, x = np.ogrid[:24, :32]
            dist = np.sqrt((x - x_c)**2 + (y - y_c)**2)
            hotspot = 12.0 * np.exp(-dist / 6.0)
            frame = base_temp + noise + hotspot
            frame_np = np.array(frame, dtype=np.float32)
            with self._lock:
                self.current_frame = frame_np
            time.sleep(0.5)
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
class MockGPIO:
    def __init__(self, pin=17):
        self.pin = pin
        self._initialized = False
        self._state = False
    def setup(self):
        self._initialized = True
        return True
    def led_on(self):
        self._state = True
        return True
    def led_off(self):
        self._state = False
        return True
    def cleanup(self):
        self._initialized = False
        self._state = False