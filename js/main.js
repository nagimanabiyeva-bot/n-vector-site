'use strict';

/* =========================================================
   НАСТРОЙКА
   Вставьте в API_URL ссылку развёрнутого веб-приложения Apps Script
   (заканчивается на /exec). Пока строка пустая — сайт показывает
   резервные данные из data/fallback.js, а форма «+» ничего не отправляет.
   ========================================================= */
const CONFIG = Object.freeze({
  API_URL: '',
  REQUEST_TIMEOUT_MS: 10000,
});

const PROGRAM_TYPES = Object.freeze(['Конкурс', 'Обучение', 'Инкубация-Акселерация', 'Финансирование']);

// Поля форм «+» по разделам — совпадают со столбцами листов Google Таблицы.
const SECTIONS = Object.freeze({
  team: {
    title: 'Новый участник команды',
    fields: [
      { name: 'name', label: 'Имя и фамилия', required: true, max: 120 },
      { name: 'role', label: 'Роль в компании', required: true, max: 120 },
      { name: 'bio', label: 'Коротко о себе', type: 'textarea', max: 600 },
      { name: 'tags', label: 'Компетенции', hint: 'Через запятую: Встраиваемые системы, IoT', max: 200 },
      { name: 'photo', label: 'Ссылка на фото', type: 'url', hint: 'Необязательно. Без фото будут показаны инициалы.', max: 400 },
      { name: 'email', label: 'E-mail', type: 'email', max: 160 },
    ],
  },
  projects: {
    title: 'Новый проект',
    fields: [
      { name: 'name', label: 'Название проекта', required: true, max: 160 },
      { name: 'tag', label: 'Метка (например, «Патент №…», «IoT»)', max: 60 },
      { name: 'year', label: 'Год', type: 'number', min: 1990, maxValue: 2100 },
      { name: 'description', label: 'Описание', type: 'textarea', required: true, max: 1200 },
      { name: 'link', label: 'Ссылка', type: 'url', max: 400 },
    ],
  },
  events: {
    title: 'Новое мероприятие',
    fields: [
      { name: 'title', label: 'Название мероприятия', required: true, max: 160 },
      { name: 'date', label: 'Дата', type: 'date', required: true },
      { name: 'location', label: 'Место проведения', max: 160 },
      { name: 'description', label: 'Что делала компания', type: 'textarea', max: 1200 },
      { name: 'link', label: 'Ссылка', type: 'url', max: 400 },
    ],
  },
  programs: {
    title: 'Новая программа поддержки',
    fields: [
      { name: 'type', label: 'Тип программы', type: 'select', options: PROGRAM_TYPES, required: true },
      { name: 'name', label: 'Название программы', required: true, max: 160 },
      { name: 'description', label: 'Описание', type: 'textarea', max: 1200 },
      { name: 'deadline', label: 'Дедлайн подачи заявки', type: 'date' },
      { name: 'link', label: 'Ссылка на официальный сайт', type: 'url', required: true, max: 400 },
    ],
  },
});

/* ---------- Утилиты ---------- */

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
const safeImage = (value) => {
  const raw = String(value || '').trim();
  return /^img\/[\w\-./]+$/.test(raw) && !raw.includes('..') ? raw : safeUrl(raw);
};

const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const splitTags = (value) =>
  String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const formatDate = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
};

const isPublished = (item) => String(item.status || '').trim().toLowerCase() === 'published';

const isSample = (item) => /образец|пример/i.test(`${item.name || ''} ${item.title || ''}`);

const linkLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Ссылка';
  }
};

async function fetchWithTimeout(url, options = {}) {
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

/* ---------- Данные ---------- */

const cache = new Map();

async function loadSection(name) {
  if (cache.has(name)) return cache.get(name);

  let result = null;
  if (CONFIG.API_URL) {
    try {
      const json = await fetchWithTimeout(`${CONFIG.API_URL}?sheet=${encodeURIComponent(name)}`);
      if (!json.ok || !Array.isArray(json.data)) throw new Error(json.error || 'Некорректный ответ');
      result = { items: json.data.filter(isPublished), source: 'remote' };
    } catch (err) {
      console.warn(`[N-VECTOR] Google Таблица недоступна для «${name}», показываем резервные данные.`, err);
    }
  }

  if (!result) {
    const local = (window.NV_FALLBACK && window.NV_FALLBACK[name]) || [];
    result = { items: local.filter(isPublished), source: 'local' };
  }

  cache.set(name, result);
  return result;
}

async function submitEntry(section, data, honeypot) {
  if (!CONFIG.API_URL) {
    throw new Error('Google Таблица ещё не подключена (пустой API_URL в js/main.js). Запись не отправлена.');
  }
  // text/plain — «простой» запрос без CORS-preflight, который Apps Script не поддерживает.
  const json = await fetchWithTimeout(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheet: section, data, website: honeypot }),
  });
  if (!json.ok) throw new Error(json.error || 'Не удалось сохранить запись.');
  return json;
}

/* ---------- Отрисовка ---------- */

const linkCell = (url, label) => {
  const href = safeUrl(url);
  return href
    ? `<a class="row-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || linkLabel(href))} ↗</a>`
    : '<span></span>';
};

const sampleTag = (item) => (isSample(item) ? ' <span class="tag tag-sample">образец</span>' : '');

const memberPhoto = (p) => {
  const src = safeImage(p.photo);
  return src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="lazy" width="400" height="500">`
    : `<span class="member-initials" aria-hidden="true">${escapeHtml(initials(p.name))}</span>`;
};

const tagList = (value) => {
  const tags = splitTags(value);
  return tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : '';
};

const RENDERERS = {
  team: (p) => `
    <article class="member">
      <div class="member-photo">${memberPhoto(p)}</div>
      <div class="member-body">
        <div>
          <div class="member-name">${escapeHtml(p.name)}${sampleTag(p)}</div>
          <div class="member-role">${escapeHtml(p.role)}</div>
        </div>
        ${p.bio ? `<p class="member-bio">${escapeHtml(p.bio)}</p>` : ''}
        ${tagList(p.tags)}
        ${p.email ? `<a class="member-email" href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : ''}
      </div>
    </article>`,

  projects: (p) => `
    <article class="row">
      <div class="row-meta">${p.tag ? `<span class="tag tag-accent">${escapeHtml(p.tag)}</span>` : ''}${p.year ? `<div>${escapeHtml(p.year)}</div>` : ''}</div>
      <div><div class="row-title">${escapeHtml(p.name)}${sampleTag(p)}</div></div>
      <p class="row-body">${escapeHtml(p.description)}</p>
      ${linkCell(p.link)}
    </article>`,

  events: (e) => `
    <article class="row">
      <div class="row-meta">${escapeHtml(formatDate(e.date))}</div>
      <div>
        <div class="row-title">${escapeHtml(e.title)}${sampleTag(e)}</div>
        ${e.location ? `<div class="row-sub">${escapeHtml(e.location)}</div>` : ''}
      </div>
      <p class="row-body">${escapeHtml(e.description)}</p>
      ${linkCell(e.link)}
    </article>`,

  programs: (p) => `
    <article class="row">
      <div class="row-meta"><span class="tag tag-accent">${escapeHtml(p.type)}</span>${p.deadline ? `<div>до ${escapeHtml(formatDate(p.deadline))}</div>` : ''}</div>
      <div><div class="row-title">${escapeHtml(p.name)}${sampleTag(p)}</div></div>
      <p class="row-body">${escapeHtml(p.description)}</p>
      ${linkCell(p.link, 'Сайт программы')}
    </article>`,

  contacts: (p) => `
    <li>
      <div><div class="row-title">${escapeHtml(p.name)}${sampleTag(p)}</div><p class="row-sub">${escapeHtml(p.role)}</p></div>
      <div>${p.email ? `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : '<span class="todo">e-mail не указан</span>'}</div>
    </li>`,
};

const SORTERS = {
  events: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
  projects: (a, b) => Number(b.year || 0) - Number(a.year || 0),
};

function renderList(container, items, variant) {
  const render = RENDERERS[variant];
  container.innerHTML = items.length
    ? items.map(render).join('')
    : '<p class="list-empty">// Пока нет опубликованных записей</p>';
}

function renderSourceNote(section, source) {
  document.querySelectorAll(`[data-source-for="${section}"]`).forEach((el) => {
    el.dataset.source = source;
    el.textContent = source === 'remote' ? 'Данные: Google Таблица' : 'Данные: локальный резерв';
  });
}

function setupProgramFilters(container, items) {
  const bar = document.querySelector('[data-filters="programs"]');
  if (!bar) return renderList(container, items, 'programs');

  const types = ['Все', ...PROGRAM_TYPES];
  bar.innerHTML = types
    .map((t, i) => `<button type="button" class="chip" data-type="${escapeHtml(t)}" aria-pressed="${i === 0}">${escapeHtml(t)}</button>`)
    .join('');

  const apply = (type) => {
    bar.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === type)));
    renderList(container, type === 'Все' ? items : items.filter((p) => p.type === type), 'programs');
  };
  bar.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (chip) apply(chip.dataset.type);
  });
  apply('Все');
}

async function populate(container) {
  const section = container.dataset.list;
  const variant = container.dataset.variant || section;
  const limit = Number(container.dataset.limit) || 0;

  const { items, source } = await loadSection(section);
  const sorted = SORTERS[section] ? [...items].sort(SORTERS[section]) : items;
  const visible = limit ? sorted.slice(0, limit) : sorted;

  renderSourceNote(section, source);
  // Блок, который не нужен без записей (например, «Другие проекты»), скрываем целиком.
  const optionalBlock = container.closest('[data-hide-empty]');
  if (optionalBlock) optionalBlock.hidden = visible.length === 0;
  if (section === 'programs' && !limit) return setupProgramFilters(container, visible);
  renderList(container, visible, variant);
}

function refreshSection(section) {
  cache.delete(section);
  document.querySelectorAll(`[data-list="${section}"]`).forEach(populate);
}

/* ---------- Форма «+» ---------- */

function buildField(field) {
  const id = `f-${field.name}`;
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = field.label;
  if (field.required) {
    const req = document.createElement('span');
    req.className = 'req';
    req.textContent = ' *';
    label.append(req);
  }

  let input;
  if (field.type === 'textarea') {
    input = document.createElement('textarea');
  } else if (field.type === 'select') {
    input = document.createElement('select');
    input.append(new Option('— выберите —', ''));
    field.options.forEach((opt) => input.append(new Option(opt, opt)));
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
  }
  input.id = id;
  input.name = field.name;
  input.required = Boolean(field.required);
  if (field.max) input.maxLength = field.max;
  if (field.min) input.min = field.min;
  if (field.maxValue) input.max = field.maxValue;

  wrap.append(label, input);
  if (field.hint) {
    const hint = document.createElement('span');
    hint.className = 'field-hint';
    hint.id = `${id}-hint`;
    hint.textContent = field.hint;
    input.setAttribute('aria-describedby', hint.id);
    wrap.append(hint);
  }
  return wrap;
}

function createDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'add-dialog';
  dialog.setAttribute('aria-labelledby', 'add-dialog-title');
  dialog.innerHTML = `
    <div class="dialog-head">
      <h2 id="add-dialog-title"></h2>
      <button type="button" class="dialog-close" aria-label="Закрыть">×</button>
    </div>
    <form class="add-form" novalidate>
      <div class="fields"></div>
      <div class="hp" aria-hidden="true"><label>Не заполняйте <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="form-note">Запись появится на сайте после проверки администратором.</p>
      <p class="form-status" role="status" aria-live="polite"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Отмена</button>
        <button type="submit" class="btn">Отправить</button>
      </div>
    </form>`;
  document.body.append(dialog);

  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.querySelector('form').addEventListener('submit', (ev) => handleSubmit(ev, dialog));
  return dialog;
}

function openDialog(section) {
  const schema = SECTIONS[section];
  if (!schema) return;

  const dialog = document.querySelector('dialog.add-dialog') || createDialog();
  const form = dialog.querySelector('form');
  dialog.dataset.section = section;
  dialog.querySelector('#add-dialog-title').textContent = schema.title;

  const fields = form.querySelector('.fields');
  fields.replaceChildren(...schema.fields.map(buildField));

  form.reset();
  setStatus(form, '');
  dialog.showModal();
  fields.querySelector('input, textarea, select')?.focus();
}

function setStatus(form, text, kind) {
  const el = form.querySelector('.form-status');
  el.textContent = text;
  el.classList.toggle('is-error', kind === 'error');
  el.classList.toggle('is-ok', kind === 'ok');
}

function collectData(form, schema) {
  const fd = new FormData(form);
  return Object.fromEntries(schema.fields.map((f) => [f.name, String(fd.get(f.name) || '').trim()]));
}

function validate(data, schema) {
  for (const f of schema.fields) {
    const value = data[f.name];
    if (f.required && !value) return `Заполните поле «${f.label}».`;
    if (value && f.type === 'url' && !safeUrl(value)) return `Поле «${f.label}»: укажите ссылку, начинающуюся с https://`;
    if (value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Проверьте адрес e-mail.';
  }
  return '';
}

async function handleSubmit(ev, dialog) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const section = dialog.dataset.section;
  const schema = SECTIONS[section];
  const data = collectData(form, schema);

  const error = validate(data, schema);
  if (error) return setStatus(form, error, 'error');

  const submitBtn = form.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  setStatus(form, 'Отправляем…');
  try {
    const result = await submitEntry(section, data, form.elements.website.value);
    const published = result.status === 'published';
    setStatus(form, published ? 'Готово — запись опубликована.' : 'Спасибо! Запись отправлена на модерацию.', 'ok');
    form.reset();
    if (published) refreshSection(section);
  } catch (err) {
    const message = err.name === 'AbortError' ? 'Сервер не ответил вовремя. Попробуйте ещё раз.' : err.message;
    setStatus(form, message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

/* ---------- Навигация ---------- */

function setupNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute('aria-current', 'page');
  });

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  document.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => openDialog(btn.dataset.add)));
  document.querySelectorAll('[data-list]').forEach(populate);
});
