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

// Переводы — из js/i18n.js (подключается раньше этого файла).
const tr = (key, vars) => window.NV_LANG.t(key, vars);
const loc = (item, field) => window.NV_LANG.localized(item, field);

// Значения типов хранятся в таблице по-русски; на сайте показываются переводом.
const PROGRAM_TYPE_KEYS = Object.freeze({
  'Конкурс': 'ptype.contest',
  'Обучение': 'ptype.training',
  'Инкубация-Акселерация': 'ptype.incubation',
  'Финансирование': 'ptype.funding',
});
const PROGRAM_TYPES = Object.freeze(Object.keys(PROGRAM_TYPE_KEYS));
const FILTER_ALL = 'all';
const typeLabel = (value) => (PROGRAM_TYPE_KEYS[value] ? tr(PROGRAM_TYPE_KEYS[value]) : value);

// Поля форм «+» по разделам — совпадают со столбцами листов Google Таблицы. label/hint — ключи словаря.
const SECTIONS = Object.freeze({
  team: {
    title: 'form.team.title',
    fields: [
      { name: 'name', label: 'f.fullName', required: true, max: 120 },
      { name: 'role', label: 'f.role', required: true, max: 120 },
      { name: 'bio', label: 'f.bio', type: 'textarea', max: 600 },
      { name: 'tags', label: 'f.tags', hint: 'f.tagsHint', max: 200 },
      { name: 'photo', label: 'f.photo', type: 'url', hint: 'f.photoHint', max: 400 },
      { name: 'email', label: 'f.email', type: 'email', max: 160 },
    ],
  },
  projects: {
    title: 'form.projects.title',
    fields: [
      { name: 'name', label: 'f.projectName', required: true, max: 160 },
      { name: 'tag', label: 'f.tag', max: 60 },
      { name: 'year', label: 'f.year', type: 'number', min: 1990, maxValue: 2100 },
      { name: 'description', label: 'f.description', type: 'textarea', required: true, max: 1200 },
      { name: 'link', label: 'f.link', type: 'url', max: 400 },
    ],
  },
  events: {
    title: 'form.events.title',
    fields: [
      { name: 'title', label: 'f.eventTitle', required: true, max: 160 },
      { name: 'date', label: 'f.date', type: 'date', required: true },
      { name: 'location', label: 'f.location', max: 160 },
      { name: 'description', label: 'f.eventDesc', type: 'textarea', max: 1200 },
      { name: 'link', label: 'f.link', type: 'url', max: 400 },
    ],
  },
  programs: {
    title: 'form.programs.title',
    fields: [
      { name: 'type', label: 'f.type', type: 'select', options: PROGRAM_TYPES, required: true },
      { name: 'name', label: 'f.programName', required: true, max: 160 },
      { name: 'description', label: 'f.description', type: 'textarea', max: 1200 },
      { name: 'deadline', label: 'f.deadline', type: 'date' },
      { name: 'link', label: 'f.officialLink', type: 'url', required: true, max: 400 },
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

const isSample = (item) => /образец|пример|sample|үлгі/i.test(`${item.name || ''} ${item.title || ''}`);

const linkLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return tr('list.link');
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
  if (!CONFIG.API_URL) throw new Error(tr('form.noBackend'));
  // text/plain — «простой» запрос без CORS-preflight, который Apps Script не поддерживает.
  const json = await fetchWithTimeout(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheet: section, data, website: honeypot }),
  });
  if (!json.ok) throw new Error(json.error || tr('form.saveFailed'));
  return json;
}

/* ---------- Отрисовка ---------- */

const linkCell = (url, label) => {
  const href = safeUrl(url);
  return href
    ? `<a class="row-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || linkLabel(href))} ↗</a>`
    : '<span></span>';
};

const sampleTag = (item) => (isSample(item) ? ` <span class="tag tag-sample">${escapeHtml(tr('list.sample'))}</span>` : '');

const memberPhoto = (p) => {
  const src = safeImage(p.photo);
  return src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(loc(p, 'name'))}" loading="lazy" width="400" height="500">`
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
          <div class="member-name">${escapeHtml(loc(p, 'name'))}${sampleTag(p)}</div>
          <div class="member-role">${escapeHtml(loc(p, 'role'))}</div>
        </div>
        ${loc(p, 'bio') ? `<p class="member-bio">${escapeHtml(loc(p, 'bio'))}</p>` : ''}
        ${tagList(loc(p, 'tags'))}
        ${p.email ? `<a class="member-email" href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : ''}
      </div>
    </article>`,

  projects: (p) => `
    <article class="row">
      <div class="row-meta">${loc(p, 'tag') ? `<span class="tag tag-accent">${escapeHtml(loc(p, 'tag'))}</span>` : ''}${p.year ? `<div>${escapeHtml(p.year)}</div>` : ''}</div>
      <div><div class="row-title">${escapeHtml(loc(p, 'name'))}${sampleTag(p)}</div></div>
      <p class="row-body">${escapeHtml(loc(p, 'description'))}</p>
      ${linkCell(p.link)}
    </article>`,

  events: (e) => `
    <article class="row">
      <div class="row-meta">${escapeHtml(formatDate(e.date))}</div>
      <div>
        <div class="row-title">${escapeHtml(loc(e, 'title'))}${sampleTag(e)}</div>
        ${loc(e, 'location') ? `<div class="row-sub">${escapeHtml(loc(e, 'location'))}</div>` : ''}
      </div>
      <p class="row-body">${escapeHtml(loc(e, 'description'))}</p>
      ${linkCell(e.link)}
    </article>`,

  programs: (p) => `
    <article class="row">
      <div class="row-meta"><span class="tag tag-accent">${escapeHtml(typeLabel(p.type))}</span>${p.deadline ? `<div>${escapeHtml(tr('programs.until', { date: formatDate(p.deadline) }))}</div>` : ''}</div>
      <div><div class="row-title">${escapeHtml(loc(p, 'name'))}${sampleTag(p)}</div></div>
      <p class="row-body">${escapeHtml(loc(p, 'description'))}</p>
      ${linkCell(p.link, tr('programs.site'))}
    </article>`,

  contacts: (p) => `
    <li>
      <div><div class="row-title">${escapeHtml(loc(p, 'name'))}${sampleTag(p)}</div><p class="row-sub">${escapeHtml(loc(p, 'role'))}</p></div>
      <div>${p.email ? `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>` : `<span class="todo">${escapeHtml(tr('contacts.noEmail'))}</span>`}</div>
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
    : `<p class="list-empty">${escapeHtml(tr('list.empty'))}</p>`;
}

function renderSourceNote(section, source) {
  document.querySelectorAll(`[data-source-for="${section}"]`).forEach((el) => {
    el.dataset.source = source;
    el.textContent = tr(source === 'remote' ? 'source.remote' : 'source.local');
  });
}

let activeProgramFilter = FILTER_ALL;

function setupProgramFilters(container, items) {
  const bar = document.querySelector('[data-filters="programs"]');
  if (!bar) return renderList(container, items, 'programs');

  const types = [FILTER_ALL, ...PROGRAM_TYPES];
  bar.innerHTML = types
    .map((type) => {
      const label = type === FILTER_ALL ? tr('filter.all') : typeLabel(type);
      return `<button type="button" class="chip" data-type="${escapeHtml(type)}" aria-pressed="false">${escapeHtml(label)}</button>`;
    })
    .join('');

  const apply = (type) => {
    activeProgramFilter = type;
    bar.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === type)));
    renderList(container, type === FILTER_ALL ? items : items.filter((p) => p.type === type), 'programs');
  };
  // onclick, а не addEventListener: панель перестраивается при смене языка, обработчик не должен дублироваться.
  bar.onclick = (ev) => {
    const chip = ev.target.closest('.chip');
    if (chip) apply(chip.dataset.type);
  };
  apply(activeProgramFilter);
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
  label.textContent = tr(field.label);
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
    input.append(new Option(tr('form.choose'), ''));
    field.options.forEach((opt) => input.append(new Option(typeLabel(opt), opt)));
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
    hint.textContent = tr(field.hint);
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
      <button type="button" class="dialog-close" data-i18n-attr="aria-label:form.close">×</button>
    </div>
    <form class="add-form" novalidate>
      <div class="fields"></div>
      <div class="hp" aria-hidden="true"><label><span data-i18n="form.honeypot"></span> <input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="form-note" data-i18n="form.note"></p>
      <p class="form-status" role="status" aria-live="polite"></p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-cancel data-i18n="form.cancel"></button>
        <button type="submit" class="btn" data-i18n="form.submit"></button>
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

// Заполняет тексты и поля формы на текущем языке, сохраняя уже введённые значения.
function fillDialog(dialog, section) {
  const schema = SECTIONS[section];
  const form = dialog.querySelector('form');
  const values = form.querySelector('.fields').children.length ? collectData(form, schema) : {};

  dialog.dataset.section = section;
  dialog.querySelector('#add-dialog-title').textContent = tr(schema.title);
  window.NV_LANG.apply(dialog);

  const fields = form.querySelector('.fields');
  fields.replaceChildren(...schema.fields.map(buildField));
  Object.entries(values).forEach(([name, value]) => {
    if (form.elements[name]) form.elements[name].value = value;
  });
}

function openDialog(section) {
  if (!SECTIONS[section]) return;

  const dialog = document.querySelector('dialog.add-dialog') || createDialog();
  const form = dialog.querySelector('form');
  form.querySelector('.fields').replaceChildren();
  fillDialog(dialog, section);

  form.reset();
  setStatus(form, '');
  dialog.showModal();
  form.querySelector('.fields input, .fields textarea, .fields select')?.focus();
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
    const label = tr(f.label);
    if (f.required && !value) return tr('err.required', { label });
    if (value && f.type === 'url' && !safeUrl(value)) return tr('err.url', { label });
    if (value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return tr('err.email');
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
  setStatus(form, tr('form.sending'));
  try {
    const result = await submitEntry(section, data, form.elements.website.value);
    const published = result.status === 'published';
    setStatus(form, tr(published ? 'form.published' : 'form.moderation'), 'ok');
    form.reset();
    if (published) refreshSection(section);
  } catch (err) {
    setStatus(form, err.name === 'AbortError' ? tr('form.timeout') : err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

/* ---------- Навигация (на мобильных — выпадающее меню на весь экран) ---------- */

const DESKTOP_NAV_QUERY = window.matchMedia('(min-width: 1121px)');

function setupNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute('aria-current', 'page');
  });

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('nav-open', open);
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  DESKTOP_NAV_QUERY.addEventListener('change', (ev) => {
    if (ev.matches) setOpen(false);
  });
}

/* ---------- Смена языка ---------- */

function onLangChange() {
  document.querySelectorAll('[data-list]').forEach(populate);
  const dialog = document.querySelector('dialog.add-dialog');
  if (dialog?.open) fillDialog(dialog, dialog.dataset.section);
}

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  document.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', () => openDialog(btn.dataset.add)));
  document.querySelectorAll('[data-list]').forEach(populate);
  document.addEventListener('nv:langchange', onLangChange);
});
