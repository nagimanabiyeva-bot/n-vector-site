/**
 * Бэкенд сайта N-VECTOR на Google Apps Script.
 *   GET  ?sheet=team|projects|events|programs  → опубликованные записи листа (JSON)
 *   POST {sheet, data, website}                → новая запись (по умолчанию со статусом pending)
 *
 * Перед первым развёртыванием запустите функцию setup() — она создаст листы с заголовками.
 */

// true  — новые записи ждут модерации (status = pending), публикуете вручную в таблице.
// false — записи публикуются сразу.
const MODERATION = true;

const SCHEMA = {
  team:     ['id', 'name', 'role', 'bio', 'tags', 'photo', 'email', 'status'],
  projects: ['id', 'name', 'tag', 'description', 'year', 'link', 'status'],
  events:   ['id', 'title', 'date', 'location', 'description', 'link', 'status'],
  programs: ['id', 'type', 'name', 'description', 'deadline', 'link', 'status'],
};

const REQUIRED = {
  team:     ['name', 'role'],
  projects: ['name', 'description'],
  events:   ['title', 'date'],
  programs: ['type', 'name', 'link'],
};

const URL_FIELDS = ['link', 'photo'];
const PROGRAM_TYPES = ['Конкурс', 'Обучение', 'Инкубация-Акселерация', 'Финансирование'];
const MAX_FIELD_LENGTH = 2000;

function doGet(e) {
  const sheetName = String((e && e.parameter && e.parameter.sheet) || '');
  if (!SCHEMA[sheetName]) return json_({ ok: false, error: 'Неизвестный раздел' });

  const rows = readRows_(sheetName).filter(function (r) {
    return String(r.status).trim().toLowerCase() === 'published';
  });
  return json_({ ok: true, data: rows });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Ловушка для ботов: скрытое поле заполняют только они. Отвечаем «успехом», ничего не сохраняя.
    if (body.website) return json_({ ok: true, status: 'pending' });

    const sheetName = String(body.sheet || '');
    if (!SCHEMA[sheetName]) return json_({ ok: false, error: 'Неизвестный раздел' });

    const record = sanitize_(sheetName, body.data || {});
    const error = validate_(sheetName, record);
    if (error) return json_({ ok: false, error: error });

    record.id = Utilities.getUuid();
    record.status = MODERATION ? 'pending' : 'published';

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet_(sheetName);
      sheet.appendRow(SCHEMA[sheetName].map(function (col) { return record[col] || ''; }));
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true, status: record.status });
  } catch (err) {
    console.error('doPost failed', err);
    return json_({ ok: false, error: 'Не удалось сохранить запись. Попробуйте позже.' });
  }
}

/** Однократная настройка: создаёт недостающие листы и строку заголовков. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(SCHEMA[name]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, SCHEMA[name].length).setFontWeight('bold');
    }
  });
}

/* ---------- Вспомогательные функции ---------- */

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Лист «' + name + '» не найден. Запустите setup().');
  return sheet;
}

function readRows_(name) {
  const values = getSheet_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const header = values[0].map(function (h) { return String(h).trim(); });
  return values.slice(1).map(function (row) {
    const obj = {};
    header.forEach(function (key, i) { obj[key] = formatCell_(row[i]); });
    return obj;
  });
}

function formatCell_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value === null || value === undefined ? '' : String(value);
}

function sanitize_(sheetName, data) {
  const out = {};
  SCHEMA[sheetName].forEach(function (col) {
    if (col === 'id' || col === 'status') return;
    let value = String(data[col] === undefined ? '' : data[col]).trim().slice(0, MAX_FIELD_LENGTH);
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
    const f = URL_FIELDS[i];
    if (record[f] && !/^https?:\/\/[^\s]+$/i.test(record[f])) return 'Ссылка должна начинаться с http:// или https://';
  }
  if (sheetName === 'programs' && PROGRAM_TYPES.indexOf(record.type) === -1) return 'Неизвестный тип программы';
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) return 'Некорректный e-mail';
  return '';
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
