'use strict';

/* =========================================================
   НАСТРОЙКА (общая для сайта и админ-панели)
   Вставьте в API_URL ссылку развёрнутого веб-приложения Apps Script
   (заканчивается на /exec). Пока строка пустая — сайт показывает
   данные из data/fallback.js, а админ-панель работает в демо-режиме.
   ========================================================= */
const CONFIG = Object.freeze({
  API_URL: '',
  REQUEST_TIMEOUT_MS: 10000,
});

const SECTION_NAMES = Object.freeze(['team', 'projects', 'events']);

// Хранилище демо-режима админки: правки, сделанные без Google Таблицы, видны в предпросмотре сайта (?preview=1).
const DEMO_STORAGE_KEY = 'nv-admin-demo';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Пропускаем только http(s)-ссылки: защита от javascript: и прочих схем.
const safeUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

// Фото: внешние http(s)-ссылки или файлы из папки img/ самого сайта.
const isSiteImagePath = (value) => /^img\/[\w\-./]+$/.test(value) && !value.includes('..');
const safeImage = (value) => {
  const raw = String(value || '').trim();
  return isSiteImagePath(raw) ? raw : safeUrl(raw);
};

const isPublished = (item) => String(item.status || '').trim().toLowerCase() === 'published';

const formatDate = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
};

const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function readDemoData() {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
