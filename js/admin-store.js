'use strict';

/*
  Данные админ-панели. Два режима:
  - remote — Google Таблица через Apps Script (CONFIG.API_URL), каждое действие подтверждается ключом администратора;
  - demo   — без таблицы: правки хранятся в этом браузере (localStorage), видны в предпросмотре сайта (?preview=1)
             и выгружаются в готовый data/fallback.js.
  Ключ администратора держим только в sessionStorage — он забывается при закрытии вкладки.
*/
const AdminStore = (() => {
  const SESSION_KEY = 'nv-admin-session';
  let mode = null;
  let adminKey = '';
  let demoData = null;

  const hasBackend = () => Boolean(CONFIG.API_URL);

  const readSession = () => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const writeSession = (value) => {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* sessionStorage недоступен — после перезагрузки придётся войти заново */
    }
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  /* ---------- remote ---------- */

  async function call(action, payload = {}) {
    let json;
    try {
      json = await fetchJson(CONFIG.API_URL, {
        method: 'POST',
        // text/plain — «простой» запрос без CORS-preflight, который Apps Script не поддерживает.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, key: adminKey, ...payload }),
      });
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? 'Сервер не ответил вовремя. Попробуйте ещё раз.' : 'Нет связи с Google Таблицей. Проверьте интернет и API_URL.');
    }
    if (!json.ok) {
      const error = new Error(json.error || 'Не удалось выполнить действие.');
      error.code = json.code;
      throw error;
    }
    return json;
  }

  /* ---------- demo ---------- */

  function loadDemo() {
    const stored = readDemoData();
    const base = stored || clone(window.NV_FALLBACK || {});
    SECTION_NAMES.forEach((name) => {
      base[name] = (base[name] || []).map((item) => ({ ...item, id: item.id || newId(), status: item.status || 'pending' }));
    });
    return base;
  }

  function saveDemo() {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoData));
    } catch {
      throw new Error('Браузер не даёт сохранить данные (приватный режим?). Правки пропадут после перезагрузки.');
    }
  }

  const findDemo = (section, id) => {
    const index = demoData[section].findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Запись не найдена — возможно, её уже удалили.');
    return index;
  };

  /* ---------- публичный интерфейс ---------- */

  async function login(key) {
    adminKey = String(key || '').trim();
    await call('login');
    mode = 'remote';
    writeSession({ mode, key: adminKey });
  }

  function startDemo() {
    mode = 'demo';
    demoData = loadDemo();
    writeSession({ mode });
  }

  // Восстановить вход после перезагрузки страницы (в пределах той же вкладки).
  function restore() {
    const session = readSession();
    if (!session) return false;
    if (session.mode === 'demo') {
      startDemo();
      return true;
    }
    if (session.mode === 'remote' && session.key && hasBackend()) {
      mode = 'remote';
      adminKey = session.key;
      return true;
    }
    return false;
  }

  function logout() {
    mode = null;
    adminKey = '';
    demoData = null;
    writeSession(null);
  }

  async function list(section) {
    if (mode === 'demo') return clone(demoData[section]);
    const json = await call('list', { sheet: section });
    return json.data;
  }

  async function create(section, data) {
    if (mode === 'demo') {
      const record = { ...data, id: newId() };
      demoData[section] = [...demoData[section], record];
      saveDemo();
      return clone(record);
    }
    return (await call('create', { sheet: section, data })).data;
  }

  async function update(section, id, data) {
    if (mode === 'demo') {
      const index = findDemo(section, id);
      const record = { ...demoData[section][index], ...data, id };
      demoData[section] = demoData[section].map((item, i) => (i === index ? record : item));
      saveDemo();
      return clone(record);
    }
    return (await call('update', { sheet: section, id, data })).data;
  }

  async function remove(section, id) {
    if (mode === 'demo') {
      findDemo(section, id);
      demoData[section] = demoData[section].filter((item) => item.id !== id);
      saveDemo();
      return;
    }
    await call('remove', { sheet: section, id });
  }

  function resetDemo() {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* нечего очищать */
    }
    demoData = loadDemo();
  }

  // Текст готового data/fallback.js со всеми разделами (включая черновики — на сайте они не показываются).
  async function exportFallback() {
    const entries = await Promise.all(SECTION_NAMES.map(async (name) => [name, await list(name)]));
    const data = Object.fromEntries(entries);
    const stamp = new Date().toISOString().slice(0, 10);
    return [
      '/*',
      `  Резервные данные сайта — выгружены из админ-панели ${stamp}.`,
      '  Используются, пока Google Таблица не подключена (пустой API_URL в js/shared.js) или недоступна.',
      '  На сайте показываются только записи со status: "published".',
      '  Переводы: поля с суффиксом _en / _kz (например, bio_en).',
      '*/',
      `window.NV_FALLBACK = ${JSON.stringify(data, null, 2)};`,
      '',
    ].join('\n');
  }

  return Object.freeze({
    hasBackend,
    login,
    startDemo,
    restore,
    logout,
    list,
    create,
    update,
    remove,
    resetDemo,
    exportFallback,
    get mode() { return mode; },
  });
})();
