<!--
  Copyright (c) 2026 Sebastian Herrera Betancur
  Biomicrosystems Research Group | Universidad de los Andes
  PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.
-->

# 🔬 Bio-Spectrophotometer IoT Web Console
### High-Precision Analytical Platform for Raspberry Pi, Django & Real-Time Thermography

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Django 6.0](https://img.shields.io/badge/django-6.0-092e20.svg)](https://www.djangoproject.com/)
[![Platform Raspberry Pi](https://img.shields.io/badge/platform-Raspberry%20Pi-C51A4A.svg)](https://www.raspberrypi.org/)
[![Status Production](https://img.shields.io/badge/status-production--ready-success.svg)]()
[![License Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](#-license--usage-restrictions)

The **Bio-Spectrophotometer Web Console** is a sophisticated IoT ecosystem designed to transform a Raspberry Pi into a professional-grade laboratory instrument. It integrates visible spectrum analysis with high-resolution thermal imaging to provide a complete kinetic and spectral monitoring solution for biomicrosystems research.

---

## 🌟 Core Capabilities

*   **Multi-Spectral Acquisition**: Real-time 6-channel visible light capture (450nm - 650nm) using calibrated optical sensors.
*   **Thermal Kinetic Monitoring**: High-resolution (32x24) thermal matrix acquisition for temperature-dependent reaction analysis.
*   **Scientific Processing Engine**:
    *   **Absorbance & Transmittance**: Real-time metrological calculations based on the Beer-Lambert Law.
    *   **Statistical Robustness**: Automated LOD (Limit of Detection) and LOQ (Limit of Quantification) estimation.
    *   **Inter-Instrumental Normalization**: Advanced linear transfer models to synchronize readings with high-end reference spectrophotometers.
*   **Responsive Control Interface**: A high-performance SPA (Single Page Application) with real-time data visualization via Chart.js.
*   **Dual-Operating Modes**: Native Raspberry Pi hardware execution and a full-featured **Hardware Emulation Mode** for cross-platform development.

---

## 📐 Technical Architecture

### 1. Hardware Integration Layer
The system utilizes a dual-bus I2C architecture to ensure maximum signal integrity and prevent timing jitter during high-frequency sampling.

| Component | Bus / Pin | Protocol | Purpose |
| :--- | :--- | :--- | :--- |
| **AS726X** | I2C (Bus 22) | SMBus | 6-channel visible spectrophotometry. |
| **MLX90640** | I2C (Bus 1) | I2C High Speed | 768-pixel thermal focal plane array. |
| **Active LED** | GPIO 17 | Digital Out | Synchronized pulse-width illumination. |

> [!IMPORTANT]
> Bus 22 is used to isolate the sensitive optical sensor from the high-bandwidth thermal data traffic on Bus 1, ensuring zero-collision acquisition.

### 2. Software Stack & Design Patterns
*   **Backend**: Django 6.0 implementing a **Single-Instrument State Model**.
    *   *Thread Safety*: Uses `threading.Lock` to ensure atomic hardware access in a multi-user environment.
    *   *Virtualization*: Automatic fallback to emulated hardware using Gaussian noise models when I2C buses are unavailable.
*   **Frontend**: Vanilla JavaScript with an event-driven architecture.
    *   *Real-Time Sync*: Polling-based state synchronization with the Django backend.
    *   *Multi-Language*: Dynamic translation engine (English/Spanish) without session interruption.
*   **Scientific Engine**: NumPy and SciPy backend for linear regressions, polynomial fitting, and outlier detection.

---

## 🧪 Scientific Data Flow & Metrology

The platform implements a rigorous analytical pipeline for chemical quantification:

### Absorbance Calculation
$$A = -\log_{10} \left( \frac{I_{sample} - I_{dark}}{I_{reference} - I_{dark}} \right)$$

### Concentration Estimation
The system supports three methods for concentration calculation:
1.  **Direct Beer-Lambert**: $c = A / (\epsilon \cdot l)$
2.  **Session Calibration Curve**: $c = (A - b) / m$ (Calculated from standards measured in-situ).
3.  **Reference Transfer Model**: $A_{adj} = m_{trans} \cdot A + b_{trans}$, then solving against a master instrument's curve.

---

## 🚀 Getting Started

### Installation
```bash
# Clone the proprietary repository
git clone https://github.com/your-org/spectro-iot.git
cd spectro-iot

# Setup Python environment
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Deployment on Raspberry Pi
1. Enable I2C via `raspi-config`.
2. Configure the secondary I2C bus (Bus 22) in `/boot/config.txt`.
3. Run the automated setup:
```bash
sudo ./setup_pi.sh
python manage.py runserver 0.0.0.0:8000
```

---

## 📂 Project Structure

```text
├── spectro_web/          # Django Project Configuration
├── spectrometer/         # Main Application Logic
│   ├── hardware.py       # Hardware abstraction layer & Emulation
│   ├── views.py          # API Endpoints & State Management
│   ├── utils.py          # Translations & Math Utilities
│   └── templates/        # SPA HTML structure
├── static/               # CSS (Modern Lab UI) & Vanilla JS
├── doc/                  # Scientific papers & technical specs
├── LICENSE               # Proprietary License
└── manage.py             # System entry point
```

---

## ⚖️ License & Usage Restrictions

> [!CAUTION]
> **PROPRIETARY AND CONFIDENTIAL**

This software is **NOT Open Source**. All rights, including intellectual property, belong to **Sebastian Herrera Betancur** and the **Universidad de los Andes**.

1.  **Unauthorized copying**, modification, or distribution is strictly prohibited.
2.  **Reverse engineering** or attempting to extract the underlying hardware communication protocols is a violation of the license.
3.  **Academic review** is permitted only under the context of the official evaluation period.

For licensing inquiries, please visit the **Biomicrosystems Research Group** or contact the author directly.

---
*Developed with excellence for the next generation of portable analytical chemistry.*
