# Copyright (c) 2026 Sebastian Herrera Betancur
# Biomicrosystems Research Group | Universidad de los Andes
# PROPRIETARY CODE - Unauthorized use, copying or distribution is strictly prohibited.

import os
from pathlib import Path

print("\n" + "="*60)
print("  PROPRIETARY SOFTWARE - BIO-SPECTROPHOTOMETER CONSOLE")
print("  Copyright (c) 2026 Sebastian Herrera Betancur")
print("  Universidad de los Andes | Biomicrosystems Research Group")
print("  Unauthorized use is strictly prohibited.")
print("="*60 + "\n")
BASE_DIR = Path(__file__).resolve().parent.parent
DJANGO_ENV = os.environ.get('DJANGO_ENV', 'development')
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-$4+#a324+f^j2r_i3jm^rr#0%oj%vluh(ap4^ni$%taf@hms!%'
)
DEBUG = DJANGO_ENV != 'production'
if DJANGO_ENV == 'production':
    ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
else:
    ALLOWED_HOSTS = ['*']
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'spectrometer',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
ROOT_URLCONF = 'spectro_web.urls'
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]
WSGI_APPLICATION = 'spectro_web.wsgi.application'
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]
LANGUAGE_CODE = 'en'
TIME_ZONE = 'America/Bogota'
USE_I18N = True
USE_TZ = True
LANGUAGES = [
    ('en', 'English'),
    ('es', 'Español'),
]
STATIC_URL = 'static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'spectrometer', 'static'),
]
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'