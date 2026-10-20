/**
 * Бэкенд сайта N-VECTOR на Google Apps Script.
 *
 *   GET  ?sheet=team|projects|events            → опубликованные записи листа (JSON), для сайта
 *   POST {action, key, sheet, id, data}         → действия админ-панели, только с ключом администратора:
 *        login  — проверить ключ
 *        list   — все записи листа (и опубликованные, и черновики)
 *        create — добавить запись
 *        update — изменить запись по id (передаются только меняемые поля)
 *        remove — удалить запись по id
 *
 * Ключ администратора хранится в свойствах скрипта (Настройки проекта → Свойства скрипта → ADMIN_KEY),
 * а не в коде. Без него все действия админ-панели отклоняются.
 * Перед первым развёртыванием запустите setup() — она создаст листы и недостающие столбцы.
 */

// Столбцы листов. Поля с суффиксом _en / _kz — переводы для английской и казахской версий сайта.
const SCHEMA = {
  team: ['id', 'name', 'name_en', 'name_kz', 'role', 'role_en', 'role_kz', 'bio', 'bio_en', 'bio_kz',
    'tags', 'tags_en', 'tags_kz', 'photo', 'email', 'status'],
  projects: ['id', 'name', 'name_en', 'name_kz', 'tag', 'tag_en', 'tag_kz',
    'description', 'description_en', 'description_kz', 'year', 'link', 'status'],
  events: ['id', 'title', 'title_en', 'title_kz', 'date', 'location', 'location_en', 'location_kz',
    'description', 'description_en', 'description_kz', 'link', 'status'],
};

const REQUIRED = {
  team: ['name', 'role'],
  projects: ['name', 'description'],
  events: ['title', 'date'],
};

const URL_FIELDS = ['link', 'photo'];
const DATE_FIELDS = ['date', 'deadline'];
const STATUSES = ['published', 'pending'];
const MAX_FIELD_LENGTH = 2000;
const MIN_ADMIN_KEY_LENGTH = 12;
const FAILED_AUTH_DELAY_MS = 1500; // замедляет перебор ключа
const LOCK_TIMEOUT_MS = 10000;

/* ---------- Публичное чтение ---------- */

function doGet(e) {
  const sheetName = String((e && e.parameter && e.parameter.sheet) || '');
  if (!SCHEMA[sheetName]) return json_({ ok: false, error: 'Неизвестный раздел' });

  const rows = readRows_(sheetName).filter(function (r) {
    return String(r.status).trim().toLowerCase() === 'published';
  });
  return json_({ ok: true, data: rows });
}

/* ---------- Действия админ-панели ---------- */

const ACTIONS = {
  login: function () {
    return { ok: true };
  },

  list: function (body) {
    const sheetName = requireSheet_(body.sheet);
    return { ok: true, data: readRows_(sheetName) };
  },

  create: function (body) {
    const sheetName = requireSheet_(body.sheet);
    const record = sanitize_(sheetName, body.data || {}, false);
    record.status = normalizeStatus_((body.data || {}).status, 'pending');
    const error = validate_(sheetName, record);
    if (error) return { ok: false, error: error };

    record.id = Utilities.getUuid();
    return withLock_(function () {
      const sheet = getSheet_(sheetName);
      sheet.appendRow(rowFrom_(headerOf_(sheet), record));
      return { ok: true, data: record };
    });
  },

  update: function (body) {
    const sheetName = requireSheet_(body.sheet);
    return withLock_(function () {
      const sheet = getSheet_(sheetName);
      const found = findRow_(sheet, body.id);
      if (!found) return { ok: false, error: 'Запись не найдена — возможно, её уже удалили' };

      const changes = sanitize_(sheetName, body.data || {}, true);
      const merged = Object.assign({}, found.record, changes);
      if (body.data && body.data.status !== undefined) merged.status = normalizeStatus_(body.data.status, found.record.status);
      const error = validate_(sheetName, merged);
      if (error) return { ok: false, error: error };

      sheet.getRange(found.row, 1, 1, found.header.length).setValues([rowFrom_(found.header, merged)]);
      return { ok: true, data: merged };
    });
  },

  remove: function (body) {
    const sheetName = requireSheet_(body.sheet);
    return withLock_(function () {
      const sheet = getSheet_(sheetName);
      const found = findRow_(sheet, body.id);
      if (!found) return { ok: false, error: 'Запись не найдена — возможно, её уже удалили' };
      sheet.deleteRow(found.row);
      return { ok: true };
    });
  },
};

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!isAdmin_(body.key)) {
      Utilities.sleep(FAILED_AUTH_DELAY_MS);
      return json_({ ok: false, code: 'auth', error: 'Неверный ключ администратора' });
    }
    const handler = ACTIONS[body.action];
    if (!handler) return json_({ ok: false, error: 'Неизвестное действие' });
    return json_(handler(body));
  } catch (err) {
    console.error('doPost failed', err);
    return json_({ ok: false, error: 'Не удалось выполнить действие. Попробуйте позже.' });
  }
}

/** Однократная настройка: создаёт недостающие листы и столбцы (существующие данные не трогает). */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(SCHEMA[name]);
    } else {
      const header = headerOf_(sheet);
      const missing = SCHEMA[name].filter(function (col) { return header.indexOf(col) === -1; });
      if (missing.length) sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  });
}

/* ---------- Вспомогательные функции ---------- */

function isAdmin_(provided) {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return Boolean(key) && key.length >= MIN_ADMIN_KEY_LENGTH && typeof provided === 'string' && provided === key;
}

function requireSheet_(name) {
  const sheetName = String(name || '');
  if (!SCHEMA[sheetName]) throw new Error('Неизвестный раздел: ' + sheetName);
  return sheetName;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Лист «' + name + '» не найден. Запустите setup().');
  return sheet;
}

function headerOf_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) { return String(h).trim(); });
}

// Строка таблицы в порядке реальных заголовков листа — порядок столбцов можно менять вручную.
function rowFrom_(header, record) {
  return header.map(function (col) { return record[col] === undefined ? '' : record[col]; });
}

function toRecord_(header, row) {
  const obj = {};
  header.forEach(function (key, i) { if (key) obj[key] = formatCell_(row[i]); });
  return obj;
}

function readRows_(name) {
  const values = getSheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) { return String(h).trim(); });
  return values.slice(1)
    .map(function (row) { return toRecord_(header, row); })
    .filter(function (r) { return r.id; });
}

function findRow_(sheet, id) {
  const wanted = String(id || '');
  if (!wanted || sheet.getLastRow() < 2) return null;
  const header = headerOf_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues();
  const idCol = header.indexOf('id');
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idCol]) === wanted) return { row: i + 2, header: header, record: toRecord_(header, values[i]) };
  }
  return null;
}

function formatCell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value === null || value === undefined ? '' : String(value);
}

function normalizeStatus_(value, fallback) {
  const status = String(value || '').trim().toLowerCase();
  return STATUSES.indexOf(status) === -1 ? fallback : status;
}

// partial = true — берём только переданные поля (для update).
function sanitize_(sheetName, data, partial) {
  const out = {};
  SCHEMA[sheetName].forEach(function (col) {
    if (col === 'id' || col === 'status') return;
    if (partial && data[col] === undefined) return;
    let value = String(data[col] === undefined || data[col] === null ? '' : data[col]).trim().slice(0, MAX_FIELD_LENGTH);
    // Защита от формул: значение, начинающееся с = + - @, таблица выполнила бы как формулу.
    if (/^[=+\-@]/.test(value)) value = "'" + value;
    out[col] = value;
  });
  return out;
}

function validate_(sheetName, record) {
  const missing = REQUIRED[sheetName].filter(function (f) { return !record[f]; });
  if (missing.length) return 'Не заполнены обязательные поля: ' + missing.join(', ');

  for (let i = 0; i < URL_FIELDS.length; i++) {
    const value = record[URL_FIELDS[i]];
    const isSitePath = URL_FIELDS[i] === 'photo' && /^img\/[\w\-./]+$/.test(value || '') && value.indexOf('..') === -1;
    if (value && !isSitePath && !/^https?:\/\/[^\s]+$/i.test(value)) return 'Ссылка должна начинаться с http:// или https://';
  }
  for (let j = 0; j < DATE_FIELDS.length; j++) {
    const date = record[DATE_FIELDS[j]];
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Дата должна быть в формате ГГГГ-ММ-ДД';
  }
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) return 'Некорректный e-mail';
  if (record.year && !/^\d{4}$/.test(record.year)) return 'Год — четыре цифры';
  return '';
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
