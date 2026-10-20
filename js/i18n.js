'use strict';

/*
  Переводы сайта (EN / RU / KZ).
  Разметка: data-i18n="ключ" — текст элемента; data-i18n-html="ключ" — разметка из словаря (только наши
  собственные строки); data-i18n-attr="атрибут:ключ; атрибут:ключ" — атрибуты (alt, aria-label…).
  Язык берётся из ?lang=…, затем из сохранённого выбора, затем из языка браузера; по умолчанию — RU.
  После смены языка отправляется событие nv:langchange — по нему main.js перерисовывает списки.
*/
(() => {
  const LANGS = Object.freeze(['en', 'ru', 'kz']);
  const DEFAULT_LANG = 'ru';
  const HTML_LANG = Object.freeze({ en: 'en', ru: 'ru', kz: 'kk' });
  const STORAGE_KEY = 'nv-lang';
  const dicts = window.NV_I18N || {};

  const readStored = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const store = (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* хранилище недоступно (приватный режим) — язык просто не запомнится */
    }
  };

  function detect() {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.includes(fromUrl)) return fromUrl;
    const stored = readStored();
    if (LANGS.includes(stored)) return stored;
    const browser = (navigator.language || '').toLowerCase();
    if (browser.startsWith('kk')) return 'kz';
    if (browser.startsWith('en')) return 'en';
    return DEFAULT_LANG;
  }

  let current = detect();

  function t(key, vars) {
    const text = dicts[current]?.[key] ?? dicts[DEFAULT_LANG]?.[key] ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match)) : text;
  }

  // Поле записи на текущем языке: name_en / name_kz, если заполнено, иначе исходное name.
  const localized = (item, field) => String(item[`${field}_${current}`] || item[field] || '');

  function applyAttrs(el) {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  }

  function applyMeta() {
    const page = document.body.dataset.page;
    if (!page) return;
    document.title = t(`meta.${page}.title`);
    document.querySelector('meta[name="description"]')?.setAttribute('content', t(`meta.${page}.desc`));
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-attr]').forEach(applyAttrs);
    document.documentElement.lang = HTML_LANG[current];
    document.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.lang === current));
    });
    applyMeta();
  }

  function setLang(lang) {
    if (!LANGS.includes(lang) || lang === current) return;
    current = lang;
    store(lang);
    apply();
    document.dispatchEvent(new CustomEvent('nv:langchange', { detail: { lang } }));
  }

  window.NV_LANG = Object.freeze({
    t,
    localized,
    apply,
    setLang,
    get lang() { return current; },
  });

  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  // Скрипт подключён в конце <body>, разметка уже есть — переводим сразу, без мигания русского текста.
  apply();
})();
