// Loads the original website content into the database.
// CLI:  npm run seed            (only if the database has no content yet)
//       npm run seed -- --force (wipes content tables and reloads; users/media/messages/history are kept)
// The server also calls seedIfEmpty() on start, so a fresh install never shows an empty site.
const { db } = require('./index');
const { COLLECTIONS, BLOCKS } = require('../content/model');
const seed = require('./seed-data.json');

const JSON_TYPES = new Set(['list', 'tags', 'repeater']);
const hasContent = () => db.prepare('SELECT COUNT(*) AS n FROM pages').get().n > 0;

const load = db.transaction(force => {
  if (force) {
    for (const t of ['project_people', ...Object.values(COLLECTIONS).map(c => c.table), 'blocks', 'pages', 'settings']) db.prepare(`DELETE FROM ${t}`).run();
  }
  const setS = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(seed.settings)) setS.run(k, JSON.stringify(v));

  const setB = db.prepare('INSERT OR REPLACE INTO blocks (key, page, data) VALUES (?, ?, ?)');
  for (const [k, v] of Object.entries(seed.blocks)) setB.run(k, BLOCKS[k].page, JSON.stringify(v));

  for (const [slug, p] of Object.entries(seed.pages)) {
    const keys = ['slug', ...Object.keys(p)];
    db.prepare(`INSERT OR REPLACE INTO pages (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(slug, ...Object.values(p));
  }

  const insert = (name, item, sort, extra = {}) => {
    const col = COLLECTIONS[name];
    const row = { ...extra, sort, status: 'published' };
    for (const fd of col.fields) {
      if (fd.type === 'relation' || fd.name === 'status' || fd.name === 'parent_id') continue;
      if (item[fd.name] === undefined) continue;
      row[fd.name] = JSON_TYPES.has(fd.type) ? JSON.stringify(item[fd.name]) : item[fd.name];
    }
    const keys = Object.keys(row);
    return db.prepare(`INSERT INTO ${col.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => row[k])).lastInsertRowid;
  };

  for (const [name, items] of Object.entries(seed.collections)) {
    if (name === 'menu_items') {
      items.forEach((m, i) => {
        const id = insert(name, m, i);
        (m.children || []).forEach((c, j) => insert(name, c, j, { parent_id: id }));
      });
      continue;
    }
    items.forEach((item, i) => insert(name, item, i));
  }
});

function counts() {
  return Object.keys(seed.collections).map(n => `${n}: ${db.prepare(`SELECT COUNT(*) AS n FROM ${COLLECTIONS[n].table}`).get().n}`).join(', ');
}

// Used by server.js: returns true if content was loaded
function seedIfEmpty() {
  if (hasContent()) return false;
  load(false);
  return true;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  const force = process.argv.includes('--force');
  if (hasContent() && !force) {
    console.log('Database already has content — seed skipped. Use "npm run seed -- --force" to reload it.');
    process.exit(0);
  }
  load(force);
  console.log('Seed complete →', counts());
}

// Adds pages, blocks, block fields and settings that were introduced in newer versions,
// without touching anything the admin has already edited. Safe to run on every start.
function ensureDefaults() {
  const added = [];
  db.transaction(() => {
    const haveS = new Set(db.prepare('SELECT key FROM settings').all().map(r => r.key));
    for (const [k, v] of Object.entries(seed.settings)) if (!haveS.has(k)) { db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, JSON.stringify(v)); added.push('setting:' + k); }
    for (const [slug, p] of Object.entries(seed.pages)) {
      if (db.prepare('SELECT 1 FROM pages WHERE slug = ?').get(slug)) continue;
      const keys = ['slug', ...Object.keys(p)];
      db.prepare(`INSERT INTO pages (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(slug, ...Object.values(p));
      added.push('page:' + slug);
    }
    for (const [k, v] of Object.entries(seed.blocks)) {
      const row = db.prepare('SELECT data FROM blocks WHERE key = ?').get(k);
      if (!row) { db.prepare('INSERT INTO blocks (key, page, data) VALUES (?, ?, ?)').run(k, BLOCKS[k].page, JSON.stringify(v)); added.push('block:' + k); continue; }
      const cur = JSON.parse(row.data || '{}');
      const missing = Object.keys(v).filter(f => !(f in cur));
      if (missing.length) { for (const f of missing) cur[f] = v[f]; db.prepare('UPDATE blocks SET data = ? WHERE key = ?').run(JSON.stringify(cur), k); added.push(`block:${k}(${missing.join(',')})`); }
    }
  })();
  return added;
}
module.exports.ensureDefaults = ensureDefaults;
