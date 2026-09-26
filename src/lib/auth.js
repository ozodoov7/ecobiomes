const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const config = require('../config');

// ---------- SQLite session store ----------
class SqliteStore extends session.Store {
  constructor() {
    super();
    this.getS = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?');
    this.setS = db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires');
    this.delS = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchS = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    setInterval(() => db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now()), 15 * 60 * 1000).unref();
  }
  expiry(sess) { return sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + config.sessionHours * 3600e3; }
  get(sid, cb) { try { const r = this.getS.get(sid, Date.now()); cb(null, r ? JSON.parse(r.sess) : null); } catch (e) { cb(e); } }
  set(sid, sess, cb) { try { this.setS.run(sid, JSON.stringify(sess), this.expiry(sess)); cb && cb(null); } catch (e) { cb && cb(e); } }
  destroy(sid, cb) { try { this.delS.run(sid); cb && cb(null); } catch (e) { cb && cb(e); } }
  touch(sid, sess, cb) { try { this.touchS.run(this.expiry(sess), sid); cb && cb(null); } catch (e) { cb && cb(e); } }
}

const sessionMiddleware = session({
  name: 'eco.sid',
  secret: config.sessionSecret,
  store: new SqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  // 'auto' = Secure flag on HTTPS requests only (needs TRUST_PROXY=1 behind nginx / hosting proxy)
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure ? 'auto' : false, maxAge: config.sessionHours * 3600e3 },
});

// ---------- Passwords ----------
const hashPassword = pw => bcrypt.hashSync(pw, 12);
const verifyPassword = (pw, hash) => bcrypt.compareSync(pw, hash);
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Parol kamida 10 belgidan iborat bo\'lishi kerak';
  if (pw.length > 200) return 'Parol juda uzun';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Parolda harf va raqam bo\'lishi kerak';
  return null;
}
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

// ---------- Login throttling ----------
const IP_WINDOW_MS = 15 * 60 * 1000;
function ipBlocked(ip) {
  const r = db.prepare('SELECT count, first_at FROM login_attempts WHERE ip = ?').get(ip);
  if (!r) return false;
  if (Date.now() - r.first_at > IP_WINDOW_MS) { db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip); return false; }
  return r.count >= config.login.maxIpAttempts;
}
function ipFail(ip) {
  db.prepare(`INSERT INTO login_attempts (ip, count, first_at) VALUES (?, 1, ?)
    ON CONFLICT(ip) DO UPDATE SET count = count + 1`).run(ip, Date.now());
}

// Returns { user } or { error }
function attemptLogin(email, password, ip) {
  if (ipBlocked(ip)) return { error: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urinib ko\'ring.' };
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
  if (!user) { verifyPassword(String(password || ''), DUMMY_HASH); ipFail(ip); return { error: 'Email yoki parol noto\'g\'ri.' }; }
  if (user.locked_until && user.locked_until > Date.now()) {
    const min = Math.ceil((user.locked_until - Date.now()) / 60000);
    return { error: `Hisob vaqtincha bloklangan. ${min} daqiqadan keyin urinib ko'ring.` };
  }
  if (!verifyPassword(String(password || ''), user.password_hash) || !user.is_active) {
    ipFail(ip);
    const fails = user.failed_attempts + 1;
    const lock = fails >= config.login.maxAccountAttempts ? Date.now() + config.login.lockMinutes * 60000 : null;
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : fails, lock, user.id);
    return { error: lock ? `Hisob ${config.login.lockMinutes} daqiqaga bloklandi.` : 'Email yoki parol noto\'g\'ri.' };
  }
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?").run(user.id);
  db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
  return { user };
}

// ---------- CSRF ----------
const newToken = () => crypto.randomBytes(32).toString('hex');
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = newToken();
  return req.session.csrf;
}
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.get('x-csrf-token') || req.body?._csrf;
  if (!safeEqual(token, req.session?.csrf)) return res.status(403).json({ error: 'CSRF token noto\'g\'ri. Sahifani yangilang.' });
  next();
}

// ---------- Guards ----------
// Reload the user on every request so role changes / deactivation take effect immediately.
function loadUser(req, res, next) {
  const id = req.session?.userId;
  if (id) {
    const u = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(id);
    if (u && u.is_active) req.user = u;
    else delete req.session.userId;
  }
  next();
}
function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.originalUrl.startsWith('/admin/api') || req.xhr) return res.status(401).json({ error: 'Tizimga kiring' });
  res.redirect('/admin/login');
}
function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Faqat Admin uchun' });
}

module.exports = { sessionMiddleware, hashPassword, verifyPassword, passwordProblem, attemptLogin, csrfToken, verifyCsrf, safeEqual, newToken, loadUser, requireAuth, requireAdmin };
