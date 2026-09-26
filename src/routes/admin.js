const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { db } = require('../db');
const config = require('../config');
const repo = require('../lib/repo');
const media = require('../lib/media');
const backup = require('../lib/backup');
const { COLLECTIONS, BLOCKS, PAGES, clientModel } = require('../content/model');
const { cleanText, EMAIL_RE, ValidationError } = require('../lib/sanitize');
const auth = require('../lib/auth');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

// ---------- Login / logout ----------
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.render('admin/login', { csrf: auth.csrfToken(req), error: null, email: '' });
});
router.post('/login', express.urlencoded({ extended: false, limit: '10kb' }), (req, res) => {
  const fail = (error, status = 401) => res.status(status).render('admin/login', { csrf: auth.csrfToken(req), error, email: cleanText(req.body.email, 254) });
  if (!auth.safeEqual(req.body._csrf, req.session.csrf)) return fail('Sessiya muddati tugagan. Qayta urinib ko\'ring.', 403);
  const { user, error } = auth.attemptLogin(req.body.email, req.body.password, req.ip);
  if (error) return fail(error);
  req.session.regenerate(err => {
    if (err) return fail('Server xatosi', 500);
    req.session.userId = user.id;
    req.session.csrf = auth.newToken();
    res.redirect('/admin');
  });
});
router.post('/logout', express.urlencoded({ extended: false }), (req, res) => {
  if (!auth.safeEqual(req.body._csrf, req.session?.csrf)) return res.status(403).send('CSRF');
  req.session.destroy(() => { res.clearCookie('eco.sid'); res.redirect('/admin/login'); });
});

// ---------- API ----------
const api = express.Router();
router.use('/api', auth.requireAuth, api);
api.use(express.json({ limit: '2mb' }));
api.use(auth.verifyCsrf);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const colGuard = (req, res, next) => {
  const c = COLLECTIONS[req.params.name];
  if (!c) return res.status(404).json({ error: 'Topilmadi' });
  if (c.adminOnly && req.user.role !== 'admin') return res.status(403).json({ error: 'Faqat Admin uchun' });
  next();
};
const id = req => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw Object.assign(new Error('Bad id'), { status: 400 }); return n; };

const ADMIN_ENTITIES = new Set(['settings', ...Object.values(COLLECTIONS).filter(c => c.adminOnly).map(c => c.table)]);
const canSee = (req, entity) => req.user.role === 'admin' || !ADMIN_ENTITIES.has(entity);
api.get('/model', (req, res) => res.json(clientModel()));
api.get('/me', (req, res) => res.json(req.user));
api.get('/dashboard', (req, res) => {
  const counts = {};
  for (const [k, c] of Object.entries(COLLECTIONS)) {
    counts[k] = db.prepare(`SELECT COUNT(*) AS total, SUM(status = 'draft') AS drafts FROM ${c.table}`).get();
  }
  res.json({
    counts,
    unread: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0').get().n,
    media: db.prepare('SELECT COUNT(*) AS n FROM media').get().n,
    recent: repo.revisions({ limit: 30 }).filter(r => canSee(req, r.entity)).slice(0, 10),
  });
});

// Collections
api.get('/c/:name', colGuard, (req, res) => res.json(repo.list(req.params.name)));
api.get('/c/:name/:id', colGuard, (req, res) => { const r = repo.get(req.params.name, id(req)); r ? res.json(r) : res.status(404).json({ error: 'Topilmadi' }); });
api.post('/c/:name', colGuard, (req, res) => res.status(201).json(repo.create(req.params.name, req.body, req.user)));
api.put('/c/:name/:id', colGuard, (req, res) => res.json(repo.update(req.params.name, id(req), req.body, req.user)));
api.delete('/c/:name/:id', colGuard, (req, res) => { repo.remove(req.params.name, id(req), req.user); res.json({ ok: true }); });
api.post('/c/:name/reorder', colGuard, (req, res) => { repo.reorder(req.params.name, Array.isArray(req.body.ids) ? req.body.ids : []); res.json({ ok: true }); });

// Blocks, pages, settings
api.get('/b/:key', (req, res) => BLOCKS[req.params.key] ? res.json(repo.getBlock(req.params.key)) : res.status(404).json({ error: 'Topilmadi' }));
api.put('/b/:key', (req, res) => res.json(repo.saveBlock(req.params.key, req.body, req.user)));
api.get('/p/:slug', (req, res) => PAGES[req.params.slug] ? res.json(repo.getPage(req.params.slug)) : res.status(404).json({ error: 'Topilmadi' }));
api.put('/p/:slug', (req, res) => res.json(repo.savePage(req.params.slug, req.body, req.user)));
api.get('/settings', (req, res) => res.json(repo.getSettings()));
api.put('/settings', auth.requireAdmin, (req, res) => res.json(repo.saveSettings(req.body, req.user)));

// Revisions
api.get('/revisions', (req, res) => {
  if (req.query.entity && !canSee(req, req.query.entity)) return res.status(403).json({ error: 'Faqat Admin uchun' });
  const rows = repo.revisions({ entity: req.query.entity, entityId: req.query.id, limit: Math.min(+req.query.limit || 100, 500) });
  res.json(rows.filter(r => canSee(req, r.entity)));
});
api.get('/revisions/:id', (req, res) => {
  const r = repo.revision(id(req));
  if (!r) return res.status(404).json({ error: 'Topilmadi' });
  canSee(req, r.entity) ? res.json(r) : res.status(403).json({ error: 'Faqat Admin uchun' });
});
api.post('/revisions/:id/restore', (req, res) => {
  const r = repo.revision(id(req));
  if (!r) return res.status(404).json({ error: 'Topilmadi' });
  if (!canSee(req, r.entity)) return res.status(403).json({ error: 'Faqat Admin uchun' });
  res.json(repo.restore(r.id, req.user));
});

// Media
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 } });
api.get('/media', (req, res) => res.json(media.list()));
api.post('/media', upload.array('files', 10), wrap(async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Fayl tanlanmagan' });
  const out = [];
  for (const f of req.files) out.push(await media.saveUpload(f, req.body.alt, req.user.id));
  res.status(201).json(out);
}));
api.put('/media/:id', (req, res) => {
  const m = media.get(id(req));
  if (!m) return res.status(404).json({ error: 'Topilmadi' });
  db.prepare('UPDATE media SET alt = ? WHERE id = ?').run(cleanText(req.body.alt, 300), m.id);
  res.json(media.get(m.id));
});
api.get('/media/:id/usage', (req, res) => { const m = media.get(id(req)); m ? res.json(media.usage(m)) : res.status(404).json({ error: 'Topilmadi' }); });
api.delete('/media/:id', (req, res) => {
  const m = media.get(id(req));
  if (!m) return res.status(404).json({ error: 'Topilmadi' });
  const used = media.usage(m);
  if (used.length && req.query.force !== '1') return res.status(409).json({ error: 'Fayl ishlatilmoqda', used });
  media.remove(m);
  res.json({ ok: true });
});

// Messages
api.get('/messages', (req, res) => res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC').all()));
api.put('/messages/:id', (req, res) => { db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(req.body.is_read ? 1 : 0, id(req)); res.json({ ok: true }); });
api.delete('/messages/:id', (req, res) => { db.prepare('DELETE FROM messages WHERE id = ?').run(id(req)); res.json({ ok: true }); });

// Users (admin only)
const userOut = 'id, name, email, role, is_active, last_login_at, created_at, locked_until';
api.get('/users', auth.requireAdmin, (req, res) => res.json(db.prepare(`SELECT ${userOut} FROM users ORDER BY id`).all()));
function userInput(body, isNew) {
  const errors = {};
  const u = { name: cleanText(body.name, 120), email: cleanText(body.email, 254).toLowerCase(), role: body.role === 'admin' ? 'admin' : 'editor', is_active: body.is_active === false || body.is_active === 0 ? 0 : 1 };
  if (!u.name) errors.name = 'Majburiy';
  if (!EMAIL_RE.test(u.email)) errors.email = 'Email noto\'g\'ri';
  if (isNew || body.password) { const p = auth.passwordProblem(body.password); if (p) errors.password = p; }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return u;
}
const activeAdmins = () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1").get().n;
api.post('/users', auth.requireAdmin, (req, res) => {
  const u = userInput(req.body, true);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(u.email)) throw new ValidationError({ email: 'Bu email band' });
  const info = db.prepare('INSERT INTO users (name, email, role, is_active, password_hash) VALUES (?,?,?,?,?)').run(u.name, u.email, u.role, u.is_active, auth.hashPassword(req.body.password));
  res.status(201).json(db.prepare(`SELECT ${userOut} FROM users WHERE id = ?`).get(info.lastInsertRowid));
});
api.put('/users/:id', auth.requireAdmin, (req, res) => {
  const uid = id(req), cur = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!cur) return res.status(404).json({ error: 'Topilmadi' });
  const u = userInput(req.body, false);
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(u.email, uid)) throw new ValidationError({ email: 'Bu email band' });
  if (cur.role === 'admin' && cur.is_active && (u.role !== 'admin' || !u.is_active) && activeAdmins() <= 1) throw new ValidationError({ role: 'Kamida bitta faol Admin qolishi kerak' });
  db.prepare("UPDATE users SET name = ?, email = ?, role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?").run(u.name, u.email, u.role, u.is_active, uid);
  if (req.body.password) db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?').run(auth.hashPassword(req.body.password), uid);
  if (req.body.unlock) db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(uid);
  res.json(db.prepare(`SELECT ${userOut} FROM users WHERE id = ?`).get(uid));
});
api.delete('/users/:id', auth.requireAdmin, (req, res) => {
  const uid = id(req);
  if (uid === req.user.id) return res.status(400).json({ error: 'O\'zingizni o\'chira olmaysiz' });
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (cur?.role === 'admin' && cur.is_active && activeAdmins() <= 1) return res.status(400).json({ error: 'Oxirgi Admin o\'chirilmaydi' });
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(uid);
  res.json({ ok: true });
});

// Own profile
api.put('/profile/password', (req, res) => {
  const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!auth.verifyPassword(String(req.body.current || ''), cur.password_hash)) throw new ValidationError({ current: 'Joriy parol noto\'g\'ri' });
  const p = auth.passwordProblem(req.body.password);
  if (p) throw new ValidationError({ password: p });
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(auth.hashPassword(req.body.password), cur.id);
  // Sign out other sessions of this user
  db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ? AND sid != ?").run(cur.id, req.sessionID);
  res.json({ ok: true });
});

// Backup (admin only)
api.get('/backup/export', auth.requireAdmin, wrap(async (req, res) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="ecobiome-backup-${new Date().toISOString().slice(0, 10)}.zip"`);
  await backup.exportZip(res);
}));
const importUpload = multer({
  dest: os.tmpdir(), limits: { fileSize: config.maxImportMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /\.zip$/i.test(file.originalname)),
});
api.post('/backup/import', auth.requireAdmin, importUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '.zip fayl tanlang' });
  try { res.json(await backup.importZip(req.file.path)); } finally { fs.rmSync(req.file.path, { force: true }); }
}));
api.get('/backup/status', auth.requireAdmin, (req, res) => res.json(backup.backupInfo()));
api.post('/backup/run', auth.requireAdmin, wrap(async (req, res) => { await backup.runBackup('manual'); res.json(backup.backupInfo()); }));
api.get('/backup/list', auth.requireAdmin, (req, res) => {
  const dir = config.backupsDir;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.zip')).map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size })).sort((a, b) => b.name.localeCompare(a.name)) : [];
  res.json(files);
});
api.get('/backup/file/:name', auth.requireAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(config.backupsDir, name);
  if (!/^[\w.-]+\.zip$/.test(name) || !fs.existsSync(p)) return res.status(404).json({ error: 'Topilmadi' });
  res.download(p);
});

api.use((req, res) => res.status(404).json({ error: 'API manzili topilmadi' }));

// API errors → JSON
api.use((err, req, res, next) => {
  if (res.headersSent) return res.destroy();
  if (err instanceof multer.MulterError) return res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fayl hajmi juda katta' : err.message });
  if (err.errors) return res.status(422).json({ error: 'Ma\'lumotlarda xatolik bor', fields: err.errors });
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(422).json({ error: 'Bunday qiymat allaqachon mavjud' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server xatosi' : err.message });
});

// ---------- Admin SPA shell ----------
router.get(['/', '/*'], auth.requireAuth, (req, res) => {
  res.render('admin/app', { csrf: auth.csrfToken(req), user: req.user });
});

module.exports = router;
