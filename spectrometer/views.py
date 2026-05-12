# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import json
import time
import csv
import os
import io
import threading
import numpy as np
from pathlib import Path
from scipy.stats import linregress
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import ensure_csrf_cookie
from django.conf import settings
from .hardware import (
    get_spectrometer, get_thermal_camera, get_gpio,
    is_hardware_available, SMBUS_AVAILABLE, ADAFRUIT_AVAILABLE, GPIO_AVAILABLE
)
from .utils import load_translations, get_available_languages
from django.utils import translation
WAVELENGTHS = [450, 500, 550, 570, 600, 650]
def get_localized_wavelength_labels(t):
    colors = {
        450: t.get('colors', {}).get('violet', 'Violeta'),
        500: t.get('colors', {}).get('blue', 'Azul'),
        550: t.get('colors', {}).get('green', 'Verde'),
        570: t.get('colors', {}).get('yellow', 'Amarillo'),
        600: t.get('colors', {}).get('orange', 'Naranja'),
        650: t.get('colors', {}).get('red', 'Rojo'),
    }
    return [f"{colors[wl]} ({wl}nm)" for wl in WAVELENGTHS]
_state_lock = threading.Lock()
_state = {
    'is_connected': False,
    'app_state': 'IDLE',
    'current_theme_is_dark': True,
    'simulation_mode': False,
    'last_calibration_values': None,
    'last_raw_measurement_spectrum': None,
    'last_measurement_values': None,
    'calibration_data_raw': [],
    'measurement_data_raw': [],
    'blank_subtraction_active': False,
    'main_plot_type': 'INTENSITY',
    'superimposed_spectra_labels': [],
    'use_log_scale_y': False,
    'show_markers': True,
    'show_I0_on_intensity_graph': False,
    'active_session_calibration_curve': None,
    'active_transfer_model': {},
    'reference_calibration_parameters': {},
    'epsilon_session': '',
    'path_length_session': '0.6',
    'measurement_type': 'Continuo',
    'm_samples': 1,
    'p_measurements': 5,
    'measurement_control': {
        'is_active': False,
        'current_m_count': 0,
        'current_p_count': 0,
        'accumulated_raw_lines': [],
        'collected_sequential_points': [],
    },
    'conc_curve_points': [],
    'cal_curve_points': [],
    'cal_fit_abs_vs_conc': {},
    'cal_fit_transfer_model': {},
    'thermal_active': False,
    'thermal_is_measuring': False,
    'thermal_measurement_data': [],
    'thermal_measurement_start_time': 0,
    'thermal_frame_counter': 0,
    'thermal_sync_enabled': False,
    'sequential_thermal_data': [],
    'led_active': False,
    'log_messages': [],
}
def _tl(key, lang='en', **kwargs):
    t = load_translations(lang)
    keys = key.split('.')
    val = t
    for k in keys:
        if isinstance(val, dict) and k in val:
            val = val[k]
        else:
            return key
    if isinstance(val, str):
        try:
            return val.format(**kwargs)
        except (KeyError, ValueError):
            return val
    return key
def _log(message_key, is_error=False, lang='en', **kwargs):
    message = _tl(message_key, lang, **kwargs)
    timestamp = time.strftime("%H:%M:%S")
    prefix = "ERR: " if is_error else ""
    entry = f"[{timestamp}] {prefix}{message}"
    try:
        print(entry)
    except UnicodeEncodeError:
        print(entry.encode('ascii', errors='replace').decode('ascii'))
    _state['log_messages'].append(entry)
    if len(_state['log_messages']) > 500:
        _state['log_messages'] = _state['log_messages'][-300:]
def _read_real_spectrum(lang='en'):
    spectro = get_spectrometer()
    if not spectro.is_connected:
        raise ConnectionError(_tl('alerts.hw_failure', lang, hw='AS726X', e='Not connected'))
    try:
        values = spectro.read_calibrated_data()
        _log('logs.measuring_live', False, lang, vals=[f'{v:.4f}' for v in values])
        return values
    except Exception as e:
        _log('logs.hw_failure', True, lang, hw='I2C', e=str(e))
        raise IOError(_tl('alerts.hw_failure', lang, hw='I2C', e=str(e)))
def _compute_absorbance_spectrum(i_values, i0_values):
    if i_values is None or i0_values is None:
        return None
    abs_spec = []
    for i in range(6):
        i0 = i0_values[i]
        iv = i_values[i]
        if i0 > 1e-9:
            ratio = iv / i0
            if ratio > 1e-9:
                abs_spec.append(-np.log10(ratio))
            else:
                abs_spec.append(float('nan'))
        else:
            abs_spec.append(float('nan'))
    return abs_spec
def _get_value_at_wl(spectrum, wavelength_nm):
    try:
        idx = WAVELENGTHS.index(wavelength_nm)
        return spectrum[idx]
    except (ValueError, IndexError, TypeError):
        return float('nan')
@ensure_csrf_cookie
def index(request):
    lang = request.session.get('django_language', request.COOKIES.get(settings.LANGUAGE_COOKIE_NAME, 'en'))
    translation.activate(lang)
    t = load_translations(lang)
    wl_labels = get_localized_wavelength_labels(t)
    hw = is_hardware_available()
    import json
    return render(request, 'spectrometer/index.html', {
        'wavelengths': WAVELENGTHS,
        'wavelength_labels': wl_labels,
        'wl_options': list(zip(WAVELENGTHS, wl_labels)),
        'hw_status': hw,
        't': t,
        't_json': json.dumps(t),
        'current_lang': lang,
        'available_langs': get_available_languages(),
    })
@require_POST
def api_set_language(request):
    data = json.loads(request.body)
    lang = data.get('language', 'en')
    with _state_lock:
        translation.activate(lang)
        request.session['django_language'] = lang
    response = JsonResponse({'status': 'ok', 'language': lang})
    response.set_cookie(settings.LANGUAGE_COOKIE_NAME, lang)
    return response
@require_POST
def api_connect(request):
    lang = request.session.get('django_language', 'en')
    spectro = get_spectrometer()
    gpio = get_gpio()
    thermal = get_thermal_camera()
    hw_messages = []
    with _state_lock:
        _state['simulation_mode'] = False
        if not SMBUS_AVAILABLE:
            _log('logs.smbus_missing_err', True, lang)
            return JsonResponse({'status': 'error', 'message': _tl('alerts.smbus_not_available', lang)})
        try:
            spectro.connect()
            hw_messages.append(_tl('logs.connect_success_spectro', lang))
            _log('logs.connect_real_i2c', False, lang)
        except Exception as e:
            _log('logs.hw_failure', True, lang, hw='AS726X', e=str(e))
            return JsonResponse({'status': 'error', 'message': _tl('alerts.hw_failure', lang, hw='AS726X', e=str(e))})
        if gpio.led_on():
            hw_messages.append(_tl('logs.connect_success_led', lang))
            _log('logs.connect_success_led', False, lang)
        else:
            hw_messages.append('GPIO Error')
            _log('logs.hw_failure', True, lang, hw='GPIO/LED', e='Not available')
        if ADAFRUIT_AVAILABLE:
            try:
                thermal.connect()
                thermal.start_acquisition()
                _state['thermal_active'] = True
                hw_messages.append(_tl('logs.connect_success_thermal', lang))
                _log('logs.connect_success_thermal', False, lang)
            except Exception as e:
                hw_messages.append(f"MLX90640: {e}")
                _log('logs.hw_failure', True, lang, hw='MLX90640', e=str(e))
        else:
            hw_messages.append(_tl('logs.thermal_lib_missing', lang))
            _log('logs.thermal_lib_missing', True, lang)
        _state['is_connected'] = True
        _state['app_state'] = 'IDLE'
        _state['last_calibration_values'] = None
        _state['last_measurement_values'] = None
        _state['last_raw_measurement_spectrum'] = None
        _state['calibration_data_raw'] = []
        _state['measurement_data_raw'] = []
        _state['blank_subtraction_active'] = False
        _state['superimposed_spectra_labels'] = []
    return JsonResponse({
        'status': 'ok',
        'message': _tl('status.connected_real', lang),
        'simulation_mode': _state['simulation_mode'],
        'hw_details': hw_messages,
    })
@require_POST
def api_disconnect(request):
    lang = request.session.get('django_language', 'en')
    spectro = get_spectrometer()
    gpio = get_gpio()
    thermal = get_thermal_camera()
    with _state_lock:
        try:
            thermal.disconnect()
            _state['thermal_active'] = False
        except Exception as e:
            _log('logs.hw_failure', True, lang, hw='MLX90640', e=str(e))
        try:
            spectro.disconnect()
        except Exception as e:
            _log('logs.hw_failure', True, lang, hw='AS726X', e=str(e))
        gpio.led_off()
        _state['is_connected'] = False
        _state['app_state'] = 'IDLE'
        _log('logs.disconnected_ok', False, lang)
        _log('logs.disconnect_led_off', False, lang)
    return JsonResponse({'status': 'ok', 'message': _tl('status.disconnected', lang)})
@require_POST
def api_calibrate(request):
    lang = request.session.get('django_language', 'en')
    with _state_lock:
        if not _state['is_connected']:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.not_connected', lang)}, status=400)
        if _state['app_state'] != 'IDLE':
            return JsonResponse({'status': 'error', 'message': _tl('alerts.meas_in_progress', lang)}, status=400)
        _log('logs.measuring_ref', False, lang)
        try:
            values = _read_real_spectrum(lang)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
        _state['last_calibration_values'] = values
        raw_line = "calblanco," + ",".join(f"{v:.4f}" for v in values)
        _state['calibration_data_raw'].append(raw_line)
        _log('logs.ref_data_processed', False, lang)
    return JsonResponse({
        'status': 'ok',
        'values': values,
        'message': _tl('sidebar.ref_params_saved', lang),
        'is_real_hw': not _state['simulation_mode'],
    })
@require_POST
def api_start_measurement(request):
    lang = request.session.get('django_language', 'en')
    with _state_lock:
        if not _state['is_connected']:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.not_connected', lang)}, status=400)
        if _state['app_state'] != 'IDLE':
            return JsonResponse({'status': 'error', 'message': _tl('alerts.meas_in_progress', lang)}, status=400)
        data = json.loads(request.body)
        mtype = data.get('type', 'continuous')
        m_samples = int(data.get('m_samples', 1))
        p_measurements = int(data.get('p_measurements', 5))
        _state['app_state'] = 'MEASURING_MAIN'
        _state['measurement_type'] = mtype
        _state['m_samples'] = m_samples
        _state['p_measurements'] = p_measurements
        try:
            thermal = get_thermal_camera()
            thermal_stats = thermal.get_stats()
            temp = round(thermal_stats['mean'], 2) if thermal_stats else None
            if mtype == 'continuous':
                values = _read_real_spectrum(lang)
                raw_spectrum = values.copy()
                if _state['blank_subtraction_active'] and _state['last_calibration_values'] is not None:
                    values = [max(0, values[i] - _state['last_calibration_values'][i]) for i in range(6)]
                _state['last_raw_measurement_spectrum'] = raw_spectrum
                _state['last_measurement_values'] = values
                raw_line = "live," + ",".join(f"{v:.4f}" for v in raw_spectrum)
                _state['measurement_data_raw'].append(raw_line)
                _log('logs.measuring_live', False, lang, vals=[f'{v:.4f}' for v in raw_spectrum])
            elif mtype in ['single', 'sequential']:
                all_spectra = []
                for m_idx in range(m_samples):
                    spectrum = _read_real_spectrum(lang)
                    all_spectra.append(spectrum)
                    _log('logs.measuring_sub', False, lang, idx=m_idx+1, total=m_samples)
                    if m_idx < m_samples - 1:
                        time.sleep(0.05)
                avg = [np.mean([s[i] for s in all_spectra]) for i in range(6)]
                raw_spectrum = avg.copy()
                if _state['blank_subtraction_active'] and _state['last_calibration_values'] is not None:
                    avg = [max(0, avg[i] - _state['last_calibration_values'][i]) for i in range(6)]
                _state['last_raw_measurement_spectrum'] = raw_spectrum
                _state['last_measurement_values'] = avg
                values = avg
                label = f"AvgM{m_samples}_{time.strftime('%H%M%S')}"
                data_line = f"{label}," + ",".join(f'{v:.3f}' for v in avg)
                _state['measurement_data_raw'].append(data_line)
                _log('logs.measuring_complete_t', False, lang, total=m_samples, t=temp)
                if _state.get('thermal_sync_enabled', False) and thermal_stats:
                    flat_frame = []
                    frame = thermal.get_frame()
                    std_t = 0
                    hist_counts = [0] * 25
                    if frame:
                        for r_row in frame:
                            flat_frame.extend(r_row)
                        if flat_frame:
                            mean_t = sum(flat_frame) / len(flat_frame)
                            std_t = (sum((v - mean_t)**2 for v in flat_frame) / len(flat_frame))**0.5
                            t_min = thermal_stats['min']
                            t_max = thermal_stats['max']
                            rng = (t_max - t_min) if (t_max - t_min) > 0 else 1.0
                            bins = 25
                            for val in flat_frame:
                                b = int((val - t_min) / rng * bins)
                                b = min(b, bins - 1)
                                b = max(b, 0)
                                hist_counts[b] += 1
                    _state['sequential_thermal_data'].append({
                        'mean': thermal_stats['mean'],
                        'min': thermal_stats['min'],
                        'max': thermal_stats['max'],
                        'std': std_t,
                        'frame': flat_frame,
                        'frame_raw': frame,
                        'hist_counts': hist_counts,
                        'timestamp': time.strftime('%H:%M:%S')
                    })
                    if len(_state['sequential_thermal_data']) > 500:
                        _state['sequential_thermal_data'] = _state['sequential_thermal_data'][-300:]
            else:
                values = _read_real_spectrum(lang)
                _state['last_measurement_values'] = values
                _state['last_raw_measurement_spectrum'] = values.copy()
        except Exception as e:
            _state['app_state'] = 'IDLE'
            _log('logs.hw_failure', True, lang, hw='I2C', e=str(e))
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
        _state['app_state'] = 'IDLE'
    return JsonResponse({
        'status': 'ok',
        'values': values,
        'raw_values': raw_spectrum,
        'measurement_type': mtype,
        'is_real_hw': not _state['simulation_mode'],
        'thermal_temp': temp,
    })
@require_POST
def api_stop_measurement(request):
    lang = request.session.get('django_language', 'en')
    with _state_lock:
        _state['app_state'] = 'IDLE'
        _state['measurement_control']['is_active'] = False
        _log('logs.measuring_manual_stop', False, lang)
    return JsonResponse({'status': 'ok'})
@require_GET
def api_get_state(request):
    lang = request.session.get('django_language', 'en')
    with _state_lock:
        abs_spectrum = None
        trans_spectrum = None
        meas_raw = _state['last_raw_measurement_spectrum']
        cal_raw = _state['last_calibration_values']
        if meas_raw and cal_raw:
            abs_spectrum = _compute_absorbance_spectrum(meas_raw, cal_raw)
            if abs_spectrum:
                trans_spectrum = []
                for i in range(6):
                    i0 = cal_raw[i]
                    iv = meas_raw[i]
                    if i0 > 1e-9:
                        trans_spectrum.append((iv / i0) * 100)
                    else:
                        trans_spectrum.append(float('nan'))
        conc_display = _calculate_concentration_display(lang)
        thermal = get_thermal_camera()
        thermal_stats = thermal.get_stats()
        return JsonResponse({
            'is_connected': _state['is_connected'],
            'app_state': _state['app_state'],
            'current_theme_is_dark': _state['current_theme_is_dark'],
            'simulation_mode': _state['simulation_mode'],
            'last_calibration_values': _state['last_calibration_values'],
            'last_measurement_values': _state['last_measurement_values'],
            'abs_spectrum': abs_spectrum,
            'trans_spectrum': trans_spectrum,
            'blank_subtraction_active': _state['blank_subtraction_active'],
            'main_plot_type': _state['main_plot_type'],
            'active_session_calibration_curve': _state['active_session_calibration_curve'],
            'active_transfer_model': _state['active_transfer_model'],
            'reference_calibration_parameters': _state['reference_calibration_parameters'],
            'log_messages': _state['log_messages'][-100:],
            'concentration_display': conc_display,
            'wavelengths': WAVELENGTHS,
            'is_real_hw': not _state['simulation_mode'],
            'has_data': len(_state['measurement_data_raw']) > 0,
            'thermal_active': _state['thermal_active'],
            'thermal_stats': thermal_stats,
            'thermal_is_measuring': _state['thermal_is_measuring'],
            'led_active': _state['led_active'],
            'hw_available': is_hardware_available(),
        })
def _calculate_concentration_display(lang='en'):
    t = load_translations(lang)
    result = {
        'concentration_text': t.get('charts', {}).get('conc_calc', 'Calculated Concentration') + ': N/A',
        'abs_custom_text': t.get('charts', {}).get('a_custom', 'A_custom') + ' (@\u03bb): N/A',
        'abs_adjusted_text': t.get('charts', {}).get('a_adj', 'A_adj') + ' (@\u03bb): N/A',
        'concentration': None,
        'a_custom': None,
    }
    meas_raw = _state.get('last_raw_measurement_spectrum')
    cal_raw = _state.get('last_calibration_values')
    if meas_raw is None or cal_raw is None:
        return result
    abs_spectrum = _compute_absorbance_spectrum(meas_raw, cal_raw)
    if abs_spectrum is None:
        return result
    wl = _state.get('beer_wavelength', 650)
    try:
        idx = WAVELENGTHS.index(wl)
        a_custom = abs_spectrum[idx]
        if np.isnan(a_custom):
            return result
        result['a_custom'] = a_custom
        result['abs_custom_text'] = f'A_custom (@{wl}nm): {a_custom:.4f}'
        conc = float('nan')
        cal = _state.get('active_session_calibration_curve')
        if cal and cal[3] == wl:
            slope, intercept = cal[0], cal[1]
            if abs(slope) > 1e-12:
                conc = (a_custom - intercept) / slope
                result['concentration'] = conc
                result['concentration_text'] = t.get('charts', {}).get('conc_calc', 'Concentration') + f": {conc:.4e}"
        else:
            try:
                eps = float(_state.get('epsilon_session', 0) or 0)
                path = float(_state.get('path_length_session', 0.6) or 0.6)
                if abs(eps * path) > 1e-12:
                    conc = a_custom / (eps * path)
                    result['concentration'] = conc
                    result['concentration_text'] = t.get('charts', {}).get('conc_calc', 'Concentration') + f": {conc:.4e}"
            except:
                pass
    except (ValueError, IndexError):
        return result
    return result
@require_POST
def api_calculate_concentration(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    wl = int(data.get('wavelength', 650))
    method = data.get('method', 'beer_lambert')
    epsilon = float(data.get('epsilon', 0) or 0)
    path_length = float(data.get('path_length', 0.6) or 0.6)
    use_session_curve = data.get('use_session_curve', False)
    use_transfer_model = data.get('use_transfer_model', False)
    with _state_lock:
        _state['beer_wavelength'] = wl
        _state['epsilon_session'] = str(epsilon)
        _state['path_length_session'] = str(path_length)
        meas_raw = _state['last_raw_measurement_spectrum']
        cal_raw = _state['last_calibration_values']
        if meas_raw is None or cal_raw is None:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.missing_meas_data', lang)}, status=400)
        abs_spectrum = _compute_absorbance_spectrum(meas_raw, cal_raw)
        if abs_spectrum is None:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.missing_meas_data', lang)}, status=400)
        try:
            idx = WAVELENGTHS.index(wl)
        except ValueError:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.invalid_wl', lang)}, status=400)
        a_custom = abs_spectrum[idx]
        a_adj = float('nan')
        if np.isnan(a_custom):
            return JsonResponse({'status': 'error', 'message': f'A_custom is NaN @ {wl}nm'}, status=400)
        concentration = float('nan')
        if use_transfer_model:
            model = _state['active_transfer_model'].get(str(wl))
            ref_cal = _state['reference_calibration_parameters'].get(str(wl))
            if not model or not ref_cal:
                return JsonResponse({'status': 'error', 'message': _tl('alerts.model_incomplete', lang)}, status=400)
            slope_t, intercept_t, _ = model
            a_adj = slope_t * a_custom + intercept_t
            if ref_cal['type'] == 'curve':
                m_ref = ref_cal.get('m_ref', 0)
                b_ref = ref_cal.get('b_ref', 0)
                if abs(m_ref) < 1e-12:
                    return JsonResponse({'status': 'error', 'message': 'm_ref \u2248 0'}, status=400)
                concentration = (a_adj - b_ref) / m_ref
            else:
                eps_l_ref = ref_cal.get('epsilon_l_ref', 0)
                if abs(eps_l_ref) < 1e-12:
                    return JsonResponse({'status': 'error', 'message': '(\u03b5L)_ref \u2248 0'}, status=400)
                concentration = a_adj / eps_l_ref
        elif use_session_curve:
            cal = _state['active_session_calibration_curve']
            if cal and cal[3] == wl:
                slope, intercept = cal[0], cal[1]
                if abs(slope) < 1e-12:
                    return JsonResponse({'status': 'error', 'message': 'Slope \u2248 0'}, status=400)
                concentration = (a_custom - intercept) / slope
            else:
                return JsonResponse({'status': 'error', 'message': _tl('alerts.session_curve_missing', lang)}, status=400)
        else:
            if abs(epsilon * path_length) < 1e-12:
                return JsonResponse({'status': 'error', 'message': '\u03b5*b \u2248 0'}, status=400)
            concentration = a_custom / (epsilon * path_length)
        label = f"ConcCalc_{time.strftime('%H%M%S')}_C{concentration:.2e}_@{wl}nm"
        data_line = f"{label}," + ",".join(f'{v:.4f}' if not np.isnan(v) else "NaN" for v in abs_spectrum)
        _state['measurement_data_raw'].append(data_line)
        _log('logs.calc_conc_success', False, lang, val=f"{concentration:.4e}")
    return JsonResponse({
        'status': 'ok',
        'concentration': concentration,
        'a_custom': a_custom,
        'a_adjusted': a_adj if not np.isnan(a_adj) else None,
        'wavelength': wl,
        'label': label,
    })
@require_POST
def api_save_ref_cal(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    wl = str(data.get('wavelength', 650))
    cal_type = data.get('type', 'curve')
    params = {'type': cal_type}
    if cal_type == 'curve':
        params['m_ref'] = float(data.get('m_ref', 0))
        params['b_ref'] = float(data.get('b_ref', 0))
    else:
        params['epsilon_l_ref'] = float(data.get('epsilon_l_ref', 0))
    with _state_lock:
        _state['reference_calibration_parameters'][wl] = params
        _log('logs.params_saved', False, lang, wl=wl)
    return JsonResponse({'status': 'ok'})
@require_POST
def api_toggle_blank_subtraction(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    active = data.get('active', False)
    with _state_lock:
        if active and _state['last_calibration_values'] is None:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.missing_ref_i0', lang)}, status=400)
        _state['blank_subtraction_active'] = active
        if _state['last_raw_measurement_spectrum'] is not None:
            if active and _state['last_calibration_values'] is not None:
                _state['last_measurement_values'] = [
                    max(0, _state['last_raw_measurement_spectrum'][i] - _state['last_calibration_values'][i])
                    for i in range(6)
                ]
            else:
                _state['last_measurement_values'] = _state['last_raw_measurement_spectrum'][:]
        st_val = _tl('status.on', lang) if active else _tl('status.off', lang)
        _log('logs.blank_sub', False, lang, status=st_val)
    return JsonResponse({'status': 'ok'})
@require_POST
def api_set_theme(request):
    data = json.loads(request.body)
    with _state_lock:
        _state['current_theme_is_dark'] = data.get('is_dark', True)
    return JsonResponse({'status': 'ok'})
@require_POST
def api_set_plot_type(request):
    data = json.loads(request.body)
    with _state_lock:
        _state['main_plot_type'] = data.get('plot_type', 'INTENSITY')
    return JsonResponse({'status': 'ok'})
@require_POST
def api_set_thermal_sync(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    with _state_lock:
        _state['thermal_sync_enabled'] = data.get('enabled', False)
        st_val = _tl('status.on', lang) if _state['thermal_sync_enabled'] else _tl('status.off', lang)
        _log('logs.thermal_sync_msg', False, lang, status=st_val)
    return JsonResponse({'status': 'ok'})
@require_POST
def api_clear_session(request):
    lang = request.session.get('django_language', 'en')
    with _state_lock:
        _state['last_calibration_values'] = None
        _state['last_measurement_values'] = None
        _state['last_raw_measurement_spectrum'] = None
        _state['calibration_data_raw'] = []
        _state['measurement_data_raw'] = []
        _state['blank_subtraction_active'] = False
        _state['superimposed_spectra_labels'] = []
        _state['active_session_calibration_curve'] = None
        _state['active_transfer_model'] = {}
        _log('logs.session_cleared', False, lang)
    return JsonResponse({'status': 'ok'})
@require_GET
def api_thermal_snapshot_sequential(request, point_index):
    lang = request.session.get('django_language', 'en')
    with _state_lock:
        try:
            idx = int(point_index)
            if idx == -1 and len(_state['sequential_thermal_data']) > 0:
                idx = len(_state['sequential_thermal_data']) - 1
            if 0 <= idx < len(_state['sequential_thermal_data']):
                tdata = _state['sequential_thermal_data'][idx]
                conc = None
                wl = _state.get('beer_wavelength')
                if 0 <= idx < len(_state['measurement_data_raw']):
                    mline = _state['measurement_data_raw'][idx]
                    parts = mline.split(',')
                    label = parts[0]
                    if 'ConcCalc' in label:
                        import re
                        matchC = re.search(r'C([0-9\.e+\-]+)_', label)
                        matchWL = re.search(r'@([0-9]+)nm', label)
                        if matchC:
                            conc = float(matchC.group(1))
                        if matchWL:
                            wl = int(matchWL.group(1))
                return JsonResponse({
                    'status': 'ok',
                    'frame': tdata.get('frame_raw'),
                    'stats': {
                        'min': tdata.get('min'),
                        'max': tdata.get('max'),
                        'mean': tdata.get('mean'),
                        'std': tdata.get('std'),
                    },
                    'timestamp': tdata.get('timestamp', ''),
                    'point_index': idx,
                    'concentration': conc,
                    'wavelength': wl
                })
            else:
                return JsonResponse({'status': 'error', 'message': _tl('alerts.point_out_of_range', lang)})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
@require_GET
def api_export_data(request):
    lang = request.session.get('django_language', 'en')
    t = load_translations(lang)
    csv_t = t.get('csv', {})
    meta_t = t.get('csv_meta', {})
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="espectro_sesion_{time.strftime("%Y%m%d_%H%M%S")}.csv"'
    writer = csv.writer(response)
    with _state_lock:
        writer.writerow(["# =============================================="])
        writer.writerow(["# " + meta_t.get('session_title', 'SPECTROPHOTOMETRY SESSION DATA')])
        writer.writerow(["# =============================================="])
        writer.writerow(["# " + meta_t.get('session_datetime', 'Session date and time:'), time.strftime('%Y-%m-%d %H:%M:%S')])
        writer.writerow(["# " + meta_t.get('meas_mode', 'Measurement mode:'), _state.get('measurement_type', 'N/A')])
        writer.writerow(["# " + meta_t.get('params_m', 'Parameters - M (spectra to average):'), _state.get('m_samples', 1)])
        writer.writerow(["# " + meta_t.get('params_p', 'Parameters - P (final measurements):'), _state.get('p_measurements', 5)])
        st_active = meta_t.get('active', 'Active') if _state['blank_subtraction_active'] else meta_t.get('inactive', 'Inactive')
        writer.writerow(["# " + meta_t.get('blank_sub', 'Blank subtraction:'), st_active])
        writer.writerow(["# " + csv_t.get('wavelength', 'Wavelength_nm') + " (nm):", ','.join(str(wl) for wl in WAVELENGTHS)])
        writer.writerow(["# " + meta_t.get('path_length', 'Optical path b (cm):'), _state.get('path_length_session', '0.6')])
        writer.writerow(["# " + meta_t.get('epsilon', 'Epsilon (\u03b5):'), _state.get('epsilon_session', 'N/A')])
        cal = _state.get('active_session_calibration_curve')
        st_yes = meta_t.get('yes', 'Yes')
        st_no = meta_t.get('no', 'No')
        if cal:
            writer.writerow(["# " + meta_t.get('cal_model_active', 'Active calibration model:'), st_yes])
            writer.writerow(["# " + meta_t.get('cal_slope', 'Calibration slope (m):'), cal[0]])
            writer.writerow(["# " + meta_t.get('cal_intercept', 'Calibration intercept (b):'), cal[1]])
            writer.writerow(["# " + meta_t.get('cal_r2', 'Calibration R\u00b2:'), cal[2]])
            writer.writerow(["# " + meta_t.get('cal_wl', 'Calibration \u03bb (nm):'), cal[3] if len(cal) > 3 else 'N/A'])
            writer.writerow(["# " + meta_t.get('cal_type', 'Fit type:'), meta_t.get('linear_session', 'Linear (session)')])
        else:
            writer.writerow(["# " + meta_t.get('cal_model_active', 'Active calibration model:'), st_no])
        tm = _state.get('active_transfer_model', {})
        if tm:
            for wl_key, params in tm.items():
                line_tm = meta_t.get('transfer_model', 'Transfer model @{wl}nm:').format(wl=wl_key)
                writer.writerow(["# " + line_tm, f"m={params[0]:.6f}", f"b={params[1]:.6f}", f"R2={params[2]:.6f}"])
        hw = is_hardware_available()
        writer.writerow(["# " + meta_t.get('hw_available', 'Hardware available:')])
        writer.writerow(["#   " + meta_t.get('spectro', 'Spectrophotometer (AS726X):'), st_yes if hw.get('smbus2') else st_no])
        writer.writerow(["#   " + meta_t.get('thermal_cam', 'Thermal camera (MLX90640):'), st_yes if hw.get('adafruit_mlx90640') else st_no])
        writer.writerow(["#   " + meta_t.get('gpio_led', 'GPIO (LED):'), st_yes if hw.get('rpi_gpio') else st_no])
        st_sync = meta_t.get('active', 'Active') if _state.get('thermal_sync_enabled', False) else meta_t.get('inactive', 'Inactive')
        writer.writerow(["# " + meta_t.get('thermal_sync', 'Synchronized thermal capture:'), st_sync])
        writer.writerow([])
        writer.writerow(["# =============================================="])
        writer.writerow(["# " + meta_t.get('ref_block_title', 'REFERENCE VALUES (I0)')])
        writer.writerow(["# =============================================="])
        if _state['last_calibration_values']:
            header_i0 = [csv_t.get('label', 'Label')] + [f"I0_{wl}nm" for wl in WAVELENGTHS]
            writer.writerow(header_i0)
            writer.writerow(["Referencia_I0"] + [f"{v:.6f}" for v in _state['last_calibration_values']])
        else:
            writer.writerow(["# " + meta_t.get('ref_not_measured', 'Reference I0 was not measured in this session')])
        if _state['calibration_data_raw']:
            writer.writerow([])
            writer.writerow(["# " + meta_t.get('raw_cal_data', 'Raw calibration data:')])
            header_cal_raw = [csv_t.get('label', 'Label')] + [f"{wl}nm" for wl in WAVELENGTHS]
            writer.writerow(header_cal_raw)
            for line in _state['calibration_data_raw']:
                parts = line.strip().split(',')
                writer.writerow(parts)
        thermal = get_thermal_camera()
        thermal_stats = thermal.get_stats()
        if thermal_stats:
            writer.writerow([])
            writer.writerow(["# " + meta_t.get('thermal_range_ref', 'Reference thermal range:')])
            writer.writerow(["# " + csv_t.get('min', 'Min (C)') + ":", f"{thermal_stats['min']:.2f}"])
            writer.writerow(["# " + csv_t.get('max', 'Max (C)') + ":", f"{thermal_stats['max']:.2f}"])
            writer.writerow(["# " + csv_t.get('mean', 'Mean (C)') + ":", f"{thermal_stats['mean']:.2f}"])
        writer.writerow([])
        writer.writerow(["# =============================================="])
        writer.writerow(["# " + meta_t.get('curve_points_title', 'CALIBRATION / CONCENTRATION CURVE POINTS')])
        writer.writerow(["# =============================================="])
        if _state.get('cal_curve_points'):
            writer.writerow(["# " + meta_t.get('cal_curve_subtitle', 'Calibration Curve (A_custom vs Concentration):')])
            writer.writerow([csv_t.get('concentration', 'Conc'), csv_t.get('abs_custom', 'Abs_Custom'), csv_t.get('wavelength', 'Wavelength_nm'), "Abs_Ref"])
            for p in _state['cal_curve_points']:
                writer.writerow([f"{p['conc']:.6e}", p['abs_custom'], p['wl'], p['abs_ref'] if not np.isnan(p['abs_ref']) else 'NaN'])
            writer.writerow([])
        if _state.get('conc_curve_points'):
            writer.writerow(["# " + meta_t.get('conc_curve_subtitle', 'Concentration Curve (X vs Y):')])
            writer.writerow(["X_Valor", "Y_Valor", "Y_Tipo", csv_t.get('wavelength', 'Wavelength_nm')])
            for p in _state['conc_curve_points']:
                writer.writerow([f"{p['x']:.6e}", p['y'], p['y_type'], p['wl']])
            writer.writerow([])
        writer.writerow(["# =============================================="])
        writer.writerow(["# " + meta_t.get('meas_data_title', 'MEASUREMENT DATA')])
        writer.writerow(["# =============================================="])
        header = [csv_t.get('timestamp', 'Timestamp'), csv_t.get('index_p', 'Index_P'), csv_t.get('label', 'Label')]
        for wl in WAVELENGTHS:
            header.append(f"{csv_t.get('i_raw', 'I_raw')}_{wl}nm")
        if _state['blank_subtraction_active']:
            for wl in WAVELENGTHS:
                header.append(f"{csv_t.get('i_net', 'I_net')}_{wl}nm")
        for wl in WAVELENGTHS:
            header.append(f"{csv_t.get('absorbance', 'A')}_{wl}nm")
        for wl in WAVELENGTHS:
            header.append(f"{csv_t.get('transmittance', 'T')}_{wl}nm")
        header.append(csv_t.get('concentration', 'Conc'))
        has_thermal_data = any(td is not None for td in _state.get('sequential_thermal_data', [])) if _state.get('sequential_thermal_data') else False
        if has_thermal_data or _state.get('thermal_sync_enabled', False):
            header.extend([csv_t.get('timestamp', 'Timestamp') + "_Thermal", csv_t.get('mean', 'T_mean'), csv_t.get('min', 'T_min'), csv_t.get('max', 'T_max'), csv_t.get('std', 'T_std')])
            header.extend([f"{csv_t.get('hist_bin', 'Bin')}_{i}" for i in range(1, 26)])
            for r_idx in range(24):
                for c_idx in range(32):
                    header.append(f"Px_{r_idx}_{c_idx}")
        writer.writerow(header)
        i0 = _state['last_calibration_values']
        for idx, line in enumerate(_state['measurement_data_raw']):
            parts = line.strip().split(',')
            label = parts[0] if len(parts) > 0 else f"P{idx+1}"
            raw_vals = []
            for j in range(1, min(7, len(parts))):
                try:
                    raw_vals.append(float(parts[j]))
                except (ValueError, IndexError):
                    raw_vals.append(float('nan'))
            while len(raw_vals) < 6:
                raw_vals.append(float('nan'))
            row = [time.strftime('%Y-%m-%d %H:%M:%S'), idx + 1, label]
            for v in raw_vals:
                row.append(f"{v:.6f}" if not np.isnan(v) else "NaN")
            if _state['blank_subtraction_active'] and i0:
                for j in range(6):
                    net = max(0, raw_vals[j] - i0[j]) if not np.isnan(raw_vals[j]) else float('nan')
                    row.append(f"{net:.6f}" if not np.isnan(net) else "NaN")
            if i0:
                for j in range(6):
                    if i0[j] > 1e-9 and not np.isnan(raw_vals[j]):
                        ratio = raw_vals[j] / i0[j]
                        a_val = -np.log10(ratio) if ratio > 1e-9 else float('nan')
                    else:
                        a_val = float('nan')
                    row.append(f"{a_val:.6f}" if not np.isnan(a_val) else "NaN")
            else:
                row.extend(["NaN"] * 6)
            if i0:
                for j in range(6):
                    if i0[j] > 1e-9 and not np.isnan(raw_vals[j]):
                        t_val = (raw_vals[j] / i0[j]) * 100
                    else:
                        t_val = float('nan')
                    row.append(f"{t_val:.4f}" if not np.isnan(t_val) else "NaN")
            else:
                row.extend(["NaN"] * 6)
            conc_val = float('nan')
            if cal and i0:
                try:
                    wl_cal = cal[3] if len(cal) > 3 else 650
                    idx_wl = WAVELENGTHS.index(wl_cal)
                    if i0[idx_wl] > 1e-9 and not np.isnan(raw_vals[idx_wl]):
                        ratio = raw_vals[idx_wl] / i0[idx_wl]
                        a_at_wl = -np.log10(ratio) if ratio > 1e-9 else float('nan')
                        if not np.isnan(a_at_wl) and abs(cal[0]) > 1e-12:
                            conc_val = (a_at_wl - cal[1]) / cal[0]
                except (ValueError, IndexError):
                    pass
            row.append(f"{conc_val:.6e}" if not np.isnan(conc_val) else "NaN")
            if has_thermal_data or _state.get('thermal_sync_enabled', False):
                seq_td = _state.get('sequential_thermal_data', [])
                if idx < len(seq_td) and seq_td[idx]:
                    td = seq_td[idx]
                    row.extend([
                        td.get('timestamp', 'NaN'),
                        f"{td.get('mean', float('nan')):.2f}",
                        f"{td.get('min', float('nan')):.2f}",
                        f"{td.get('max', float('nan')):.2f}",
                        f"{td.get('std', float('nan')):.2f}",
                    ])
                    if 'hist_counts' in td and td['hist_counts']:
                        row.extend([str(c) for c in td['hist_counts']])
                    else:
                        row.extend(['NaN'] * 25)
                    if 'frame' in td and td['frame']:
                        row.extend([f"{v:.2f}" for v in td['frame']])
                    else:
                        row.extend(['NaN'] * 768)
                else:
                    row.extend(["NaN"] * (5 + 25 + 768))
            writer.writerow(row)
    return response
@require_POST
def api_conc_curve_measure(request):
    global _state
    with _state_lock:
        lang = request.session.get('django_language', 'en')
        data = json.loads(request.body)
        wl = int(data.get('wavelength', 650))
        y_type = data.get('y_type', 'Intensidad')
        if not _state['is_connected']:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.not_connected', lang)}, status=400)
        try:
            spectrum = _read_real_spectrum(lang)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
        idx = WAVELENGTHS.index(wl)
        if y_type in ['Intensidad', 'Intensity']:
            value = spectrum[idx]
            if _state['blank_subtraction_active'] and _state['last_calibration_values']:
                value = max(0, value - _state['last_calibration_values'][idx])
        elif y_type in ['Absorbancia', 'Absorbance', 'Transmitancia', 'Transmittance']:
            if _state['last_calibration_values'] is None:
                return JsonResponse({'status': 'error', 'message': _tl('alerts.missing_ref_i0', lang)}, status=400)
            i0 = _state['last_calibration_values'][idx]
            iv = spectrum[idx]
            if _state['blank_subtraction_active']:
                iv = max(0, iv - i0)
            if i0 > 1e-9:
                ratio = iv / i0
                if y_type in ['Absorbancia', 'Absorbance']:
                    value = -np.log10(ratio) if ratio > 1e-9 else float('nan')
                else:
                    value = ratio * 100
            else:
                value = float('nan')
        else:
            value = spectrum[idx]
        _log('logs.measuring_live', False, lang, vals=f"{y_type}@{wl}nm = {value:.4f}")
        return JsonResponse({'status': 'ok', 'value': value, 'is_real_hw': not _state['simulation_mode']})
@require_POST
def api_conc_curve_add_point(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    point = {
        'x': float(data.get('x', 0)),
        'y': float(data.get('y', 0)),
        'y_type': data.get('y_type', 'Intensidad'),
        'wl': int(data.get('wl', 650)),
    }
    with _state_lock:
        _state['conc_curve_points'].append(point)
        _log('logs.seq_point', False, lang, n=len(_state['conc_curve_points']), vals=f"X:{point['x']:.4f}, Y:{point['y']:.4f}")
    return JsonResponse({'status': 'ok', 'points': _state['conc_curve_points']})
@require_POST
def api_conc_curve_remove_point(request):
    data = json.loads(request.body)
    idx = int(data.get('index', -1))
    y_type = data.get('y_type', '')
    wl = int(data.get('wl', 650))
    filtered = [p for p in _state['conc_curve_points'] if p['y_type'] == y_type and p['wl'] == wl]
    filtered.sort(key=lambda p: p['x'])
    if 0 <= idx < len(filtered):
        point_to_remove = filtered[idx]
        _state['conc_curve_points'].remove(point_to_remove)
    return JsonResponse({'status': 'ok', 'points': _state['conc_curve_points']})
@require_POST
def api_conc_curve_clear(request):
    data = json.loads(request.body)
    if data.get('clear_all', False):
        _state['conc_curve_points'] = []
    else:
        y_type = data.get('y_type', '')
        wl = int(data.get('wl', 650))
        _state['conc_curve_points'] = [p for p in _state['conc_curve_points']
                                        if not (p['y_type'] == y_type and p['wl'] == wl)]
    return JsonResponse({'status': 'ok'})
@require_GET
def api_conc_curve_data(request):
    y_type = request.GET.get('y_type', '')
    wl = int(request.GET.get('wl', 650))
    filtered = sorted(
        [p for p in _state['conc_curve_points'] if p['y_type'] == y_type and p['wl'] == wl],
        key=lambda p: p['x']
    )
    return JsonResponse({'status': 'ok', 'points': filtered, 'all_points': _state['conc_curve_points']})
@require_POST
def api_cal_curve_measure(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    wl = int(data.get('wavelength', 650))
    if not _state['is_connected']:
        return JsonResponse({'status': 'error', 'message': _tl('alerts.not_connected', lang)}, status=400)
    if _state['last_calibration_values'] is None:
        return JsonResponse({'status': 'error', 'message': _tl('alerts.missing_ref_i0', lang)}, status=400)
    try:
        spectrum = _read_real_spectrum(lang)
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)
    idx = WAVELENGTHS.index(wl)
    i0 = _state['last_calibration_values'][idx]
    iv = spectrum[idx]
    if _state['blank_subtraction_active']:
        iv = max(0, iv - i0)
    if i0 > 1e-9:
        ratio = iv / i0
        value = -np.log10(ratio) if ratio > 1e-9 else float('nan')
    else:
        value = float('nan')
    _log('logs.measuring_live', False, lang, vals=f"A_custom@{wl}nm = {value:.4f}")
    return JsonResponse({'status': 'ok', 'value': value, 'is_real_hw': not _state['simulation_mode']})
@require_POST
def api_cal_curve_add_point(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    point = {
        'conc': float(data.get('conc', 0)),
        'abs_custom': float(data.get('abs_custom', 0)),
        'wl': int(data.get('wl', 650)),
        'abs_ref': float(data.get('abs_ref', 'nan')) if data.get('abs_ref') else float('nan'),
    }
    with _state_lock:
        _state['cal_curve_points'].append(point)
        _recalculate_cal_fits()
        _log('logs.seq_point', False, lang, n=len(_state['cal_curve_points']), vals=f"C={point['conc']}, A={point['abs_custom']:.4f}")
    return JsonResponse({'status': 'ok', 'fit': _get_cal_fit_results(point['wl'])})
def _recalculate_cal_fits():
    _state['cal_fit_abs_vs_conc'] = {}
    _state['cal_fit_transfer_model'] = {}
    all_points = _state['cal_curve_points']
    if len(all_points) < 2:
        return
    wls = set(p['wl'] for p in all_points)
    for wl in wls:
        pts = sorted([p for p in all_points if p['wl'] == wl], key=lambda p: p['conc'])
        if len(pts) >= 2:
            conc = [p['conc'] for p in pts]
            abs_c = [p['abs_custom'] for p in pts]
            try:
                res = linregress(conc, abs_c)
                if not (np.isnan(res.slope) or np.isnan(res.intercept)):
                    _state['cal_fit_abs_vs_conc'][str(wl)] = {
                        'slope': res.slope, 'intercept': res.intercept,
                        'r_squared': res.rvalue**2, 'wl': wl
                    }
            except Exception:
                pass
        transfer_pts = [p for p in pts if not np.isnan(p['abs_ref'])]
        if len(transfer_pts) >= 2:
            abs_c = [p['abs_custom'] for p in transfer_pts]
            abs_r = [p['abs_ref'] for p in transfer_pts]
            try:
                res_tm = linregress(abs_c, abs_r)
                if not (np.isnan(res_tm.slope) or np.isnan(res_tm.intercept)):
                    _state['cal_fit_transfer_model'][str(wl)] = {
                        'slope': res_tm.slope, 'intercept': res_tm.intercept,
                        'r_squared': res_tm.rvalue**2, 'wl': wl
                    }
            except Exception:
                pass
def _get_cal_fit_results(wl=None):
    if wl is not None:
        return {
            'abs_vs_conc': _state['cal_fit_abs_vs_conc'].get(str(wl)),
            'transfer_model': _state['cal_fit_transfer_model'].get(str(wl)),
        }
    return {
        'abs_vs_conc': _state['cal_fit_abs_vs_conc'],
        'transfer_model': _state['cal_fit_transfer_model'],
    }
@require_POST
def api_cal_curve_remove_point(request):
    data = json.loads(request.body)
    idx = int(data.get('index', -1))
    wl = int(data.get('wl', 650))
    pts = sorted([p for p in _state['cal_curve_points'] if p['wl'] == wl], key=lambda p: p['conc'])
    if 0 <= idx < len(pts):
        _state['cal_curve_points'].remove(pts[idx])
    _recalculate_cal_fits()
    return JsonResponse({'status': 'ok', 'fit': _get_cal_fit_results(wl)})
@require_POST
def api_cal_curve_clear(request):
    data = json.loads(request.body)
    if data.get('clear_all', False):
        _state['cal_curve_points'] = []
    else:
        wl = int(data.get('wl', 650))
        _state['cal_curve_points'] = [p for p in _state['cal_curve_points'] if p['wl'] != wl]
    _recalculate_cal_fits()
    return JsonResponse({'status': 'ok'})
@require_POST
def api_cal_curve_apply(request):
    lang = request.session.get('django_language', 'en')
    t = load_translations(lang)
    data = json.loads(request.body)
    wl = int(data.get('wl', 650))
    msgs = []
    fit_avc = _state['cal_fit_abs_vs_conc'].get(str(wl))
    if fit_avc:
        _state['active_session_calibration_curve'] = [
            fit_avc['slope'], fit_avc['intercept'], fit_avc['r_squared'], wl
        ]
        msg = t.get('sidebar', {}).get('ref_params_saved', 'Session curve applied') + f" ({wl}nm)"
        msgs.append(msg)
    fit_tm = _state['cal_fit_transfer_model'].get(str(wl))
    if fit_tm:
        _state['active_transfer_model'][str(wl)] = [fit_tm['slope'], fit_tm['intercept'], fit_tm['r_squared']]
        msg = t.get('charts', {}).get('transfer_model', 'Transfer model applied') + f" ({wl}nm)"
        msgs.append(msg)
    else:
        if str(wl) in _state['active_transfer_model']:
            del _state['active_transfer_model'][str(wl)]
    if msgs:
        _log("; ".join(msgs), False, lang)
    return JsonResponse({'status': 'ok', 'messages': msgs})
@require_GET
def api_cal_curve_data(request):
    wl = int(request.GET.get('wl', 650))
    pts = sorted([p for p in _state['cal_curve_points'] if p['wl'] == wl], key=lambda p: p['conc'])
    _recalculate_cal_fits()
    return JsonResponse({'status': 'ok', 'points': pts, 'fit': _get_cal_fit_results(wl)})
@require_GET
def api_cal_curve_save_file(request):
    wl = int(request.GET.get('wl', 650))
    pts = [p for p in _state['cal_curve_points'] if p['wl'] == wl]
    lang = request.session.get('django_language', 'en')
    t = load_translations(lang)
    csv_t = t.get('csv', {})
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="cal_data_wl{wl}.csv"'
    writer = csv.writer(response)
    writer.writerow([
        csv_t.get('concentration', 'Concentration'),
        csv_t.get('abs_custom', 'Abs_Custom'),
        csv_t.get('wavelength', 'Wavelength_nm'),
        csv_t.get('abs_ref_opt', 'Reference_Abs_Optional')
    ])
    for p in pts:
        writer.writerow([p['conc'], p['abs_custom'], p['wl'], p['abs_ref'] if not np.isnan(p['abs_ref']) else 'nan'])
    return response
@require_POST
def api_cal_curve_load_file(request):
    if 'file' not in request.FILES:
        return JsonResponse({'status': 'error', 'message': 'No file uploaded'}, status=400)
    wl = int(request.POST.get('wl', 650))
    f = request.FILES['file']
    content = f.read().decode('utf-8-sig')
    reader = csv.reader(io.StringIO(content))
    next(reader)
    _state['cal_curve_points'] = [p for p in _state['cal_curve_points'] if p['wl'] != wl]
    for row in reader:
        if len(row) == 4:
            conc, abs_c, wl_file, abs_r = row
            if int(wl_file) == wl:
                _state['cal_curve_points'].append({
                    'conc': float(conc),
                    'abs_custom': float(abs_c),
                    'wl': int(wl_file),
                    'abs_ref': float(abs_r) if abs_r != 'nan' else float('nan'),
                })
    _recalculate_cal_fits()
    return JsonResponse({'status': 'ok', 'fit': _get_cal_fit_results(wl)})
@require_POST
def api_thermal_start(request):
    lang = request.session.get('django_language', 'en')
    thermal = get_thermal_camera()
    if not thermal.is_connected:
        if not ADAFRUIT_AVAILABLE:
            _log('logs.thermal_lib_missing', True, lang)
            return JsonResponse({'status': 'error', 'message': _tl('logs.thermal_lib_missing', lang)}, status=500)
        try:
            thermal.connect()
            thermal.start_acquisition()
            _state['thermal_active'] = True
            _log('logs.connect_success_thermal', False, lang)
        except Exception as e:
            _state['thermal_active'] = False
            _log('logs.hw_failure', True, lang, hw='MLX90640', e=str(e))
            return JsonResponse({'status': 'error', 'message': _tl('alerts.hw_failure', lang, hw='MLX90640', e=str(e))}, status=500)
    else:
        _state['thermal_active'] = True
        if not thermal._acquiring:
            thermal.start_acquisition()
    return JsonResponse({'status': 'ok'})
@require_POST
def api_thermal_stop(request):
    lang = request.session.get('django_language', 'en')
    thermal = get_thermal_camera()
    thermal.stop_acquisition()
    _state['thermal_active'] = False
    _log('logs.thermal_stopped', False, lang)
    return JsonResponse({'status': 'ok'})
@require_GET
def api_thermal_data(request):
    lang = request.session.get('django_language', 'en')
    thermal = get_thermal_camera()
    with _state_lock:
        frame = thermal.get_frame()
        stats = thermal.get_stats()
        if frame is None and _state['thermal_active']:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.no_thermal_frame', lang)}, status=500)
        flat = []
        if stats and frame:
            for row in frame:
                flat.extend(row)
            if len(flat) > 0:
                mean = sum(flat) / len(flat)
                variance = sum((v - mean) ** 2 for v in flat) / len(flat)
                stats['std'] = variance ** 0.5
        if _state['thermal_is_measuring'] and stats and frame:
            elapsed = time.time() - _state['thermal_measurement_start_time']
            _state['thermal_frame_counter'] += 1
            hist_counts = [0] * 25
            t_min = stats['min']
            t_max = stats['max']
            rng = (t_max - t_min) if (t_max - t_min) > 0 else 1.0
            for val in flat:
                b = int((val - t_min) / rng * 25)
                b = max(0, min(b, 24))
                hist_counts[b] += 1
            row = [
                round(elapsed, 2),
                _state['thermal_frame_counter'],
                stats['min'],
                stats['max'],
                stats['mean'],
                stats.get('std', 0.0),
            ]
            row.extend(hist_counts)
            row.extend([round(v, 2) for v in flat])
            _state['thermal_measurement_data'].append(row)
            if len(_state['thermal_measurement_data']) > 5000:
                _state['thermal_measurement_data'] = _state['thermal_measurement_data'][-3000:]
    return JsonResponse({
        'status': 'ok',
        'active': _state['thermal_active'],
        'frame': frame,
        'stats': stats,
        'is_measuring': _state['thermal_is_measuring'],
        'measurement_data': [r[:6] for r in _state['thermal_measurement_data'][-10:]] if _state['thermal_measurement_data'] else [],
        'is_real_hw': thermal.is_connected,
    })
@require_POST
def api_thermal_start_measurement(request):
    lang = request.session.get('django_language', 'en')
    _state['thermal_is_measuring'] = True
    _state['thermal_measurement_data'] = []
    _state['thermal_measurement_start_time'] = time.time()
    _state['thermal_frame_counter'] = 0
    _log('logs.thermal_meas_started', False, lang)
    return JsonResponse({'status': 'ok'})
@require_POST
def api_thermal_stop_measurement(request):
    lang = request.session.get('django_language', 'en')
    _state['thermal_is_measuring'] = False
    _log('logs.thermal_meas_stopped', False, lang)
    return JsonResponse({'status': 'ok', 'data_count': len(_state['thermal_measurement_data'])})
@require_GET
def api_thermal_save_measurement(request):
    lang = request.session.get('django_language', 'en')
    t = load_translations(lang)
    csv_t = t.get('csv', {})
    meta_t = t.get('csv_meta', {})
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="medicion_termica_{time.strftime("%Y%m%d_%H%M%S")}.csv"'
    writer = csv.writer(response)
    writer.writerow([meta_t.get('thermal_controls', 'THERMAL MEASUREMENT CONFIGURATION').upper()])
    writer.writerow([f"{csv_t.get('timestamp', 'Timestamp')}:,{time.strftime('%Y-%m-%d %H:%M:%S')}"])
    thermal = get_thermal_camera()
    writer.writerow([f"{meta_t.get('hw_available', 'Hardware')}:,MLX90640 REAL"])
    writer.writerow([])
    header = [
        csv_t.get('time_s', 'Time (s)'),
        csv_t.get('frame', 'Frame'),
        csv_t.get('min', 'Min'),
        csv_t.get('max', 'Max'),
        csv_t.get('mean', 'Mean'),
        csv_t.get('std', 'Std_Dev')
    ]
    bin_label = csv_t.get('hist_bin', 'Hist_Bin')
    header.extend([f"{bin_label}_{i}" for i in range(1, 26)])
    for r_idx in range(24):
        for c_idx in range(32):
            header.append(f"Px_{r_idx}_{c_idx}")
    writer.writerow(header)
    for row in _state['thermal_measurement_data']:
        writer.writerow(row)
    return response
@require_POST
def api_toggle_led(request):
    lang = request.session.get('django_language', 'en')
    data = json.loads(request.body)
    active = data.get('active', False)
    with _state_lock:
        if active:
            success = get_gpio().led_on()
        else:
            success = get_gpio().led_off()
        if success:
            _state['led_active'] = active
            st_val = _tl('status.on', lang) if active else _tl('status.off', lang)
            _log('logs.led_toggle', False, lang, status=st_val)
            return JsonResponse({'status': 'ok', 'led_active': active})
        else:
            return JsonResponse({'status': 'error', 'message': _tl('alerts.hw_error', lang)}, status=500)
@require_GET
def api_help(request):
    try:
        lang = request.session.get('django_language', request.COOKIES.get(settings.LANGUAGE_COOKIE_NAME, 'en'))
        t = load_translations(lang)
        help_topics = t.get('help', {})
        return JsonResponse({'status': 'ok', 'topics': help_topics})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)})
@require_GET
def api_stats_session(request):
    with _state_lock:
        meas = _state.get('last_measurement_values')
        cal  = _state.get('last_calibration_values')
        if not meas:
            return JsonResponse({'status': 'ok', 'has_data': False})
        try:
            from scipy.stats import shapiro as scipy_shapiro, skew as scipy_skew, kurtosis as scipy_kurt
            has_scipy = True
        except ImportError:
            has_scipy = False
        meas_arr = np.array(meas, dtype=float)
        cal_arr  = np.array(cal,  dtype=float) if cal else None
        lang = request.session.get('django_language', 'en')
        t = load_translations(lang)
        wl_labels = get_localized_wavelength_labels(t)
        band_stats = []
        for i, wl in enumerate(WAVELENGTHS):
            band = {'wl': wl, 'label': wl_labels[i]}
            band['meas'] = meas_arr[i]
            if cal_arr is not None and cal_arr[i] > 1e-9:
                ratio = meas_arr[i] / cal_arr[i]
                band['abs']   = float(-np.log10(ratio)) if ratio > 1e-9 else float('nan')
                band['trans'] = float(ratio * 100)
            else:
                band['abs'] = band['trans'] = float('nan')
            band_stats.append(band)
        valid = meas_arr[~np.isnan(meas_arr)]
        global_stats = {}
        if len(valid) > 0:
            mean = float(np.mean(valid))
            std  = float(np.std(valid, ddof=1)) if len(valid) > 1 else 0.0
            global_stats = {
                'mean': mean, 'std': std,
                'cv': float(std / abs(mean) * 100) if mean != 0 else float('nan'),
                'min': float(np.min(valid)), 'max': float(np.max(valid)),
                'median': float(np.median(valid)),
                'range': float(np.max(valid) - np.min(valid)),
            }
            if has_scipy and len(valid) >= 3:
                try:
                    from scipy.stats import skew, kurtosis
                    global_stats['skewness']  = float(skew(valid))
                    global_stats['kurtosis']  = float(kurtosis(valid))
                    W, p_sw = scipy_shapiro(valid)
                    global_stats['shapiro_W'] = float(W)
                    global_stats['shapiro_p'] = float(p_sw)
                    global_stats['is_normal'] = bool(p_sw >= 0.05)
                except:
                    pass
        lod_loq = {}
        meas_history = _state.get('measurement_data_raw', [])
        abs_history = []
        if cal_arr is not None:
            cal_history = _state.get('calibration_data_raw', [])
            combined_history = cal_history + [line for line in meas_history if line.startswith('calblanco')]
            for line in combined_history[-30:]:
                parts = line.strip().split(',')
                if len(parts) >= 7:
                    try:
                        vals = [float(parts[i+1]) for i in range(6)]
                        abs_v = _compute_absorbance_spectrum(vals, cal_arr.tolist())
                        if abs_v:
                            wl_target = _state.get('beer_wavelength', 650)
                            try:
                                idx_wl = WAVELENGTHS.index(wl_target)
                                a = abs_v[idx_wl]
                                if not np.isnan(a):
                                    abs_history.append(a)
                            except:
                                pass
                    except Exception:
                        pass
        if len(abs_history) >= 3:
            sigma_blank = float(np.std(abs_history, ddof=1))
            fit = _state.get('active_session_calibration_curve')
            if fit and abs(fit[0]) > 1e-12:
                slope = fit[0]
                lod_loq = {
                    'sigma': sigma_blank,
                    'LOD': float(3 * sigma_blank / abs(slope)),
                    'LOQ': float(10 * sigma_blank / abs(slope)),
                    'wl': fit[3] if len(fit) > 3 else 650,
                }
    return JsonResponse({
        'status': 'ok',
        'has_data': True,
        'measurement_values': list(meas_arr),
        'calibration_values': list(cal_arr) if cal_arr is not None else None,
        'band_stats': band_stats,
        'global_stats': global_stats,
        'lod_loq': lod_loq,
        'wavelengths': WAVELENGTHS,
        'hw_available': is_hardware_available(),
    })