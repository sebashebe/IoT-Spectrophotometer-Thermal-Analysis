# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import re, sys, json
sys.stdout.reconfigure(encoding='utf-8')
with open('spectrometer/static/spectrometer/js/app.js', 'r', encoding='utf-8') as f:
    js = f.read()
with open('spectrometer/templates/spectrometer/index.html', 'r', encoding='utf-8') as f:
    html = f.read()
js_ids = set(re.findall(r'getElementById\([\'"]([^\'"]+)[\'"]\)', js))
html_ids = set(re.findall(r'id="([^"]+)"', html))
missing_in_html = js_ids - html_ids
if missing_in_html:
    print(f'IDs in JS but NOT in HTML ({len(missing_in_html)}):')
    for m in sorted(missing_in_html):
        print(f'  - {m}')
else:
    print(f'DOM IDs: {len(js_ids)} referenced in JS, all found in HTML')
legacy = re.findall(r'cal-val-|meas-val-|group-numeric', js)
if legacy:
    print(f'LEGACY references found: {legacy}')
else:
    print('No legacy numeric display refs in JS')
zoom_init = re.findall(r'zoom\s*:\s*\{', js)
print(f'Zoom config blocks: {len(zoom_init)}')
hammer = re.findall(r'Hammer|hammerjs', js)
print(f'Hammer.js refs: {len(hammer)}')
tzm = re.findall(r'function toggleZoomMode', js)
rz = re.findall(r'function resetZoom', js)
print(f'toggleZoomMode defined: {len(tzm)}, resetZoom defined: {len(rz)}')
chart_map = re.findall(r"'chart-([^']+)'", js)
print(f'Chart canvas IDs in _chartMap: {chart_map[:10]}')
print('JS AUDIT COMPLETE')