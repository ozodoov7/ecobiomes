const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Columns added after the first release. Existing databases get them automatically on start.
const ADDED_COLUMNS = [
  ['people', 'scopus_url', "TEXT NOT NULL DEFAULT ''"],
  ['people', 'links', "TEXT NOT NULL DEFAULT '[]'"],
];

// One-time data moves between columns. Each clears its source, so it never runs twice for a row.
function migrateData() {
  // v2: fixed ORCID / Google Scholar / Scopus fields → free "links" list (label + url)
  const rows = db.prepare("SELECT id, orcid, scholar_url, scopus_url, links FROM people WHERE orcid != '' OR scholar_url != '' OR scopus_url != ''").all();
  const upd = db.prepare("UPDATE people SET links = ?, orcid = '', scholar_url = '', scopus_url = '' WHERE id = ?");
  db.transaction(() => {
    for (const r of rows) {
      let links = [];
      try { links = JSON.parse(r.links || '[]'); } catch {}
      const have = new Set(links.map(l => l.url));
      for (const [label, url] of [['ORCID', r.orcid], ['Google Scholar', r.scholar_url], ['Scopus', r.scopus_url]]) {
        if (url && !have.has(url)) links.push({ label, url });
      }
      upd.run(JSON.stringify(links), r.id);
    }
  })();
}

function migrate() {
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  migrateData();
}
migrate();

module.exports = { db, migrate };
