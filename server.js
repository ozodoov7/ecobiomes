const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./src/config');
const { db } = require('./src/db'); // runs migrations on start
// First start (or an empty/new data folder): load the original site content automatically
const seeder = require('./src/db/seed');
if (seeder.seedIfEmpty()) console.log('ℹ Database was empty — original website content loaded (seed).');
else { const added = seeder.ensureDefaults(); if (added.length) console.log('ℹ New default content added:', added.join(', ')); }
if (!db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1").get().n) {
  console.warn('⚠ No admin user yet. Create one with:  npm run create-admin');
}
const auth = require('./src/lib/auth');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      frameSrc: ['https:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  hsts: config.cookieSecure,
}));

const staticOpts = { maxAge: config.isProd ? '7d' : 0, index: false, fallthrough: true };
app.use('/css', express.static(path.join(__dirname, 'public/css'), staticOpts));
app.use('/js', express.static(path.join(__dirname, 'public/js'), staticOpts));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), staticOpts));
app.use('/admin/static', express.static(path.join(__dirname, 'public/admin'), { ...staticOpts, maxAge: 0 }));
app.use('/uploads', express.static(config.uploadsDir, {
  ...staticOpts, dotfiles: 'deny',
  setHeaders: res => res.set('X-Content-Type-Options', 'nosniff'),
}));
app.get('/robots.txt', (req, res) => {
  const base = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\n\nSitemap: ${base}/sitemap.xml\n`);
});

// Warn once if the admin is used over plain HTTP in production (passwords would travel unencrypted)
let httpWarned = false;
app.use('/admin', (req, res, next) => {
  if (config.isProd && !req.secure && !httpWarned) {
    httpWarned = true;
    console.warn('⚠ Admin panel is being accessed over HTTP. Enable HTTPS; behind nginx/hosting proxy set TRUST_PROXY=1.');
  }
  next();
});
app.use(auth.sessionMiddleware);
app.use(auth.loadUser);
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/public'));

// 404 + errors
const repo = require('./src/lib/repo');
const helpers = require('./src/lib/helpers');
function render404(req, res) {
  const settings = repo.getSettings();
  const items = repo.list('menu_items', { publishedOnly: true });
  const menu = { header: [], header_button: [], footer_1: [], footer_2: [] };
  const byId = new Map(items.map(i => [i.id, { ...i, children: [] }]));
  for (const i of byId.values()) { if (i.parent_id && byId.has(i.parent_id)) byId.get(i.parent_id).children.push(i); else if (!i.parent_id) menu[i.location]?.push(i); }
  res.status(404).render('pages/404', { ...helpers, settings, menu, preview: false, headerSearch: repo.getBlock('search_intro'), lang: settings.default_language || 'en', absUrl: u => u,
    meta: { title: `Page not found — ${settings.site_name}`, description: '', ogTitle: settings.site_name, ogDescription: '' } });
}
app.use(render404);
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).type('text/plain').send(err.status && err.status < 500 ? err.message : 'Server error');
});

app.listen(config.port, () => {
  console.log(`Ecobiome running on http://localhost:${config.port}  (admin: /admin)`);
  require('./src/lib/backup').startScheduler();
  if (config.backup.auto) console.log(`ℹ Daily backup at ${String(config.backup.hour).padStart(2, '0')}:00${config.backup.offsiteRemote ? ` → also off-site: ${config.backup.offsiteRemote}` : ' (off-site copy not configured: OFFSITE_REMOTE)'}`);
});
