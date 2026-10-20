'use strict';

/*
  Админ-панель: добавление, редактирование, публикация и удаление записей кнопками.
  Данные — через AdminStore (js/admin-store.js): Google Таблица по ключу или демо-режим в браузере.
  Интерфейс — на трёх языках (EN / RU / KZ), как и сайт: тексты в data/i18n/admin-*.js.
*/

// Переводы — из js/i18n.js (подключается раньше этого файла).
const tr = (key, vars) => window.NV_LANG.t(key, vars);

// Языки содержимого записи (вкладки в редакторе) — не путать с языком интерфейса.
const EDITOR_LANGS = Object.freeze([
  { code: 'ru', label: 'RU', suffix: '' },
  { code: 'en', label: 'EN', suffix: '_en' },
  { code: 'kz', label: 'KZ', suffix: '_kz' },
]);
const ARM_TIMEOUT_MS = 4000;
const TOAST_TIMEOUT_MS = 4000;

// label / hint — ключи словаря. i18n: true — поле заполняется на трёх языках (name, name_en, name_kz).
const ADMIN_SECTIONS = Object.freeze({
  team: {
    titleField: 'name',
    subField: 'role',
    fields: [
      { name: 'name', label: 'admin.f.fullName', required: true, i18n: true, max: 120 },
      { name: 'role', label: 'admin.f.role', required: true, i18n: true, max: 120 },
      { name: 'bio', label: 'admin.f.bio', type: 'textarea', i18n: true, max: 600 },
      { name: 'tags', label: 'admin.f.tags', hint: 'admin.f.tagsHint', i18n: true, max: 200 },
      { name: 'photo', label: 'admin.f.photo', type: 'image', hint: 'admin.f.photoHint', max: 400 },
      { name: 'email', label: 'admin.f.email', type: 'email', max: 160 },
    ],
  },
  projects: {
    titleField: 'name',
    subField: 'tag',
    fields: [
      { name: 'name', label: 'admin.f.projectName', required: true, i18n: true, max: 160 },
      { name: 'tag', label: 'admin.f.tag', i18n: true, max: 60 },
      { name: 'description', label: 'admin.f.description', type: 'textarea', required: true, i18n: true, max: 1200 },
      { name: 'year', label: 'admin.f.year', type: 'year' },
      { name: 'link', label: 'admin.f.link', type: 'url', max: 400 },
    ],
  },
  events: {
    titleField: 'title',
    subField: 'date',
    fields: [
      { name: 'title', label: 'admin.f.eventTitle', required: true, i18n: true, max: 160 },
      { name: 'location', label: 'admin.f.location', i18n: true, max: 160 },
      { name: 'description', label: 'admin.f.eventDesc', type: 'textarea', i18n: true, max: 1200 },
      { name: 'date', label: 'admin.f.date', type: 'date', required: true },
      { name: 'link', label: 'admin.f.link', type: 'url', max: 400 },
    ],
  },
});

const STATUS_FILTERS = Object.freeze([
  { value: 'all', label: 'admin.filterAll' },
  { value: 'published', label: 'admin.filterPublished' },
  { value: 'pending', label: 'admin.filterDrafts' },
]);

const state = {
  section: 'team',
  data: { team: [], projects: [], events: [] },
  statusFilter: 'all',
  query: '',
  editingId: null,
};

const $ = (selector, root = document) => root.querySelector(selector);

/* ---------- Уведомления ---------- */

function toast(message, kind = 'ok') {
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  item.textContent = message;
  $('#toasts').append(item);
  setTimeout(() => item.remove(), TOAST_TIMEOUT_MS);
}

// Кнопка опасного действия срабатывает со второго нажатия (первое — «вы уверены?»).
function isArmed(button, armedKey) {
  if (button.dataset.armed === 'true') return true;
  const original = button.textContent;
  button.dataset.armed = 'true';
  button.textContent = tr(armedKey);
  setTimeout(() => {
    if (!button.isConnected) return;
    button.dataset.armed = 'false';
    button.textContent = original;
  }, ARM_TIMEOUT_MS);
  return false;
}

async function withBusy(button, action) {
  button.disabled = true;
  try {
    await action();
  } catch (err) {
    if (err.code === 'auth') return handleAuthLost();
    toast(err.message, 'error');
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

/* ---------- Вход и выход ---------- */

function showScreen(name) {
  $('#login').hidden = name !== 'login';
  $('#workspace').hidden = name !== 'workspace';
  $('#header-actions').hidden = name !== 'workspace';
}

// Статус входа хранит ключ словаря, чтобы перевестись при смене языка.
function setLoginStatus(key, kind) {
  const el = $('#login-status');
  el.dataset.key = key || '';
  el.textContent = key ? tr(key) : '';
  el.className = `form-status${kind ? ` is-${kind}` : ''}`;
}

function setLoginError(message) {
  const el = $('#login-status');
  el.dataset.key = '';
  el.textContent = message;
  el.className = 'form-status is-error';
}

function setupLogin() {
  const hasBackend = AdminStore.hasBackend();
  $('#no-backend').hidden = hasBackend;
  $('#login-form').hidden = !hasBackend;

  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const key = $('#admin-key').value;
    if (!key.trim()) return setLoginStatus('admin.enterKey', 'error');
    const button = $('#login-form [type="submit"]');
    button.disabled = true;
    setLoginStatus('admin.checking');
    try {
      await AdminStore.login(key);
      $('#admin-key').value = '';
      setLoginStatus('');
      await enterWorkspace();
    } catch (err) {
      setLoginError(err.message);
    } finally {
      button.disabled = false;
    }
  });

  $('#demo-start').addEventListener('click', async () => {
    AdminStore.startDemo();
    await enterWorkspace();
  });
}

function handleAuthLost() {
  AdminStore.logout();
  showScreen('login');
  setLoginStatus('admin.authLost', 'error');
}

function renderModeBadge() {
  const isDemo = AdminStore.mode === 'demo';
  $('#mode-badge').textContent = tr(isDemo ? 'admin.modeDemo' : 'admin.modeRemote');
  $('#mode-badge').dataset.mode = AdminStore.mode || '';
}

async function enterWorkspace() {
  const isDemo = AdminStore.mode === 'demo';
  $('#mode-banner').hidden = !isDemo;
  $('#reset-demo').hidden = !isDemo;
  $('#open-site').href = isDemo ? 'index.html?preview=1' : 'index.html';
  renderModeBadge();
  showScreen('workspace');
  await reloadAll();
}

/* ---------- Данные ---------- */

async function reloadAll() {
  $('#admin-list').innerHTML = `<p class="loading">${escapeHtml(tr('loading'))}</p>`;
  try {
    const lists = await Promise.all(SECTION_NAMES.map((name) => AdminStore.list(name)));
    state.data = Object.fromEntries(SECTION_NAMES.map((name, i) => [name, lists[i]]));
    renderAll();
  } catch (err) {
    if (err.code === 'auth') return handleAuthLost();
    $('#admin-list').innerHTML = `<p class="list-empty">${escapeHtml(err.message)}</p>`;
  }
}

const replaceItem = (section, record) => {
  const items = state.data[section];
  const exists = items.some((item) => item.id === record.id);
  state.data[section] = exists ? items.map((item) => (item.id === record.id ? record : item)) : [...items, record];
};

/* ---------- Отрисовка ---------- */

const i18nFields = (section) => ADMIN_SECTIONS[section].fields.filter((f) => f.i18n);

// Переведена ли запись: все заполненные по-русски поля заполнены и на этом языке.
function isTranslated(section, item, suffix) {
  return i18nFields(section).every((f) => !item[f.name] || String(item[`${f.name}${suffix}`] || '').trim());
}

// Название записи — на языке интерфейса, если перевод заполнен.
const displayValue = (item, field) => {
  const lang = window.NV_LANG.lang;
  const suffix = EDITOR_LANGS.find((l) => l.code === lang)?.suffix || '';
  return String((suffix && item[`${field}${suffix}`]) || item[field] || '');
};

function itemSubtitle(section, item) {
  const field = ADMIN_SECTIONS[section].subField;
  return field === 'date' ? formatDate(item[field]) : displayValue(item, field);
}

function thumbHtml(section, item) {
  const src = section === 'team' ? safeImage(item.photo) : '';
  if (src) return `<img src="${escapeHtml(src)}" alt="" loading="lazy">`;
  return `<span>${escapeHtml(initials(item[ADMIN_SECTIONS[section].titleField]) || '•')}</span>`;
}

function itemHtml(section, item) {
  const published = isPublished(item);
  const title = displayValue(item, ADMIN_SECTIONS[section].titleField) || tr('admin.untitled');
  const langBadges = EDITOR_LANGS.slice(1)
    .map(({ label, suffix }) => {
      const done = isTranslated(section, item, suffix);
      return `<span class="badge badge-lang${done ? ' is-done' : ''}" title="${escapeHtml(tr(done ? 'admin.langDone' : 'admin.langMissing'))}">${label} ${done ? '✓' : '—'}</span>`;
    })
    .join('');
  return `
    <article class="admin-item" data-id="${escapeHtml(item.id)}">
      <div class="admin-thumb" aria-hidden="true">${thumbHtml(section, item)}</div>
      <div class="admin-item-main">
        <div class="admin-item-title">${escapeHtml(title)}</div>
        <div class="admin-item-sub">${escapeHtml(itemSubtitle(section, item))}</div>
        <div class="admin-badges">
          <span class="badge ${published ? 'badge-ok' : 'badge-draft'}">${escapeHtml(tr(published ? 'admin.statusPublished' : 'admin.statusDraft'))}</span>
          ${langBadges}
        </div>
      </div>
      <div class="admin-item-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-act="edit">${escapeHtml(tr('admin.edit'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="toggle">${escapeHtml(tr(published ? 'admin.hide' : 'admin.publish'))}</button>
        <button type="button" class="btn btn-danger btn-sm" data-act="delete">${escapeHtml(tr('admin.delete'))}</button>
      </div>
    </article>`;
}

function visibleItems() {
  const query = state.query.trim().toLowerCase();
  return state.data[state.section].filter((item) => {
    if (state.statusFilter === 'published' && !isPublished(item)) return false;
    if (state.statusFilter === 'pending' && isPublished(item)) return false;
    return !query || Object.values(item).some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderTabs() {
  $('#section-tabs').innerHTML = SECTION_NAMES.map((name) => {
    const items = state.data[name];
    const drafts = items.filter((item) => !isPublished(item)).length;
    return `<button type="button" class="admin-tab" data-section="${name}" aria-pressed="${name === state.section}">
      ${escapeHtml(tr(`admin.sec.${name}`))} <span class="admin-tab-count">${items.length}</span>${drafts ? `<span class="admin-tab-drafts" title="${escapeHtml(tr('admin.drafts'))}">${drafts}</span>` : ''}
    </button>`;
  }).join('');
}

function renderFilters() {
  $('#status-filters').innerHTML = STATUS_FILTERS.map(
    (f) => `<button type="button" class="chip" data-status="${f.value}" aria-pressed="${f.value === state.statusFilter}">${escapeHtml(tr(f.label))}</button>`,
  ).join('');
}

function renderList() {
  const items = visibleItems();
  $('#section-title').textContent = tr(`admin.sec.${state.section}`);
  $('#admin-list').innerHTML = items.length
    ? items.map((item) => itemHtml(state.section, item)).join('')
    : `<p class="list-empty">${escapeHtml(tr(state.data[state.section].length ? 'admin.emptyFilter' : 'admin.emptySection'))}</p>`;
}

function renderAll() {
  renderTabs();
  renderFilters();
  renderList();
}

/* ---------- Действия со списком ---------- */

async function togglePublished(button, item) {
  await withBusy(button, async () => {
    const status = isPublished(item) ? 'pending' : 'published';
    const record = await AdminStore.update(state.section, item.id, { status });
    replaceItem(state.section, record);
    renderAll();
    toast(tr(status === 'published' ? 'admin.toastPublished' : 'admin.toastHidden'));
  });
}

async function deleteItem(button, item) {
  if (!isArmed(button, 'admin.confirmDelete')) return;
  await withBusy(button, async () => {
    await AdminStore.remove(state.section, item.id);
    state.data[state.section] = state.data[state.section].filter((x) => x.id !== item.id);
    renderAll();
    toast(tr('admin.toastDeleted'));
  });
}

function setupList() {
  $('#section-tabs').addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-section]');
    if (!tab) return;
    state.section = tab.dataset.section;
    renderAll();
  });
  $('#status-filters').addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-status]');
    if (!chip) return;
    state.statusFilter = chip.dataset.status;
    renderAll();
  });
  $('#search').addEventListener('input', (ev) => {
    state.query = ev.target.value;
    renderList();
  });
  $('#admin-list').addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-act]');
    if (!button) return;
    const id = button.closest('[data-id]').dataset.id;
    const item = state.data[state.section].find((x) => x.id === id);
    if (!item) return;
    if (button.dataset.act === 'edit') openEditor(item);
    if (button.dataset.act === 'toggle') togglePublished(button, item);
    if (button.dataset.act === 'delete') deleteItem(button, item);
  });

  $('#add-item').addEventListener('click', () => openEditor(null));
  $('#reload').addEventListener('click', (ev) => withBusy(ev.currentTarget, reloadAll));
  $('#export').addEventListener('click', (ev) => withBusy(ev.currentTarget, exportFallback));
  $('#reset-demo').addEventListener('click', (ev) => {
    if (!isArmed(ev.currentTarget, 'admin.confirmReset')) return;
    AdminStore.resetDemo();
    reloadAll();
    toast(tr('admin.toastReset'));
  });
  $('#logout').addEventListener('click', () => {
    AdminStore.logout();
    showScreen('login');
    setLoginStatus('admin.loggedOut');
  });
}

async function exportFallback() {
  const text = await AdminStore.exportFallback();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fallback.js';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(tr('admin.toastExported'));
}

/* ---------- Редактор записи ---------- */

function fieldControl(field, name, value, required) {
  const id = `ed-${name}`;
  const req = required ? ' <span class="req">*</span>' : '';
  const hint = field.hint ? `<span class="field-hint" id="${id}-hint">${escapeHtml(tr(field.hint))}</span>` : '';
  const describedBy = field.hint ? ` aria-describedby="${id}-hint"` : '';
  const common = `id="${id}" name="${name}"${required ? ' required' : ''}${field.max ? ` maxlength="${field.max}"` : ''}${describedBy}`;
  const safeValue = escapeHtml(value);

  let control;
  if (field.type === 'textarea') control = `<textarea ${common}>${safeValue}</textarea>`;
  else if (field.type === 'select') {
    const options = field.options.map((opt) => `<option value="${escapeHtml(opt)}"${opt === value ? ' selected' : ''}>${escapeHtml(opt)}</option>`).join('');
    control = `<select ${common}><option value="">${escapeHtml(tr('admin.choose'))}</option>${options}</select>`;
  } else {
    const type = { url: 'url', email: 'email', date: 'date', year: 'number' }[field.type] || 'text';
    const extra = field.type === 'year' ? ' min="1990" max="2100" step="1"' : '';
    control = `<input type="${type}" ${common}${extra} value="${safeValue}">`;
  }
  return `<div class="field"><label for="${id}">${escapeHtml(tr(field.label))}${req}</label>${control}${hint}</div>`;
}

function langPanelHtml(section, values, lang, activeLang) {
  const fields = i18nFields(section)
    .map((f) => fieldControl(f, `${f.name}${lang.suffix}`, values[`${f.name}${lang.suffix}`] || '', f.required && lang.code === 'ru'))
    .join('');
  const note = lang.code === 'ru' ? tr('admin.noteRu') : tr('admin.noteLang', { lang: lang.label });
  return `<div class="editor-panel" data-panel="${lang.code}"${lang.code === activeLang ? '' : ' hidden'}>
    <p class="form-note">${escapeHtml(note)}</p>${fields}</div>`;
}

// Отрисовать форму по значениям записи (при смене языка интерфейса — с уже введёнными данными).
function renderEditor(values, published, activeLang = 'ru') {
  const section = state.section;
  const config = ADMIN_SECTIONS[section];
  $('#editor-title').textContent = state.editingId
    ? tr('admin.editTitle', { name: displayValue(values, config.titleField) })
    : tr(`admin.new.${section}`);
  $('#editor-published').checked = published;
  $('#editor-langs').innerHTML = EDITOR_LANGS.map(
    (lang) => `<button type="button" class="chip" data-lang-tab="${lang.code}" aria-pressed="${lang.code === activeLang}">${lang.label}</button>`,
  ).join('');
  $('#editor-panels').innerHTML = EDITOR_LANGS.map((lang) => langPanelHtml(section, values, lang, activeLang)).join('');
  $('#editor-common').innerHTML = config.fields
    .filter((f) => !f.i18n)
    .map((f) => fieldControl(f, f.name, values[f.name] || '', f.required))
    .join('');
}

function openEditor(item) {
  state.editingId = item ? item.id : null;
  renderEditor(item || {}, item ? isPublished(item) : false);
  setEditorStatus('');
  $('#editor').showModal();
  $('#editor-panels input, #editor-panels textarea')?.focus();
}

function switchEditorLang(code) {
  document.querySelectorAll('[data-lang-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langTab === code)));
  document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== code; });
}

function setEditorStatus(text, kind) {
  const el = $('#editor-status');
  el.textContent = text;
  el.className = `form-status${kind ? ` is-${kind}` : ''}`;
}

function collectEditor() {
  const form = $('#editor-form');
  const data = {};
  ADMIN_SECTIONS[state.section].fields.forEach((f) => {
    const names = f.i18n ? EDITOR_LANGS.map((l) => `${f.name}${l.suffix}`) : [f.name];
    names.forEach((name) => { data[name] = String(form.elements[name]?.value || '').trim(); });
  });
  data.status = $('#editor-published').checked ? 'published' : 'pending';
  return data;
}

// Возвращает [текст ошибки, код языка вкладки с ошибкой].
function validateEditor(data) {
  for (const f of ADMIN_SECTIONS[state.section].fields) {
    const value = data[f.name];
    const label = tr(f.label);
    if (f.required && !value) return [tr('admin.errRequired', { label, lang: f.i18n ? ' (RU)' : '' }), 'ru'];
    if (!value) continue;
    if (f.type === 'url' && !safeUrl(value)) return [tr('admin.errUrl', { label }), null];
    if (f.type === 'image' && !safeImage(value)) return [tr('admin.errImage', { label }), null];
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return [tr('admin.errEmail'), null];
    if (f.type === 'year' && !/^\d{4}$/.test(value)) return [tr('admin.errYear'), null];
  }
  return ['', null];
}

async function saveEditor(ev) {
  ev.preventDefault();
  const data = collectEditor();
  const [error, lang] = validateEditor(data);
  if (error) {
    if (lang) switchEditorLang(lang);
    return setEditorStatus(error, 'error');
  }

  const button = $('#editor-form [type="submit"]');
  button.disabled = true;
  setEditorStatus(tr('admin.saving'));
  try {
    const record = state.editingId
      ? await AdminStore.update(state.section, state.editingId, data)
      : await AdminStore.create(state.section, data);
    replaceItem(state.section, record);
    renderAll();
    $('#editor').close();
    toast(tr(state.editingId ? 'admin.toastSaved' : 'admin.toastAdded'));
  } catch (err) {
    if (err.code === 'auth') {
      $('#editor').close();
      return handleAuthLost();
    }
    setEditorStatus(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function setupEditor() {
  const dialog = $('#editor');
  $('#editor-form').addEventListener('submit', saveEditor);
  $('#editor-langs').addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-lang-tab]');
    if (tab) switchEditorLang(tab.dataset.langTab);
  });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });
}

/* ---------- Смена языка интерфейса ---------- */

function onLangChange() {
  const status = $('#login-status');
  if (status.dataset.key) status.textContent = tr(status.dataset.key);
  if (!$('#workspace').hidden) {
    renderModeBadge();
    renderAll();
  }
  const dialog = $('#editor');
  if (dialog.open) {
    const activeLang = document.querySelector('[data-lang-tab][aria-pressed="true"]')?.dataset.langTab || 'ru';
    const values = collectEditor();
    renderEditor(values, values.status === 'published', activeLang);
  }
}

/* ---------- Запуск ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  setupLogin();
  setupList();
  setupEditor();
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  document.addEventListener('nv:langchange', onLangChange);
  if (AdminStore.restore()) await enterWorkspace();
  else showScreen('login');
});
