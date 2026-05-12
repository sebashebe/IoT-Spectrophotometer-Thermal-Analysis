# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import json
import numpy as np
from django.test import TestCase, Client, override_settings
@override_settings(ROOT_URLCONF='spectro_web.urls')
class APIEndpointTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
    def test_index_returns_200(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
    def test_index_sets_csrf_cookie(self):
        response = self.client.get('/')
        self.assertIn('csrftoken', response.cookies)
    def test_get_state(self):
        response = self.client.get('/api/state/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('is_connected', data)
        self.assertIn('app_state', data)
        self.assertIn('simulation_mode', data)
        self.assertFalse(data['is_connected'])
    def test_set_language(self):
        response = self.client.post(
            '/api/set_language/',
            json.dumps({'language': 'es'}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['language'], 'es')
    def test_set_theme(self):
        response = self.client.post(
            '/api/set_theme/',
            json.dumps({'is_dark': False}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
    def test_clear_session(self):
        response = self.client.post(
            '/api/clear_session/',
            json.dumps({}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
    def test_help_endpoint(self):
        response = self.client.get('/api/help/', {'topic': 'beer_lambert'})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
    def test_stats_session_no_data(self):
        response = self.client.get('/api/stats/session/')
        self.assertEqual(response.status_code, 200)
    def test_export_data(self):
        response = self.client.get('/api/export_data/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
    def test_conc_curve_data(self):
        response = self.client.get('/api/conc_curve/data/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
    def test_cal_curve_data(self):
        response = self.client.get('/api/cal_curve/data/?wl=650')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
@override_settings(ROOT_URLCONF='spectro_web.urls')
class CoreCalculationTests(TestCase):
    def test_absorbance_calculation(self):
        from spectrometer.views import _compute_absorbance_spectrum
        i0 = [100.0, 200.0, 300.0, 400.0, 500.0, 600.0]
        i_values = [50.0, 100.0, 150.0, 200.0, 250.0, 300.0]
        result = _compute_absorbance_spectrum(i_values, i0)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 6)
        for a in result:
            self.assertAlmostEqual(a, -np.log10(0.5), places=4)
    def test_absorbance_with_zero_reference(self):
        from spectrometer.views import _compute_absorbance_spectrum
        i0 = [0.0, 100.0, 0.0, 100.0, 0.0, 100.0]
        i_values = [50.0, 50.0, 50.0, 50.0, 50.0, 50.0]
        result = _compute_absorbance_spectrum(i_values, i0)
        self.assertIsNotNone(result)
        self.assertTrue(np.isnan(result[0]))
        self.assertFalse(np.isnan(result[1]))
        self.assertTrue(np.isnan(result[2]))
    def test_absorbance_none_inputs(self):
        from spectrometer.views import _compute_absorbance_spectrum
        self.assertIsNone(_compute_absorbance_spectrum(None, [1, 2, 3, 4, 5, 6]))
        self.assertIsNone(_compute_absorbance_spectrum([1, 2, 3, 4, 5, 6], None))
    def test_get_value_at_wavelength(self):
        from spectrometer.views import _get_value_at_wl, WAVELENGTHS
        spectrum = [10, 20, 30, 40, 50, 60]
        self.assertEqual(_get_value_at_wl(spectrum, 450), 10)
        self.assertEqual(_get_value_at_wl(spectrum, 650), 60)
        self.assertTrue(np.isnan(_get_value_at_wl(spectrum, 999)))
@override_settings(ROOT_URLCONF='spectro_web.urls')
class ConnectionFlowTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
    def test_calibrate_without_connection_fails(self):
        response = self.client.post(
            '/api/calibrate/',
            json.dumps({}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data['status'], 'error')
    def test_start_measurement_without_connection_fails(self):
        response = self.client.post(
            '/api/start_measurement/',
            json.dumps({'type': 'continuous', 'm_samples': 1, 'p_measurements': 1}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
    def test_concentration_without_data_fails(self):
        from spectrometer.views import _state
        _state['main_plot_type'] = 'ABSORBANCE'
        response = self.client.post(
            '/api/calculate_concentration/',
            json.dumps({'wavelength': 650, 'epsilon': 1, 'path_length': 1}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
@override_settings(ROOT_URLCONF='spectro_web.urls')
class ConcCurveTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        from spectrometer.views import _state
        _state['conc_curve_points'] = []
    def test_add_and_clear_points(self):
        response = self.client.post(
            '/api/conc_curve/add_point/',
            json.dumps({'x': 1.0, 'y': 0.5, 'y_type': 'Absorbance', 'wl': 650}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['points']), 1)
        response = self.client.post(
            '/api/conc_curve/clear/',
            json.dumps({'clear_all': True}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/api/conc_curve/data/')
        data = response.json()
        self.assertEqual(len(data['points']), 0)