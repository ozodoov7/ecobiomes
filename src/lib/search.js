// Site-wide search over all PUBLISHED content (news, publications, people, projects,
// research areas, facilities, collaboration, services and page texts).
// Content is small (hundreds of records), so an in-memory index rebuilt on change is fast and simple.
const { db } = require('../db');
const repo = require('./repo');
const helpers = require('./helpers');

// ---------- text normalisation (case, accents, Uzbek apostrophes) ----------
const APOS = /[\u2018\u2019\u02BB\u02BC\u0060\u00B4]/g; // ‘ ’ ʻ ʼ ` ´  →  '
function normChar(c) {
  return c.replace(APOS, "'").normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
// Returns the normalised string plus a map from each normalised index to the original index
function normalizeWithMap(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const n = normChar(text[i]);
    for (let k = 0; k < n.length; k++) { out += n[k]; map.push(i); }
  }
  return { out, map };
}
const norm = s => normalizeWithMap(String(s || '')).out;
const stripHtml = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;|&#34;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// ---------- index ----------
let cache = { key: null, docs: [] };

function versionKey() {
  // Any content write records a revision; seeds/imports change row counts.
  const r = db.prepare('SELECT COALESCE(MAX(id), 0) AS m, COUNT(*) AS c FROM revisions').get();
  const p = db.prepare('SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), \'\') AS u FROM pages').get();
  return `${r.m}:${r.c}:${p.c}:${p.u}`;
}

function buildDocs() {
  const docs = [];
  const add = (type, title, url, fields, meta = '', date = '') => {
    const parts = fields.map(f => stripHtml(f)).filter(Boolean);
    docs.push({ type, title: String(title || ''), url, meta, date, body: parts, nTitle: norm(title), nBody: norm(parts.join(' \u2022 ')) });
  };
  const pub = name => repo.list(name, { publishedOnly: true });

  for (const n of pub('news')) {
    add('news', n.title, `/news/${n.slug}.html`, [n.excerpt, n.body, n.label, n.context], [helpers.fmtDate(n.date), n.label].filter(Boolean).join(' · '), n.date);
  }
  const cats = Object.fromEntries(pub('pub_categories').map(c => [c.key, c.label]));
  for (const p of pub('publications')) {
    const url = p.pdf || (/^https?:/.test(p.url || '') ? p.url : `/publications.html?q=${encodeURIComponent(p.title.slice(0, 60))}`);
    add('publication', p.title, url, [p.authors, p.journal, p.doi, cats[p.category], String(p.year)], [p.authors, p.journal, p.year].filter(Boolean).join(' · '), `${p.year}-01-01`);
  }
  for (const p of pub('people')) add('person', p.name, `/people.html#person-${p.slug}`, [p.role_title, p.bio, (p.tags || []).join(', ')], p.role_title);
  for (const p of pub('projects')) {
    add('project', p.title, `/projects.html#project-${p.slug}`, [p.overview, p.question, p.objectives, p.methods, p.study_system, p.outcomes, p.related_label, (p.tags || []).join(', ')], p.badge);
  }
  for (const a of pub('research_areas')) {
    add('research', a.title, `/research.html#area-${helpers.slug(a.title)}`, [a.summary, (a.questions || []).join(' '), a.methods, a.current_focus, a.related_projects]);
  }
  for (const f of pub('facilities')) add('facility', f.title, '/research.html#facilities', [f.description, (f.specs || []).map(s => `${s.label}: ${s.value}`).join(' ')]);
  for (const c of pub('collab_types')) add('collaboration', c.title, '/research.html#collaboration', [c.text]);
  for (const t of pub('collab_timeline')) add('collaboration', t.title, '/research.html#collaboration', [t.text, t.year], t.year);
  for (const l of pub('collab_locations')) add('collaboration', l.country, '/research.html#collaboration', [l.description]);
  for (const s of pub('services')) add('service', s.title, `/services.html#service-${s.id}`, [s.description, s.methodology, s.applications, (s.tags || []).join(', ')]);

  // Page-level texts (hero + section blocks)
  const pageUrl = { home: '/', research: '/research.html', people: '/people.html', projects: '/projects.html', publications: '/publications.html', news: '/news.html', services: '/services.html' };
  for (const [slug, url] of Object.entries(pageUrl)) {
    const pg = repo.getPage(slug);
    if (pg.hero_title) add('page', pg.hero_title, url, [pg.hero_lede, pg.cta_title]);
  }
  const blockUrl = { home_info: '/#info', home_about: '/#about', research_facilities: '/research.html#facilities', research_facility_practice: '/research.html#facilities', research_collab: '/research.html#collaboration', research_network: '/research.html#collaboration' };
  for (const [key, url] of Object.entries(blockUrl)) {
    const b = repo.getBlock(key);
    const title = b.title || b.eyebrow;
    const texts = Object.entries(b).filter(([k, v]) => typeof v === 'string' && k !== 'title' && !/image|url|_alt$/.test(k)).map(([, v]) => v);
    if (title) add('page', title, url, texts);
  }
  return docs;
}

function getDocs() {
  const key = versionKey();
  if (cache.key !== key) cache = { key, docs: buildDocs() };
  return cache.docs;
}

// ---------- highlighting ----------
// Splits `text` into [{t, m}] segments where m=true marks a query-term match.
function highlight(text, terms) {
  const { out, map } = normalizeWithMap(text);
  const ranges = [];
  for (const term of terms) {
    let i = out.indexOf(term);
    while (i !== -1) { ranges.push([map[i], map[i + term.length - 1] + 1]); i = out.indexOf(term, i + term.length); }
  }
  if (!ranges.length) return [{ t: text, m: false }];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const r of ranges.slice(1)) { const last = merged[merged.length - 1]; if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r); }
  const segs = [];
  let pos = 0;
  for (const [a, b] of merged) { if (a > pos) segs.push({ t: text.slice(pos, a), m: false }); segs.push({ t: text.slice(a, b), m: true }); pos = b; }
  if (pos < text.length) segs.push({ t: text.slice(pos), m: false });
  return segs;
}

// A ~200-character excerpt around the first matching term
function snippet(doc, terms) {
  const text = doc.body.join(' · ');
  if (!text) return [];
  const { out, map } = normalizeWithMap(text);
  let first = -1;
  for (const t of terms) { const i = out.indexOf(t); if (i !== -1 && (first === -1 || i < first)) first = i; }
  const LEN = 200;
  let start = 0;
  if (first > 60) start = map[first] - 60;
  let s = text.slice(start, start + LEN);
  if (start > 0) s = '… ' + s.replace(/^\S*\s/, '');
  if (start + LEN < text.length) s = s.replace(/\s\S*$/, '') + ' …';
  return highlight(s, terms);
}

// ---------- query ----------
function search(query, { limit = Infinity } = {}) {
  const q = String(query || '').trim().slice(0, 100);
  const phrases = [];
  const rest = norm(q).replace(/"([^"]+)"/g, (m, ph) => { phrases.push(ph.trim()); return ' '; });
  const terms = [...new Set([...phrases, ...rest.split(/[\s,.;:!?()"]+/).filter(t => t.length >= 2 || /\d/.test(t))])].filter(Boolean);
  if (!terms.length) return { q, terms, total: 0, results: [] };
  const phrase = norm(q).replace(/"/g, '').trim();
  const has = (text, t) => /^\d+$/.test(t) ? new RegExp(`(^|\\D)${t}(\\D|$)`).test(text) : text.includes(t);
  const scored = [];
  for (const d of getDocs()) {
    let score = 0, all = true;
    for (const t of terms) {
      const inTitle = has(d.nTitle, t), inBody = has(d.nBody, t);
      if (!inTitle && !inBody) { all = false; break; }
      if (inTitle) score += 10 + (d.nTitle.startsWith(t) ? 3 : 0);
      if (inBody) score += Math.min(5, d.nBody.split(t).length - 1);
    }
    if (!all) continue;
    if (terms.length > 1 && (d.nTitle.includes(phrase) || d.nBody.includes(phrase))) score += 15;
    if (d.nTitle === phrase) score += 25;
    scored.push({ d, score });
  }
  scored.sort((a, b) => b.score - a.score || String(b.d.date).localeCompare(String(a.d.date)) || a.d.title.localeCompare(b.d.title));
  return {
    q, terms, total: scored.length,
    results: scored.slice(0, limit).map(({ d }) => ({ type: d.type, url: d.url, meta: d.meta, title: highlight(d.title, terms), snippet: snippet(d, terms) })),
  };
}

module.exports = { search, normalize: norm };
