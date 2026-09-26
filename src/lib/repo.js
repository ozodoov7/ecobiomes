// Data access layer: every write goes through here so revisions are always recorded.
const { db } = require('../db');
const { COLLECTIONS, BLOCKS, PAGES, PAGE_FIELDS, SETTINGS_FIELDS } = require('../content/model');
const { validate, ValidationError, slugify } = require('./sanitize');

const JSON_TYPES = new Set(['list', 'tags', 'repeater']);
const jsonFields = col => col.fields.filter(fd => JSON_TYPES.has(fd.type)).map(fd => fd.name);

function parseRow(col, row) {
  if (!row) return row;
  for (const n of jsonFields(col)) { try { row[n] = JSON.parse(row[n] || '[]'); } catch { row[n] = []; } }
  return row;
}
function toDb(col, data) {
  const out = { ...data };
  for (const n of jsonFields(col)) if (n in out) out[n] = JSON.stringify(out[n] || []);
  for (const fd of col.fields) if (fd.type === 'relation') delete out[fd.name];
  return out;
}
const colOf = name => {
  const c = COLLECTIONS[name];
  if (!c) { const e = new Error('Unknown collection'); e.status = 404; throw e; }
  return c;
};

function recordRevision(entity, entityId, action, label, snapshot, user) {
  db.prepare('INSERT INTO revisions (entity, entity_id, action, label, snapshot, user_id, user_name) VALUES (?,?,?,?,?,?,?)')
    .run(entity, String(entityId), action, String(label || '').slice(0, 200), JSON.stringify(snapshot), user?.id || null, user?.name || '');
  // Keep history bounded: last 50 revisions per record
  db.prepare(`DELETE FROM revisions WHERE entity = ? AND entity_id = ? AND id NOT IN
    (SELECT id FROM revisions WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 50)`).run(entity, String(entityId), entity, String(entityId));
}

// ---------- Collections ----------
function relationValues(col, id) {
  const out = {};
  for (const fd of col.fields.filter(x => x.type === 'relation')) {
    out[fd.name] = db.prepare(`SELECT ${fd.foreignKey} AS v FROM ${fd.joinTable} WHERE ${fd.localKey} = ? ORDER BY sort`).all(id).map(r => r.v);
  }
  return out;
}
function saveRelations(col, id, data) {
  for (const fd of col.fields.filter(x => x.type === 'relation')) {
    if (!(fd.name in data)) continue;
    const target = COLLECTIONS[fd.collection].table;
    const valid = data[fd.name].filter(fid => db.prepare(`SELECT 1 FROM ${target} WHERE id = ?`).get(fid));
    db.prepare(`DELETE FROM ${fd.joinTable} WHERE ${fd.localKey} = ?`).run(id);
    const ins = db.prepare(`INSERT INTO ${fd.joinTable} (${fd.localKey}, ${fd.foreignKey}, sort) VALUES (?,?,?)`);
    valid.forEach((fid, i) => ins.run(id, fid, i));
  }
}

function list(name, { publishedOnly = false } = {}) {
  const col = colOf(name);
  const where = publishedOnly ? "WHERE status = 'published'" : '';
  const rows = db.prepare(`SELECT * FROM ${col.table} ${where} ORDER BY ${col.defaultOrder || 'sort'}, id`).all();
  rows.forEach(r => { parseRow(col, r); Object.assign(r, relationValues(col, r.id)); });
  return rows;
}
function get(name, id) {
  const col = colOf(name);
  const row = parseRow(col, db.prepare(`SELECT * FROM ${col.table} WHERE id = ?`).get(id));
  if (row) Object.assign(row, relationValues(col, row.id));
  return row;
}

function ensureUniqueSlug(col, data, id) {
  const slugField = col.fields.find(fd => fd.type === 'slug');
  if (!slugField) return;
  let base = data[slugField.name] || slugify(data[slugField.from]) || 'item';
  let s = base, n = 2;
  while (db.prepare(`SELECT 1 FROM ${col.table} WHERE ${slugField.name} = ? AND id != ?`).get(s, id || 0)) s = `${base}-${n++}`;
  data[slugField.name] = s;
}
function checkMenu(data, id) {
  if (data.parent_id === null || data.parent_id === undefined) return;
  const parent = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(data.parent_id);
  let msg = null;
  if (!parent) msg = 'Ota punkt topilmadi';
  else if (parent.id === id) msg = 'Punkt o\'ziga ota bo\'la olmaydi';
  else if (parent.parent_id) msg = 'Faqat bir darajali submenyu mumkin — ota punkt o\'zi submenyu bo\'lmasligi kerak';
  else if (parent.location !== 'header') msg = 'Submenyu faqat header menyusidagi punkt ostida bo\'ladi';
  else if (id && db.prepare('SELECT 1 FROM menu_items WHERE parent_id = ?').get(id)) msg = 'Bu punktning o\'z submenyusi bor — uni boshqa punkt ostiga ko\'chirib bo\'lmaydi';
  if (msg) throw new ValidationError({ parent_id: msg });
  data.location = 'header';
}

function checkRefs(col, data) {
  const errors = {};
  for (const fd of col.fields.filter(x => x.type === 'ref')) {
    const v = data[fd.name];
    if (v === null || v === undefined || v === '') continue;
    const t = COLLECTIONS[fd.collection].table;
    if (!db.prepare(`SELECT 1 FROM ${t} WHERE ${fd.valueField} = ?`).get(v)) errors[fd.name] = 'Tanlangan qiymat topilmadi';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

const create = db.transaction((name, input, user) => {
  const col = colOf(name);
  const data = validate(col.fields, input);
  ensureUniqueSlug(col, data);
  checkRefs(col, data);
  if (name === 'menu_items') checkMenu(data, null);
  const row = toDb(col, data);
  row.sort = (db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ${col.table}`).get().s);
  const keys = Object.keys(row);
  const info = db.prepare(`INSERT INTO ${col.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k]));
  saveRelations(col, info.lastInsertRowid, data);
  const saved = get(name, info.lastInsertRowid);
  recordRevision(col.table, saved.id, 'create', saved[col.titleField], saved, user);
  return saved;
});

const update = db.transaction((name, id, input, user, { action = 'update' } = {}) => {
  const col = colOf(name);
  const before = get(name, id);
  if (!before) { const e = new Error('Not found'); e.status = 404; throw e; }
  const data = validate(col.fields, input, { partial: true });
  if (col.fields.some(fd => fd.type === 'slug' && fd.name in data)) ensureUniqueSlug(col, data, id);
  checkRefs(col, data);
  if (name === 'menu_items' && 'parent_id' in data) checkMenu(data, id);
  // 7. renaming a category key must carry its publications along
  if (name === 'pub_categories' && data.key && data.key !== before.key) {
    db.prepare('UPDATE publications SET category = ? WHERE category = ?').run(data.key, before.key);
  }
  // 8. renamed news keeps its old URL working (301)
  if (name === 'news' && data.slug && data.slug !== before.slug) {
    db.prepare('INSERT OR REPLACE INTO slug_redirects (entity, old_slug, target_id) VALUES (?,?,?)').run('news', before.slug, id);
    db.prepare("DELETE FROM slug_redirects WHERE entity = 'news' AND old_slug = ?").run(data.slug);
  }
  const row = toDb(col, data);
  const keys = Object.keys(row);
  if (keys.length) db.prepare(`UPDATE ${col.table} SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map(k => row[k]), id);
  saveRelations(col, id, data);
  const saved = get(name, id);
  recordRevision(col.table, id, action, saved[col.titleField], saved, user);
  return saved;
});

const remove = db.transaction((name, id, user) => {
  const col = colOf(name);
  const before = get(name, id);
  if (!before) { const e = new Error('Not found'); e.status = 404; throw e; }
  if (name === 'pub_categories') {
    const n = db.prepare('SELECT COUNT(*) AS n FROM publications WHERE category = ?').get(before.key).n;
    if (n) { const e = new Error(`Bu kategoriya ${n} ta maqolada ishlatilmoqda. Avval maqolalarni boshqa kategoriyaga o'tkazing.`); e.status = 409; throw e; }
  }
  if (name === 'menu_items') {
    // children are removed by ON DELETE CASCADE — keep them restorable from history
    for (const child of db.prepare('SELECT id FROM menu_items WHERE parent_id = ?').all(id)) {
      const c = get(name, child.id);
      recordRevision(col.table, c.id, 'delete', c[col.titleField] + ' (ota punkt bilan)', c, user);
    }
  }
  db.prepare(`DELETE FROM ${col.table} WHERE id = ?`).run(id);
  recordRevision(col.table, id, 'delete', before[col.titleField], before, user);
  return before;
});

const reorder = db.transaction((name, ids) => {
  const col = colOf(name);
  const st = db.prepare(`UPDATE ${col.table} SET sort = ? WHERE id = ?`);
  ids.map(Number).filter(Number.isInteger).forEach((id, i) => st.run(i, id));
});

// ---------- Blocks / pages / settings ----------
function getBlock(key) {
  const row = db.prepare('SELECT data FROM blocks WHERE key = ?').get(key);
  try { return row ? JSON.parse(row.data) : {}; } catch { return {}; }
}
function allBlocks(page) {
  const out = {};
  for (const r of db.prepare('SELECT key, data FROM blocks WHERE page = ?').all(page)) { try { out[r.key] = JSON.parse(r.data); } catch { out[r.key] = {}; } }
  return out;
}
const saveBlock = db.transaction((key, input, user, { action = 'update' } = {}) => {
  const def = BLOCKS[key];
  if (!def) { const e = new Error('Unknown block'); e.status = 404; throw e; }
  const data = { ...getBlock(key), ...validate(def.fields, input, { partial: true }) };
  db.prepare(`INSERT INTO blocks (key, page, data, updated_at) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).run(key, def.page, JSON.stringify(data));
  recordRevision('block', key, action, def.label, data, user);
  return data;
});

function getPage(slug) { return db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug) || { slug }; }
const savePage = db.transaction((slug, input, user, { action = 'update' } = {}) => {
  if (!PAGES[slug]) { const e = new Error('Unknown page'); e.status = 404; throw e; }
  const data = validate(PAGE_FIELDS, input, { partial: true });
  const keys = Object.keys(data);
  db.prepare(`INSERT INTO pages (slug) VALUES (?) ON CONFLICT(slug) DO NOTHING`).run(slug);
  if (keys.length) db.prepare(`UPDATE pages SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE slug = ?`).run(...keys.map(k => data[k]), slug);
  const saved = getPage(slug);
  recordRevision('page', slug, action, PAGES[slug].label, saved, user);
  return saved;
});

function getSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}
const saveSettings = db.transaction((input, user, { action = 'update' } = {}) => {
  const data = validate(SETTINGS_FIELDS, input, { partial: true });
  for (const fd of SETTINGS_FIELDS) if (fd.type === 'checkbox' && fd.name in data) data[fd.name] = !!data[fd.name];
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(data)) st.run(k, JSON.stringify(v));
  const saved = getSettings();
  recordRevision('settings', 'site', action, 'Sozlamalar', saved, user);
  return saved;
});

// ---------- Revisions ----------
function revisions({ entity, entityId, limit = 100 } = {}) {
  if (entity) return db.prepare('SELECT id, entity, entity_id, action, label, user_name, created_at FROM revisions WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT ?').all(entity, String(entityId), limit);
  return db.prepare('SELECT id, entity, entity_id, action, label, user_name, created_at FROM revisions ORDER BY id DESC LIMIT ?').all(limit);
}
function revision(id) {
  const r = db.prepare('SELECT * FROM revisions WHERE id = ?').get(id);
  if (r) r.snapshot = JSON.parse(r.snapshot);
  return r;
}
const tableToCollection = t => Object.keys(COLLECTIONS).find(k => COLLECTIONS[k].table === t);

// Restore a revision snapshot. Deleted collection records are re-created with their original id.
const restore = db.transaction((revId, user) => {
  const r = revision(revId);
  if (!r) { const e = new Error('Revision not found'); e.status = 404; throw e; }
  const snap = r.snapshot;
  if (r.entity === 'block') return { type: 'block', key: r.entity_id, data: saveBlock(r.entity_id, snap, user, { action: 'restore' }) };
  if (r.entity === 'page') return { type: 'page', slug: r.entity_id, data: savePage(r.entity_id, snap, user, { action: 'restore' }) };
  if (r.entity === 'settings') return { type: 'settings', data: saveSettings(snap, user, { action: 'restore' }) };
  const name = tableToCollection(r.entity);
  if (!name) { const e = new Error('Unknown entity'); e.status = 400; throw e; }
  const col = COLLECTIONS[name];
  const id = Number(r.entity_id);
  if (!get(name, id)) {
    // Re-insert the deleted record with its original id from the full snapshot.
    const cols = new Set(db.prepare(`PRAGMA table_info(${col.table})`).all().map(c => c.name));
    const row = toDb(col, snap);
    const slugField = col.fields.find(fd => fd.type === 'slug');
    if (slugField) ensureUniqueSlug(col, row, id);
    const keys = Object.keys(row).filter(k => cols.has(k));
    db.prepare(`INSERT INTO ${col.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k]));
    snap[slugField?.name] = row[slugField?.name];
  }
  const saved = update(name, id, snap, user, { action: 'restore' });
  return { type: 'collection', collection: name, data: saved };
});

module.exports = { list, get, create, update, remove, reorder, getBlock, allBlocks, saveBlock, getPage, savePage, getSettings, saveSettings, revisions, revision, restore, tableToCollection };
