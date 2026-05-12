# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import json
import os
from django.conf import settings
def load_translations(lang_code='en'):
    if not lang_code:
        lang_code = 'en'
    path = os.path.join(settings.BASE_DIR, 'spectrometer', 'translations', f'{lang_code}.json')
    if not os.path.exists(path):
        path = os.path.join(settings.BASE_DIR, 'spectrometer', 'translations', 'en.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading translations for {lang_code}: {e}")
        return {}
def get_available_languages():
    base_path = os.path.join(settings.BASE_DIR, 'spectrometer', 'translations')
    if not os.path.exists(base_path):
        return [('en', 'English')]
    langs = []
    labels_map = {'en': '🇬🇧 English', 'es': '🇪🇸 Español', 'fr': '🇫🇷 Français', 'de': '🇩🇪 Deutsch', 'it': '🇮🇹 Italiano', 'pt': '🇵🇹 Português'}
    for filename in os.listdir(base_path):
        if filename.endswith('.json'):
            code = filename.replace('.json', '')
            try:
                with open(os.path.join(base_path, filename), 'r', encoding='utf-8') as f:
                    j_data = json.load(f)
                    if 'lang_name' in j_data:
                        langs.append((code, j_data['lang_name']))
                        continue
            except:
                pass
            langs.append((code, labels_map.get(code, code.upper())))
    return langs