# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

from django.urls import path
from . import views
app_name = 'spectrometer'
urlpatterns = [
    path('', views.index, name='index'),
    path('api/connect/', views.api_connect, name='api_connect'),
    path('api/disconnect/', views.api_disconnect, name='api_disconnect'),
    path('api/led/toggle/', views.api_toggle_led, name='api_toggle_led'),
    path('api/calibrate/', views.api_calibrate, name='api_calibrate'),
    path('api/start_measurement/', views.api_start_measurement, name='api_start_measurement'),
    path('api/stop_measurement/', views.api_stop_measurement, name='api_stop_measurement'),
    path('api/state/', views.api_get_state, name='api_get_state'),
    path('api/calculate_concentration/', views.api_calculate_concentration, name='api_calculate_concentration'),
    path('api/save_ref_cal/', views.api_save_ref_cal, name='api_save_ref_cal'),
    path('api/toggle_blank_subtraction/', views.api_toggle_blank_subtraction, name='api_toggle_blank_subtraction'),
    path('api/set_theme/', views.api_set_theme, name='api_set_theme'),
    path('api/set_plot_type/', views.api_set_plot_type, name='api_set_plot_type'),
    path('api/set_language/', views.api_set_language, name='api_set_language'),
    path('api/set_thermal_sync/', views.api_set_thermal_sync, name='api_set_thermal_sync'),
    path('api/clear_session/', views.api_clear_session, name='api_clear_session'),
    path('api/export_data/', views.api_export_data, name='api_export_data'),
    path('api/conc_curve/measure/', views.api_conc_curve_measure, name='api_conc_curve_measure'),
    path('api/conc_curve/add_point/', views.api_conc_curve_add_point, name='api_conc_curve_add_point'),
    path('api/conc_curve/remove_point/', views.api_conc_curve_remove_point, name='api_conc_curve_remove_point'),
    path('api/conc_curve/clear/', views.api_conc_curve_clear, name='api_conc_curve_clear'),
    path('api/conc_curve/data/', views.api_conc_curve_data, name='api_conc_curve_data'),
    path('api/cal_curve/measure/', views.api_cal_curve_measure, name='api_cal_curve_measure'),
    path('api/cal_curve/add_point/', views.api_cal_curve_add_point, name='api_cal_curve_add_point'),
    path('api/cal_curve/remove_point/', views.api_cal_curve_remove_point, name='api_cal_curve_remove_point'),
    path('api/cal_curve/clear/', views.api_cal_curve_clear, name='api_cal_curve_clear'),
    path('api/cal_curve/apply/', views.api_cal_curve_apply, name='api_cal_curve_apply'),
    path('api/cal_curve/data/', views.api_cal_curve_data, name='api_cal_curve_data'),
    path('api/cal_curve/save_file/', views.api_cal_curve_save_file, name='api_cal_curve_save_file'),
    path('api/cal_curve/load_file/', views.api_cal_curve_load_file, name='api_cal_curve_load_file'),
    path('api/thermal/start/', views.api_thermal_start, name='api_thermal_start'),
    path('api/thermal/stop/', views.api_thermal_stop, name='api_thermal_stop'),
    path('api/thermal/data/', views.api_thermal_data, name='api_thermal_data'),
    path('api/thermal/start_measurement/', views.api_thermal_start_measurement, name='api_thermal_start_measurement'),
    path('api/thermal/stop_measurement/', views.api_thermal_stop_measurement, name='api_thermal_stop_measurement'),
    path('api/thermal/save_measurement/', views.api_thermal_save_measurement, name='api_thermal_save_measurement'),
    path('api/thermal/snapshot_sequential/<str:point_index>/', views.api_thermal_snapshot_sequential, name='api_thermal_snapshot_sequential'),
    path('api/help/', views.api_help, name='api_help'),
    path('api/stats/session/', views.api_stats_session, name='api_stats_session'),
]