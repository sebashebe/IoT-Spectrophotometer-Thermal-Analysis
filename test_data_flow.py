# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import os
import django
import json
import time
import sys
os.environ['EMULATE_SENSORS'] = '1'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'spectro_web.settings')
django.setup()
from django.test import RequestFactory
from spectrometer.views import (
    api_connect, api_calibrate, api_start_measurement, api_stop_measurement,
    api_export_data, _state, api_thermal_start, api_thermal_start_measurement,
    api_thermal_stop_measurement
)
def test_flow():
    factory = RequestFactory()
    print("1. Connecting to sensors (emulated)...")
    req = factory.post('/api/connect/')
    req.session = {'django_language': 'en'}
    res = api_connect(req)
    print("Connect response:", json.loads(res.content))
    print("\n2. Starting thermal camera...")
    req = factory.post('/api/thermal/start/')
    req.session = {'django_language': 'en'}
    res = api_thermal_start(req)
    print("Thermal start:", json.loads(res.content))
    print("\n3. Calibrating (measuring I0)...")
    req = factory.post('/api/calibrate/')
    req.session = {'django_language': 'en'}
    res = api_calibrate(req)
    print("Calibrate response:", json.loads(res.content))
    print("\n4. Starting synchronous measurement (Thermal + Spectrometer)...")
    _state['thermal_sync_enabled'] = True
    req = factory.post('/api/start_measurement/', json.dumps({
        'type': 'sequential',
        'm_samples': 1,
        'p_measurements': 1
    }), content_type='application/json')
    req.session = {'django_language': 'en'}
    res = api_start_measurement(req)
    print("Start measurement response:", json.loads(res.content))
    print("\nSimulating delay for measurement...")
    time.sleep(2)
    print("\n5. Exporting data...")
    req = factory.get('/api/export_data/')
    req.session = {'django_language': 'en'}
    res = api_export_data(req)
    content = res.content.decode('utf-8')
    lines = content.split('\n')
    print("\nExported CSV snippet (first 15 lines):")
    for line in lines[:15]:
        print(line.strip().encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding))
    print("\nExported CSV snippet (last 5 lines):")
    for line in lines[-6:]:
        print(line.strip().encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding))
    print("\nFlow completed successfully.")
if __name__ == '__main__':
    test_flow()