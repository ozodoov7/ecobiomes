const express = require('express');
const crypto = require('crypto');
const repo = require('../lib/repo');
const helpers = require('../lib/helpers');
const { db } = require('../db');
const { cleanText, EMAIL_RE } = require('../lib/sanitize');
const { safeEqual } = require('../lib/auth');
const config = require('../config');
const { BLOCKS } = require('../content/model');

const router = express.Router();
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');

// ---------- helpers ----------
function menuTree(publishedOnly) {
  const items = repo.list('menu_items', { publishedOnly });
  const tree = { header: [], header_button: [], footer_1: [], footer_2: [] };
  const byId = new Map(items.map(i => [i.id, { ...i, children: [] }]));
  for (const i of byId.values()) {
    if (i.parent_id && byId.has(i.parent_id)) byId.get(i.parent_id).children.push(i);
    else if (!i.parent_id) tree[i.location]?.push(i);
  }
  return tree;
}

function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
// Double-submit cookie CSRF for the anonymous contact form
function publicCsrf(req, res) {
  let t = readCookie(req, 'eco_csrf');
  if (!/^[a-f0-9]{48}$/.test(t)) {
    t = crypto.randomBytes(24).toString('hex');
    res.cookie('eco_csrf', t, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure && req.secure, maxAge: 24 * 3600e3 });
  }
  return t;
}

function render(req, res, view, slug, data = {}) {
  const preview = !!(req.user && req.query.preview);
  const settings = repo.getSettings();
  const page = repo.getPage(slug);
  const b = { ...Object.fromEntries(Object.entries(BLOCKS).filter(([, d]) => d.page === slug).map(([k]) => [k, {}])), ...repo.allBlocks(slug) };
  const meta = {
    title: page.seo_title || settings.site_name,
    description: page.seo_description || '',
    ogTitle: page.og_title || page.seo_title || settings.site_name,
    ogDescription: page.og_description || page.seo_description || '',
    ogImage: page.og_image || '',
    ...(data.meta || {}),
  };
  if (preview) res.set('Cache-Control', 'no-store');
  res.render(`pages/${view}`, {
    ...helpers, ...data, settings, page, b, meta, preview,
    lang: settings.default_language || 'en',
    menu: menuTree(!preview),
    headerSearch: repo.getBlock('search_intro'),
    absUrl: u => (SITE_URL && u.startsWith('/') ? SITE_URL + u : u),
  });
}
const pub = req => !(req.user && req.query.preview);

// ---------- pages ----------
router.get(['/', '/index.html'], (req, res) => {
  const settings = repo.getSettings();
  render(req, res, 'index', 'home', {
    slides: repo.list('hero_slides', { publishedOnly: pub(req) }),
    explore: repo.list('explore_cards', { publishedOnly: pub(req) }),
    publicCsrf: settings.show_contact_form ? publicCsrf(req, res) : '',
  });
});

router.get('/research.html', (req, res) => render(req, res, 'research', 'research', {
  areas: repo.list('research_areas', { publishedOnly: pub(req) }),
  facilities: repo.list('facilities', { publishedOnly: pub(req) }),
  collabTypes: repo.list('collab_types', { publishedOnly: pub(req) }),
  locations: repo.list('collab_locations', { publishedOnly: pub(req) }),
  timeline: repo.list('collab_timeline', { publishedOnly: pub(req) }),
}));

router.get('/people.html', (req, res) => {
  const people = repo.list('people', { publishedOnly: pub(req) });
  const groups = ['pi', 'core', 'doctoral', 'technical'].map(key => ({ key, people: people.filter(p => p.grp === key) })).filter(g => g.people.length);
  render(req, res, 'people', 'people', { groups });
});

router.get('/projects.html', (req, res) => {
  const people = new Map(repo.list('people', { publishedOnly: pub(req) }).map(p => [p.id, p]));
  const projects = repo.list('projects', { publishedOnly: pub(req) }).map(p => ({ ...p, team: p.people.map(id => people.get(id)).filter(Boolean) }));
  render(req, res, 'projects', 'projects', { projects });
});

router.get('/publications.html', (req, res) => {
  const pubs = repo.list('publications', { publishedOnly: pub(req) });
  const categories = repo.list('pub_categories', { publishedOnly: pub(req) });
  const years = [...new Set(pubs.map(p => p.year))].sort((a, b) => b - a).map(year => ({ year, items: pubs.filter(p => p.year === year) }));
  render(req, res, 'publications', 'publications', { years, categories, total: pubs.length, catLabel: Object.fromEntries(categories.map(c => [c.key, c.label])) });
});

router.get('/news.html', (req, res) => render(req, res, 'news', 'news', { news: repo.list('news', { publishedOnly: pub(req) }) }));

router.get('/news/:slug.html', (req, res, next) => {
  const item = db.prepare('SELECT * FROM news WHERE slug = ?').get(req.params.slug);
  if (!item) {
    const r = db.prepare("SELECT n.slug FROM slug_redirects s JOIN news n ON n.id = s.target_id WHERE s.entity = 'news' AND s.old_slug = ?").get(req.params.slug);
    return r ? res.redirect(301, `/news/${encodeURIComponent(r.slug)}.html`) : next();
  }
  if (item.status !== 'published' && pub(req)) return next();
  const site = repo.getSettings().site_name;
  render(req, res, 'news-article', 'news', {
    item,
    meta: {
      title: item.seo_title || `${item.title} — ${site}`,
      description: item.seo_description || item.excerpt,
      ogTitle: item.og_title || item.seo_title || item.title,
      ogDescription: item.og_description || item.seo_description || item.excerpt,
      ogImage: item.cover || '', ogType: 'article',
    },
  });
});

router.get('/services.html', (req, res) => render(req, res, 'services', 'services', { services: repo.list('services', { publishedOnly: pub(req) }) }));

router.get('/search.html', (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  const { search } = require('../lib/search');
  const data = search(q);
  render(req, res, 'search', 'search', { q: data.q, total: data.total, results: data.results, meta: { robots: 'noindex, follow' } });
});

// ---------- sitemap for Google / Yandex ----------
router.get('/sitemap.xml', (req, res) => {
  const base = SITE_URL || `${req.protocol}://${req.get('host')}`;
  const pages = db.prepare("SELECT slug, updated_at FROM pages WHERE slug != 'search'").all();
  const path = s => (s === 'home' ? '/' : `/${s}.html`);
  const urls = pages.map(p => ({ loc: base + path(p.slug), lastmod: p.updated_at }));
  for (const n of db.prepare("SELECT slug, updated_at FROM news WHERE status = 'published' ORDER BY date DESC").all()) {
    urls.push({ loc: `${base}/news/${encodeURIComponent(n.slug)}.html`, lastmod: n.updated_at });
  }
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url><loc>${x(u.loc)}</loc>${u.lastmod ? `<lastmod>${x(String(u.lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n');
});

// ---------- old static URLs ----------
router.get('/facilities.html', (req, res) => res.redirect(301, '/research.html#facilities'));
router.get('/collaboration.html', (req, res) => res.redirect(301, '/research.html#collaboration'));
router.get('/contact.html', (req, res) => res.redirect(301, '/#contact'));
router.get('/news-article.html', (req, res) => {
  const slug = repo.getSettings().legacy_article_slug;
  res.redirect(301, slug ? `/news/${encodeURIComponent(slug)}.html` : '/news.html');
});

// ---------- contact form ----------
const contactHits = new Map();
setInterval(() => { const now = Date.now(); for (const [ip, t] of contactHits) if (!t.some(x => now - x < 10 * 60e3)) contactHits.delete(ip); }, 10 * 60e3).unref();
router.post('/contact', express.urlencoded({ extended: false, limit: '20kb' }), express.json({ limit: '20kb' }), (req, res) => {
  const settings = repo.getSettings();
  if (!settings.show_contact_form) return res.status(404).json({ error: 'Contact form is disabled.' });
  if (!safeEqual(req.body?._csrf, readCookie(req, 'eco_csrf'))) return res.status(403).json({ error: 'Session expired — please reload the page and try again.' });
  if (req.body.website) return res.json({ ok: true }); // honeypot: silently drop bots

  const now = Date.now(), hits = (contactHits.get(req.ip) || []).filter(t => now - t < 10 * 60e3);
  if (hits.length >= 5) return res.status(429).json({ error: 'Too many messages. Please try again later.' });

  const data = {
    name: cleanText(req.body.name, 120), email: cleanText(req.body.email, 254), institution: cleanText(req.body.institution, 200),
    subject: cleanText(req.body.subject, 120), message: cleanText(req.body.message, 5000),
  };
  const allowed = repo.getBlock('home_contact').subjects || [];
  if (data.subject && !allowed.includes(data.subject)) data.subject = 'Other';
  if (!data.name || !data.message || !EMAIL_RE.test(data.email)) return res.status(422).json({ error: 'Please fill in your name, a valid email and a message.' });

  hits.push(now); contactHits.set(req.ip, hits);
  db.prepare('INSERT INTO messages (name, email, institution, subject, message, ip) VALUES (?,?,?,?,?,?)')
    .run(data.name, data.email, data.institution, data.subject, data.message, req.ip);
  res.json({ ok: true });
});

module.exports = router;
