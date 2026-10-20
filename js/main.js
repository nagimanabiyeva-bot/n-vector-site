'use strict';

/*
  Публичная (пользовательская) версия сайта — только просмотр.
  Записи читаются из Google Таблицы (CONFIG.API_URL в js/shared.js) или из data/fallback.js.
  Изменения вносятся в админ-панели (admin.html).
*/

// Переводы — из js/i18n.js (подключается раньше этого файла).
const tr = (key, vars) => window.NV_LANG.t(key, vars);
const loc = (item, field) => window.NV_LANG.localized(item, field);

const FILTER_ALL = 'all';
const typeLabel = (value) => (PROGRAM_TYPE_KEYS[value] ? tr(PROGRAM_TYPE_KEYS[value]) : value);

// ?preview=1 — показать правки из демо-режима админки (хранятся только в этом браузере).
const IS_PREVIEW = new URLSearchParams(window.location.search).get('preview') === '1';

/* ---------- Утилиты ---------- */

const splitTags = (value) =>
  String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const isSample = (item) => /образец|пример|sample|үлгі/i.test(`${item.name || ''} ${item.title || ''}`);

const linkLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return tr('list.link');
  }
};

/* ---------- Данные ---------- */

const cache = new Map();

function previewItems(name) {
  const demo = IS_PREVIEW ? readDemoData() : null;
  return demo && Array.isArray(demo[name]) ? demo[name] : null;
}

async function loadSection(name) {
  if (cache.has(name)) return cache.get(name);

  let items = previewItems(name);
  if (!items && CONFIG.API_URL) {
    try {
      const json = await fetchJson(`${CONFIG.API_URL}?sheet=${encodeURIComponent(name)}`);
      if (!json.ok || !Array.isArray(json.data)) throw new Error(json.error || 'Некорректный ответ');
      items = json.data;
    } catch (err) {
      console.warn(`[N-VECTOR] Google Таблица недоступна для «${name}», показываем резервные данные.`, err);
    }
  }
  if (!items) items = (window.NV_FALLBACK && window.NV_FALLBACK[name]) || [];

  const published = items.filter(isPublished);
  cache.set(name, published);
  return published;
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

  const items = await loadSection(section);
  const sorted = SORTERS[section] ? [...items].sort(SORTERS[section]) : items;
  const visible = limit ? sorted.slice(0, limit) : sorted;

  // Блок, который не нужен без записей (например, «Другие проекты»), скрываем целиком.
  const optionalBlock = container.closest('[data-hide-empty]');
  if (optionalBlock) optionalBlock.hidden = visible.length === 0;
  if (section === 'programs' && !limit) return setupProgramFilters(container, visible);
  renderList(container, visible, variant);
}

function showPreviewBanner() {
  if (!IS_PREVIEW) return;
  const banner = document.createElement('div');
  banner.className = 'preview-banner';
  banner.setAttribute('role', 'status');
  banner.dataset.i18n = 'preview.banner';
  banner.textContent = tr('preview.banner');
  document.body.prepend(banner);
  // Сохраняем режим предпросмотра при переходах по меню.
  document.querySelectorAll('a[href$=".html"]').forEach((a) => {
    a.href = `${a.getAttribute('href')}?preview=1`;
  });
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

document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  showPreviewBanner();
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  document.querySelectorAll('[data-list]').forEach(populate);
  // Смена языка: перерисовываем списки (данные уже в кэше).
  document.addEventListener('nv:langchange', () => document.querySelectorAll('[data-list]').forEach(populate));
});
