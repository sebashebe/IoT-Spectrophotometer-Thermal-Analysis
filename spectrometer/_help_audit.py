# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import json, re
with open('spectrometer/templates/spectrometer/index.html', 'r', encoding='utf-8') as f:
    html = f.read()
topics_html = set(re.findall(r'showContextHelp\([\'"]([^\'"]+)[\'"]\)', html))
with open('spectrometer/translations/en.json', 'r', encoding='utf-8') as f:
    en = json.load(f)
with open('spectrometer/translations/es.json', 'r', encoding='utf-8') as f:
    es = json.load(f)
en_helps = set(en.get('help', {}).keys())
es_helps = set(es.get('help', {}).keys())
print(f'HTML topics: {len(topics_html)}')
print(f'EN JSON help keys: {len(en_helps)}')
print(f'ES JSON help keys: {len(es_helps)}')
missing_in_en = topics_html - en_helps
missing_in_es = topics_html - es_helps
if missing_in_en:
    print(f'Missing in EN: {missing_in_en}')
if missing_in_es:
    print(f'Missing in ES: {missing_in_es}')
if not missing_in_en and not missing_in_es:
    print('ALL context help topics referenced in HTML exist in both EN and ES JSON files!')