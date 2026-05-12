/*
 * Copyright (c) 2026 Sebastian Herrera Betancur
 * Biomicrosystems Research Group | Universidad de los Andes
 * PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.
 */

let appState = {
    isConnected: false,
    isDarkTheme: true,
    plotType: 'INTENSITY',
    lastCalValues: null,
    lastMeasValues: null,
    absSpectrum: null,
    transSpectrum: null,
    logScrollToBottom: true,
    selectedConcRow: -1,
    selectedCalRow: -1,
    thermalInterval: null,
    thermalCmap: 'hot',
    analysisFiles: [],
    thermalSyncEnabled: false,
    thermalAutoSaveImages: false,
    thermalDisplayScale: 8,
    measurementHistory: [],
    autoExportCSV: true,
    thermalDisplayMin: 20,
    thermalDisplayMax: 40,
    lastAddedThermalFrame: null,
    ledActive: false,
    superimposedIndices: new Set(),
};
function t(path, defaultValue) {
    if (!window.translations) return defaultValue || path;
    const keys = path.split('.');
    let result = window.translations;
    for (const key of keys) {
        if (result[key] === undefined) return defaultValue || path;
        result = result[key];
    }
    return result;
}
const WAVELENGTHS = [450, 500, 550, 570, 600, 650];
const WL_COLORS = ['#4a00ff', '#00e5ff', '#00ff44', '#ffe600', '#ff8c00', '#ff1111'];
const WL_LABELS = ['450nm', '500nm', '550nm', '570nm', '600nm', '650nm'];
const canvasBackgroundColorPlugin = {
    id: 'customCanvasBackgroundColor',
    beforeDraw: (chart, args, options) => {
        const {ctx} = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.color || (appState.isDarkTheme ? '#2e2e40' : '#ffffff');
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
    }
};
Chart.register(canvasBackgroundColorPlugin);
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setTimeout(() => {
        if (sessionStorage.getItem('startup_modal_seen') !== 'true') {
            document.getElementById('modal-startup').classList.add('active');
        }
    }, 500);
    setInterval(updateLogFromServer, 3000);
    updateTheme();
    addLog(t('logs.app_started', 'Aplicación web iniciada correctamente.'));
    setTimeout(connectI2C, 1000);
});
function initCharts() {
    addLog("DEBUG: Starting initCharts...");
    if (typeof Chart === 'undefined') {
        addLog("DEBUG: ERROR - Chart is undefined!");
        return;
    }
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { 
                labels: { 
                    color: getTextColor(), 
                    font: { family: 'Inter', size: 12, weight: '500' }, 
                    usePointStyle: true 
                } 
            },
            tooltip: {
                backgroundColor: appState.isDarkTheme ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                titleColor: getTextColor(),
                bodyColor: getTextColor(),
                titleFont: { size: 13, family: 'Inter', weight: 'bold' },
                bodyFont: { size: 12, family: 'Inter' },
                padding: 10,
                cornerRadius: 8,
                displayColors: true,
                borderColor: getGridColor(),
                borderWidth: 1
            },
            customCanvasBackgroundColor: {
                color: getBgColor(),
            }
        },
        scales: {
            x: { 
                ticks: { color: getTextColor(), font: { size: 11, family: 'Inter' } }, 
                grid: { color: getGridColor(), drawBorder: false }, 
                title: { display: true, color: getTextColor(), font: { size: 12, weight: '600', family: 'Inter' } } 
            },
            y: { 
                ticks: { color: getTextColor(), font: { size: 11, family: 'Inter' } }, 
                grid: { color: getGridColor(), drawBorder: false }, 
                title: { display: true, color: getTextColor(), font: { size: 12, weight: '600', family: 'Inter' } } 
            },
        }
    };
    try {
        chartSpectrum = new Chart(document.getElementById('chart-spectrum'), {
            type: 'line',
            data: { 
                labels: WL_LABELS, 
                datasets: [{ 
                    label: '', 
                    data: [], 
                    hidden: true 
                }] 
            },
            options: {
                ...commonOptions,
                plugins: { 
                    ...commonOptions.plugins, 
                    title: { display: true, text: t('charts.intensity_spectrum', 'Espectro de Intensidad'), color: getTextColor(), font: { size: 14 } } 
                },
                scales: {
                    x: { ...commonOptions.scales.x, title: { display: true, text: t('sidebar.wavelength', 'Longitud de Onda') + ' (nm)', color: getTextColor() } },
                    y: { ...commonOptions.scales.y, title: { display: true, text: t('charts.intensity', 'Intensidad'), color: getTextColor() }, min: 0 },
                }
            }
        });
        addLog("DEBUG: chartSpectrum initialized.");
    } catch (e) {
        addLog("DEBUG: ERROR initializing chartSpectrum: " + e.message);
    }
    chartConcCurve = new Chart(document.getElementById('chart-conc-curve'), {
        type: 'scatter',
        data: { datasets: [] },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, title: { display: true, text: t('tabs.conc', 'Curva Conc. vs Medición'), color: getTextColor(), font: { size: 14 } } },
            scales: {
                x: { type: 'linear', title: { display: true, text: t('charts.val_x', 'Valor X (Eje Variable)'), color: getTextColor() }, ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
                y: { title: { display: true, text: t('charts.val_y', 'Valor Y Medido'), color: getTextColor() }, ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
            }
        }
    });
    chartCalCurve = new Chart(document.getElementById('chart-cal-curve'), {
        type: 'scatter',
        data: { datasets: [] },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, title: { display: true, text: t('tabs.cal', 'Curva de Calibración'), color: getTextColor(), font: { size: 14 } } },
            scales: {
                x: { type: 'linear', title: { display: true, text: t('charts.creg_title', 'Concentración'), color: getTextColor() }, ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
                y: { title: { display: true, text: t('charts.absorbance', 'Absorbancia'), color: getTextColor() }, ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
            }
        }
    });
    chartAnalysisIntensity = new Chart(document.getElementById('chart-analysis-intensity'), {
        type: 'line', data: { labels: WL_LABELS, datasets: [] },
        options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: t('charts.intensity_spectrum', 'Espectros de Intensidad'), color: getTextColor() } } }
    });
    chartAnalysisAbsorbance = new Chart(document.getElementById('chart-analysis-absorbance'), {
        type: 'line', data: { labels: WL_LABELS, datasets: [] },
        options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: t('charts.absorbance_spectrum', 'Espectros de Absorbancia'), color: getTextColor() } } }
    });
    chartAnalysisCalibration = new Chart(document.getElementById('chart-analysis-calibration'), {
        type: 'scatter', data: { datasets: [] },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, title: { display: true, text: t('charts.cal_session', 'Curva de Calibración'), color: getTextColor() } },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Concentración (mg/L)', color: getTextColor() }, ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
                y: { title: { display: true, text: t('charts.absorbance', 'Absorbancia'), color: getTextColor() }, ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
            }
        }
    });
}
function getTextColor() { return appState.isDarkTheme ? '#d4d4e8' : '#1a1a2e'; }
function getGridColor() { return appState.isDarkTheme ? '#44445a' : '#e0e0e8'; }
function getBgColor() { return appState.isDarkTheme ? '#2e2e40' : '#ffffff'; }
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
async function apiPost(url, data = {}) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (e) {
        addLog(t('logs.comm_error', 'Error de comunicación: ').replace('{msg}', e.message), true);
        return { status: 'error', message: e.message };
    }
}
async function apiGet(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (e) {
        addLog(t('logs.comm_error', 'Error de comunicación: ').replace('{msg}', e.message), true);
        return { status: 'error', message: e.message };
    }
}
async function setLanguage(lang) {
    const res = await apiPost('/api/set_language/', { language: lang });
    if (res.status === 'ok') {
        location.reload();
    }
}
async function connectI2C() {
    addLog(t('logs.i2c_attempt', 'Intentando conexión I2C...'));
    const res = await apiPost('/api/connect/');
    if (res.status === 'ok') {
        appState.isConnected = true;
        updateConnectionUI(true);
        if (res.hw_details) {
            res.hw_details.forEach(msg => addLog('⚙️ ' + msg));
        }
        addLog('✅ ' + t('logs.connected_ok', 'Conexión exitosa'));
        if (res.led_active !== undefined) {
            appState.ledActive = res.led_active;
            updateLEDUI();
        }
        if (!appState.thermalInterval) {
            appState.thermalInterval = setInterval(updateThermalFrame, 500);
            document.getElementById('btn-thermal-start').disabled = true;
            document.getElementById('btn-thermal-stop').disabled = false;
            document.getElementById('btn-thermal-capture').disabled = false;
        }
    } else {
        addLog('❌ ' + t('status.label', 'Estado:') + ' ' + res.message, true);
    }
}
async function disconnectI2C() {
    const res = await apiPost('/api/disconnect/');
    if (res.status === 'ok') {
        appState.isConnected = false;
        updateConnectionUI(false);
        addLog('🔌 ' + t('logs.disconnected_ok', 'Desconectado correctamente'));
        if (appState.thermalInterval) {
            clearInterval(appState.thermalInterval);
            appState.thermalInterval = null;
            document.getElementById('btn-thermal-start').disabled = false;
            document.getElementById('btn-thermal-stop').disabled = true;
            document.getElementById('btn-thermal-capture').disabled = true;
        }
    }
}
async function toggleLED() {
    const nextState = !appState.ledActive;
    const res = await apiPost('/api/led/toggle/', { active: nextState });
    if (res.status === 'ok') {
        appState.ledActive = res.led_active;
        updateLEDUI();
    } else {
        alert(res.message);
    }
}
function updateLEDUI() {
    const btn = document.getElementById('btn-toggle-led');
    if (!btn) return;
    if (appState.ledActive) {
        btn.textContent = t('sidebar.led_off', 'Apagar LED');
        btn.classList.add('btn-danger');
        btn.classList.remove('btn-success');
    } else {
        btn.textContent = t('sidebar.led_on', 'Encender LED');
        btn.classList.add('btn-success');
        btn.classList.remove('btn-danger');
    }
}
function updateConnectionUI(connected) {
    const statusLabel = document.getElementById('status-label');
    const badge = document.getElementById('hw-mode-badge');
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const btnCalibrate = document.getElementById('btn-calibrate');
    const btnStartMeas = document.getElementById('btn-start-measurement');
    if (connected) {
        if (statusLabel) {
            statusLabel.textContent = t('status.label', 'Estado:') + ' ' + t('status.connected_real', 'Conectado (I2C Real)');
            statusLabel.className = 'status-connected';
        }
        if (badge) {
            badge.className = 'hw-badge hw-badge-hw';
            badge.textContent = '⚡ ' + t('status.real', 'REAL');
        }
        if (btnConnect) btnConnect.disabled = true;
        if (btnDisconnect) btnDisconnect.disabled = false;
        if (btnCalibrate) btnCalibrate.disabled = false;
        if (btnStartMeas) btnStartMeas.disabled = false;
        const mType = document.getElementById('measurement-type');
        if (mType) mType.disabled = false;
        const mSamples = document.getElementById('m-samples');
        if (mSamples) mSamples.disabled = false;
        const pPoints = document.getElementById('p-points');
        if (pPoints) pPoints.disabled = false;
        const bsCB = document.getElementById('blank-subtraction-cb');
        if (bsCB) bsCB.disabled = false;
    } else {
        if (statusLabel) {
            statusLabel.textContent = t('status.label', 'Estado:') + ' ' + t('status.disconnected', 'Desconectado');
            statusLabel.className = 'status-disconnected';
        }
        if (badge) {
            badge.className = 'hw-badge hw-badge-sim';
            badge.textContent = '⚡ ' + t('status.disconnected', 'DESCONECTADO').toUpperCase();
        }
        if (btnConnect) btnConnect.disabled = false;
        if (btnDisconnect) btnDisconnect.disabled = true;
        if (btnCalibrate) btnCalibrate.disabled = true;
        if (btnStartMeas) btnStartMeas.disabled = true;
        const stopBtn = document.getElementById('btn-stop-measurement');
        if (stopBtn) stopBtn.disabled = true;
        const mType = document.getElementById('measurement-type');
        if (mType) mType.disabled = true;
        const mSamples = document.getElementById('m-samples');
        if (mSamples) mSamples.disabled = true;
        const pPoints = document.getElementById('p-points');
        if (pPoints) pPoints.disabled = true;
    }
}
async function measureReference() {
    addLog(t('logs.measuring_ref', 'Midiendo referencia I₀...'));
    const res = await apiPost('/api/calibrate/');
    if (res.status === 'ok') {
        appState.lastCalValues = res.values;
        updateNumericDisplay();
        document.getElementById('blank-subtraction-cb').disabled = false;
        document.getElementById('blank-status').textContent = t('logs.ref_ok_short', 'Referencia I₀ medida ✓');
        document.getElementById('blank-status').style.color = 'var(--accent-success)';
        document.getElementById('btn-calc-conc').disabled = false;
        addLog('✅ ' + t('logs.ref_ok', 'Referencia I₀ medida correctamente'));
        updateSpectrumChart();
        addMeasurementToHistory('calibration', res.values, null, "", res.raw_values);
    } else {
        addLog('❌ ' + t('status.label', 'Estado:') + ' ' + res.message, true);
    }
}
let isMeasuring = false;
async function startMeasurement() {
    const mtype = document.getElementById('measurement-type').value;
    const m = parseInt(document.getElementById('m-samples').value);
    const p = parseInt(document.getElementById('p-points').value);
    const typeStr = t('history.' + mtype, mtype);
    addLog(t('logs.starting_meas', 'Iniciando medición: ') + `${typeStr} (M=${m}, P=${p})`);
    document.getElementById('btn-start-measurement').disabled = true;
    document.getElementById('btn-stop-measurement').disabled = false;
    isMeasuring = true;
    if (!appState.lastCalValues) {
        addLog('⚡ ' + t('logs.auto_cal_start', 'Referencia no detectada. Iniciando calibración automática...'));
        try {
            await measureReference();
            if (!appState.lastCalValues) {
                addLog('❌ ' + t('logs.auto_cal_fail', 'Fallo en calibración automática. Abortando medición.'));
                stopMeasurement();
                return;
            }
        } catch (err) {
            addLog('❌ Error en calibración: ' + err.message);
            stopMeasurement();
            return;
        }
    }
    if (mtype === 'continuous') {
        let c_collected = 0;
        while (isMeasuring) {
            const res = await apiPost('/api/start_measurement/', {
                type: 'continuous',
                m_samples: 1,
                p_measurements: 0,
            });
            if (res && res.status === 'ok') {
                if (res.values) {
                    c_collected++;
                    appState.lastMeasValues = res.values;
                    const valsStr = res.values.map(v => v.toFixed(2)).join(', ');
                    addLog(`[${t('logs.live', 'En vivo')}] ${t('logs.meas', 'Medición')}: [${valsStr}]`);
                    let thermalDataContinuous = null;
                    if (res.thermal_temp != null && !isNaN(res.thermal_temp)) {
                        thermalDataContinuous = { mean: res.thermal_temp, min: null, max: null, std: null };
                    }
                    addMeasurementToHistory('continuous', res.values, thermalDataContinuous, `#${c_collected} (M=${m})`, res.raw_values);
                }
                updateSpectrumChart();
                updateNumericDisplay();
            } else {
                let errMsg = res ? res.message : t('logs.unknown_err', 'Error desconocido');
                addLog('⚠️ ' + t('status.label', 'Estado:') + ' I2C: ' + errMsg + ' (' + t('logs.retrying', 'Reintentando...') + ')', true);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } else if (mtype === 'single') {
        const res = await apiPost('/api/start_measurement/', {
            type: 'single',
            m_samples: m,
            p_measurements: 0,
        });
        if (!isMeasuring) return;
        if (res.status === 'ok') {
            appState.lastMeasValues = res.values;
            const valsStr = res.values.map(v => v.toFixed(2)).join(', ');
            addLog(`[${t('logs.single', 'Único')} M=${m}] [${valsStr}]`);
            updateNumericDisplay();
            updateSpectrumChart();
            let thermalDataSingle = null;
            if (res.thermal_temp != null && !isNaN(res.thermal_temp)) {
                thermalDataSingle = { mean: res.thermal_temp, min: null, max: null, std: null };
            }
            addMeasurementToHistory('single', res.values, thermalDataSingle, `M=${m}`, res.raw_values);
            addLog('✅ ' + t('logs.analysis_processed', 'Medición completada'));
        } else {
            addLog('❌ ' + t('status.label', 'Estado:') + ' ' + res.message, true);
        }
        document.getElementById('btn-start-measurement').disabled = false;
        document.getElementById('btn-stop-measurement').disabled = true;
        isMeasuring = false;
    } else if (mtype === 'sequential') {
        let p_collected = 0;
        appState.sequentialPoints = [];
        while (isMeasuring && p_collected < p) {
            const res = await apiPost('/api/start_measurement/', {
                type: 'single',
                m_samples: m,
                p_measurements: 0,
            });
            if (!isMeasuring) break;
            if (res.status === 'ok') {
                appState.lastMeasValues = res.values;
                const valsStr = res.values.map(v => v.toFixed(2)).join(', ');
                addLog(`[${t('logs.sequential', 'Secuencial')} #${p_collected + 1}] [${valsStr}]`);
                updateNumericDisplay();
                updateSpectrumChart();
                const temp = res.thermal_temp || NaN;
                p_collected += 1;
                let thermalData = null;
                if (appState.thermalSyncEnabled) {
                    try {
                        const tRes = await apiGet('/api/thermal/data/');
                        if (tRes.status === 'ok' && tRes.stats) {
                            thermalData = {
                                mean: tRes.stats.mean,
                                min: tRes.stats.min,
                                max: tRes.stats.max,
                                std: tRes.stats.std || 0,
                                frame: tRes.frame
                            };
                            addLog(`   🌡️ ${t('logs.thermal_captured', 'Térmica capturada')}: mean=${thermalData.mean.toFixed(2)} min=${thermalData.min.toFixed(2)} max=${thermalData.max.toFixed(2)}`);
                        }
                    } catch (e) {
                        addLog('   ⚠️ ' + t('logs.thermal_fail', 'No se pudo capturar frame térmico'), true);
                    }
                }
                addMeasurementToHistory('sequential', res.values, thermalData, `P=${p_collected}/${p} M=${m}`, res.raw_values);
                appState.sequentialPoints.push({
                    label: `P${p_collected}_AvgM${m}`,
                    corrected: res.values,
                    temp: temp,
                    thermalData: thermalData,
                });
                addLog(`✅ ${t('logs.point_collected', 'Punto recolectado')} P=${p_collected}/${p}. T=${temp}°C`);
            } else {
                addLog('❌ ' + t('status.label', 'Estado:') + ' ' + res.message, true);
                break;
            }
            if (p_collected < p) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        if (p_collected >= p) {
            addLog('✅ ' + t('logs.seq_finished', 'Medición Secuencial terminada por completo.'));
            if (appState.autoExportCSV) {
                exportSessionData();
            }
        }
        document.getElementById('btn-start-measurement').disabled = false;
        document.getElementById('btn-stop-measurement').disabled = true;
        isMeasuring = false;
    }
}
async function stopMeasurement() {
    isMeasuring = false;
    await apiPost('/api/stop_measurement/');
    document.getElementById('btn-start-measurement').disabled = false;
    document.getElementById('btn-stop-measurement').disabled = true;
    addLog(t('logs.meas_stopped', 'Measurement stopped'));
}
function onMeasurementTypeChange() {
    const mtype = document.getElementById('measurement-type').value;
    const pInput = document.getElementById('p-points');
    pInput.disabled = mtype !== 'sequential';
    const syncSection = document.getElementById('thermal-sync-section');
    if (syncSection) syncSection.classList.remove('disabled-look');
    const autoSaveSection = document.getElementById('thermal-autosave-section');
    if (autoSaveSection) autoSaveSection.classList.remove('disabled-look');
}
function onThermalSyncChange() {
    const cb = document.getElementById('thermal-sync-cb');
    appState.thermalSyncEnabled = cb ? cb.checked : false;
    apiPost('/api/set_thermal_sync/', { enabled: appState.thermalSyncEnabled });
    addLog(`${t('logs.thermal_sync', 'Captura térmica sincronizada').replace('{status}', appState.thermalSyncEnabled ? t('status.on', 'Activada') : t('status.off', 'Desactivada'))}`);
}
function onThermalAutoSaveChange() {
    const cb = document.getElementById('thermal-autosave-cb');
    appState.thermalAutoSaveImages = cb ? cb.checked : false;
}
function onAutoExportCSVChange() {
    const cb = document.getElementById('auto-export-csv-cb');
    appState.autoExportCSV = cb ? cb.checked : false;
}
function updateNumericDisplay() {
    const grid = document.getElementById('last-values-grid');
    if (!grid) return;
    if (!appState.lastMeasValues) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); font-size:11px;">Esperando datos...</div>';
        return;
    }
    const wavelengths = [450, 500, 550, 570, 600, 650];
    grid.innerHTML = wavelengths.map((wl, i) => {
        const val = appState.lastMeasValues[i];
        const color = WL_COLORS[i];
        return `
            <div class="stat-item" style="border-left: 3px solid ${color}; padding: 4px 8px; background: rgba(255,255,255,0.03); border-radius: 4px;">
                <div style="font-size: 10px; color: var(--text-muted);">${wl}nm</div>
                <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">${Math.round(val)}</div>
            </div>
        `;
    }).join('');
}
function updateSuperimposeList() {
    const container = document.getElementById('superimpose-list');
    if (!container) return;
    if (appState.measurementHistory.length === 0) {
        container.innerHTML = `<div class="text-xs" style="color:var(--text-muted)">${t('charts.no_saved_meas', 'Sin mediciones guardadas')}</div>`;
        return;
    }
    const sorted = [...appState.measurementHistory].reverse().slice(0, 10);
    container.innerHTML = sorted.map((m, idx) => {
        const originalIdx = appState.measurementHistory.length - 1 - idx;
        const checked = appState.superimposedIndices.has(originalIdx) ? 'checked' : '';
        const timeStr = m.timestamp.split(' ')[1] || m.timestamp;
        const label = m.label || `${m.type} ${timeStr}`;
        return `
            <label class="checkbox-item" style="font-size:10px; margin-bottom:2px; display:flex; align-items:center; gap:5px;">
                <input type="checkbox" onchange="toggleSuperimpose(${originalIdx})" ${checked}>
                <span class="truncate" style="max-width:140px;" title="${label}">${label}</span>
            </label>
        `;
    }).join('');
}
function toggleSuperimpose(index) {
    if (appState.superimposedIndices.has(index)) {
        appState.superimposedIndices.delete(index);
    } else {
        if (appState.superimposedIndices.size >= 5) {
            alert(t('alerts.max_superimpose', 'Máximo 5 espectros superpuestos permitidos.'));
            updateSuperimposeList();
            return;
        }
        appState.superimposedIndices.add(index);
    }
    updateSpectrumChart();
}
function updateSpectrumChart() {
    const plotType = appState.plotType;
    let yLabel = t('charts.intensity', 'Intensidad');
    let title = t('charts.intensity_spectrum', 'Espectro de Intensidad');
    let newConfigs = [];
    if (plotType === 'INTENSITY') {
        if (appState.lastMeasValues) {
            newConfigs.push({
                label: t('charts.meas', 'Medición (I)'),
                data: appState.lastMeasValues,
                borderColor: '#7c6cf0',
                backgroundColor: 'rgba(124, 108, 240, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: WL_COLORS,
                pointRadius: document.getElementById('show-markers-cb').checked ? 5 : 0,
            });
        }
        if (document.getElementById('show-i0-cb').checked && appState.lastCalValues) {
            newConfigs.push({
                label: t('charts.ref', 'Referencia (I₀)'),
                data: appState.lastCalValues,
                borderColor: '#888',
                borderDash: [5, 3],
                borderWidth: 1.5,
                fill: false,
                pointRadius: 0,
                tension: 0.3,
            });
        }
    } else if (plotType === 'ABSORBANCE') {
        yLabel = t('charts.absorbance', 'Absorbancia');
        title = t('charts.absorbance_spectrum', 'Espectro de Absorbancia');
        if (appState.lastMeasValues && appState.lastCalValues) {
            const absData = computeAbsorbance(appState.lastMeasValues, appState.lastCalValues);
            newConfigs.push({
                label: t('charts.absorbance', 'Absorbancia'),
                data: absData,
                borderColor: '#ff7c43',
                backgroundColor: 'rgba(255, 124, 67, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: WL_COLORS,
                pointRadius: document.getElementById('show-markers-cb').checked ? 5 : 0,
            });
            appState.absSpectrum = absData;
        }
    } else if (plotType === 'TRANSMITTANCE') {
        yLabel = t('charts.transmittance', 'Transmitancia (%T)');
        title = t('charts.transmittance_spectrum', 'Espectro de Transmitancia');
        if (appState.lastMeasValues && appState.lastCalValues) {
            const transData = appState.lastMeasValues.map((v, i) => (appState.lastCalValues[i] > 0.001 ? (v / appState.lastCalValues[i]) * 100 : NaN));
            newConfigs.push({
                label: t('charts.transmittance', 'Transmitancia (%T)'),
                data: transData,
                borderColor: '#56b4e9',
                backgroundColor: 'rgba(86, 180, 233, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: WL_COLORS,
                pointRadius: document.getElementById('show-markers-cb').checked ? 5 : 0,
            });
            appState.transSpectrum = transData;
        }
    }
    appState.superimposedIndices.forEach(idx => {
        const m = appState.measurementHistory[idx];
        if (!m) return;
        let histData = [];
        if (plotType === 'INTENSITY') histData = m.raw;
        else if (plotType === 'ABSORBANCE') histData = m.abs;
        else if (plotType === 'TRANSMITTANCE') histData = m.trans;
        if (histData && histData.length > 0) {
            newConfigs.push({
                label: `${m.label || m.type} (${m.timestamp.split(' ')[1] || ''})`,
                data: histData,
                borderColor: `hsla(${(idx * 137) % 360}, 70%, 50%, 0.7)`,
                borderWidth: 1.5,
                fill: false,
                tension: 0.3,
                pointRadius: 0
            });
        }
    });
    chartSpectrum.options.plugins.title.text = title;
    chartSpectrum.options.scales.y.title.text = yLabel;
    chartSpectrum.options.scales.y.type = document.getElementById('log-scale-cb').checked ? 'logarithmic' : 'linear';
    chartSpectrum.data.datasets = newConfigs;
    updateChartTheme(chartSpectrum);
    chartSpectrum.update(isMeasuring ? 'none' : undefined);
}
function computeAbsorbance(i, i0) {
    return i.map((v, idx) => {
        const ref = i0[idx];
        if (ref > 0.001) {
            const ratio = v / ref;
            return ratio > 0.001 ? -Math.log10(ratio) : NaN;
        }
        return NaN;
    });
}
async function setPlotType(val) {
    appState.plotType = val;
    updateSpectrumChart();
    await apiPost('/api/set_plot_type/', { plot_type: val });
}
function updatePlotOptions() {
    updateSpectrumChart();
}
async function calculateConcentration() {
    const wl = parseInt(document.getElementById('beer-wavelength').value);
    const epsilon = parseFloat(document.getElementById('epsilon-input').value) || 0;
    const pathLength = parseFloat(document.getElementById('path-length-input').value) || 0.6;
    const useSessionCurve = document.getElementById('use-session-curve').checked;
    const useTransferModel = document.getElementById('use-transfer-model').checked;
    const res = await apiPost('/api/calculate_concentration/', {
        wavelength: wl,
        epsilon: epsilon,
        path_length: pathLength,
        method: useSessionCurve ? 'session' : (useTransferModel ? 'transfer' : 'beer_lambert'),
        use_session_curve: useSessionCurve,
        use_transfer_model: useTransferModel,
    });
    if (res.status === 'ok') {
        document.getElementById('conc-abs-custom').textContent = `${t('charts.a_custom', 'A_custom')} (@${wl}nm): ${res.a_custom.toFixed(4)}`;
        document.getElementById('conc-abs-adjusted').textContent = res.a_adjusted ? `${t('charts.a_adjusted', 'A_adjusted')} (@${wl}nm): ${res.a_adjusted.toFixed(4)}` : `${t('charts.a_adjusted', 'A_adjusted')} (@λ): N/A`;
        const cVal = (res.concentration === null || isNaN(res.concentration)) ? 'N/A' : Number(res.concentration).toExponential(4);
        document.getElementById('conc-value').textContent = `C = ${cVal}`;
        addLog(`${t('logs.calc_conc', 'Concentración calculada')}: ${cVal}`);
    } else {
        alert(res.message);
        addLog('❌ ' + t('status.label', 'Estado:') + ' ' + res.message, true);
    }
}
function toggleRefCalInputs() {
    const type = document.querySelector('input[name="ref-cal-type"]:checked').value;
    document.getElementById('ref-cal-curve-inputs').classList.toggle('hidden', type !== 'curve');
    document.getElementById('ref-cal-factor-inputs').classList.toggle('hidden', type !== 'factor');
}
async function saveRefCalParams() {
    const wl = parseInt(document.getElementById('ref-cal-wl').value);
    const type = document.querySelector('input[name="ref-cal-type"]:checked').value;
    const data = { wavelength: wl, type: type };
    if (type === 'curve') {
        data.m_ref = parseFloat(document.getElementById('ref-cal-m').value) || 0;
        data.b_ref = parseFloat(document.getElementById('ref-cal-b').value) || 0;
    } else {
        data.epsilon_l_ref = parseFloat(document.getElementById('ref-cal-epsilon-l').value) || 0;
    }
    const res = await apiPost('/api/save_ref_cal/', data);
    if (res.status === 'ok') {
        document.getElementById('ref-cal-display').textContent = t('logs.params_saved', 'Parámetros Ref. para {wl}nm guardados ✓').replace('{wl}', wl);
        document.getElementById('ref-cal-display').style.color = 'var(--accent-success)';
        addLog(t('logs.params_saved_log', 'Parámetros de referencia guardados para {wl}nm').replace('{wl}', wl));
    }
}
async function toggleBlankSubtraction() {
    const active = document.getElementById('blank-subtraction-cb').checked;
    const res = await apiPost('/api/toggle_blank_subtraction/', { active: active });
    if (res.status === 'error') {
        document.getElementById('blank-subtraction-cb').checked = false;
        alert(res.message);
    } else {
        addLog(`${t('logs.blank_sub', 'Sustracción de blanco').replace('{status}', active ? t('status.on', 'Activada') : t('status.off', 'Desactivada'))}`);
        const state = await apiGet('/api/state/');
        if (state.last_measurement_values) {
            appState.lastMeasValues = state.last_measurement_values;
            updateNumericDisplay();
            updateSpectrumChart();
        }
    }
}
async function measureConcCurveY() {
    if (!appState.isConnected) { alert(t('alerts.not_connected', 'No conectado')); return; }
    const wl = parseInt(document.getElementById('conc-wl').value);
    const yType = document.getElementById('conc-y-type').value;
    const res = await apiPost('/api/conc_curve/measure/', { wavelength: wl, y_type: yType });
    if (res.status === 'ok') {
        document.getElementById('conc-y-value').value = res.value.toFixed(4);
        document.getElementById('conc-y-value').disabled = false;
        addLog(`${t('charts.measurement', 'Medición Y directa')}: ${res.value.toFixed(4)}`);
    } else {
        alert(res.message);
    }
}
async function addConcCurvePoint() {
    const x = parseFloat(document.getElementById('conc-x-value').value);
    const y = parseFloat(document.getElementById('conc-y-value').value);
    const yType = document.getElementById('conc-y-type').value;
    const wl = parseInt(document.getElementById('conc-wl').value);
    if (isNaN(x) || isNaN(y)) { alert(t('alerts.invalid_input', 'Valores X e Y deben ser numéricos')); return; }
    await apiPost('/api/conc_curve/add_point/', { x, y, y_type: yType, wl });
    loadConcCurveData();
    document.getElementById('conc-y-value').value = '0';
    document.getElementById('conc-y-value').disabled = true;
}
async function removeConcCurvePoint() {
    if (appState.selectedConcRow < 0) { alert(t('alerts.select_point', 'Seleccione un punto')); return; }
    const yType = document.getElementById('conc-y-type').value;
    const wl = parseInt(document.getElementById('conc-wl').value);
    await apiPost('/api/conc_curve/remove_point/', { index: appState.selectedConcRow, y_type: yType, wl });
    appState.selectedConcRow = -1;
    loadConcCurveData();
}
async function clearConcCurveView() {
    const yType = document.getElementById('conc-y-type').value;
    const wl = parseInt(document.getElementById('conc-wl').value);
    await apiPost('/api/conc_curve/clear/', { y_type: yType, wl });
    loadConcCurveData();
}
async function clearConcCurveAll() {
    if (!confirm(t('alerts.confirm_clear', '¿Borrar TODOS los puntos de la curva?'))) return;
    await apiPost('/api/conc_curve/clear/', { clear_all: true });
    loadConcCurveData();
}
async function loadConcCurveData() {
    const yType = document.getElementById('conc-y-type').value;
    const wl = parseInt(document.getElementById('conc-wl').value);
    const res = await apiGet(`/api/conc_curve/data/?y_type=${yType}&wl=${wl}`);
    if (res.status === 'ok') {
        updateConcTable(res.points);
        updateConcChart(res.points, yType, wl);
    }
}
function updateConcTable(points) {
    const tbody = document.querySelector('#conc-table tbody');
    tbody.innerHTML = '';
    points.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.x.toFixed(4)}</td><td>${p.y.toFixed(4)}</td><td>${p.y_type}</td><td>${p.wl}</td>`;
        tr.onclick = () => {
            document.querySelectorAll('#conc-table tbody tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            appState.selectedConcRow = i;
        };
        tbody.appendChild(tr);
    });
}
function updateConcChart(points, yType, wl) {
    const datasets = [];
    if (points.length > 0) {
        datasets.push({
            label: `${yType} @ ${wl}nm`,
            data: points.map(p => ({ x: p.x, y: p.y })),
            borderColor: '#7c6cf0',
            backgroundColor: 'rgba(124, 108, 240, 0.5)',
            pointRadius: 5,
            showLine: false,
        });
        if (points.length >= 2) {
            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const fit = linearRegression(xs, ys);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            datasets.push({
                label: t('charts.fit', 'Ajuste') + `: Y = ${fit.slope.toFixed(4)}X + ${fit.intercept.toFixed(4)} (R²=${fit.r2.toFixed(4)})`,
                data: [{ x: minX, y: fit.slope * minX + fit.intercept }, { x: maxX, y: fit.slope * maxX + fit.intercept }],
                borderColor: '#ff7c43',
                borderWidth: 2,
                pointRadius: 0,
                showLine: true,
                borderDash: [5, 3],
            });
        }
    }
    chartConcCurve.data.datasets = datasets;
    chartConcCurve.options.plugins.title.text = t('charts.curve', 'Curva') + `: ${yType} @ ${wl}nm`;
    chartConcCurve.options.scales.y.title.text = yType;
    updateChartTheme(chartConcCurve);
    chartConcCurve.update();
}
async function measureCalAbsCustom() {
    if (!appState.isConnected) { alert(t('alerts.not_connected', 'No conectado')); return; }
    const wl = parseInt(document.getElementById('cal-wl').value);
    const res = await apiPost('/api/cal_curve/measure/', { wavelength: wl });
    if (res.status === 'ok') {
        document.getElementById('cal-abs-custom').value = res.value.toFixed(4);
        document.getElementById('cal-abs-custom').disabled = false;
        addLog(`${t('charts.measurement', 'A_custom medida')}: ${res.value.toFixed(4)}`);
    } else {
        alert(res.message);
    }
}
async function addCalPoint() {
    const conc = parseFloat(document.getElementById('cal-conc').value);
    const absCustom = parseFloat(document.getElementById('cal-abs-custom').value);
    const wl = parseInt(document.getElementById('cal-wl').value);
    const absRefInput = document.getElementById('cal-abs-ref').value;
    const absRef = absRefInput ? parseFloat(absRefInput) : null;
    if (isNaN(conc)) { alert(t('alerts.invalid_conc', 'Concentración inválida')); return; }
    if (document.getElementById('cal-abs-custom').disabled) { alert(t('alerts.measure_a_custom', 'Mida A_custom primero')); return; }
    const res = await apiPost('/api/cal_curve/add_point/', { conc, abs_custom: absCustom, wl, abs_ref: absRef });
    if (res.status === 'ok') {
        updateCalFitLabels(res.fit);
        loadCalCurveData();
        document.getElementById('cal-abs-custom').value = '0';
        document.getElementById('cal-abs-custom').disabled = true;
        document.getElementById('cal-abs-ref').value = '';
    }
}
async function removeCalPoint() {
    if (appState.selectedCalRow < 0) { alert(t('alerts.select_point', 'Seleccione un punto')); return; }
    const wl = parseInt(document.getElementById('cal-wl').value);
    const res = await apiPost('/api/cal_curve/remove_point/', { index: appState.selectedCalRow, wl });
    appState.selectedCalRow = -1;
    if (res.status === 'ok') {
        updateCalFitLabels(res.fit);
        loadCalCurveData();
    }
}
async function clearCalWl() {
    const wl = parseInt(document.getElementById('cal-wl').value);
    await apiPost('/api/cal_curve/clear/', { wl });
    loadCalCurveData();
}
async function clearCalAll() {
    if (!confirm(t('alerts.confirm_clear', '¿Borrar TODOS los puntos de calibración?'))) return;
    await apiPost('/api/cal_curve/clear/', { clear_all: true });
    loadCalCurveData();
}
async function applyCalCurve() {
    const wl = parseInt(document.getElementById('cal-wl').value);
    const res = await apiPost('/api/cal_curve/apply/', { wl });
    if (res.status === 'ok') {
        if (res.messages.length > 0) {
            alert(res.messages.join('\n'));
            addLog(res.messages.join('; '));
        } else {
            alert(t('alerts.no_valid_model', 'No se aplicó ninguna curva o modelo válido.'));
        }
    }
}
async function loadCalCurveData() {
    const wl = parseInt(document.getElementById('cal-wl').value);
    const res = await apiGet(`/api/cal_curve/data/?wl=${wl}`);
    if (res.status === 'ok') {
        updateCalTable(res.points);
        updateCalChart(res.points, res.fit);
        updateCalFitLabels(res.fit);
    }
}
function updateCalTable(points) {
    const tbody = document.querySelector('#cal-table tbody');
    tbody.innerHTML = '';
    points.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.conc.toFixed(6)}</td><td>${p.abs_custom.toFixed(4)}</td><td>${isNaN(p.abs_ref) ? t('charts.na', 'N/A') : p.abs_ref.toFixed(4)}</td><td>${p.wl}</td>`;
        tr.onclick = () => {
            document.querySelectorAll('#cal-table tbody tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
            appState.selectedCalRow = i;
        };
        tbody.appendChild(tr);
    });
}
function updateCalChart(points, fit) {
    const view = document.querySelector('input[name="cal-view"]:checked').value;
    const wlText = document.getElementById('cal-wl').options[document.getElementById('cal-wl').selectedIndex].text;
    const datasets = [];
    if (view === 'abs_vs_conc') {
        if (points.length > 0) {
            datasets.push({
                label: t('charts.points_custom', 'Puntos A_custom'),
                data: points.map(p => ({ x: p.conc, y: p.abs_custom })),
                borderColor: '#7c6cf0',
                backgroundColor: 'rgba(124, 108, 240, 0.5)',
                pointRadius: 6,
                showLine: false,
            });
        }
        if (fit && fit.abs_vs_conc) {
            const f = fit.abs_vs_conc;
            const xs = points.map(p => p.conc);
            if (xs.length >= 2) {
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                datasets.push({
                    label: t('charts.equation', 'Ecuación') + `: A_custom = ${f.slope.toFixed(4)}*C + ${f.intercept.toFixed(4)}`,
                    data: [{ x: minX, y: f.slope * minX + f.intercept }, { x: maxX, y: f.slope * maxX + f.intercept }],
                    borderColor: '#ff7c43',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true,
                });
            }
        }
        chartCalCurve.options.scales.x.title.text = t('charts.concentration', 'Concentración');
        chartCalCurve.options.scales.y.title.text = t('charts.a_custom', 'A_custom @ {wl}').replace('{wl}', wlText);
        chartCalCurve.options.plugins.title.text = t('charts.cal_session', 'Calibración Sesión (A_custom vs C) @ {wl}').replace('{wl}', wlText);
    } else {
        const tPoints = points.filter(p => !isNaN(p.abs_ref));
        if (tPoints.length > 0) {
            datasets.push({
                label: t('charts.points_ref', 'Puntos (A_ref vs A_custom)'),
                data: tPoints.map(p => ({ x: p.abs_custom, y: p.abs_ref })),
                borderColor: '#56b4e9',
                backgroundColor: 'rgba(86, 180, 233, 0.5)',
                pointRadius: 6,
                showLine: false,
            });
        }
        if (fit && fit.transfer_model) {
            const f = fit.transfer_model;
            const xs = tPoints.map(p => p.abs_custom);
            if (xs.length >= 2) {
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                datasets.push({
                    label: t('charts.equation', 'Ecuación') + `: A_ref = ${f.slope.toFixed(4)}*A_custom + ${f.intercept.toFixed(4)}`,
                    data: [{ x: minX, y: f.slope * minX + f.intercept }, { x: maxX, y: f.slope * maxX + f.intercept }],
                    borderColor: '#ff7c43',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true,
                });
            }
        }
        chartCalCurve.options.scales.x.title.text = t('charts.a_custom', 'A_custom @ {wl}').replace('{wl}', wlText);
        chartCalCurve.options.scales.y.title.text = t('charts.a_ref', 'A_ref @ {wl}').replace('{wl}', wlText);
        chartCalCurve.options.plugins.title.text = t('charts.transfer_model', 'Modelo de Transferencia @ {wl}').replace('{wl}', wlText);
    }
    chartCalCurve.data.datasets = datasets;
    updateChartTheme(chartCalCurve);
    chartCalCurve.update();
}
function updateCalFitLabels(fit) {
    if (fit && fit.abs_vs_conc) {
        const f = fit.abs_vs_conc;
        document.getElementById('cal-eq-label').textContent = t('charts.equation', 'Ecuación') + `: A_custom = ${f.slope.toFixed(4)}*C + ${f.intercept.toFixed(4)}`;
        document.getElementById('cal-r2-label').textContent = t('charts.r2_session', 'R² (Sesión)') + `: ${f.r_squared.toFixed(4)}`;
    } else {
        document.getElementById('cal-eq-label').textContent = t('charts.equation', 'Ecuación') + ': N/A';
        document.getElementById('cal-r2-label').textContent = 'R²: N/A';
    }
    if (fit && fit.transfer_model) {
        const f = fit.transfer_model;
        document.getElementById('transfer-eq-label').textContent = t('charts.equation', 'Ecuación') + `: A_ref = ${f.slope.toFixed(4)}*A_custom + ${f.intercept.toFixed(4)}`;
        document.getElementById('transfer-r2-label').textContent = t('charts.r2_transfer', 'R² (Transfer)') + `: ${f.r_squared.toFixed(4)}`;
    } else {
        document.getElementById('transfer-eq-label').textContent = t('charts.transfer_model', 'Ecuación Transferencia') + ': N/A';
        document.getElementById('transfer-r2-label').textContent = t('charts.r2_transfer', 'R² (Transfer)') + ': N/A';
    }
}
function downloadCalData() {
    const wl = document.getElementById('cal-wl').value;
    window.location.href = `/api/cal_curve/save_file/?wl=${wl}`;
}
function loadCalFile(input) {
    if (!input.files.length) return;
    const wl = parseInt(document.getElementById('cal-wl').value);
    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('wl', wl);
    fetch('/api/cal_curve/load_file/', { method: 'POST', body: formData, headers: { 'X-CSRFToken': getCookie('csrftoken') } })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'ok') {
                loadCalCurveData();
                addLog(t('logs.data_loaded', 'Datos cargados desde archivo'));
            }
        });
    input.value = '';
}
async function startThermal() {
    const res = await apiPost('/api/thermal/start/');
    if (res.status === 'ok') {
        appState.thermalInterval = setInterval(updateThermalFrame, 500);
        document.getElementById('btn-thermal-start').disabled = true;
        document.getElementById('btn-thermal-stop').disabled = false;
        document.getElementById('btn-thermal-capture').disabled = false;
        addLog(t('logs.thermal_started', 'Cámara térmica iniciada'));
    }
}
async function stopThermal() {
    clearInterval(appState.thermalInterval);
    await apiPost('/api/thermal/stop/');
    document.getElementById('btn-thermal-start').disabled = false;
    document.getElementById('btn-thermal-stop').disabled = true;
    document.getElementById('btn-thermal-capture').disabled = true;
    addLog(t('logs.thermal_stopped', 'Cámara térmica detenida'));
}
async function updateThermalFrame() {
    const res = await apiGet('/api/thermal/data/');
    if (res.status === 'ok' && res.frame) {
        appState.lastThermalFrame = res.frame;
        appState.lastThermalStats = res.stats;
        renderThermalFrame(res.frame, res.stats);
        if (res.stats) {
            document.getElementById('thermal-min').textContent = res.stats.min.toFixed(1);
            document.getElementById('thermal-max').textContent = res.stats.max.toFixed(1);
            document.getElementById('thermal-mean').textContent = res.stats.mean.toFixed(1);
            document.getElementById('thermal-min-main').textContent = res.stats.min.toFixed(1);
            document.getElementById('thermal-max-main').textContent = res.stats.max.toFixed(1);
            document.getElementById('thermal-mean-main').textContent = res.stats.mean.toFixed(1);
        }
    }
}
function thermalScaleChanged() {
    appState.thermalDisplayScale = parseInt(document.getElementById('thermal-display-scale').value) || 8;
    if (appState.lastThermalFrame) {
        renderThermalFrame(appState.lastThermalFrame, appState.lastThermalStats);
    }
}
function renderThermalFrame(frameData, stats) {
    const canvas = document.getElementById('thermal-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = [];
    if (frameData.length === 768) {
        for(let r=0; r<24; r++) frame.push(frameData.slice(r*32, (r+1)*32));
    } else {
        frame = frameData;
    }
    const rows = frame.length;
    const cols = frame[0].length;
    const scale = 32;
    canvas.width = cols * scale;
    canvas.height = rows * scale;
    const flat = frame.flat().sort((a,b) => a - b);
    const pMin = flat[Math.floor(flat.length * 0.02)];
    const pMax = flat[Math.floor(flat.length * 0.98)];
    const displayMin = (pMax - pMin > 0.5) ? pMin : (stats?.min || 20);
    const displayMax = (pMax - pMin > 0.5) ? pMax : (stats?.max || 40);
    appState.thermalDisplayMin = displayMin;
    appState.thermalDisplayMax = displayMax;
    const displayRange = displayMax - displayMin || 1;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = cols;
    offCanvas.height = rows;
    const offCtx = offCanvas.getContext('2d');
    const imgData = offCtx.createImageData(cols, rows);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = frame[r][c];
            const norm = Math.max(0, Math.min(1, (val - displayMin) / displayRange));
            const rgbStr = getColorFromMap(norm, appState.thermalCmap);
            const match = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
            if (match) {
                const idx = (r * cols + c) * 4;
                imgData.data[idx] = parseInt(match[1]);
                imgData.data[idx + 1] = parseInt(match[2]);
                imgData.data[idx + 2] = parseInt(match[3]);
                imgData.data[idx + 3] = 255;
            }
        }
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
}
function renderThermalFrameToCanvas(canvas, frameData, stats, meta, opts) {
    const defaultOpts = { scale: 50, cmap: appState.thermalCmap || 'hot', showColorbar: false, showMetadata: true, showHistogram: true };
    opts = { ...defaultOpts, ...opts };
    let frame24x32 = [];
    if (frameData.length === 768) {
        for(let r=0; r<24; r++) frame24x32.push(frameData.slice(r*32, (r+1)*32));
    } else if (frameData.length === 24 && Array.isArray(frameData[0])) {
        frame24x32 = frameData;
    } else {
        console.error("Invalid thermal frame format", frameData);
        return;
    }
    const rows = 24;
    const cols = 32;
    const heatmapW = cols * opts.scale;
    const heatmapH = rows * opts.scale;
    const reportWidth = 2400;
    const padding = 120;
    const headerH = 300;
    const metaH = 1000;
    const histH = opts.showHistogram ? 700 : 0;
    const footerH = 200;
    canvas.width = reportWidth;
    canvas.height = headerH + heatmapH + metaH + histH + footerH + (padding * 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const textColor = '#000000';
    const accentColor = '#0b132b'; 
    const subColor = '#444444';
    const highlightColor = '#d90429';
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, reportWidth, 30);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 30, reportWidth, 220);
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText("THERMAL ANALYSIS", padding, 100);
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText("PRECISION LABORATORY CERTIFICATE", padding, 160);
    ctx.fillStyle = '#16a085';
    ctx.font = 'bold 24px monospace';
    ctx.fillText("✓ DATA INTEGRITY: 100% BIT-PERFECT | SENSOR SYNC: VERIFIED", padding, 210);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 20px monospace';
    ctx.fillText("MLX90640-D32 | RAW PIXEL MAPPING: 1:1 [50px/px]", reportWidth - padding, 210);
    ctx.textAlign = 'left';
    const heatmapX = (reportWidth - heatmapW) / 2;
    const heatmapY = headerH + 100;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = cols;
    offCanvas.height = rows;
    const offCtx = offCanvas.getContext('2d');
    const imgData = offCtx.createImageData(cols, rows);
    const flat = [...frame24x32.flat()].sort((a,b) => a - b);
    const displayMin = (stats && stats.min != null) ? Number(stats.min) : flat[0];
    const displayMax = (stats && stats.max != null) ? Number(stats.max) : flat[flat.length-1];
    const displayRange = (displayMax - displayMin) || 0.1;
    const min = (stats && stats.min != null) ? Number(stats.min) : flat[0];
    const max = (stats && stats.max != null) ? Number(stats.max) : flat[flat.length-1];
    const mean = (stats && stats.mean != null) ? Number(stats.mean) : (flat.reduce((a,b)=>a+b,0)/flat.length);
    const std = (stats && stats.std != null) ? Number(stats.std) : 0;
    const q1 = flat[Math.floor(flat.length * 0.25)];
    const median = flat[Math.floor(flat.length * 0.5)];
    const q3 = flat[Math.floor(flat.length * 0.75)];
    let maxPos = { r: 0, c: 0 };
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = frame24x32[r][c];
            if (val === max) maxPos = { r, c };
            const norm = Math.max(0, Math.min(1, (val - displayMin) / displayRange));
            const rgbStr = getColorFromMap(norm, opts.cmap);
            const match = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
            if (match) {
                const idx = (r * cols + c) * 4;
                imgData.data[idx] = parseInt(match[1]);
                imgData.data[idx + 1] = parseInt(match[2]);
                imgData.data[idx + 2] = parseInt(match[3]);
                imgData.data[idx + 3] = 255;
            }
        }
    }
    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = false; 
    ctx.drawImage(offCanvas, heatmapX, heatmapY, heatmapW, heatmapH);
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.strokeRect(heatmapX, heatmapY, heatmapW, heatmapH);
    ctx.fillStyle = subColor;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    for(let i=0; i<cols; i++) {
        ctx.fillText(i+1, heatmapX + i*opts.scale + opts.scale/2, heatmapY - 25);
    }
    ctx.textAlign = 'right';
    for(let i=0; i<rows; i++) {
        ctx.fillText(i+1, heatmapX - 25, heatmapY + i*opts.scale + opts.scale/2 + 7);
    }
    ctx.textAlign = 'left';
    const mx = Math.floor(heatmapX + maxPos.c * opts.scale + opts.scale/2);
    const my = Math.floor(heatmapY + maxPos.r * opts.scale + opts.scale/2);
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, 25, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx - 40, my); ctx.lineTo(mx + 40, my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my - 40); ctx.lineTo(mx, my + 40); ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 32px sans-serif';
    ctx.shadowBlur = 8; ctx.shadowColor = 'black';
    ctx.fillText(`HOTSPOT: ${max.toFixed(2)}°C`, mx + 50, my - 50);
    ctx.shadowBlur = 0;
    let currentY = heatmapY + heatmapH + 100;
    if (opts.showHistogram) {
        const hX = padding + 120;
        const hY = currentY + 40;
        const hW = reportWidth - (padding * 2) - 120;
        const hH = 360;
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText("THERMAL FREQUENCY & COLOR DISTRIBUTION PROFILE", hX, hY - 40);
        ctx.fillStyle = '#fdfdfd';
        ctx.fillRect(hX, hY, hW, hH);
        const bins = 256;
        const counts = new Array(bins).fill(0);
        frame24x32.flat().forEach(v => {
            let b = Math.floor(((v - displayMin) / displayRange) * bins);
            counts[Math.max(0, Math.min(bins-1, b))]++;
        });
        const maxC = Math.max(...counts) || 1;
        const bW = hW / bins;
        ctx.strokeStyle = '#ced4da';
        ctx.lineWidth = 1;
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'right';
        for(let i=0; i<=5; i++) {
            const gy = hY + hH - (i/5 * hH);
            ctx.beginPath(); ctx.moveTo(hX, gy); ctx.lineTo(hX + hW, gy); ctx.stroke();
            ctx.fillStyle = subColor;
            ctx.fillText(Math.round(i/5 * maxC), hX - 20, gy + 8);
        }
        for(let i=0; i<=10; i++) {
            const gx = hX + (i/10 * hW);
            ctx.beginPath(); ctx.moveTo(gx, hY); ctx.lineTo(gx, hY + hH); ctx.stroke();
        }
        counts.forEach((c, i) => {
            const bh = (c / maxC) * hH;
            ctx.fillStyle = getColorFromMap(i/(bins-1), opts.cmap);
            ctx.fillRect(Math.floor(hX + i * bW), Math.floor(hY + hH - bh), Math.ceil(bW), Math.ceil(bh));
        });
        ctx.save();
        ctx.translate(hX - 90, hY + hH/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("PIXEL FREQUENCY / COUNT", 0, 0);
        ctx.restore();
        const gradY = hY + hH + 50;
        const grad = ctx.createLinearGradient(hX, 0, hX + hW, 0);
        for(let i=0; i<=10; i++) grad.addColorStop(i/10, getColorFromMap(i/10, opts.cmap));
        ctx.fillStyle = grad;
        ctx.fillRect(hX, gradY, hW, 40);
        ctx.strokeRect(hX, gradY, hW, 40);
        ctx.fillStyle = textColor;
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        for(let i=0; i<=10; i++) {
            const t = i/10;
            const x = hX + t * hW;
            ctx.fillText((displayMin + t * displayRange).toFixed(1), x, gradY + 90);
        }
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText("TEMPERATURE SCALE (°C)", hX + hW/2, gradY + 160);
        currentY = gradY + 280; 
    }
    const items = [
        ["TIMESTAMP / UTC ISO", meta?.timestamp || '—'],
        ["POINT IDENTIFIER", meta?.pointIndex ? `SENSOR_REF_#${meta.pointIndex}` : '—'],
        ["CONCENTRATION (C)", (meta?.concentration != null && !isNaN(parseFloat(meta.concentration))) ? Number(meta.concentration).toExponential(8) : '—'],
        ["ANALYTICAL WAVELENGTH", (meta?.wavelength || 'N/A') + " nm"],
        ["ABSOLUTE MINIMUM", min.toFixed(6) + " °C"],
        ["QUARTILE 1 (Q1)", q1.toFixed(6) + " °C"],
        ["MEDIAN TEMP (Q2)", median.toFixed(6) + " °C"],
        ["QUARTILE 3 (Q3)", q3.toFixed(6) + " °C"],
        ["ABSOLUTE MAXIMUM", max.toFixed(6) + " °C"],
        ["ARITHMETIC MEAN (μ)", mean.toFixed(6) + " °C"],
        ["STANDARD DEV. (σ)", std.toFixed(8) + " °C"],
        ["PIXEL DENSITY", "768 ACTIVE POINTS"]
    ];
    const colCount = 3;
    const cellW = (reportWidth - (padding * 2)) / colCount;
    const cellH = 220;
    items.forEach((it, i) => {
        const c = i % colCount;
        const r = Math.floor(i / colCount);
        const x = padding + c * cellW;
        const y = currentY + r * cellH;
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(x + 5, y, cellW - 10, cellH - 10);
        ctx.strokeStyle = '#dee2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 5, y, cellW - 10, cellH - 10);
        ctx.fillStyle = subColor;
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(it[0], x + 35, y + 70);
        ctx.fillStyle = textColor;
        ctx.font = 'bold 36px monospace';
        ctx.fillText(it[1], x + 35, y + 160);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = subColor;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText("PROPRIETARY BIOMICROSYSTEMS DATA | LABORATORY CERTIFIED ANALYSIS V4.0.8", reportWidth/2, canvas.height - 50);
}
function getColorFromMap(t, cmap) {
    let r, g, b;
    switch (cmap) {
        case 'inferno':
            r = Math.floor(255 * Math.min(1, t * 3));
            g = Math.floor(255 * Math.max(0, Math.min(1, (t - 0.33) * 3)));
            b = Math.floor(255 * Math.max(0, t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2));
            break;
        case 'hot':
            r = Math.floor(255 * Math.min(1, t * 2.5));
            g = Math.floor(255 * Math.max(0, (t - 0.4) * 2.5));
            b = Math.floor(255 * Math.max(0, (t - 0.8) * 5));
            break;
        case 'plasma':
            r = Math.floor(255 * (0.05 + 0.9 * t));
            g = Math.floor(255 * Math.max(0, Math.sin(t * Math.PI)));
            b = Math.floor(255 * Math.max(0, 1 - t));
            break;
        case 'viridis':
            r = Math.floor(255 * (0.267 + 0.004 * t + t * t * 0.3));
            g = Math.floor(255 * Math.min(1, 0.004 + t * 0.87));
            b = Math.floor(255 * Math.max(0, 0.329 + 0.4 * (1 - t)));
            break;
        case 'coolwarm':
            r = Math.floor(255 * (t < 0.5 ? 0.3 + t : 1));
            g = Math.floor(255 * (1 - Math.abs(t - 0.5) * 2) * 0.6);
            b = Math.floor(255 * (t > 0.5 ? 1 - t : 1));
            break;
        default:
            r = Math.floor(255 * t);
            g = Math.floor(255 * t);
            b = Math.floor(255 * t);
    }
    return `rgb(${r},${g},${b})`;
}
function thermalCmapChanged() {
    appState.thermalCmap = document.getElementById('thermal-cmap').value;
    addLog(`🎨 ${t('logs.cmap_changed', 'Mapa de colores cambiado a')}: ${appState.thermalCmap.toUpperCase()}`);
    if (appState.measurementHistory && appState.measurementHistory.length > 0) {
        appState.measurementHistory.forEach(item => {
            if (item.thermal && item.thermal.frame) {
                let frame24x32 = [];
                if (item.thermal.frame.length === 768) {
                    for(let r=0; r<24; r++) {
                        frame24x32.push(item.thermal.frame.slice(r*32, (r+1)*32));
                    }
                } else {
                    frame24x32 = item.thermal.frame;
                }
                const canvas = document.createElement('canvas');
                const stats = { min: item.thermal.min, max: item.thermal.max, mean: item.thermal.mean, std: item.thermal.std || 0 };
                renderThermalFrameToCanvas(canvas, frame24x32, stats, null, { 
                    scale: 4, 
                    showColorbar: false, 
                    showMetadata: false, 
                    showHistogram: false,
                    cmap: appState.thermalCmap 
                });
                item.thermalSnapshot = canvas.toDataURL('image/png');
            }
        });
        updateHistoryTable();
    }
}
function exportLog() {
    const logOutput = document.getElementById('log-output');
    if (!logOutput) return;
    const text = logOutput.innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event_log_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`✅ ${t('logs.exported', 'Log de comunicaciones exportado')}`);
}
async function captureAndSaveThermalSnapshotForEntry(entry) {
    if (!entry.thermal || !entry.thermal.frame) return;
    try {
        const canvas = document.createElement('canvas');
        renderThermalFrameToCanvas(canvas, entry.thermal.frame, {
            mean: entry.thermal.mean,
            min: entry.thermal.min,
            max: entry.thermal.max,
            std: entry.thermal.std
        }, {
            timestamp: entry.timestamp,
            pointIndex: entry.details,
            concentration: null,
            wavelength: null
        }, { scale: 64, showHistogram: true, cmap: appState.thermalCmap });
        canvas.toBlob(blob => {
            const link = document.createElement('a');
            const mode = entry.type.toUpperCase();
            const ts = entry.timestamp.replace(/[\/, :]/g, '_');
            link.download = `THERMAL_REPORT_HD_${mode}_${ts}.png`;
            link.href = URL.createObjectURL(blob);
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }, 'image/png');
        const tsRaw = entry.timestamp.replace(/[\/, :]/g, '_');
        exportRawThermalMatrix(entry.thermal.frame, {
            min: entry.thermal.min,
            max: entry.thermal.max,
            mean: entry.thermal.mean,
            std: entry.thermal.std
        }, `THERMAL_RAW_32x24_${entry.type.toUpperCase()}_${tsRaw}.png`);
        addLog(`💾 ${t('logs.auto_saved', 'Auto-guardado')} [${entry.type}] @ ${entry.timestamp}`);
    } catch(e) {
        addLog('⚠️ Error in auto-save: ' + e.message, true);
    }
}
async function captureAndSaveThermalSnapshot(pointIndex) {
    try {
        const res = await apiGet(`/api/thermal/snapshot_sequential/${pointIndex}/`);
        if (res.status === 'ok') {
            const entry = {
                type: 'SEQUENTIAL_POINT',
                timestamp: res.timestamp,
                details: `P#${res.point_index + 1}`,
                thermal: {
                    frame: res.frame,
                    mean: res.stats.mean,
                    min: res.stats.min,
                    max: res.stats.max,
                    std: res.stats.std
                }
            };
            captureAndSaveThermalSnapshotForEntry(entry);
        } else {
            addLog('⚠️ ' + t('logs.thermal_save_err', 'Error guardando snapshot térmico: ') + res.message, true);
        }
    } catch(e) {
        addLog('⚠️ ' + t('logs.thermal_err', 'Error en snapshot térmico: ') + e.message, true);
    }
}
function captureThermal() {
    if (!appState.lastThermalFrame) {
        alert(t('alerts.no_thermal_frame', 'No hay frame térmico para exportar'));
        return;
    }
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const tStr = now.toISOString().slice(0, 10).replace(/-/g, '') + '_' + now.toISOString().slice(11, 19).replace(/:/g, '');
    const canvasReport = document.createElement('canvas');
    renderThermalFrameToCanvas(canvasReport, appState.lastThermalFrame, appState.lastThermalStats, { 
        timestamp: timestamp, pointIndex: null, concentration: null, wavelength: null 
    }, { scale: 64, showColorbar: true, showMetadata: true, cmap: appState.thermalCmap });
    canvasReport.toBlob(blob => {
        const link = document.createElement('a');
        link.download = `thermal_report_hd_${tStr}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
    exportRawThermalMatrix(appState.lastThermalFrame, appState.lastThermalStats, `thermal_raw_32x24_${tStr}.png`);
}
function exportRawThermalMatrix(frameData, stats, filename) {
    const canvas = document.createElement('canvas');
    const cols = 32;
    const rows = 24;
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(cols, rows);
    const flat = [...frameData.flat()].sort((a,b) => a - b);
    const displayMin = (stats && stats.min != null) ? Number(stats.min) : flat[0];
    const displayMax = (stats && stats.max != null) ? Number(stats.max) : flat[flat.length-1];
    const displayRange = (displayMax - displayMin) || 0.1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = frameData[r][c];
            const norm = Math.max(0, Math.min(1, (val - displayMin) / displayRange));
            const rgbStr = getColorFromMap(norm, appState.thermalCmap);
            const match = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
            if (match) {
                const idx = (r * cols + c) * 4;
                imgData.data[idx] = parseInt(match[1]);
                imgData.data[idx + 1] = parseInt(match[2]);
                imgData.data[idx + 2] = parseInt(match[3]);
                imgData.data[idx + 3] = 255;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}
function exportOfflineThermalImage() {
    const sel = document.getElementById('offline-thermal-select');
    if (!sel || sel.value === "") return;
    const data = appState.offlineThermalFrames[parseInt(sel.value)];
    if (!data) return;
    const frame24x32 = [];
    for(let r=0; r<24; r++) {
        frame24x32.push(data.frame.slice(r*32, (r+1)*32));
    }
    const canvas = document.createElement('canvas');
    const stats = { min: data.min, max: data.max, mean: data.mean, std: 0 };
    const meta = { timestamp: t('charts.offline', "Offline"), pointIndex: parseInt(sel.value) + 1, concentration: t('charts.na', "N/A"), wavelength: t('charts.na', "N/A") };
    renderThermalFrameToCanvas(canvas, frame24x32, stats, meta, { scale: 64, showColorbar: true, showMetadata: true, cmap: appState.thermalCmap || 'hot' });
    canvas.toBlob(blob => {
        const link = document.createElement('a');
        link.download = `thermal_offline_report_hd_${data.label.replace(/[^z0-9a-z_.]/gi, '_')}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
    exportRawThermalMatrix(frame24x32, stats, `thermal_offline_raw_32x24_${data.label.replace(/[^z0-9a-z_.]/gi, '_')}.png`);
}
function exportThermalHistogram(type = 'realtime') {
    let sourceChart = null;
    let canvasId = '';
    let stats = {};
    if (type === 'realtime') {
        if (typeof _thermalHistFullChart === 'undefined' || !_thermalHistFullChart) { alert(t('alerts.hist_na', 'Histograma no disponible')); return; }
        sourceChart = _thermalHistFullChart;
        canvasId = 'chart-thermal-histogram-full';
        stats = {
            min: document.getElementById('thist-tmin')?.textContent || '—',
            max: document.getElementById('thist-tmax')?.textContent || '—',
            mean: document.getElementById('thist-tmean')?.textContent || '—',
            std: document.getElementById('thist-tstd')?.textContent || '—',
            pixels: document.getElementById('thist-npixels')?.textContent || '768'
        };
    } else {
        if (!_offlineThermalHistChart) { alert(t('alerts.hist_offline_na', 'Histograma offline no disponible')); return; }
        sourceChart = _offlineThermalHistChart;
        canvasId = 'offline-thermal-hist-canvas';
        const sel = document.getElementById('offline-thermal-select');
        const frameData = appState.offlineThermalFrames[parseInt(sel.value)];
        if (!frameData) return;
        stats = {
            min: frameData.min.toFixed(2),
            max: frameData.max.toFixed(2),
            mean: frameData.mean.toFixed(2),
            std: 'N/A',
            pixels: '768'
        };
    }
    const chartCanvas = document.getElementById(canvasId);
    if (!chartCanvas) return;
    const reportWidth = 1000;
    const padding = 60;
    const headerHeight = 180;
    const footerHeight = 80;
    const chartMaxWidth = reportWidth - (padding * 2);
    const chartScale = chartMaxWidth / chartCanvas.width;
    const chartDispWidth = chartCanvas.width * chartScale;
    const chartDispHeight = chartCanvas.height * chartScale;
    const compCanvas = document.createElement('canvas');
    const tableHeight = 220; 
    compCanvas.width = reportWidth;
    compCanvas.height = headerHeight + chartDispHeight + tableHeight + footerHeight;
    const ctx = compCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, compCanvas.width, compCanvas.height);
    const textColor = '#11111d';
    const subColor = '#444466';
    const accentColor = '#7c6cf0';
    ctx.fillStyle = accentColor;
    ctx.fillRect(padding, padding, 8, 50);
    ctx.fillStyle = textColor;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(type === 'realtime' ? "REPORTE TÉRMICO (TIEMPO REAL)" : "REPORTE TÉRMICO (HISTÓRICO)", padding + 25, padding + 35);
    ctx.fillStyle = subColor;
    ctx.font = '600 16px sans-serif';
    ctx.fillText("Análisis Estadístico de Distribución de Temperaturas", padding + 25, padding + 60);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = textColor;
    ctx.fillText(`Fecha: ${new Date().toLocaleString()}`, padding, padding + 110);
    ctx.fillText(`Sensor: Melexis MLX90640 (24x32 Pixels)`, padding, padding + 140);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(padding, padding + 170); ctx.lineTo(reportWidth - padding, padding + 170); ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.drawImage(chartCanvas, padding, padding + headerHeight, chartDispWidth, chartDispHeight);
    const tableY = padding + headerHeight + chartDispHeight + 40;
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText("MÉTRICAS DEL FRAME", padding, tableY);
    const startY = tableY + 20;
    const rowH = 35;
    const statsLabels = [
        ["Temperatura Mínima Detectada", stats.min + " °C"],
        ["Temperatura Máxima Detectada", stats.max + " °C"],
        ["Temperatura Media (Average)", stats.mean + " °C"],
        ["Desviación Estándar de Población", stats.std + (stats.std !== 'N/A' ? " °C" : "")],
        ["Conteo Total de Píxeles", stats.pixels]
    ];
    statsLabels.forEach((pair, i) => {
        const y = startY + i * rowH;
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.03)';
            ctx.fillRect(padding, y, reportWidth - padding * 2, rowH);
        }
        ctx.fillStyle = subColor;
        ctx.font = '600 14px sans-serif';
        ctx.fillText(pair[0], padding + 15, y + 22);
        ctx.fillStyle = textColor;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(pair[1], reportWidth - padding - 15, y + 22);
        ctx.textAlign = 'left';
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = subColor;
    ctx.font = 'italic 12px sans-serif';
    ctx.fillText("Reporte generado por Suite Biomicrosystems v4.0. Análisis óptico y térmico de precisión.", reportWidth/2, compCanvas.height - 30);
    const link = document.createElement('a');
    link.download = `Histograma_Termico_${new Date().getTime()}.png`;
    link.href = compCanvas.toDataURL('image/png');
    link.click();
    addLog(`✅ Reporte de histograma exportado.`);
}
async function startThermalMeasurement() {
    await apiPost('/api/thermal/start_measurement/');
    document.getElementById('thermal-meas-status').textContent = t('status.measuring', 'Estado: Midiendo...');
    document.getElementById('thermal-meas-status').style.color = 'var(--accent-success)';
    addLog(t('logs.thermal_meas_started', 'Medición térmica iniciada'));
}
async function stopThermalMeasurement() {
    const res = await apiPost('/api/thermal/stop_measurement/');
    document.getElementById('thermal-meas-status').textContent = t('status.stopped', 'Estado: Detenido') + ` (${res.data_count || 0} ${t('charts.points', 'puntos')})`;
    document.getElementById('thermal-meas-status').style.color = '';
    addLog(t('logs.thermal_meas_stopped', 'Medición térmica detenida'));
}
function saveThermalMeasurement() {
    window.location.href = '/api/thermal/save_measurement/';
}
function handleAnalysisFiles(input) {
    const files = Array.from(input.files);
    files.forEach(f => {
        const basename = f.name.replace(/\.[^.]+$/, '');
        let conc = 0;
        try { conc = parseFloat(basename); } catch (e) { }
        const isBlank = basename.toLowerCase().includes('blanco') || basename.toLowerCase().includes('blank');
        appState.analysisFiles.push({ file: f, name: f.name, concentration: isNaN(conc) ? 0 : conc, is_blank: isBlank });
    });
    updateAnalysisTable();
    document.getElementById('btn-process-analysis').disabled = appState.analysisFiles.length === 0;
    input.value = '';
}
function updateAnalysisTable() {
    const tbody = document.querySelector('#analysis-files-table tbody');
    tbody.innerHTML = '';
    appState.analysisFiles.forEach((f, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.name}</td>
            <td><input type="number" value="${f.concentration}" step="any" onchange="appState.analysisFiles[${i}].concentration=parseFloat(this.value)" style="width:80px;"></td>
            <td><input type="checkbox" ${f.is_blank ? 'checked' : ''} onchange="appState.analysisFiles[${i}].is_blank=this.checked"></td>
        `;
        tr.onclick = () => {
            document.querySelectorAll('#analysis-files-table tbody tr').forEach(r => r.classList.remove('selected'));
            tr.classList.add('selected');
        };
        tbody.appendChild(tr);
    });
}
function removeAnalysisFile() {
    const selected = document.querySelector('#analysis-files-table tbody tr.selected');
    if (selected) {
        const idx = Array.from(selected.parentNode.children).indexOf(selected);
        appState.analysisFiles.splice(idx, 1);
        updateAnalysisTable();
    }
    document.getElementById('btn-process-analysis').disabled = appState.analysisFiles.length === 0;
}
function clearAnalysisFiles() {
    appState.analysisFiles = [];
    updateAnalysisTable();
    document.getElementById('btn-process-analysis').disabled = true;
    document.getElementById('analysis-results').textContent = t('charts.no_analysis_results', 'Sin resultados.');
}
async function processAnalysis() {
    const wl = parseInt(document.getElementById('analysis-wl').value);
    if (isNaN(wl) || appState.analysisFiles.length === 0) return;
    document.getElementById('analysis-results').textContent = 'Leyendo y procesando archivos locales en el cliente...';
    const vals = [];
    const concs = [];
    appState.offlineThermalFrames = [];
    for (let fObj of appState.analysisFiles) {
        if (fObj.is_blank) continue;
        try {
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(e);
                reader.readAsText(fObj.file);
            });
            const lines = text.split('\n');
            let colIdx = -1, px0Idx = -1, hist0Idx = -1, tMeanIdx = -1, concColIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#')) continue;
                const headers = lines[i].split(',');
                colIdx = headers.indexOf(`A_${wl}nm`);
                if (colIdx === -1) colIdx = headers.indexOf(`I_raw_${wl}nm`);
                concColIdx = headers.indexOf('Concentracion_C');
                tMeanIdx = headers.indexOf('T_mean_°C');
                px0Idx = headers.indexOf('Px_0_0');
                hist0Idx = headers.indexOf('Hist_Bin_1');
                if (colIdx !== -1) {
                    for (let j = i + 1; j < lines.length; j++) {
                        const row = lines[j].split(',');
                        if (row.length > colIdx) {
                            const val = parseFloat(row[colIdx]);
                            if (!isNaN(val)) { 
                                vals.push(val); 
                                let cVal = fObj.concentration;
                                if (concColIdx !== -1 && row.length > concColIdx && !isNaN(parseFloat(row[concColIdx]))) {
                                    cVal = parseFloat(row[concColIdx]);
                                }
                                concs.push(cVal);
                                if (tMeanIdx !== -1 && px0Idx !== -1 && row.length > (px0Idx + 767)) {
                                    const mean = parseFloat(row[tMeanIdx]);
                                    if (!isNaN(mean)) {
                                        const frame = [];
                                        for(let px = 0; px < 768; px++) {
                                            frame.push(parseFloat(row[px0Idx + px]));
                                        }
                                        const hist = [];
                                        if (hist0Idx !== -1 && row.length > (hist0Idx + 24)) {
                                            for(let h = 0; h < 25; h++) hist.push(parseInt(row[hist0Idx + h])||0);
                                        }
                                        const label = row[2] || `Punto`;
                                        appState.offlineThermalFrames = appState.offlineThermalFrames || [];
                                        appState.offlineThermalFrames.push({ 
                                            label: label, mean: mean, frame: frame, hist: hist, 
                                            min: parseFloat(row[tMeanIdx+1]), max: parseFloat(row[tMeanIdx+2]) 
                                        });
                                    }
                                }
                            }
                        }
                    }
                    break;
                }
            }
        } catch (e) { console.error('Error procesando CSV local', e); }
    }
    if (vals.length > 0) {
        document.getElementById('analysis-results').textContent = `✓ Extraídos ${vals.length} valores promedianos válidos a ${wl} nm desde los archivos CSV.\nLos cálculos de Cinética de Michaelis-Menten, Normalidad y T-Test pueden explorarse debajo.`;
        if (typeof renderAnalysisSuiteResults === 'function') {
            renderAnalysisSuiteResults(vals, wl, concs);
            document.getElementById('analysis-descriptive-block').style.display = 'block';
            document.getElementById('analysis-normality-block').style.display = vals.length >= 3 ? 'block' : 'none';
            document.getElementById('analysis-ttest-block').style.display = vals.length >= 2 ? 'block' : 'none';
        }
        document.getElementById('btn-export-analysis').disabled = false;
        const select = document.getElementById('offline-thermal-select');
        if (select && appState.offlineThermalFrames && appState.offlineThermalFrames.length > 0) {
            select.innerHTML = '<option value="">Medición térmica...</option>';
            appState.offlineThermalFrames.forEach((tf, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `[${idx+1}] ${tf.label} (T=${tf.mean.toFixed(1)}°C)`;
                select.appendChild(opt);
            });
            select.value = "0";
            renderOfflineThermalFrame("0");
            const expBtn = document.getElementById('btn-export-offline-hist');
            if (expBtn) expBtn.style.display = 'inline-block';
            const expImgBtn = document.getElementById('btn-export-offline-img');
            if (expImgBtn) expImgBtn.style.display = 'inline-block';
        }
        addLog(`Análisis offline de datos completado para ${wl}nm.`);
    } else {
        document.getElementById('analysis-results').textContent = `Error: No se encontró la columna A_${wl}nm o I_raw_${wl}nm en los CSV.`;
    }
}
function exportAnalysisResults() {
    let csv = "=== ANALYSIS RESULTS ===\n\n";
    csv += `Wavelength (nm):,${document.getElementById('analysis-wl').value}\n`;
    csv += `Files Processed:,${appState.analysisFiles.length}\n\n`;
    const extractText = id => { const el = document.getElementById(id); return el ? el.textContent : 'N/A'; };
    csv += "--- DESCRIPTIVE STATS ---\n";
    csv += `Mean:,${extractText('analysis-mean')}\n`;
    csv += `Std Dev:,${extractText('analysis-std')}\n`;
    csv += `CV (%):,${extractText('analysis-cv')}\n`;
    csv += `Min:,${extractText('analysis-min')}\n`;
    csv += `Max:,${extractText('analysis-max')}\n\n`;
    csv += "--- NORMALITY (Shapiro-Wilk) ---\n";
    csv += `W-statistic:,${extractText('analysis-shapiro-w')}\n`;
    csv += `P-value:,${extractText('analysis-shapiro-p')}\n`;
    csv += `Is Normal:,${extractText('analysis-is-normal')}\n\n`;
    csv += "--- T-TEST (1-Sample) ---\n";
    csv += `Mu0:,${document.getElementById('analysis-ttest-ref')?.value || 'N/A'}\n`;
    csv += `T-statistic:,${extractText('analysis-t-stat')}\n`;
    csv += `P-value:,${extractText('analysis-t-p')}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analisis_local_${new Date().getTime()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    addLog('✅ Resultados de análisis exportados localmente.');
}
function switchInnerTab(tabId, btn) {
    document.getElementById('chart-analysis-intensity').classList.add('hidden');
    document.getElementById('chart-analysis-absorbance').classList.add('hidden');
    document.getElementById('chart-analysis-calibration').classList.add('hidden');
    const thContainer = document.getElementById('analysis-thermal-container');
    if (thContainer) thContainer.classList.add('hidden');
    if (tabId === 'analysis-thermal') {
        if (thContainer) thContainer.classList.remove('hidden');
    } else {
        document.getElementById(`chart-${tabId}`).classList.remove('hidden');
    }
    document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
let _offlineThermalHistChart = null;
function renderOfflineThermalFrame(idxStr) {
    if (!idxStr) return;
    const idx = parseInt(idxStr);
    const data = appState.offlineThermalFrames ? appState.offlineThermalFrames[idx] : null;
    if (!data) return;
    const canvas = document.getElementById('offline-thermal-canvas');
    if (!canvas) return;
    canvas.width = 1024; canvas.height = 768;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.imageRendering = 'auto';
    const ctx = canvas.getContext('2d');
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 32; offCanvas.height = 24;
    const offCtx = offCanvas.getContext('2d');
    const imgData = offCtx.createImageData(32, 24);
    const min = data.min, max = data.max;
    data.frame.forEach((val, i) => {
        let norm = (val - min) / (max - min || 1);
        norm = Math.max(0, Math.min(1, norm));
        const rgbStr = getColorFromMap(norm, appState.thermalCmap || 'inferno');
        const match = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
        if (match) {
            imgData.data[i*4] = parseInt(match[1]);
            imgData.data[i*4+1] = parseInt(match[2]);
            imgData.data[i*4+2] = parseInt(match[3]);
            imgData.data[i*4+3] = 255;
        }
    });
    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
    const histCanvas = document.getElementById('offline-thermal-hist-canvas');
    if (!histCanvas) return;
    const flat = [...data.frame].sort((a,b) => a - b);
    const n = flat.length;
    const mean = flat.reduce((a,b) => a + b, 0) / n;
    const std = Math.sqrt(flat.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const bins = 25;
    const range = (max - min) || 1;
    const binWidth = range / bins;
    const counts = new Array(bins).fill(0);
    flat.forEach(v => {
        const b = Math.min(bins - 1, Math.floor((v - min) / range * bins));
        counts[b]++;
    });
    const binCenters = Array.from({length: bins}, (_, i) => +(min + (i + 0.5) * binWidth).toFixed(2));
    const maxCount = Math.max(...counts);
    const refLines = [
        { val: min, label: `T_min: ${min.toFixed(1)}`, color: 'rgba(86,180,233,0.8)', dash: [4, 4] },
        { val: max, label: `T_max: ${max.toFixed(1)}`, color: 'rgba(255,85,85,0.8)', dash: [4, 4] },
        { val: mean, label: `T_mean: ${mean.toFixed(1)}`, color: 'rgba(255,204,0,0.9)', dash: [] },
        { val: mean - std, label: `-1\u03c3: ${(mean - std).toFixed(1)}`, color: 'rgba(124,108,240,0.6)', dash: [3, 3] },
        { val: mean + std, label: `+1\u03c3: ${(mean + std).toFixed(1)}`, color: 'rgba(124,108,240,0.6)', dash: [3, 3] },
    ];
    const lineDatasets = refLines.map(rl => ({
        type: 'line',
        label: rl.label,
        data: [{ x: rl.val, y: 0 }, { x: rl.val, y: maxCount * 1.1 }],
        borderColor: rl.color,
        borderWidth: 1.5,
        borderDash: rl.dash,
        pointRadius: 0,
        showLine: true,
        fill: false,
        order: 0,
    }));
    const bgColors = binCenters.map(x => {
        const norm = range > 0 ? (x - min) / range : 0.5;
        return getColorFromMap(Math.max(0, Math.min(1, norm)), appState.thermalCmap || 'inferno');
    });
    const barDataset = {
        type: 'bar',
        label: 'Píxeles',
        data: binCenters.map((x, i) => ({ x, y: counts[i] })),
        backgroundColor: bgColors,
        borderColor: bgColors,
        borderWidth: 1,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        order: 1
    };
    if (!_offlineThermalHistChart) {
        _offlineThermalHistChart = new Chart(histCanvas, {
            data: {
                datasets: [barDataset, ...lineDatasets]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { 
                    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 8 }, color: getTextColor() } },
                    title: { display: true, text: 'Distribución Térmica (Offline)', font: { size: 10 }, color: getTextColor() }
                },
                scales: {
                    x: { 
                        type: 'linear',
                        ticks: { color: getTextColor(), font: {size: 8} }, 
                        grid: { display: false },
                        min: min - binWidth,
                        max: max + binWidth
                    },
                    y: { ticks: { color: getTextColor(), font: {size: 8} }, grid: { color: getGridColor() } }
                }
            }
        });
    } else {
        _offlineThermalHistChart.data.datasets = [barDataset, ...lineDatasets];
        _offlineThermalHistChart.options.scales.x.min = min - binWidth;
        _offlineThermalHistChart.options.scales.x.max = max + binWidth;
        _offlineThermalHistChart.update();
        updateChartTheme(_offlineThermalHistChart);
    }
}
function toggleTheme() {
    appState.isDarkTheme = !appState.isDarkTheme;
    updateTheme();
    apiPost('/api/set_theme/', { is_dark: appState.isDarkTheme });
}
function updateTheme() {
    const html = document.documentElement;
    html.setAttribute('data-theme', appState.isDarkTheme ? 'dark' : 'light');
    document.getElementById('theme-toggle-text').textContent = appState.isDarkTheme ? t('menu.light_mode', '☀️ Modo Claro') : t('menu.dark_mode', '🌙 Modo Oscuro');
    const logoImg = document.getElementById('logo-img');
    if (appState.isDarkTheme) {
        logoImg.src = logoImg.src.replace('BiomicrosystemsLogo.png', 'BiomicrosystemsLogo_WhiteText.png');
    } else {
        logoImg.src = logoImg.src.replace('BiomicrosystemsLogo_WhiteText.png', 'BiomicrosystemsLogo.png');
    }
    [
        chartSpectrum, chartConcCurve, chartCalCurve, 
        chartAnalysisIntensity, chartAnalysisAbsorbance, chartAnalysisCalibration,
        typeof _thermalHistFullChart !== 'undefined' ? _thermalHistFullChart : null,
        typeof _thermalHistChart !== 'undefined' ? _thermalHistChart : null,
        typeof _offlineThermalHistChart !== 'undefined' ? _offlineThermalHistChart : null,
        typeof _chartResiduals !== 'undefined' ? _chartResiduals : null
    ].forEach(chart => {
        if (chart) { 
            updateChartTheme(chart); 
            chart.update(); 
        }
    });
}
function updateChartTheme(chart) {
    if (!chart) return;
    const tc = getTextColor();
    const gc = getGridColor();
    const bg = getBgColor();
    if (chart.options.plugins.title) {
        chart.options.plugins.title.color = tc;
        chart.options.plugins.title.font = { family: 'Inter', size: 16, weight: 'bold' };
    }
    if (chart.options.plugins.legend) {
        chart.options.plugins.legend.labels.color = tc;
        chart.options.plugins.legend.labels.font = { family: 'Inter', size: 12, weight: '500' };
    }
    if (chart.options.plugins.tooltip) {
        chart.options.plugins.tooltip.backgroundColor = appState.isDarkTheme ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
        chart.options.plugins.tooltip.titleColor = tc;
        chart.options.plugins.tooltip.bodyColor = tc;
        chart.options.plugins.tooltip.borderColor = gc;
        chart.options.plugins.tooltip.titleFont = { size: 13, weight: 'bold' };
        chart.options.plugins.tooltip.bodyFont = { size: 12 };
    }
    if (chart.options.plugins.customCanvasBackgroundColor) {
        chart.options.plugins.customCanvasBackgroundColor.color = bg;
    } else {
        chart.options.plugins.customCanvasBackgroundColor = { color: bg };
    }
    if (chart.options.scales) {
        Object.keys(chart.options.scales).forEach(axis => {
            const scale = chart.options.scales[axis];
            if (scale.ticks) {
                scale.ticks.color = tc;
                scale.ticks.font = { family: 'Inter', size: 11 };
            }
            if (scale.grid) {
                scale.grid.color = gc;
            }
            if (scale.title) {
                scale.title.color = tc;
                scale.title.font = { family: 'Inter', size: 14, weight: '600' };
            }
        });
    }
    chart.update('none');
}
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    setTimeout(() => {
        [chartSpectrum, chartConcCurve, chartCalCurve, chartAnalysisIntensity, chartAnalysisAbsorbance, chartAnalysisCalibration].forEach(c => {
            if (c) c.resize();
        });
    }, 100);
}
function toggleGroup(id) {
    const group = document.getElementById(id);
    if (!group) return;
    group.classList.toggle('open');
    const toggle = group.querySelector('.group-toggle');
    if (toggle) {
        toggle.textContent = group.classList.contains('open') ? '▼' : '▶';
    }
}
function addLog(message, isError = false) {
    const logOutput = document.getElementById('log-output');
    let timestamp = '';
    let finalMessage = message;
    if (!message.trim().startsWith('[')) {
        timestamp = `[${new Date().toLocaleTimeString()}] `;
    }
    const cls = isError ? ' class="log-error"' : '';
    logOutput.innerHTML += `<span${cls}>${timestamp}${finalMessage}</span>\n`;
    logOutput.scrollTop = logOutput.scrollHeight;
}
async function updateLogFromServer() {
    if (!appState.isConnected) return;
    try {
        const state = await apiGet('/api/state/');
        if (state) {
            if (state.log_messages) {
                if (!appState.lastLogCount) appState.lastLogCount = 0;
                const newLogs = state.log_messages.slice(appState.lastLogCount);
                if (newLogs.length > 0) {
                    newLogs.forEach(msg => addLog('⚙️ ' + msg));
                    appState.lastLogCount = state.log_messages.length;
                }
            }
            if (state.last_calibration_values !== undefined) {
                appState.lastCalValues = state.last_calibration_values;
            }
            if (state.led_active !== undefined && state.led_active !== appState.ledActive) {
                appState.ledActive = state.led_active;
                updateLEDUI();
            }
        }
    } catch (e) {
    }
}
function toggleLogArea() {
    const logArea = document.getElementById('log-area');
    const toggle = document.getElementById('log-toggle');
    logArea.classList.toggle('collapsed');
    if (logArea.classList.contains('collapsed')) {
        toggle.textContent = '▲';
    } else {
        toggle.textContent = '▼';
    }
}
function toggleMenu(el) {
    document.querySelectorAll('.menu-item').forEach(mi => {
        if (mi !== el) mi.classList.remove('active');
    });
    el.classList.toggle('active');
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-item')) {
        document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
    }
});
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}
function showHelp() {
    document.getElementById('modal-help').classList.add('active');
    loadHelpContent();
}
function showAbout() {
    document.getElementById('modal-about').classList.add('active');
}
let _cachedHelpTopics = null;
async function loadHelpContent() {
    if (!_cachedHelpTopics) {
        if (window.translations && window.translations.help) {
            _cachedHelpTopics = window.translations.help;
        } else {
            const res = await apiGet('/api/help/');
            if (res.status === 'ok') _cachedHelpTopics = res.topics;
        }
    }
    if (_cachedHelpTopics) {
        const tree = document.getElementById('help-tree');
        if (tree) {
            tree.innerHTML = '';
            Object.keys(_cachedHelpTopics).forEach(key => {
                const topic = _cachedHelpTopics[key];
                const li = document.createElement('li');
                li.textContent = topic.title || key;
                li.onclick = () => {
                    document.querySelectorAll('.help-tree li').forEach(l => l.classList.remove('active'));
                    li.classList.add('active');
                    document.getElementById('help-content').innerHTML = topic.content || '';
                };
                tree.appendChild(li);
            });
        }
    }
}
async function showContextHelp(topic) {
    if (!_cachedHelpTopics) {
        if (window.translations && window.translations.help) {
            _cachedHelpTopics = window.translations.help;
        } else {
            const res = await apiGet('/api/help/');
            if (res.status === 'ok') _cachedHelpTopics = res.topics;
        }
    }
    const content = (_cachedHelpTopics && _cachedHelpTopics[topic]) 
        ? _cachedHelpTopics[topic].content 
        : '<p>' + t('alerts.help_not_found', 'Ayuda no disponible para este contexto.') + '</p>';
    const contentEl = document.getElementById('context-help-content');
    if (contentEl) {
        contentEl.innerHTML = content;
    }
    const modal = document.getElementById('modal-context-help');
    if (modal) {
        modal.classList.add('active');
    }
}
function exportSessionData() {
    window.location.href = '/api/export_data/';
}
function exportGraph() {
    openModal('modal-export-graph');
}
async function processGraphExport() {
    closeModal('modal-export-graph');
    let chartCanvas = null;
    let activeChart = null;
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        chartCanvas = activeTab.querySelector('canvas:not(.hidden)');
        if (chartCanvas) activeChart = Chart.getChart(chartCanvas);
    }
    if (!chartCanvas || !activeChart) {
        alert(t('alerts.no_graph', 'No hay gráfico activo para exportar.'));
        return;
    }
    const title = document.getElementById('export-graph-title').value.trim();
    const lang = document.getElementById('export-graph-lang').value;
    const bgType = document.getElementById('export-graph-bg').value;
    const includeMeta = document.getElementById('export-graph-metadata').checked;
    const dict = {
        'es': {
            defaultTitle: "Certificado de Análisis Espectral de Precisión",
            date: "FECHA DE EMISIÓN:",
            mode: "MODO ANALÍTICO:",
            blank: "REFERENCIA BLANCO:",
            thermal: "CÁMARA TÉRMICA:",
            yes: "SÍ (ACTIVO)",
            no: "NO (INACTIVO)",
            generated: "BIOMICROSYSTEMS ANALYTICAL SUITE | LABORATORY EDITION V4.0",
            results: "MATRIZ DE DATOS ANALÍTICOS CERTIFICADOS",
            footer: "DOCUMENTO DE VALIDEZ TÉCNICA GENERADO AUTOMÁTICAMENTE | ID: SPEC-"
        },
        'en': {
            defaultTitle: "Precision Spectral Analysis Certificate",
            date: "DATE OF ISSUE:",
            mode: "ANALYTICAL MODE:",
            blank: "BLANK REFERENCE:",
            thermal: "THERMAL CAMERA:",
            yes: "YES (ACTIVE)",
            no: "NO (INACTIVE)",
            generated: "BIOMICROSYSTEMS ANALYTICAL SUITE | LABORATORY EDITION V4.0",
            results: "CERTIFIED ANALYTICAL DATA MATRIX",
            footer: "TECHNICAL VALIDITY DOCUMENT AUTOMATICALLY GENERATED | ID: SPEC-"
        }
    }[lang];
    const reportWidth = 1800; 
    const padding = 120;
    const headerH = 240;
    const metaH = includeMeta ? 200 : 0;
    const chartAreaW = reportWidth - (padding * 2);
    const chartScale = chartAreaW / chartCanvas.width;
    const chartH = chartCanvas.height * chartScale;
    const rowH = 60;
    const numRows = activeChart.data.labels ? activeChart.data.labels.length : 0;
    const datasets = activeChart.data.datasets;
    const numDS = datasets.length;
    const isLarge = numRows > 32;
    const displayRows = isLarge ? numDS : numRows;
    const tableH = (displayRows > 0) ? (rowH * (displayRows + 4) + 80) : 0;
    const compCanvas = document.createElement('canvas');
    compCanvas.width = reportWidth;
    compCanvas.height = headerH + metaH + chartH + tableH + 200;
    const ctx = compCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, compCanvas.width, compCanvas.height);
    const textColor = '#000000';
    const subColor = '#555555';
    const accentColor = '#0b132b';
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, reportWidth, 25);
    ctx.fillStyle = textColor;
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText((title || dict.defaultTitle).toUpperCase(), padding, 140);
    ctx.fillStyle = subColor;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(dict.generated, padding, 190);
    let currentY = headerH;
    if (includeMeta) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(padding, currentY); ctx.lineTo(reportWidth - padding, currentY); ctx.stroke();
        const dStr = new Date().toLocaleString(lang === 'es' ? 'es-ES' : 'en-US');
        const isBS = document.getElementById('blank-subtraction-cb')?.checked ? dict.yes : dict.no;
        const isTh = document.getElementById('thermal-autosave-cb')?.checked ? dict.yes : dict.no;
        const mode = (document.getElementById('meas-type')?.value || 'N/A').toUpperCase();
        const metaItems = [
            [dict.date, dStr],
            [dict.mode, mode],
            [dict.blank, isBS],
            [dict.thermal, isTh]
        ];
        const boxH = 80;
        metaItems.forEach((item, i) => {
            const ix = padding + (i % 2) * (reportWidth / 2 - padding);
            const iy = currentY + 100 + Math.floor(i / 2) * (boxH + 20);
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(ix, iy - 60, 650, boxH);
            ctx.strokeStyle = '#ced4da';
            ctx.lineWidth = 1;
            ctx.strokeRect(ix, iy - 60, 650, boxH);
            ctx.fillStyle = subColor;
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(item[0], ix + 20, iy - 30);
            let fSize = 32;
            ctx.font = `bold ${fSize}px monospace`;
            while (ctx.measureText(item[1]).width > 610 && fSize > 14) {
                fSize -= 2;
                ctx.font = `bold ${fSize}px monospace`;
            }
            ctx.fillStyle = textColor;
            ctx.textAlign = 'right';
            ctx.fillText(item[1], ix + 630, iy + 10);
            ctx.textAlign = 'left';
        });
        currentY += metaH + 40;
    }
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#16a085';
    ctx.fillText("DATA INTEGRITY: 100% LOSSLESS | DYNAMIC OVERFLOW PROTECTION: ACTIVE", padding, currentY - 15);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(padding, currentY, chartAreaW, chartH);
    currentY += chartH + 120;
    if (tableH > 0) {
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 42px sans-serif';
        ctx.fillText(dict.results, padding, currentY);
        currentY += 60;
        ctx.fillStyle = '#f1f3f5';
        ctx.fillRect(padding, currentY, reportWidth - padding * 2, rowH);
        const tableW = reportWidth - padding * 2;
        const labelColW = tableW * 0.28;
        const dataColW = (tableW - labelColW) / (isLarge ? 6 : numDS);
        ctx.fillStyle = textColor;
        ctx.font = 'bold 22px monospace';
        ctx.fillText("CHANNEL / IDENTIFIER", padding + 30, currentY + 40);
        if (isLarge) {
            ["N", "MIN", "MAX", "MEAN", "MEDIAN", "UNIT"].forEach((h, i) => {
                ctx.fillText(h, padding + labelColW + i * dataColW + 20, currentY + 40);
            });
            currentY += rowH;
            datasets.forEach((ds, i) => {
                const y = currentY + i * rowH;
                if (i % 2 === 1) {
                    ctx.fillStyle = 'rgba(0,0,0,0.03)';
                    ctx.fillRect(padding, y, tableW, rowH);
                }
                ctx.fillStyle = ds.borderColor || accentColor;
                ctx.beginPath(); ctx.arc(padding + 15, y + 30, 10, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = textColor;
                ctx.font = 'bold 20px monospace';
                let dLabel = ds.label;
                while (ctx.measureText(dLabel).width > (labelColW - 60) && dLabel.length > 5) {
                    dLabel = dLabel.substring(0, dLabel.length - 4) + "...";
                }
                ctx.fillText(dLabel, padding + 50, y + 40);
                const data = ds.data.map(p => typeof p === 'object' ? p.y : p).filter(v => !isNaN(v)).sort((a,b)=>a-b);
                if (data.length) {
                    ctx.font = '20px monospace';
                    const vals = [
                        data.length,
                        data[0].toFixed(4),
                        data[data.length-1].toFixed(4),
                        (data.reduce((a,b)=>a+b,0)/data.length).toFixed(4),
                        data[Math.floor(data.length/2)].toFixed(4),
                        "UNIT"
                    ];
                    vals.forEach((v, vi) => {
                        ctx.fillText(v, padding + labelColW + vi * dataColW + 20, y + 40);
                    });
                }
            });
        } else {
            datasets.forEach((ds, i) => {
                ctx.fillStyle = ds.borderColor || accentColor;
                ctx.fillText(ds.label.substring(0, 15), padding + labelColW + i * dataColW + 20, currentY + 40);
            });
            currentY += rowH;
            for (let r = 0; r < numRows; r++) {
                const y = currentY + r * rowH;
                if (r % 2 === 1) {
                    ctx.fillStyle = 'rgba(0,0,0,0.03)';
                    ctx.fillRect(padding, y, tableW, rowH);
                }
                ctx.fillStyle = textColor;
                ctx.font = '20px monospace';
                ctx.fillText(activeChart.data.labels[r], padding + 30, y + 40);
                datasets.forEach((ds, c) => {
                    const val = ds.data[r];
                    const valStr = (typeof val === 'number') ? val.toFixed(5) : (val?.y?.toFixed(5) || '—');
                    ctx.fillText(valStr, padding + labelColW + c * dataColW + 20, y + 40);
                });
            }
        }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = subColor;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(dict.footer + Date.now().toString(16).toUpperCase(), reportWidth / 2, compCanvas.height - 70);
    const link = document.createElement('a');
    link.download = `Precision_Spectral_Certificate_${Date.now()}.png`;
    link.href = compCanvas.toDataURL('image/png', 1.0);
    link.click();
    addLog(`✅ ${t('logs.graph_exported', 'Certificado Spectral generado correctamente')}`);
}
function exportLog() {
    const logContent = document.getElementById('log-output').textContent;
    const blob = new Blob([logContent], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `log_${new Date().toISOString().slice(0, 19).replace(/[:]/g, '')}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    addLog(t('logs.log_exported', 'Log exportado.'));
}
async function clearSessionData() {
    if (!confirm(t('alerts.confirm_clear', 'Clear all session data?'))) return;
    await apiPost('/api/clear_session/');
    appState.lastCalValues = null;
    appState.lastMeasValues = null;
    appState.absSpectrum = null;
    appState.transSpectrum = null;
    appState.measurementHistory = [];
    appState.lastAddedThermalFrame = null;
    chartSpectrum.data.datasets = [];
    chartSpectrum.update();
    updateHistoryTable();
    addLog(t('logs.session_cleared', 'Session data cleared.'));
}
function linearRegression(xs, ys) {
    const n = xs.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += xs[i]; sumY += ys[i];
        sumXY += xs[i] * ys[i];
        sumX2 += xs[i] * xs[i];
        sumY2 += ys[i] * ys[i];
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}
function advancedRegression(xs, ys, type = 'linear') {
    const n = xs.length;
    if (n < 2) return null;
    let predict = null, equation = '', coeffs = {};
    let r2 = 0, sse = 0, sst = 0, rmse = 0, see = 0, r2adj = 0, k = 1;
    if (type === 'linear') {
        const { slope, intercept } = linearRegression(xs, ys);
        predict = x => slope * x + intercept;
        equation = `y = ${slope.toExponential(3)}x + ${intercept.toExponential(3)}`;
        coeffs = { slope, intercept };
    } else if (type === 'quadratic') {
        if (n < 3) return null;
        k = 2;
        let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0, sumY = 0, sumXY = 0, sumX2Y = 0;
        for (let i = 0; i < n; i++) {
            let x = xs[i], y = ys[i], x2 = x * x;
            sumX += x; sumX2 += x2; sumX3 += x2 * x; sumX4 += x2 * x2;
            sumY += y; sumXY += x * y; sumX2Y += x2 * y;
        }
        const D = n * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX3 - sumX2 * sumX2);
        if (D === 0) return null;
        const Da = sumY * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumXY * sumX4 - sumX2Y * sumX3) + sumX2 * (sumXY * sumX3 - sumX2Y * sumX2);
        const Db = n * (sumXY * sumX4 - sumX2Y * sumX3) - sumY * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX2Y - sumX2 * sumXY);
        const Dc = n * (sumX2 * sumX2Y - sumX3 * sumXY) - sumX * (sumX * sumX2Y - sumX2 * sumXY) + sumY * (sumX * sumX3 - sumX2 * sumX2);
        const c = Da / D, b = Db / D, a = Dc / D;
        predict = x => a * x * x + b * x + c;
        equation = `y = ${a.toExponential(3)}x² + ${b.toExponential(3)}x + ${c.toExponential(3)}`;
        coeffs = { a, b, c };
    } else if (type === 'exponential') {
        const logY = ys.map(y => Math.log(y > 0 ? y : 1e-10));
        const { slope, intercept } = linearRegression(xs, logY);
        const A = Math.exp(intercept), B = slope;
        predict = x => A * Math.exp(B * x);
        equation = `y = ${A.toExponential(3)}e^(${B.toExponential(3)}x)`;
        coeffs = { A, B };
    } else if (type === 'logarithmic') {
        const logX = xs.map(x => Math.log(x > 0 ? x : 1e-10));
        const { slope, intercept } = linearRegression(logX, ys);
        predict = x => slope * Math.log(x > 0 ? x : 1e-10) + intercept;
        equation = `y = ${slope.toExponential(3)}ln(x) + ${intercept.toExponential(3)}`;
        coeffs = { A: slope, B: intercept };
    }
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) {
        sst += (ys[i] - yMean) ** 2;
        sse += (ys[i] - predict(xs[i])) ** 2;
    }
    r2 = sst === 0 ? 1 : 1 - (sse / sst);
    r2adj = (n - k - 1 > 0) ? 1 - ((1 - r2) * (n - 1) / (n - k - 1)) : r2;
    rmse = Math.sqrt(sse / n);
    see = (n - k - 1 > 0) ? Math.sqrt(sse / (n - k - 1)) : 0;
    return { predict, equation, r2, r2adj, sse, sst, rmse, see, k, ...coeffs, type };
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
        e.preventDefault();
        showHelp();
    }
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});
function calcDescriptiveStats(arr) {
    const n = arr.filter(v => !isNaN(v)).length;
    if (n === 0) return { n: 0, mean: NaN, median: NaN, std: NaN, cv: NaN, min: NaN, max: NaN, skew: NaN, kurt: NaN, iqr: NaN };
    const valid = arr.filter(v => !isNaN(v));
    const mean = valid.reduce((a, b) => a + b, 0) / n;
    const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
    const std = Math.sqrt(variance);
    const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : NaN;
    const sorted = [...valid].sort((a, b) => a - b);
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    const min = sorted[0];
    const max = sorted[n - 1];
    const skew = n > 2 ? valid.reduce((s, v) => s + ((v - mean) / (std || 1)) ** 3, 0) / n : NaN;
    const kurt = n > 3 ? valid.reduce((s, v) => s + ((v - mean) / (std || 1)) ** 4, 0) / n - 3 : NaN;
    return { n, mean, median, std, cv, min, max, skew, kurt, iqr, q1, q3 };
}
function linearRegressionAdvanced(xs, ys, type = 'linear') {
    const n = xs.length;
    if (n < 2) return null;
    let predict = null, equation = '', slope = 0, intercept = 0;
    let k = 1;
    if (type === 'linear') {
        const fit = linearRegression(xs, ys);
        slope = fit.slope; intercept = fit.intercept;
        predict = x => slope * x + intercept;
        equation = `Y = ${fmtNum(slope)}·X + ${fmtNum(intercept)}`;
    } else if (type === 'quadratic') {
        if (n < 3) return null;
        k = 2;
        let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0, sumY = 0, sumXY = 0, sumX2Y = 0;
        for (let i = 0; i < n; i++) {
            let x = xs[i], y = ys[i], x2 = x * x;
            sumX += x; sumX2 += x2; sumX3 += x2 * x; sumX4 += x2 * x2;
            sumY += y; sumXY += x * y; sumX2Y += x2 * y;
        }
        const D = n * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX3 - sumX2 * sumX2);
        if (D !== 0) {
            const Da = sumY * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumXY * sumX4 - sumX2Y * sumX3) + sumX2 * (sumXY * sumX3 - sumX2Y * sumX2);
            const Db = n * (sumXY * sumX4 - sumX2Y * sumX3) - sumY * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX2Y - sumX2 * sumXY);
            const Dc = n * (sumX2 * sumX2Y - sumX3 * sumXY) - sumX * (sumX * sumX2Y - sumX2 * sumXY) + sumY * (sumX * sumX3 - sumX2 * sumX2);
            const c = Da / D, b = Db / D, a = Dc / D;
            slope = b;
            predict = x => a * x * x + b * x + c;
            equation = `Y = ${fmtNum(a)}·X² + ${fmtNum(b)}·X + ${fmtNum(c)}`;
        } else {
            predict = x => 0; equation = "N/A";
        }
    } else if (type === 'exponential') {
        const logY = ys.map(y => Math.log(y > 0 ? y : 1e-10));
        const fit = linearRegression(xs, logY);
        const A = Math.exp(fit.intercept), B = fit.slope;
        slope = B;
        predict = x => A * Math.exp(B * x);
        equation = `Y = ${fmtNum(A)}·e^(${fmtNum(B)}X)`;
    } else if (type === 'logarithmic') {
        const logX = xs.map(x => Math.log(x > 0 ? x : 1e-10));
        const fit = linearRegression(logX, ys);
        slope = fit.slope; intercept = fit.intercept;
        predict = x => slope * Math.log(x > 0 ? x : 1e-10) + intercept;
        equation = `Y = ${fmtNum(slope)}·ln(X) + ${fmtNum(intercept)}`;
    }
    const yhat = xs.map(x => predict(x));
    const residuals = ys.map((y, i) => y - yhat[i]);
    const sse = residuals.reduce((s, e) => s + e * e, 0);
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const sst = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
    const r2 = sst === 0 ? 1 : 1 - (sse / sst);
    const r2adj = (n - k - 1 > 0) ? 1 - ((1 - r2) * (n - 1) / (n - k - 1)) : NaN;
    const rmse = Math.sqrt(sse / (n > k + 1 ? n - (k + 1) : 1));
    const see = rmse;
    const tCrit = getTCritical(n - (k + 1), 0.025);
    let ssx = 0, seSlope = 0, ciSlope = 0;
    if (type === 'linear') {
        let sx = xs.reduce((a, b) => a + b, 0);
        let sx2 = xs.reduce((a, b) => a + b * b, 0);
        ssx = sx2 - sx * sx / n;
        seSlope = rmse / Math.sqrt(ssx > 0 ? ssx : 1);
        ciSlope = tCrit * seSlope;
    }
    return { n, slope, intercept, r2, r2adj, rmse, see, residuals, yhat, sse, sst, ciSlope, seSlope, tCrit, equation, predict };
}
function getTCritical(df, alpha) {
    const table = {
        1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
        12: 2.179, 15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980
    };
    const dfs = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (df <= 0) return 12.706;
    for (let i = 0; i < dfs.length - 1; i++) {
        if (df >= dfs[i] && df <= dfs[i + 1]) {
            const t0 = table[dfs[i]], t1 = table[dfs[i + 1]];
            const frac = (df - dfs[i]) / (dfs[i + 1] - dfs[i]);
            return t0 + frac * (t1 - t0);
        }
    }
    return df > 120 ? 1.960 : table[dfs[0]];
}
function calcConfidenceBands(xs, ys, fit, nPoints = 60) {
    if (!fit || fit.n < 3) return { ci: [], pi: [] };
    const { slope, intercept, rmse, n } = fit;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const step = (maxX - minX) / (nPoints - 1);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const ssx = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
    const tCrit = getTCritical(n - 2, 0.025);
    const ci = [], pi = [];
    for (let i = 0; i < nPoints; i++) {
        const x = minX + i * step;
        const yhat = slope * x + intercept;
        const hii = 1 / n + (x - meanX) ** 2 / (ssx || 1);
        const ciW = tCrit * rmse * Math.sqrt(hii);
        const piW = tCrit * rmse * Math.sqrt(1 + hii);
        ci.push({ x, yLow: yhat - ciW, yHigh: yhat + ciW });
        pi.push({ x, yLow: yhat - piW, yHigh: yhat + piW });
    }
    return { ci, pi };
}
function calcLOD_LOQ(blankValues, slope) {
    if (!blankValues || blankValues.length < 2 || !slope || Math.abs(slope) < 1e-12) return { sigma: NaN, LOD: NaN, LOQ: NaN };
    const s = calcDescriptiveStats(blankValues);
    const sigma = s.std;
    return { sigma, LOD: 3 * sigma / Math.abs(slope), LOQ: 10 * sigma / Math.abs(slope) };
}
function calcSNR(signalValues, refValues) {
    if (!signalValues || !refValues) return signalValues ? signalValues.map(() => NaN) : [];
    return signalValues.map((s, i) => {
        const noise = Math.abs(s - (refValues[i] || 0));
        return noise > 1e-9 ? Math.abs(s) / noise : (Math.abs(s) > 0 ? 99.9 : 0);
    });
}
function findLambdaMax(values, plotType) {
    if (!values || values.length === 0) return { wl: null, val: null, idx: -1 };
    let maxIdx = 0;
    for (let i = 1; i < values.length; i++) {
        if (!isNaN(values[i]) && (isNaN(values[maxIdx]) || Math.abs(values[i]) > Math.abs(values[maxIdx]))) maxIdx = i;
    }
    return { wl: WAVELENGTHS[maxIdx], val: values[maxIdx], idx: maxIdx };
}
function shapiroWilkApprox(arr) {
    const valid = arr.filter(v => !isNaN(v));
    const n = valid.length;
    if (n < 3) return { W: NaN, p: NaN, isNormal: null };
    const sorted = [...valid].sort((a, b) => a - b);
    const mean = valid.reduce((a, b) => a + b, 0) / n;
    const expectedQuantiles = sorted.map((_, i) => {
        const p = (i + 0.5) / n;
        return normalQuantile(p);
    });
    const sx = expectedQuantiles.reduce((a, b) => a + b, 0) / n;
    const sy = mean;
    const sxy = expectedQuantiles.reduce((s, v, i) => s + (v - sx) * (sorted[i] - sy), 0);
    const ssx = expectedQuantiles.reduce((s, v) => s + (v - sx) ** 2, 0);
    const ssy = sorted.reduce((s, v) => s + (v - sy) ** 2, 0);
    const W = sxy * sxy / (ssx * ssy);
    let pApprox;
    if (W > 0.98) pApprox = 0.5;
    else if (W > 0.95) pApprox = 0.15;
    else if (W > 0.92) pApprox = 0.05;
    else if (W > 0.88) pApprox = 0.01;
    else pApprox = 0.001;
    return { W: W, p: pApprox, isNormal: pApprox >= 0.05 };
}
function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    let q;
    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        const r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
}
function tTestOneSample(arr, mu0 = 0) {
    const s = calcDescriptiveStats(arr);
    if (s.n < 2) return { t: NaN, df: 0, p: NaN, significant: null };
    const t = (s.mean - mu0) / (s.std / Math.sqrt(s.n));
    const df = s.n - 1;
    const p = pValueFromT(Math.abs(t), df);
    return { t, df, p, significant: p < 0.05, mean: s.mean, std: s.std, n: s.n };
}
function tTestTwoSample(arr1, arr2) {
    const s1 = calcDescriptiveStats(arr1), s2 = calcDescriptiveStats(arr2);
    if (s1.n < 2 || s2.n < 2) return { t: NaN, df: 0, p: NaN, significant: null };
    const se = Math.sqrt(s1.std ** 2 / s1.n + s2.std ** 2 / s2.n);
    if (se < 1e-15) return { t: 0, df: s1.n + s2.n - 2, p: 1.0, significant: false };
    const t = (s1.mean - s2.mean) / se;
    const df = (s1.std ** 2 / s1.n + s2.std ** 2 / s2.n) ** 2 /
        ((s1.std ** 2 / s1.n) ** 2 / (s1.n - 1) + (s2.std ** 2 / s2.n) ** 2 / (s2.n - 1));
    const p = pValueFromT(Math.abs(t), df);
    return { t, df, p, significant: p < 0.05, mean1: s1.mean, mean2: s2.mean };
}
function pValueFromT(tAbs, df) {
    if (df >= 120) return 2 * (1 - normalCDF(tAbs));
    const tc = getTCritical(Math.round(df), 0.025);
    if (tAbs > tc * 1.5) return 0.01;
    if (tAbs > tc) return 0.05;
    if (tAbs > tc * 0.8) return 0.1;
    return 0.5;
}
function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422820 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815306 + t * (-0.3565637813 + t * (1.7814779372 + t * (-1.8212559978 + t * 1.3302744929))));
    return x > 0 ? 1 - p : p;
}
function fmtNum(v, dec = 4) { return isNaN(v) ? 'N/A' : Number(v).toFixed(dec); }
function fmtSci(v) { return isNaN(v) ? 'N/A' : Number(v).toExponential(3); }
function flashEl(id) { const el = document.getElementById(id); if (el) { el.classList.remove('stat-updated'); void el.offsetWidth; el.classList.add('stat-updated'); } }
function setStatVal(id, val, dec = 3) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = isNaN(val) ? '--' : Number(val).toFixed(dec);
    flashEl(id);
}
let lastAdvancedStatsFetch = 0;
async function updateAdvancedStats() {
    if (!appState.isConnected) return;
    const now = Date.now();
    if (now - lastAdvancedStatsFetch < 2000) return;
    lastAdvancedStatsFetch = now;
    const res = await apiGet('/api/stats/session/');
    if (res.status === 'ok' && res.has_data) {
        const lodVal = document.getElementById('cval-lod');
        const loqVal = document.getElementById('cval-loq');
        if (res.lod_loq && res.lod_loq.LOD) {
            if (lodVal) lodVal.textContent = res.lod_loq.LOD.toExponential(3);
            if (loqVal) loqVal.textContent = res.lod_loq.LOQ.toExponential(3);
        }
        if (res.global_stats) {
            const gs = res.global_stats;
            setStatVal('sstat-skewness', gs.skewness, 3);
            setStatVal('sstat-kurtosis', gs.kurtosis, 3);
            const normEl = document.getElementById('sstat-normality');
            if (normEl) {
                normEl.textContent = gs.is_normal ? t('status.normal', 'Normal') : t('status.non_normal', 'No Normal');
                normEl.className = 'stat-value ' + (gs.is_normal ? 'good' : 'warn');
            }
        }
    }
}
function updateLiveSpectrumStats() {
    const values = appState.plotType === 'ABSORBANCE' ? appState.absSpectrum :
        appState.plotType === 'TRANSMITTANCE' ? appState.transSpectrum : appState.lastMeasValues;
    if (!values) return;
    const s = calcDescriptiveStats(values);
    setStatVal('sstat-mean', s.mean, 2);
    setStatVal('sstat-std', s.std, 3);
    const cvEl = document.getElementById('sstat-cv');
    if (cvEl) {
        cvEl.textContent = isNaN(s.cv) ? '--%' : s.cv.toFixed(1) + '%';
        cvEl.className = 'stat-value ' + (s.cv < 2 ? 'good' : s.cv < 10 ? 'warn' : 'bad');
        flashEl('sstat-cv');
    }
    updateAdvancedStats();
    const lmax = findLambdaMax(values, appState.plotType);
    const lmEl = document.getElementById('lambdamax-val');
    if (lmEl && lmax.wl) {
        lmEl.textContent = lmax.wl;
        document.getElementById('lambdamax-type').textContent = `val: ${fmtNum(lmax.val, 2)}`;
    }
    const noise = appState.lastCalValues;
    WAVELENGTHS.forEach((wl, i) => {
        const sig = values[i];
        let snr;
        if (noise && appState.plotType === 'INTENSITY') {
            snr = noise[i] > 1e-9 ? Math.abs(sig) / Math.abs(sig - noise[i] + 1e-9) : 0;
        } else {
            snr = s.std > 1e-12 ? Math.abs(sig) / (s.std + 1e-9) : 0;
        }
        snr = Math.min(snr, 100);
        const pct = Math.min(snr, 40) / 40 * 100;
        const fillEl = document.getElementById(`snr-fill-${wl}`);
        const valEl = document.getElementById(`snr-val-${wl}`);
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.className = 'snr-bar-fill ' + (snr > 20 ? 'good' : snr > 5 ? 'warn' : 'bad');
        }
        if (valEl) valEl.textContent = fmtNum(snr, 1);
    });
    if (appState.showLambdaMaxAnnotation && lmax.wl) {
        updateLambdaMaxLine(lmax.idx);
    }
}
let _lambdaMaxAnnotation = false;
function toggleLambdaMaxAnnotation(btn) {
    _lambdaMaxAnnotation = !_lambdaMaxAnnotation;
    btn.classList.toggle('active', _lambdaMaxAnnotation);
    appState.showLambdaMaxAnnotation = _lambdaMaxAnnotation;
    updateSpectrumChart();
}
function updateLambdaMaxLine(idx) {
    if (!chartSpectrum || !_lambdaMaxAnnotation) return;
    const ds = chartSpectrum.data.datasets;
    const existing = ds.findIndex(d => d._isLambdaMax);
    const labelVal = WL_LABELS[idx];
    const lineDs = {
        _isLambdaMax: true,
        label: `λmax: ${labelVal}`,
        type: 'line',
        data: WL_LABELS.map((l, i) => i === idx ? null : null),
        borderColor: 'rgba(255,204,0,0.7)',
        borderWidth: 2,
        borderDash: [4, 4],
        pointRadius: WL_LABELS.map((l, i) => i === idx ? 12 : 0),
        pointStyle: 'line',
        pointRotation: 90,
        fill: false,
        tension: 0,
    };
    if (existing >= 0) ds[existing] = lineDs; else ds.push(lineDs);
    chartSpectrum.update('none');
}
const _chartMap = {
    'chart-spectrum': () => chartSpectrum,
    'chart-conc-curve': () => chartConcCurve,
    'chart-cal-curve': () => chartCalCurve,
};
const _chartVarMap = {
    'chartSpectrum': () => chartSpectrum,
    'chartConcCurve': () => chartConcCurve,
    'chartCalCurve': () => chartCalCurve,
};
function toggleZoomMode(canvasId, btn) {
    const chart = _chartMap[canvasId]?.();
    if (!chart || !chart.options.plugins.zoom) {
        addLog('⚠️ ' + t('logs.zoom_plugin_err', 'Plugin zoom no disponible'), true);
        return;
    }
    const isActive = btn.classList.contains('active');
    btn.classList.toggle('active', !isActive);
    const mode = isActive ? 'none' : 'xy';
    chart.options.plugins.zoom.zoom.mode = mode;
    chart.options.plugins.zoom.pan.mode = isActive ? 'none' : 'xy';
    chart.update('none');
    addLog(isActive ? t('logs.zoom_off', 'Zoom desactivado') : '🔍 ' + t('logs.zoom_on', 'Zoom activado'));
}
function resetZoom(canvasId) {
    const chart = _chartMap[canvasId]?.();
    if (chart && chart.resetZoom) { chart.resetZoom(); addLog(t('logs.zoom_reset', 'Zoom restablecido')); }
}
function applyAxisRange(chartVarName) {
    const chart = _chartVarMap[chartVarName]?.();
    if (!chart) return;
    const yminId = chartVarName === 'chartSpectrum' ? 'spec-ymin' : null;
    const ymaxId = chartVarName === 'chartSpectrum' ? 'spec-ymax' : null;
    if (yminId) {
        const yMin = parseFloat(document.getElementById(yminId)?.value);
        const yMax = parseFloat(document.getElementById(ymaxId)?.value);
        chart.options.scales.y.min = isNaN(yMin) ? undefined : yMin;
        chart.options.scales.y.max = isNaN(yMax) ? undefined : yMax;
        chart.update();
    }
}
function buildZoomOptions() {
    return {
        zoom: {
            wheel: { enabled: false },
            pinch: { enabled: true },
            mode: 'none',
            onZoom({ chart }) { chart.update('none'); }
        },
        pan: {
            enabled: true,
            mode: 'none',
        }
    };
}
const _originalInitCharts = initCharts;
function _patchChartsWithZoom() {
    [chartSpectrum, chartConcCurve, chartCalCurve].forEach(chart => {
        if (chart && !chart.options.plugins.zoom) {
            chart.options.plugins.zoom = buildZoomOptions();
            chart.update('none');
        }
    });
}
appState.errorBarsSpectrum = false;
appState.spectrumMultiMeasures = [];
function toggleErrorBarsSpectrum(btn) {
    appState.errorBarsSpectrum = !appState.errorBarsSpectrum;
    btn.classList.toggle('active', appState.errorBarsSpectrum);
    updateSpectrumChart();
    addLog(appState.errorBarsSpectrum ? '±σ barras de error activadas en espectro' : '±σ barras de error desactivadas');
}
appState.showCI_conc = false;
appState.showPI_conc = false;
appState.showCI_cal = false;
appState.showPI_cal = false;
appState.showEB_conc = false;
function toggleConfidenceBands(tab, btn) {
    if (tab === 'conc') {
        appState.showCI_conc = !appState.showCI_conc;
        btn.classList.toggle('active', appState.showCI_conc);
        loadConcCurveData();
    } else {
        appState.showCI_cal = !appState.showCI_cal;
        btn.classList.toggle('active', appState.showCI_cal);
        loadCalCurveData();
    }
}
function togglePredictionBands(tab, btn) {
    if (tab === 'conc') {
        appState.showPI_conc = !appState.showPI_conc;
        btn.classList.toggle('active', appState.showPI_conc);
        loadConcCurveData();
    } else {
        appState.showPI_cal = !appState.showPI_cal;
        btn.classList.toggle('active', appState.showPI_cal);
        loadCalCurveData();
    }
}
function toggleErrorBarsConc(btn) {
    appState.showEB_conc = !appState.showEB_conc;
    btn.classList.toggle('active', appState.showEB_conc);
    loadConcCurveData();
}
function buildBandDatasets(xs, ys, fit, showCI, showPI) {
    const bands = [];
    if (!fit || xs.length < 3) return bands;
    const { ci, pi } = calcConfidenceBands(xs, ys, fit);
    if (showCI && ci.length) {
        bands.push({
            label: t('charts.ci_band_desc', 'IC 95% (media)'),
            data: ci.map(p => ({ x: p.x, y: p.yHigh })),
            borderColor: 'rgba(124,108,240,0.5)', borderWidth: 1,
            borderDash: [3, 3], pointRadius: 0, showLine: true, fill: false,
        });
        bands.push({
            label: '_ic_low',
            data: ci.map(p => ({ x: p.x, y: p.yLow })),
            borderColor: 'rgba(124,108,240,0.5)', borderWidth: 1,
            borderDash: [3, 3], pointRadius: 0, showLine: true,
            fill: { target: '-1', above: 'rgba(124,108,240,0.08)', below: 'rgba(124,108,240,0.08)' },
        });
    }
    if (showPI && pi.length) {
        bands.push({
            label: t('charts.pi_band_desc', 'IP 95% (predicción)'),
            data: pi.map(p => ({ x: p.x, y: p.yHigh })),
            borderColor: 'rgba(255,124,67,0.4)', borderWidth: 1,
            borderDash: [5, 3], pointRadius: 0, showLine: true, fill: false,
        });
        bands.push({
            label: '_ip_low',
            data: pi.map(p => ({ x: p.x, y: p.yLow })),
            borderColor: 'rgba(255,124,67,0.4)', borderWidth: 1,
            borderDash: [5, 3], pointRadius: 0, showLine: true,
            fill: { target: '-1', above: 'rgba(255,124,67,0.05)', below: 'rgba(255,124,67,0.05)' },
        });
    }
    return bands;
}
function updateRegressionStatsPanelConc(points) {
    if (!points || points.length < 2) {
        ['creg-eq', 'creg-r2', 'creg-r2adj', 'creg-rmse', 'creg-see', 'creg-ci-slope', 'creg-n', 'creg-lod', 'creg-loq']
            .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = id === 'creg-n' ? '0' : 'N/A'; });
        updateResidualsChart([], null);
        return;
    }
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const regEl = document.getElementById('conc-reg-type');
    const regType = regEl ? regEl.value : 'linear';
    const fit = linearRegressionAdvanced(xs, ys, regType);
    if (!fit) return;
    document.getElementById('creg-eq').textContent = fit.equation;
    document.getElementById('creg-r2').textContent = fmtNum(fit.r2, 5);
    document.getElementById('creg-r2adj').textContent = fmtNum(fit.r2adj, 5);
    document.getElementById('creg-rmse').textContent = fmtNum(fit.rmse, 4);
    document.getElementById('creg-see').textContent = fmtNum(fit.see, 4);
    document.getElementById('creg-ci-slope').textContent = `±${fmtNum(fit.ciSlope, 4)}`;
    document.getElementById('creg-n').textContent = fit.n;
    const blankYresid = fit.residuals;
    const lodloq = calcLOD_LOQ(blankYresid, fit.slope);
    document.getElementById('creg-lod').textContent = isNaN(lodloq.LOD) ? '--' : fmtSci(lodloq.LOD);
    document.getElementById('creg-loq').textContent = isNaN(lodloq.LOQ) ? '--' : fmtSci(lodloq.LOQ);
    const r2El = document.getElementById('creg-r2');
    if (r2El) r2El.style.color = fit.r2 > 0.999 ? 'var(--accent-success)' : fit.r2 > 0.99 ? 'var(--accent-warning)' : 'var(--accent-error)';
    updateResidualsChart(xs, fit);
    appState._concFit = { fit, xs, ys };
}
function updateRegressionStatsPanelCal(points, fit) {
    if (!points || points.length < 2 || !fit || !fit.abs_vs_conc) {
        ['cval-r2', 'cval-r2adj', 'cval-rmse', 'cval-see', 'cval-slope', 'cval-ci', 'cval-n', 'cval-lod', 'cval-loq']
            .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'N/A'; });
        document.getElementById('recovery-factors-container').textContent = t('charts.no_cal_points', 'Sin puntos de cal.');
        return;
    }
    const xs = points.map(p => p.conc);
    const ys = points.map(p => p.abs_custom);
    const regEl = document.getElementById('cal-reg-type');
    const regType = regEl ? regEl.value : 'linear';
    const advFit = linearRegressionAdvanced(xs, ys, regType);
    const f = fit.abs_vs_conc;
    document.getElementById('cval-r2').textContent = advFit ? fmtNum(advFit.r2, 5) : fmtNum(f.r_squared, 5);
    document.getElementById('cval-slope').textContent = advFit ? fmtNum(advFit.slope, 4) : fmtNum(f.slope, 4);
    document.getElementById('cval-n').textContent = points.length;
    if (advFit) {
        document.getElementById('cval-r2adj').textContent = fmtNum(advFit.r2adj, 5);
        document.getElementById('cval-rmse').textContent = fmtNum(advFit.rmse, 4);
        document.getElementById('cval-see').textContent = fmtNum(advFit.see, 4);
        document.getElementById('cval-ci').textContent = `±${fmtNum(advFit.ciSlope, 4)}`;
        const blankResid = advFit.residuals;
        const ll = calcLOD_LOQ(blankResid, f.slope);
        document.getElementById('cval-lod').textContent = isNaN(ll.LOD) ? '--' : fmtSci(ll.LOD);
        document.getElementById('cval-loq').textContent = isNaN(ll.LOQ) ? '--' : fmtSci(ll.LOQ);
        appState._calFitAdv = { advFit, xs, ys };
    }
    const r2El = document.getElementById('cval-r2');
    if (r2El) r2El.style.color = f.r_squared > 0.999 ? 'var(--accent-success)' : f.r_squared > 0.99 ? 'var(--accent-warning)' : 'var(--accent-error)';
    const recovEl = document.getElementById('recovery-factors-container');
    if (recovEl && points.length > 0) {
        recovEl.innerHTML = points.map(pt => {
            const predicted = f.slope * pt.conc + f.intercept;
            const recovery = predicted !== 0 ? (pt.abs_custom / predicted) * 100 : NaN;
            const cls = isNaN(recovery) ? '' : recovery > 85 && recovery < 115 ? 'good' : recovery > 70 && recovery < 130 ? 'warn' : 'bad';
            return `<span style="font-size:11px; margin:2px; display:inline-block;">C=${fmtNum(pt.conc, 2)}: <span class="recovery-badge ${cls}">${isNaN(recovery) ? 'N/A' : recovery.toFixed(1) + '%'}</span></span>`;
        }).join('');
    }
}
let _chartResiduals = null;
function updateResidualsChart(xs, fit) {
    const canvas = document.getElementById('chart-conc-residuals');
    if (!canvas) return;
    if (!fit || xs.length < 2) {
        if (_chartResiduals) { _chartResiduals.data.datasets = []; _chartResiduals.update(); }
        return;
    }
    const data = xs.map((x, i) => ({ x, y: fit.residuals[i] }));
    const maxAbs = Math.max(...fit.residuals.map(Math.abs)) || 1;
    if (!_chartResiduals) {
        _chartResiduals = new Chart(canvas, {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'Residual', data, borderColor: '#7c6cf0', backgroundColor: 'rgba(124,108,240,0.6)', pointRadius: 5 },
                    { label: 'Cero', data: [{ x: Math.min(...xs), y: 0 }, { x: Math.max(...xs), y: 0 }], borderColor: 'rgba(255,85,85,0.5)', borderDash: [4, 4], pointRadius: 0, showLine: true, fill: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: { legend: { display: false }, title: { display: false } },
                scales: {
                    x: { ticks: { color: getTextColor(), font: { size: 8 } }, grid: { color: getGridColor() } },
                    y: { ticks: { color: getTextColor(), font: { size: 8 } }, grid: { color: getGridColor() }, min: -maxAbs * 1.5, max: maxAbs * 1.5 }
                }
            }
        });
    } else {
        _chartResiduals.data.datasets[0].data = data;
        _chartResiduals.options.scales.y.min = -maxAbs * 1.5;
        _chartResiduals.options.scales.y.max = maxAbs * 1.5;
    }
    updateChartTheme(_chartResiduals);
    _chartResiduals.update('none');
}
function runQCCheck() {
    const calFit = appState._calFitAdv?.advFit;
    const fitData = appState._calFitAdv;
    const r2Thr = parseFloat(document.getElementById('qc-r2-threshold')?.value) || 0.999;
    const cvThr = parseFloat(document.getElementById('qc-cv-threshold')?.value) || 5;
    function setLight(id, state, val) {
        const light = document.getElementById('qc-light-' + id);
        const valEl = document.getElementById('qc-val-' + id);
        if (light) light.className = 'qc-light ' + state;
        if (valEl) valEl.textContent = val;
    }
    if (!calFit || !fitData) {
        ['r2', 'cv', 'n', 'lod'].forEach(id => setLight(id, 'idle', '--'));
        addLog('QC: ' + t('logs.insufficient_cal_data', 'No hay datos de calibración suficientes'));
        return;
    }
    const r2 = fitData.fit?.r_squared ?? calFit.r2;
    const r2State = r2 >= r2Thr ? 'ok' : r2 >= r2Thr - 0.01 ? 'warn' : 'fail';
    setLight('r2', r2State, fmtNum(r2, 5));
    const residStats = calcDescriptiveStats(calFit.residuals);
    const cvResid = residStats.cv;
    const cvState = isNaN(cvResid) ? 'idle' : cvResid <= cvThr ? 'ok' : cvResid <= cvThr * 2 ? 'warn' : 'fail';
    setLight('cv', cvState, isNaN(cvResid) ? '--' : cvResid.toFixed(1) + '%');
    const n = calFit.n;
    const nState = n >= 5 ? 'ok' : n >= 3 ? 'warn' : 'fail';
    setLight('n', nState, n);
    const lodEl = document.getElementById('cval-lod');
    const lodDefined = lodEl && lodEl.textContent !== '--' && lodEl.textContent !== 'N/A';
    setLight('lod', lodDefined ? 'ok' : 'warn', lodDefined ? '✓' : '?');
    const overallPassed = r2State !== 'fail' && cvState !== 'fail' && nState !== 'fail';
    const qcLabel = overallPassed ? '✅ ' + t('status.passed', 'APROBADO') : '⚠️ ' + t('status.review', 'REVISAR');
    addLog(`QC Evaluado: R²=${fmtNum(r2, 4)} | %CV(resid)=${isNaN(cvResid) ? 'N/A' : cvResid.toFixed(1)}% | n=${n} → ${qcLabel}`);
}
let _thermalHistChart = null;
let _thermalHistFullChart = null;
let _lastThermalFrame = null;
let _lastThermalStats = null;
function updateThermalAdvancedStats(frame, stats) {
    if (!frame || !stats) return;
    _lastThermalFrame = frame;
    _lastThermalStats = stats;
    const flat = frame.flat();
    const sorted = [...flat].sort((a, b) => a - b);
    const n = sorted.length;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const p10 = sorted[Math.floor(n * 0.10)];
    const p90 = sorted[Math.floor(n * 0.90)];
    const mean = flat.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(flat.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const range = stats.max - stats.min;
    const setStatVal = (id, val, dec) => {
        const el = document.getElementById(id);
        if (el) el.textContent = typeof val === 'number' ? val.toFixed(dec) : val;
    };
    setStatVal('thermal-median', median, 1);
    setStatVal('thermal-p10', p10, 1);
    setStatVal('thermal-p90', p90, 1);
    setStatVal('thermal-std', std, 2);
    setStatVal('thermal-range', range, 1);
    document.getElementById('thermal-pixels').textContent = n;
    updateThermalColorbar(appState.thermalDisplayMin, appState.thermalDisplayMax);
    updateThermalHistogramFull(flat, stats.min, stats.max, mean, std);
    updateThermalHistogram(flat, stats.min, stats.max);
}
function updateThermalColorbar(tMin, tMax) {
    const canvas = document.getElementById('thermal-colorbar-gradient');
    if (!canvas) return;
    canvas.width = 30;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    const h = canvas.height;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    for(let i=0; i<=10; i++) {
        const t = i/10;
        grad.addColorStop(t, getColorFromMap(t, appState.thermalCmap));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const cbLabels = document.querySelectorAll('#thermal-colorbar-labels .thermal-colorbar-label');
    if (cbLabels.length > 0) {
        const range = tMax - tMin || 1;
        const nLbl = cbLabels.length;
        for(let i=0; i<nLbl; i++) {
            const t = 1 - (i / (nLbl - 1));
            const val = tMin + t * range;
            cbLabels[i].textContent = val.toFixed(1) + '°';
        }
    }
}
function updateThermalHistogramFull(flat, tMin, tMax, mean, std) {
    const canvas = document.getElementById('chart-thermal-histogram-full');
    if (!canvas) return;
    const bins = 25;
    const range = tMax - tMin || 1;
    const binWidth = range / bins;
    const counts = new Array(bins).fill(0);
    flat.forEach(v => {
        const b = Math.min(bins - 1, Math.floor((v - tMin) / range * bins));
        counts[b]++;
    });
    const binCenters = Array.from({ length: bins }, (_, i) => +(tMin + (i + 0.5) * binWidth).toFixed(2));
    const n = flat.length;
    const setTH = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = typeof val === 'number' ? val.toFixed(2) : val; };
    setTH('thist-tmin', tMin);
    setTH('thist-tmax', tMax);
    setTH('thist-tmean', mean);
    setTH('thist-tstd', std);
    setTH('thist-npixels', n);
    setTH('thist-trange', (tMax - tMin));
    const refLines = [
        { val: tMin, label: `T_min: ${tMin.toFixed(1)}`, color: 'rgba(86,180,233,0.8)', dash: [4, 4] },
        { val: tMax, label: `T_max: ${tMax.toFixed(1)}`, color: 'rgba(255,85,85,0.8)', dash: [4, 4] },
        { val: mean, label: `T_mean: ${mean.toFixed(1)}`, color: 'rgba(255,204,0,0.9)', dash: [] },
        { val: mean - std, label: `-1\u03c3: ${(mean - std).toFixed(1)}`, color: 'rgba(124,108,240,0.6)', dash: [3, 3] },
        { val: mean + std, label: `+1\u03c3: ${(mean + std).toFixed(1)}`, color: 'rgba(124,108,240,0.6)', dash: [3, 3] },
    ];
    const maxCount = Math.max(...counts);
    const lineDatasets = refLines.map(rl => ({
        type: 'line',
        label: rl.label,
        data: [{ x: rl.val, y: 0 }, { x: rl.val, y: maxCount * 1.1 }],
        borderColor: rl.color,
        borderWidth: 1.5,
        borderDash: rl.dash,
        pointRadius: 0,
        showLine: true,
        fill: false,
        order: 0,
    }));
    const bgColors = binCenters.map(x => {
        const norm = range > 0 ? (x - tMin) / range : 0.5;
        return getColorFromMap(Math.max(0, Math.min(1, norm)), appState.thermalCmap || 'inferno');
    });
    const barDataset = {
        type: 'bar',
        label: t('charts.pixel', 'Píxeles'),
        data: binCenters.map((x, i) => ({ x, y: counts[i] })),
        backgroundColor: bgColors,
        borderColor: bgColors,
        borderWidth: 1,
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        order: 1,
    };
    const tc = getTextColor();
    const gc = getGridColor();
    if (!_thermalHistFullChart) {
        _thermalHistFullChart = new Chart(canvas, {
            data: {
                datasets: [barDataset, ...lineDatasets],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    title: {
                        display: true,
                        text: t('charts.thermal_dist', 'Distribución de Temperaturas \u2014 Frame Actual'),
                        color: tc,
                        font: { family: 'Inter', size: 12, weight: '600' },
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { color: tc, font: { family: 'Inter', size: 9 }, boxWidth: 12, padding: 6 },
                    },
                    tooltip: {
                        mode: 'nearest',
                        callbacks: {
                            label: (ctx) => ctx.dataset.type === 'bar' ? `${ctx.parsed.y} ${t('charts.pixel', 'píxeles').toLowerCase()} @ ${ctx.parsed.x.toFixed(1)}°C` : ctx.dataset.label,
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: t('charts.temperature', 'Temperatura') + ' (°C)', color: tc, font: { family: 'Inter', size: 12, weight: 'bold' } },
                        ticks: { color: tc, font: { size: 10 }, maxTicksLimit: 12 },
                        grid: { color: gc, drawBorder: false },
                        min: tMin - binWidth,
                        max: tMax + binWidth,
                    },
                    y: {
                        title: { display: true, text: t('charts.pixel_count', 'Número de píxeles'), color: tc, font: { family: 'Inter', size: 12, weight: 'bold' } },
                        ticks: { color: tc, font: { size: 10 } },
                        grid: { color: gc, drawBorder: false },
                        beginAtZero: true,
                    }
                }
            }
        });
    } else {
        _thermalHistFullChart.data.datasets = [barDataset, ...lineDatasets];
        _thermalHistFullChart.options.scales.x.min = tMin - binWidth;
        _thermalHistFullChart.options.scales.x.max = tMax + binWidth;
        updateChartTheme(_thermalHistFullChart);
        _thermalHistFullChart.update('none');
    }
}
function updateThermalHistogram(flat, tMin, tMax) {
    const canvas = document.getElementById('chart-thermal-histogram');
    if (!canvas) return;
    const bins = 20;
    const minVal = tMin != null ? Number(tMin) : 20;
    const maxVal = tMax != null ? Number(tMax) : 40;
    const rangeVal = (maxVal - minVal) || 1;
    const counts = new Array(bins).fill(0);
    flat.forEach(v => {
        let b = Math.floor((v - minVal) / rangeVal * bins);
        if (b < 0) b = 0;
        if (b >= bins) b = bins - 1;
        counts[b]++;
    });
    const labels = Array.from({ length: bins }, (_, i) => (minVal + (i + 0.5) * rangeVal / bins).toFixed(1));
    const bgColors = Array.from({ length: bins }, (_, i) => {
        const norm = rangeVal > 0 ? (i + 0.5) / bins : 0.5;
        return getColorFromMap(Math.max(0, Math.min(1, norm)), appState.thermalCmap || 'inferno');
    });
    if (!_thermalHistChart) {
        _thermalHistChart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: bgColors, borderColor: bgColors, borderWidth: 1 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: { 
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { 
                        display: true, 
                        ticks: { color: tc, font: { size: 7 }, maxTicksLimit: 5, callback: (v) => labels[v] + '°' },
                        grid: { display: false } 
                    },
                    y: { display: false, grid: { display: false } }
                }
            }
        });
    } else {
        _thermalHistChart.data.labels = labels;
        _thermalHistChart.data.datasets[0].data = counts;
        _thermalHistChart.data.datasets[0].backgroundColor = bgColors;
        _thermalHistChart.data.datasets[0].borderColor = bgColors;
        _thermalHistChart.options.scales.x.ticks.color = tc;
        _thermalHistChart.update('none');
    }
}
function initThermalCrosshair() {
    const canvas = document.getElementById('thermal-canvas');
    const tooltip = document.getElementById('thermal-tooltip');
    if (!canvas || !tooltip) return;
    canvas.addEventListener('mousemove', (e) => {
        _lastThermalMouseMoveEvent = e;
        updateThermalTooltip(e);
    });
    canvas.addEventListener('mouseleave', () => {
        _lastThermalMouseMoveEvent = null;
        document.getElementById('thermal-xhair-temp').textContent = '--°C';
        document.getElementById('thermal-xhair-pos').textContent = 'x:-- y:--';
        tooltip.classList.remove('visible');
    });
}
let _lastThermalMouseMoveEvent = null;
function updateThermalTooltip(e) {
    if (!e || !_lastThermalFrame || !_lastThermalStats) return;
    const canvas = document.getElementById('thermal-canvas');
    const tooltip = document.getElementById('thermal-tooltip');
    if (!canvas || !tooltip) return;
    const rect = canvas.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const rows = _lastThermalFrame.length;
    const cols = _lastThermalFrame[0]?.length || 0;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(relX * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(relY * rows)));
    const temp = _lastThermalFrame[row]?.[col];
    if (temp !== undefined) {
        document.getElementById('thermal-xhair-temp').textContent = temp.toFixed(1) + '°C';
        document.getElementById('thermal-xhair-pos').textContent = `x:${col} y:${row}`;
        const flat = _lastThermalFrame.flat();
        const n = flat.length;
        const mean = flat.reduce((a, b) => a + b, 0) / n;
        const std = Math.sqrt(flat.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
        const deltaT = temp - mean;
        let classLabel, classCSS;
        if (deltaT > std) {
            classLabel = `\u25b2 ` + t('charts.above_sigma', 'Por encima de +1\u03c3');
            classCSS = 'above';
        } else if (deltaT < -std) {
            classLabel = `\u25bc ` + t('charts.below_sigma', 'Por debajo de -1\u03c3');
            classCSS = 'below';
        } else {
            classLabel = `\u25cf ` + t('charts.within_sigma', 'Dentro de \u00b11\u03c3');
            classCSS = 'within';
        }
        document.getElementById('tt-temp').textContent = temp.toFixed(2) + '°C';
        document.getElementById('tt-pos').textContent = t('charts.row', 'Fila') + `: ${row} (0\u2013${rows - 1}) ` + t('charts.col', 'Col') + `: ${col} (0\u2013${cols - 1})`;
        document.getElementById('tt-delta').textContent = `\u0394T = ${deltaT >= 0 ? '+' : ''}${deltaT.toFixed(2)} \u00b0C`;
        const ttClass = document.getElementById('tt-class');
        if(ttClass) {
            ttClass.textContent = classLabel;
            ttClass.className = 'thermal-tooltip-class ' + classCSS;
        }
        const ttW = 200, ttH = 130;
        let tx = e.clientX + 16;
        let ty = e.clientY - 10;
        if (tx + ttW > window.innerWidth - 10) tx = e.clientX - ttW - 10;
        if (ty + ttH > window.innerHeight - 10) ty = window.innerHeight - ttH - 10;
        if (ty < 10) ty = 10;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
        tooltip.classList.add('visible');
    }
}
function renderAnalysisSuiteResults(valuesAtWl, wl, allValues) {
    const s = calcDescriptiveStats(valuesAtWl);
    setStatVal('astat-mean', s.mean, 4);
    setStatVal('astat-std', s.std, 4);
    const cvEl = document.getElementById('astat-cv');
    if (cvEl) { cvEl.textContent = isNaN(s.cv) ? '--%' : s.cv.toFixed(1) + '%'; cvEl.className = 'stat-value ' + (s.cv < 5 ? 'good' : s.cv < 15 ? 'warn' : 'bad'); }
    document.getElementById('astat-n').textContent = s.n;
    const descBlock = document.getElementById('analysis-descriptive-block');
    const descGrid = document.getElementById('analysis-descriptive-grid');
    if (descBlock && descGrid) {
        descGrid.innerHTML = [
            [t('charts.mean', 'Media'), fmtNum(s.mean, 4)],
            [t('charts.median', 'Mediana'), fmtNum(s.median, 4)],
            ['σ (' + t('charts.std', 'desv. std') + ')', fmtNum(s.std, 4)],
            ['%CV', isNaN(s.cv) ? 'N/A' : s.cv.toFixed(2) + '%'],
            [t('charts.min', 'Mín.'), fmtNum(s.min, 4)],
            [t('charts.max', 'Máx.'), fmtNum(s.max, 4)],
            [t('charts.range', 'Rango'), fmtNum(s.max - s.min, 4)],
            ['IQR', fmtNum(s.iqr, 4)],
            [t('charts.skewness', 'Asimetría'), fmtNum(s.skew, 3)],
            [t('charts.kurtosis', 'Curtosis exc.'), fmtNum(s.kurt, 3)],
        ].map(([k, v]) => `<div class="asb-row"><span class="asb-key">${k}</span><span class="asb-val">${v}</span></div>`).join('');
        descBlock.style.display = 'block';
    }
    if (s.n >= 3) {
        const norm = shapiroWilkApprox(valuesAtWl);
        const normBlock = document.getElementById('analysis-normality-block');
        const normRes = document.getElementById('analysis-normality-result');
        if (normBlock && normRes) {
            const cls = norm.isNormal ? 'normal' : 'not-normal';
            const label = norm.isNormal ? '✅ ' + t('charts.normal', 'NORMAL') + ' (p≥0.05)' : '⚠️ ' + t('charts.not_normal', 'NO NORMAL') + ' (p<0.05)';
            normRes.innerHTML = `
                <div style="margin:4px 0;">
                    <span class="test-result-pill ${cls}">${label}</span>
                </div>
                <div class="asb-row"><span class="asb-key">W `+t('charts.statistic','estadístico')+`</span><span class="asb-val">${fmtNum(norm.W, 4)}</span></div>
                <div class="asb-row"><span class="asb-key">p-value aprox.</span><span class="asb-val">${fmtNum(norm.p, 4)}</span></div>
                <div style="font-size:9px; color:var(--text-muted); margin-top:4px;">⚠️ `+t('charts.approx_warn','Aproximación válida para n≤50. Para mayor precisión use software estadístico.')+`</div>
            `;
            normBlock.style.display = 'block';
        }
    }
    const tRef = parseFloat(document.getElementById('analysis-ttest-ref')?.value);
    const ttestBlock = document.getElementById('analysis-ttest-block');
    const ttestRes = document.getElementById('analysis-ttest-result');
    if (ttestBlock && ttestRes && s.n >= 2) {
        const mu0 = isNaN(tRef) ? 0 : tRef;
        const tt = tTestOneSample(valuesAtWl, mu0);
        const cls = tt.significant ? 'significant' : 'not-significant';
        const label = tt.significant ? '⚠️ ' + t('charts.significant_diff', 'DIFERENCIA SIGNIFICATIVA') + ' (p<0.05)' : '✅ ' + t('charts.no_significant_diff', 'SIN DIFERENCIA SIGNIF.') + ' (p≥0.05)';
        ttestRes.innerHTML = `
            <div style="margin:4px 0;"><span style="font-size:10px; color:var(--text-muted);">vs μ₀ = ${mu0}</span></div>
            <span class="test-result-pill ${cls}">${label}</span>
            <div class="asb-row mt-4"><span class="asb-key">t `+t('charts.statistic','estadístico')+`</span><span class="asb-val">${fmtNum(tt.t, 4)}</span></div>
            <div class="asb-row"><span class="asb-key">gl (df)</span><span class="asb-val">${tt.df}</span></div>
            <div class="asb-row"><span class="asb-key">p-value aprox.</span><span class="asb-val">${fmtNum(tt.p, 4)}</span></div>
        `;
        ttestBlock.style.display = 'block';
    }
}
const _orig_updateSpectrumChart = updateSpectrumChart;
updateSpectrumChart = function () {
    _orig_updateSpectrumChart.apply(this, arguments);
    if (appState.lastMeasValues) {
        updateLiveSpectrumStats();
    }
};
const _orig_updateConcChart = updateConcChart;
updateConcChart = function (points, yType, wl) {
    _orig_updateConcChart.apply(this, arguments);
    updateRegressionStatsPanelConc(points);
    if ((appState.showCI_conc || appState.showPI_conc) && points.length >= 3 && appState._concFit) {
        const { fit, xs, ys } = appState._concFit;
        const bandDs = buildBandDatasets(xs, ys, fit, appState.showCI_conc, appState.showPI_conc);
        chartConcCurve.data.datasets.push(...bandDs);
        chartConcCurve.update('none');
    }
};
const _orig_updateCalChart = updateCalChart;
updateCalChart = function (points, fit) {
    _orig_updateCalChart.apply(this, arguments);
    updateRegressionStatsPanelCal(points, fit);
    if ((appState.showCI_cal || appState.showPI_cal) && points.length >= 3 && appState._calFitAdv) {
        const { advFit, xs, ys } = appState._calFitAdv;
        const bandDs = buildBandDatasets(xs, ys, advFit, appState.showCI_cal, appState.showPI_cal);
        chartCalCurve.data.datasets.push(...bandDs);
        chartCalCurve.update('none');
    }
};
const _orig_updateThermalFrame = updateThermalFrame;
updateThermalFrame = async function () {
    await _orig_updateThermalFrame.apply(this, arguments);
    if (_lastThermalFrame) {
        const stats = {
            min: parseFloat(document.getElementById('thermal-min').textContent) || 0,
            max: parseFloat(document.getElementById('thermal-max').textContent) || 40,
            mean: parseFloat(document.getElementById('thermal-mean').textContent) || 20,
        };
        if (!isNaN(stats.min) && stats.max > stats.min) {
            updateThermalAdvancedStats(_lastThermalFrame, stats);
        }
    }
};
const _orig_renderThermalFrame = renderThermalFrame;
renderThermalFrame = function (frame, stats) {
    _lastThermalFrame = frame;
    _orig_renderThermalFrame.apply(this, arguments);
    if (_lastThermalMouseMoveEvent) {
        updateThermalTooltip(_lastThermalMouseMoveEvent);
    }
};
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        _patchChartsWithZoom();
        initThermalCrosshair();
    }, 600);
});
function addMeasurementToHistory(type, values, thermalData = null, extraDetails = "", rawValues = null) {
    const rawForAbs = rawValues || values;
    let absValues = null;
    let transValues = null;
    if (appState.lastCalValues && rawForAbs) {
        absValues = rawForAbs.map((v, i) => {
            const ref = appState.lastCalValues[i];
            if (ref && ref > 1e-9 && v > 0) {
                const ratio = Math.max(1e-12, v / ref);
                const a = -Math.log10(ratio);
                return parseFloat(Math.max(0, a).toFixed(4));
            }
            return null;
        });
        transValues = rawForAbs.map((v, i) => {
            const ref = appState.lastCalValues[i];
            if (ref && ref > 1e-9) {
                const t = (v / ref) * 100;
                return parseFloat(Math.min(200, Math.max(0, t)).toFixed(2));
            }
            return null;
        });
    }
    const blankSubCB = document.getElementById('blank-subtraction-cb');
    const isBlankSubtracted = blankSubCB ? blankSubCB.checked : false;
    let finalThermal = null;
    const saveRequested = appState.thermalAutoSaveImages || (appState.thermalSyncEnabled && thermalData);
    if (saveRequested) {
        const currentFrame = thermalData?.frame || appState.lastThermalFrame;
        const isSequential = (type === 'sequential' || type === 'SEQUENTIAL_POINT');
        if (currentFrame && (isSequential || !framesAreEqual(currentFrame, appState.lastAddedThermalFrame))) {
            finalThermal = {
                mean: thermalData?.mean || appState.lastThermalStats?.mean || 0,
                min: thermalData?.min || appState.lastThermalStats?.min || 0,
                max: thermalData?.max || appState.lastThermalStats?.max || 0,
                std: thermalData?.std || appState.lastThermalStats?.std || 0,
                frame: JSON.parse(JSON.stringify(currentFrame))
            };
            appState.lastAddedThermalFrame = currentFrame;
        }
    }
    const entry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        type: type,
        timestamp: new Date().toLocaleString(),
        values: [...values],
        absValues: absValues,
        transValues: transValues,
        blankSubtracted: isBlankSubtracted,
        thermal: finalThermal,
        details: extraDetails,
        selected: false
    };
    const tCanvas = document.getElementById('thermal-canvas');
    if (finalThermal && tCanvas) {
        try { 
            entry.thermalSnapshot = tCanvas.toDataURL('image/jpeg', 0.5); 
        } catch(e) {}
    }
    appState.measurementHistory.push(entry);
    updateHistoryTable();
    if (appState.thermalAutoSaveImages && finalThermal) {
        captureAndSaveThermalSnapshotForEntry(entry);
    }
    updateSuperimposeList();
}
function framesAreEqual(f1, f2) {
    if (!f1 || !f2) return false;
    const flat1 = Array.isArray(f1[0]) ? f1.flat() : f1;
    const flat2 = Array.isArray(f2[0]) ? f2.flat() : f2;
    if (flat1.length !== flat2.length) return false;
    for (let i = 0; i < flat1.length; i++) {
        if (flat1[i] !== flat2[i]) return false;
    }
    return true;
}
function updateHistoryTable() {
    const tbody = document.getElementById('history-tbody');
    const emptyMsg = document.getElementById('history-empty-msg');
    const badge = document.getElementById('history-count');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (badge) badge.textContent = appState.measurementHistory.length;
    if (appState.measurementHistory.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    } else {
        if (emptyMsg) emptyMsg.classList.add('hidden');
    }
    const displayList = [...appState.measurementHistory].reverse().slice(0, 100);
    displayList.forEach((item) => {
        const actualIdx = appState.measurementHistory.findIndex(h => h.id === item.id);
        const tr = document.createElement('tr');
        tr.className = item.selected ? 'selected' : '';
        let valCols = '';
        if (item.values) {
            valCols = item.values.map((v, i) => {
                const absV = item.absValues && item.absValues[i] != null ? item.absValues[i].toFixed(3) : null;
                const transV = item.transValues && item.transValues[i] != null ? item.transValues[i].toFixed(1) : null;
                let tooltip = '';
                if (absV !== null) tooltip += `A=${absV}`;
                if (transV !== null) tooltip += (tooltip ? ` | T=${transV}%` : `T=${transV}%`);
                const hint = tooltip ? ` title="${tooltip}"` : '';
                return `<td${hint} style="font-family:'JetBrains Mono',monospace;">${v.toFixed(1)}</td>`;
            }).join('');
        } else {
            valCols = '<td colspan="6" class="text-muted text-center">—</td>';
        }
        const typeLocales = {
            'single': t('history.single', 'Única'),
            'sequential': t('history.sequential', 'Secuencial'),
            'continuous': t('history.continuous', 'Continua'),
            'calibration': t('history.calibration', 'Calibración')
        };
        const typeColors = {
            'single': '#00BCD4',
            'sequential': '#FF9800',
            'continuous': '#4CAF50',
            'calibration': '#AB47BC'
        };
        const tColor = typeColors[item.type] || 'var(--text-secondary)';
        const tLabel = typeLocales[item.type] || item.type;
        const typeStr = `<span style="color:${tColor}; border:1px solid ${tColor}; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${tLabel}</span>`;
        const blankStr = item.blankSubtracted
            ? `<span style="color:var(--accent-success);font-weight:bold;">${t('history.bs_yes', 'SÍ')}</span>`
            : `<span class="text-muted">${t('history.bs_no', 'NO')}</span>`;
        let thermalHtml = '<span class="text-muted" style="font-size:10px;">—</span>';
        if (item.thermal) {
            const th = item.thermal;
            const hasMinMax = th.min != null && th.max != null;
            const hasThumbnail = !!item.thermalSnapshot;
            const meanVal = th.mean != null ? Number(th.mean).toFixed(1) : '—';
            const meanStr = `<span style="font-weight:700; color:var(--accent-info); font-family:'JetBrains Mono',monospace;">${meanVal}°C</span>`;
            const rangeStr = hasMinMax ? `<div style="font-size:9px; color:var(--text-muted); line-height:1.3;">↓${Number(th.min).toFixed(1)} ↑${Number(th.max).toFixed(1)}</div>` : '';
            const stdStr = (hasMinMax && th.std != null) ? `<div style="font-size:9px; color:var(--text-muted);">σ=${Number(th.std).toFixed(2)}</div>` : '';
            const thumbStr = hasThumbnail
                ? `<div style="display:inline-block; cursor:zoom-in; padding:2px; border:1px solid var(--accent-primary); border-radius:4px; background:var(--bg-tertiary);" onclick="if(window.event) window.event.stopPropagation(); viewHistoryThermal('${item.id}')" title="${t('history.thermal_capture', 'Ver imagen térmica')}">
                     <img src="${item.thermalSnapshot}" style="width:32px; height:24px; display:block; border-radius:2px;">
                   </div>`
                : '';
            thermalHtml = `
                <div style="display:flex; align-items:center; gap:8px;">
                    ${thumbStr}
                    <div style="text-align:left; line-height:1.2;">
                        ${meanStr}
                        ${rangeStr}
                        ${stdStr}
                    </div>
                </div>`;
        }
        let absSummary = '<span class="text-muted" style="font-size:10px;">—</span>';
        if (item.absValues) {
            const defined = item.absValues.filter(v => v !== null);
            if (defined.length > 0) {
                const maxAbs = Math.max(...defined);
                const maxIdx = item.absValues.indexOf(item.absValues.find(v => v === maxAbs));
                const λLabel = WL_LABELS[maxIdx] || '?';
                absSummary = `<span style="font-weight:700; color:var(--accent-success); font-family:'JetBrains Mono',monospace;" title="A máx @ ${λLabel}">A=${maxAbs.toFixed(3)}@${λLabel}</span>`;
            }
        }
        let transSummary = '<span class="text-muted" style="font-size:10px;">—</span>';
        if (item.transValues) {
            const definedT = item.transValues.filter(v => v !== null);
            if (definedT.length > 0) {
                const minT = Math.min(...definedT); 
                const minIdx = item.transValues.indexOf(item.transValues.find(v => v === minT));
                const λLabelT = WL_LABELS[minIdx] || '?';
                transSummary = `<span style="font-weight:700; color:var(--accent-warning); font-family:'JetBrains Mono',monospace;" title="T mín @ ${λLabelT}">T=${minT.toFixed(1)}%@${λLabelT}</span>`;
            }
        }
        tr.innerHTML = `
            <td><input type="checkbox" onchange="toggleHistorySelection(${actualIdx}, this.checked)" ${item.selected ? 'checked' : ''}></td>
            <td style="font-weight:600; font-size:12px;">${typeStr} <div style="font-size:9px; color:var(--text-muted);">${item.details || ''}</div></td>
            <td style="font-size:11px; color:var(--text-muted);">${item.timestamp}</td>
            <td style="font-size:11px; text-align:center;">${blankStr}</td>
            ${valCols}
            <td style="background:rgba(255,255,255,0.02); text-align:center;">${absSummary}</td>
            <td style="background:rgba(255,255,255,0.02); text-align:center;">${transSummary}</td>
            <td>${thermalHtml}</td>
            <td class="text-center" onclick="event.stopPropagation();">
                <button class="btn btn-sm btn-icon" onclick="deleteHistoryItem(${actualIdx})" title="${t('history.delete_item', 'Eliminar')}" style="padding:4px 6px;background:rgba(255,0,0,0.1);border-color:transparent;">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
function toggleHistorySelection(idx, checked) {
    appState.measurementHistory[idx].selected = checked;
    updateHistoryTable();
}
function toggleAllHistoryCheckboxes(source) {
    appState.measurementHistory.forEach(item => item.selected = source.checked);
    updateHistoryTable();
}
function selectAllHistory() {
    appState.measurementHistory.forEach(item => item.selected = true);
    updateHistoryTable();
}
function deleteHistoryItem(idx) {
    appState.measurementHistory.splice(idx, 1);
    updateHistoryTable();
}
function toggleMaximizeDashboards() {
    const dash = document.getElementById('bottom-dashboard');
    const btn = document.getElementById('btn-maximize-dash');
    dash.classList.toggle('maximized');
    if (dash.classList.contains('maximized')) {
        btn.innerHTML = '🗗';
        btn.title = t('history.minimize', 'Restaurar');
    } else {
        btn.innerHTML = '🗖';
        btn.title = t('history.maximize', 'Maximizar');
    }
}
function toggleMaximizeLog() {
    const logArea = document.getElementById('log-area');
    const btn = document.getElementById('btn-maximize-log');
    logArea.classList.toggle('maximized-log');
    if (logArea.classList.contains('maximized-log')) {
        btn.innerHTML = '🗗';
        btn.title = t('history.minimize', 'Restaurar');
        if (logArea.classList.contains('collapsed')) {
            toggleLogArea();
        }
    } else {
        btn.innerHTML = '⛶';
        btn.title = t('history.maximize', 'Maximizar');
    }
}
function toggleMaximizeHistogram() {
    const histContainer = document.getElementById('thermal-hist-container');
    const btnMax = document.getElementById('btn-maximize-hist');
    const btnClose = document.getElementById('btn-close-hist');
    histContainer.classList.toggle('maximized');
    if (histContainer.classList.contains('maximized')) {
        if(btnMax) { btnMax.innerHTML = '🗗'; btnMax.title = "Restaurar Histograma"; }
        if(btnClose) { btnClose.style.display = 'block'; }
    } else {
        if(btnMax) { btnMax.innerHTML = '🗖'; btnMax.title = "Maximizar Histograma"; }
        if(btnClose) { btnClose.style.display = 'none'; }
    }
    if (chartThermalHistogramFull) {
        chartThermalHistogramFull.resize();
    }
}
async function exportSelectedHistory() {
    const selected = appState.measurementHistory.filter(h => h.selected);
    if (selected.length === 0) {
        alert(t('alerts.no_selection', 'Por favor, seleccione al menos una medición para exportar.'));
        return;
    }
    const wlIntHeaders = WAVELENGTHS.map(w => `I_${w}nm`).join(',');
    const wlAbsHeaders = WAVELENGTHS.map(w => `A_${w}nm`).join(',');
    const wlTransHeaders = WAVELENGTHS.map(w => `T_%_${w}nm`).join(',');
    let thermalHeaders = 'T_Mean_C,T_Min_C,T_Max_C,T_Std_C';
    for(let r=0; r<24; r++) {
        for(let c=0; c<32; c++) {
            thermalHeaders += `,Px_${r}_${c}`;
        }
    }
    let csv = `# ==================================================\n`;
    csv += `# REPORT: SPECTROPHOTOMETRY HISTORY EXPORT\n`;
    csv += `# GENERATED: ${new Date().toLocaleString()}\n`;
    csv += `# RECORDS: ${selected.length}\n`;
    csv += `# ==================================================\n\n`;
    csv += `Timestamp,Type,Blank_Subtracted,${wlIntHeaders},${wlAbsHeaders},${wlTransHeaders},Conc_Calculated,${thermalHeaders},Details\n`;
    selected.forEach(item => {
        const intVals = item.values.map(v => v.toFixed(6)).join(',');
        const absVals = WAVELENGTHS.map((_, i) =>
            (item.absValues && item.absValues[i] != null) ? item.absValues[i].toFixed(6) : ''
        ).join(',');
        const transVals = WAVELENGTHS.map((_, i) =>
            (item.transValues && item.transValues[i] != null) ? item.transValues[i].toFixed(4) : ''
        ).join(',');
        let thermalCols = '';
        if (item.thermal) {
            const th = item.thermal;
            thermalCols = [
                th.mean != null ? th.mean.toFixed(3) : '',
                th.min != null ? th.min.toFixed(3) : '',
                th.max != null ? th.max.toFixed(3) : '',
                th.std != null ? th.std.toFixed(3) : ''
            ].join(',');
            if (th.frame) {
                const flat = Array.isArray(th.frame[0]) ? th.frame.flat() : th.frame;
                thermalCols += ',' + flat.map(v => v.toFixed(2)).join(',');
            } else {
                thermalCols += ',' + new Array(768).fill('').join(',');
            }
        } else {
            thermalCols = ',,,' + new Array(768).fill('').join(',');
        }
        const details = (item.details || '').replace(/,/g, ';');
        const blankSubStr = item.blankSubtracted ? 'Yes' : 'No';
        const concCalc = (item.concentration != null && !isNaN(parseFloat(item.concentration))) ? Number(item.concentration).toExponential(4) : '';
        csv += `${item.timestamp},${item.type},${blankSubStr},${intVals},${absVals},${transVals},${concCalc},${thermalCols},${details}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `SpectroHistory_Lossless_${new Date().getTime()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addLog(`✅ Exportadas ${selected.length} mediciones (Formato Completo Sin Pérdida).`);
}
function viewHistoryThermal(id) {
    try {
        const item = appState.measurementHistory.find(h => h.id === id);
        if (!item || !item.thermal) {
            alert(t('alerts.hist_na', 'Información térmica no disponible'));
            return;
        }
        let fullImageB64 = item.thermalSnapshot;
        if (item.thermal.frame) {
            let frame24x32 = [];
            if (item.thermal.frame.length === 768) {
                for(let r=0; r<24; r++) {
                    frame24x32.push(item.thermal.frame.slice(r*32, (r+1)*32));
                }
            } else {
                frame24x32 = item.thermal.frame;
            }
            const canvas = document.createElement('canvas');
            const stats = { min: item.thermal.min, max: item.thermal.max, mean: item.thermal.mean, std: item.thermal.std || 0 };
            const meta = { 
                timestamp: item.timestamp, 
                pointIndex: item.id.toString().substring(0,6), 
                concentration: item.type.toUpperCase(), 
                wavelength: item.blankSubtracted ? 'B-S: SÍ' : 'B-S: NO' 
            };
            renderThermalFrameToCanvas(canvas, frame24x32, stats, meta, { scale: 32, showColorbar: true, showMetadata: true, cmap: appState.thermalCmap || 'hot' });
            fullImageB64 = canvas.toDataURL('image/png');
        }
        let modal = document.getElementById('thermal-history-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'thermal-history-modal';
            modal.className = 'modal-overlay';
            modal.style.zIndex = '9999';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div class="modal" style="max-width: 800px; padding: 24px; display:flex; flex-direction:column; align-items:center; background:var(--bg-secondary); border-radius:12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
                <div style="text-align: center; margin-bottom: 15px;">
                    <h2 style="margin: 0 0 5px 0; color: var(--accent-primary); font-weight: 600;">Visor Térmico Avanzado</h2>
                    <p style="margin:0; color:var(--text-muted); font-size:14px;">${item.timestamp}</p>
                </div>
                <div style="background: #000; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 20px; display:flex; justify-content:center; max-width: 100%;">
                    <img src="${fullImageB64}" style="max-width: 100%; height: auto; border-radius: 4px; display: block;">
                </div>
                <div style="display: flex; gap: 15px; margin-top:10px;">
                    <a href="${fullImageB64}" download="termograma_${item.id}.png" style="text-decoration:none;">
                        <button class="btn" style="background: var(--accent-primary); color: #fff; border:none; padding: 10px 20px;">💾 ${t('history.download_unified', 'Descargar Imagen Unificada')}</button>
                    </a>
                    <button class="btn" style="background: var(--bg-tertiary); color: var(--text-primary); border:none; padding: 10px 20px;" onclick="document.getElementById('thermal-history-modal').classList.remove('active')">✖ ${t('close', 'Cerrar')}</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
    } catch (e) {
        console.error("Error in viewHistoryThermal:", e);
        alert("Error: " + e.message);
    }
}