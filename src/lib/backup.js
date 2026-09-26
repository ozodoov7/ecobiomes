const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');
const { db } = require('../db');
const config = require('../config');

const SKIP_TABLES = new Set(['sessions', 'login_attempts', 'sqlite_sequence']);

// Writes a ZIP (database.sqlite + uploads/ + manifest.json) to `out` (a writable stream).
async function exportZip(out) {
  const tmp = path.join(os.tmpdir(), `eco-backup-${Date.now()}.sqlite`);
  await db.backup(tmp);
  const clean = new Database(tmp);
  clean.exec('DELETE FROM sessions; DELETE FROM login_attempts;');
  clean.close();
  const archive = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => { out.on('close', resolve); out.on('finish', resolve); archive.on('error', reject); });
  archive.pipe(out);
  archive.append(JSON.stringify({ app: 'ecobiome-cms', version: 1, created_at: new Date().toISOString() }, null, 2), { name: 'manifest.json' });
  archive.file(tmp, { name: 'database.sqlite' });
  if (fs.existsSync(config.uploadsDir)) archive.directory(config.uploadsDir, 'uploads');
  await archive.finalize();
  await done;
  fs.rmSync(tmp, { force: true });
}

async function exportToFile() {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const file = path.join(config.backupsDir, `ecobiome-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
  await exportZip(fs.createWriteStream(file));
  return file;
}

// Restores a backup ZIP. Content, users and media are replaced; the current state is saved to backups/ first.
async function importZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (entries.length > 20000) throw Object.assign(new Error('Arxivda fayllar juda ko\'p'), { status: 400 });
  const total = entries.reduce((s, e) => s + (e.header.size || 0), 0);
  if (total > config.maxImportMb * 4 * 1024 * 1024) throw Object.assign(new Error('Arxiv hajmi juda katta'), { status: 400 });
  const dbEntry = entries.find(e => e.entryName === 'database.sqlite');
  if (!dbEntry) throw Object.assign(new Error('Arxivda database.sqlite topilmadi — bu Ecobiome backup fayli emas'), { status: 400 });

  const tmpDb = path.join(os.tmpdir(), `eco-import-${Date.now()}.sqlite`);
  fs.writeFileSync(tmpDb, dbEntry.getData());
  let imp;
  try {
    imp = new Database(tmpDb, { readonly: true, fileMustExist: true });
    const tables = imp.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    for (const t of ['settings', 'pages', 'blocks', 'users']) if (!tables.includes(t)) throw new Error(`Backup bazasida "${t}" jadvali yo'q`);
    if (imp.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup bazasi shikastlangan');
    if (!imp.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1").get().n) throw new Error('Backup\'da faol Admin foydalanuvchi yo\'q');
  } catch (e) { imp?.close(); fs.rmSync(tmpDb, { force: true }); throw Object.assign(e, { status: 400 }); }
  imp.close();

  const safety = await exportToFile();

  // Copy tables from the backup into the live database (same connection stays open)
  db.pragma('foreign_keys = OFF');
  try {
    db.prepare('ATTACH DATABASE ? AS imp').run(tmpDb);
    const impTables = new Set(db.prepare("SELECT name FROM imp.sqlite_master WHERE type='table'").all().map(r => r.name));
    const liveTables = db.prepare("SELECT name FROM main.sqlite_master WHERE type='table'").all().map(r => r.name).filter(t => !SKIP_TABLES.has(t));
    db.transaction(() => {
      for (const t of liveTables) {
        db.prepare(`DELETE FROM main.${t}`).run();
        if (!impTables.has(t)) continue;
        const liveCols = db.prepare(`PRAGMA main.table_info(${t})`).all().map(c => c.name);
        const impCols = new Set(db.prepare(`PRAGMA imp.table_info(${t})`).all().map(c => c.name));
        const cols = liveCols.filter(c => impCols.has(c)).join(', ');
        db.prepare(`INSERT INTO main.${t} (${cols}) SELECT ${cols} FROM imp.${t}`).run();
      }
      db.prepare('DELETE FROM sessions').run();
    })();
  } finally {
    try { db.prepare('DETACH DATABASE imp').run(); } catch {}
    db.pragma('foreign_keys = ON');
    fs.rmSync(tmpDb, { force: true });
  }

  // Restore uploads (guarding against path traversal / zip-slip)
  const root = config.uploadsDir;
  fs.mkdirSync(root, { recursive: true });
  let files = 0;
  for (const e of entries) {
    if (e.isDirectory || !e.entryName.startsWith('uploads/')) continue;
    const rel = e.entryName.slice('uploads/'.length);
    const dest = path.resolve(root, rel);
    if (!dest.startsWith(root + path.sep) || rel.includes('..')) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.getData());
    files++;
  }
  return { safetyBackup: path.basename(safety), files };
}

module.exports = { exportZip, exportToFile, importZip };

// ======================================================================
//  Scheduled backups: local copy on the server + optional off-site copy (rclone)
// ======================================================================
const { execFile } = require('child_process');
const STATUS_FILE = () => path.join(config.backupsDir, 'status.json');

function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE(), 'utf8')); } catch { return {}; }
}
function writeStatus(patch) {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const s = { ...readStatus(), ...patch };
  fs.writeFileSync(STATUS_FILE(), JSON.stringify(s, null, 2));
  return s;
}

function rclone(args, timeoutMs = 60 * 60 * 1000) {
  const env = { ...process.env };
  if (config.backup.rcloneConfig) env.RCLONE_CONFIG = config.backup.rcloneConfig;
  return new Promise((resolve, reject) => {
    execFile(config.backup.rcloneBin, args, { env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = err.code === 'ENOENT' ? 'rclone topilmadi — serverga o\'rnating (README: 6-bo\'lim)' : (String(stderr || err.message).trim().split('\n').slice(-3).join(' ') || err.message);
        return reject(new Error(msg.slice(0, 500)));
      }
      resolve(stdout);
    });
  });
}

function pruneLocal() {
  if (!fs.existsSync(config.backupsDir)) return [];
  const files = fs.readdirSync(config.backupsDir).filter(f => /^ecobiome-.*\.zip$/.test(f)).sort().reverse();
  const removed = files.slice(config.backup.keep);
  for (const f of removed) fs.rmSync(path.join(config.backupsDir, f), { force: true });
  return removed;
}

let running = null;
// Creates a backup ZIP in backups/, keeps the newest N, and (if configured) uploads it off-site.
async function runBackup(reason = 'manual') {
  if (running) return running;
  running = (async () => {
    const started = new Date().toISOString();
    let status;
    try {
      const file = await exportToFile();
      const name = path.basename(file);
      const size = fs.statSync(file).size;
      pruneLocal();
      status = writeStatus({ last_local: { at: started, file: name, size, reason, ok: true } });
      if (config.backup.offsiteRemote) {
        const remote = config.backup.offsiteRemote.replace(/\/$/, '');
        try {
          await rclone(['copyto', file, `${remote}/${name}`]);
          // remove off-site copies older than OFFSITE_KEEP_DAYS (only our own backup files)
          await rclone(['delete', remote, '--min-age', `${config.backup.offsiteKeepDays}d`, '--include', 'ecobiome-*.zip'], 10 * 60 * 1000).catch(() => {});
          status = writeStatus({ last_offsite: { at: new Date().toISOString(), file: name, remote, ok: true } });
        } catch (e) {
          status = writeStatus({ last_offsite: { at: new Date().toISOString(), file: name, remote, ok: false, error: e.message } });
          console.error('✗ Off-site backup failed:', e.message);
        }
      }
      console.log(`✓ Backup (${reason}): ${name}`);
    } catch (e) {
      status = writeStatus({ last_local: { at: started, reason, ok: false, error: e.message } });
      console.error('✗ Backup failed:', e.message);
    }
    return status;
  })();
  try { return await running; } finally { running = null; }
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Checks every 15 minutes; runs once per day at/after BACKUP_HOUR (server local time, see TZ in .env).
function startScheduler() {
  if (!config.backup.auto) return;
  const tick = async () => {
    const now = new Date();
    const today = localDate(now);
    if (now.getHours() < config.backup.hour || readStatus().last_auto_date === today) return;
    writeStatus({ last_auto_date: today });
    await runBackup('auto');
  };
  setTimeout(() => tick().catch(e => console.error(e)), parseInt(process.env.BACKUP_CHECK_DELAY_MS || '60000', 10)).unref();
  setInterval(() => tick().catch(e => console.error(e)), 15 * 60 * 1000).unref();
}

function backupInfo() {
  return {
    auto: config.backup.auto, hour: config.backup.hour, keep: config.backup.keep,
    offsite: config.backup.offsiteRemote || null, offsiteKeepDays: config.backup.offsiteKeepDays,
    status: readStatus(),
  };
}

module.exports.runBackup = runBackup;
module.exports.startScheduler = startScheduler;
module.exports.backupInfo = backupInfo;
