// End-to-end test. Run against a THROWAWAY database, never production:
//   DB_PATH=data/test.sqlite npm run seed
//   DB_PATH=data/test.sqlite ADMIN_PASSWORD=TestAdmin12345 npm run create-admin -- --email admin@test.uz --name Test
//   DB_PATH=data/test.sqlite PORT=3100 COOKIE_SECURE=0 npm start   (another terminal)  →  npm test
const sharp = require('sharp');
const BASE = process.env.TEST_URL || 'http://localhost:3100';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

function client() {
  const jar = {};
  const f = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}), cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    const r = await fetch(BASE + path, { ...opts, headers, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return r;
  };
  f.jar = jar;
  return f;
}
async function login(email, password) {
  const c = client();
  const html = await (await c('/admin/login')).text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const r = await c('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, email, password }) });
  if (r.status !== 302) return { c, status: r.status, body: await r.text() };
  const app = await (await c('/admin')).text();
  c.csrf = app.match(/name="csrf-token" content="([^"]+)"/)[1];
  c.api = async (method, path, body) => {
    const opts = { method, headers: { 'x-csrf-token': c.csrf } };
    if (body instanceof FormData) opts.body = body; else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await c('/admin/api' + path, opts);
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer() };
  };
  return { c, status: 302 };
}
const page = async p => (await fetch(BASE + p)).text();

(async () => {
  console.log('Auth');
  const bad = await login('admin@test.uz', 'wrongpassword1');
  ok(bad.status === 401 && bad.body.includes('noto'), 'wrong password rejected');
  const unauth = await fetch(BASE + '/admin/api/model');
  ok(unauth.status === 401, 'API requires login');
  const { c: A } = await login('admin@test.uz', 'TestAdmin12345');
  ok(!!A.csrf, 'admin login ok');
  const noCsrf = await A('/admin/api/c/services', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"title":"x"}' });
  ok(noCsrf.status === 403, 'POST without CSRF token → 403');

  console.log('CRUD + draft/preview');
  let r = await A.api('POST', '/c/people', { name: 'Test Researcher', grp: 'core', role_title: 'Visiting Scientist', bio: 'Bio text', tags: ['Soil', 'GIS'], status: 'draft' });
  ok(r.status === 201 && r.data.slug === 'test-researcher', 'create person (auto slug)');
  const pid = r.data.id;
  ok(!(await page('/people.html')).includes('Test Researcher'), 'draft hidden on public site');
  ok((await (await A('/people.html?preview=1')).text()).includes('Test Researcher'), 'draft visible in preview for logged-in user');
  ok(!(await page('/people.html?preview=1')).includes('Test Researcher'), 'preview param ignored for anonymous visitors');
  r = await A.api('PUT', '/c/people/' + pid, { status: 'published', role_title: 'Senior Scientist' });
  ok(r.status === 200 && (await page('/people.html')).includes('Senior Scientist'), 'publish + update appears on site');
  r = await A.api('POST', '/c/people', { name: 'Test Researcher', grp: 'core', status: 'draft' });
  ok(r.data.slug === 'test-researcher-2', 'duplicate slug made unique');
  await A.api('DELETE', '/c/people/' + r.data.id);

  console.log('Reorder');
  const list = (await A.api('GET', '/c/services')).data;
  const rev = list.map(s => s.id).reverse();
  await A.api('POST', '/c/services/reorder', { ids: rev });
  const html = await page('/services.html');
  ok(html.indexOf(list[list.length - 1].title) < html.indexOf(list[0].title), 'drag & drop order reflected on site');
  await A.api('POST', '/c/services/reorder', { ids: list.map(s => s.id) });

  console.log('Revisions');
  await A.api('DELETE', '/c/people/' + pid);
  ok(!(await page('/people.html')).includes('Senior Scientist'), 'person deleted');
  const revs = (await A.api('GET', `/revisions?entity=people&id=${pid}`)).data;
  ok(revs.length >= 3 && revs[0].action === 'delete', 'history recorded (create/update/delete)');
  r = await A.api('POST', `/revisions/${revs[0].id}/restore`);
  ok(r.status === 200 && (await page('/people.html')).includes('Senior Scientist'), 'deleted record restored from history');
  const upd = revs.find(x => x.action === 'create');
  await A.api('POST', `/revisions/${upd.id}/restore`);
  ok((await A.api('GET', '/c/people/' + pid)).data.role_title === 'Visiting Scientist', 'rolled back to an older version');

  console.log('Blocks / pages / settings');
  r = await A.api('PUT', '/b/home_about', { quote: 'A brand new PI quote.' });
  ok(r.status === 200 && (await page('/')).includes('A brand new PI quote.'), 'block edit shows on home');
  r = await A.api('PUT', '/p/people', { hero_title: 'Our wonderful team.', cta_enabled: 0 });
  const ph = await page('/people.html');
  ok(ph.includes('Our wonderful team.') && !ph.includes('Join our team'), 'page hero + CTA toggle');
  await A.api('PUT', '/p/people', { hero_title: 'The researchers behind the science.', cta_enabled: 1 });
  r = await A.api('PUT', '/settings', { slide_interval: 4000, phone: '+998 (71) 123-45-67' });
  const hp = await page('/');
  ok(hp.includes('data-interval="4000"') && hp.includes('tel:+998711234567'), 'settings: slide interval + phone');

  console.log('Security: XSS & URL validation');
  r = await A.api('POST', '/c/news', { title: '<img src=x onerror=alert(1)>', date: '2026-09-20', kind: 'news', excerpt: '<script>alert(2)</script>',
    body: '<p onclick="evil()">Hello</p><script>alert(3)</script><a href="javascript:alert(4)">bad</a><a href="https://ok.uz" target="_blank">good</a>', status: 'published' });
  ok(r.status === 201, 'news created');
  const nid = r.data.id, slug = r.data.slug;
  const nh = await page('/news.html'), ah = await page(`/news/${slug}.html`);
  ok(!nh.includes('<img src=x') && nh.includes('&lt;img src=x onerror=alert(1)&gt;') && !nh.includes('<script>alert(2)'), 'titles/excerpts are HTML-escaped');
  ok(!ah.includes('onclick') && !ah.includes('<script>alert(3)') && !ah.includes('javascript:') && ah.includes('rel="noopener noreferrer"'), 'rich text sanitised');
  r = await A.api('PUT', '/c/news/' + nid, { cover: 'javascript:alert(1)' });
  ok(r.status === 422 && r.data.fields.cover, 'javascript: URL rejected');
  await A.api('DELETE', '/c/news/' + nid);

  console.log('Relations');
  const ppl = (await A.api('GET', '/c/people')).data.slice(0, 2);
  const proj = (await A.api('GET', '/c/projects')).data[0];
  await A.api('PUT', '/c/projects/' + proj.id, { people: ppl.map(p => p.id) });
  ok((await page('/projects.html')).includes('<strong>Team:</strong> ' + ppl.map(p => p.name).join(', ')), 'project team from People');
  await A.api('PUT', '/c/projects/' + proj.id, { people: [] });

  console.log('Media');
  const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#3a7' } }).png().toBuffer();
  let fd = new FormData(); fd.append('files', new Blob([png], { type: 'image/png' }), 'Field Photo.png');
  r = await A.api('POST', '/media', fd);
  ok(r.status === 201 && r.data[0].file.endsWith('-lg.webp') && r.data[0].width === 1920, 'image → WEBP, resized to 1920px');
  const mid = r.data[0].id, murl = r.data[0].file;
  ok((await fetch(BASE + r.data[0].variants.sm)).status === 200, 'thumbnail variant served');
  fd = new FormData(); fd.append('files', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
  r = await A.api('POST', '/media', fd);
  ok(r.status === 415, 'fake image (wrong magic bytes) rejected');
  fd = new FormData(); fd.append('files', new Blob(['%PDF-1.4\n%fake pdf\n'], { type: 'application/pdf' }), 'paper.pdf');
  r = await A.api('POST', '/media', fd);
  ok(r.status === 201 && r.data[0].file.endsWith('.pdf'), 'PDF upload');
  const pub = (await A.api('GET', '/c/publications')).data[0];
  await A.api('PUT', '/c/publications/' + pub.id, { pdf: r.data[0].file });
  ok((await page('/publications.html')).includes(`href="${r.data[0].file}"`), 'publication links to uploaded PDF');
  await A.api('PUT', '/c/publications/' + pub.id, { pdf: '' });
  await A.api('PUT', '/c/hero_slides/' + (await A.api('GET', '/c/hero_slides')).data[0].id, { image: murl });
  r = await A.api('DELETE', '/media/' + mid);
  ok(r.status === 409 && r.data.used.length, 'deleting media in use is blocked (shows where used)');

  console.log('Contact form + messages');
  await A.api('PUT', '/settings', { show_contact_form: 1 });
  const V = client();
  const home = await (await V('/')).text();
  ok(home.includes('<form class="contact-form" id="contact-form"') && (home.match(/id="contact-form"/g) || []).length === 1, 'contact form shown when enabled (unique id)');
  const pcsrf = home.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await V('/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _csrf: pcsrf, name: 'Ali', email: 'ali@example.uz', subject: 'Research inquiry', message: 'Salom!' }) });
  ok(r.status === 200, 'visitor message accepted');
  r = await V('/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ _csrf: 'bad', name: 'x', email: 'x@y.uz', message: 'x' }) });
  ok(r.status === 403, 'contact CSRF enforced');
  const msgs = (await A.api('GET', '/messages')).data;
  ok(msgs[0].name === 'Ali' && msgs[0].is_read === 0, 'message listed as unread');
  await A.api('PUT', '/messages/' + msgs[0].id, { is_read: 1 });
  ok((await A.api('GET', '/dashboard')).data.unread === 0, 'marked as read');

  console.log('Roles');
  r = await A.api('POST', '/users', { name: 'Editor One', email: 'editor@test.uz', role: 'editor', password: 'short' });
  ok(r.status === 422 && r.data.fields.password, 'weak password rejected');
  r = await A.api('POST', '/users', { name: 'Editor One', email: 'editor@test.uz', role: 'editor', password: 'EditorPass123' });
  ok(r.status === 201, 'editor created');
  const { c: E } = await login('editor@test.uz', 'EditorPass123');
  ok((await E.api('PUT', '/c/services/' + list[0].id, { title: list[0].title })).status === 200, 'editor can edit content');
  ok((await E.api('PUT', '/settings', { site_name: 'x' })).status === 403, 'editor cannot change settings');
  ok((await E.api('GET', '/users')).status === 403, 'editor cannot manage users');
  ok((await E.api('GET', '/c/menu_items')).status === 403, 'editor cannot edit menu');
  ok((await E.api('GET', '/backup/export')).status === 403, 'editor cannot export backup');
  r = await A.api('PUT', '/users/' + (await A.api('GET', '/users')).data.find(u => u.email === 'admin@test.uz').id, { name: 'Test Admin', email: 'admin@test.uz', role: 'editor' });
  ok(r.status === 422, 'last admin cannot be demoted');

  console.log('Regressions (bug fixes)');
  ok((await E.api('GET', '/revisions?entity=settings&id=site')).status === 403 && !(await E.api('GET', '/revisions?limit=500')).data.some(r => r.entity === 'settings'), 'editor cannot read settings history');
  r = await A.api('GET', '/nope');
  ok(r.status === 404 && r.data.error, 'unknown API route → JSON 404');
  r = await A.api('PUT', '/c/services/' + list[0].id, { request_url: '/\\evil.com' });
  ok(r.status === 422, 'backslash URL (/\\evil.com) rejected');
  const menu = (await A.api('GET', '/c/menu_items')).data;
  const research = menu.find(m => m.label === 'Research'), peopleItem = menu.find(m => m.label === 'People' && m.location === 'header');
  const facil = menu.find(m => m.label === 'Facilities');
  r = await A.api('PUT', '/c/menu_items/' + research.id, { parent_id: peopleItem.id });
  ok(r.status === 422 && r.data.fields.parent_id, 'item with its own submenu cannot become a child');
  r = await A.api('PUT', '/c/menu_items/' + peopleItem.id, { parent_id: facil.id });
  ok(r.status === 422, 'cannot nest under a submenu item (max 2 levels)');
  await A.api('DELETE', '/c/menu_items/' + research.id);
  const childRev = (await A.api('GET', `/revisions?entity=menu_items&id=${facil.id}`)).data.find(v => v.action === 'delete');
  ok(!!childRev, 'deleting a parent records history for its submenu items');
  const parentRev = (await A.api('GET', `/revisions?entity=menu_items&id=${research.id}`)).data.find(v => v.action === 'delete');
  await A.api('POST', `/revisions/${parentRev.id}/restore`);
  await A.api('POST', `/revisions/${childRev.id}/restore`);
  ok((await page('/people.html')).includes('research.html#facilities'), 'parent and submenu restored');
  const cat = (await A.api('GET', '/c/pub_categories')).data[0];
  const before = (await A.api('GET', '/c/publications')).data.filter(p => p.category === cat.key).length;
  await A.api('PUT', '/c/pub_categories/' + cat.id, { key: 'renamed-key' });
  ok((await A.api('GET', '/c/publications')).data.filter(p => p.category === 'renamed-key').length === before && (await page('/publications.html')).includes('tag cat">' + cat.label), 'renaming a category key keeps its publications');
  r = await A.api('DELETE', '/c/pub_categories/' + cat.id);
  ok(r.status === 409, 'category in use cannot be deleted');
  await A.api('PUT', '/c/pub_categories/' + cat.id, { key: cat.key });
  const nw = (await A.api('GET', '/c/news')).data[0];
  await A.api('PUT', '/c/news/' + nw.id, { slug: 'renamed-article' });
  const redir = await fetch(`${BASE}/news/${nw.slug}.html`, { redirect: 'manual' });
  ok(redir.status === 301 && redir.headers.get('location') === '/news/renamed-article.html', 'renamed news: old URL → 301');
  await A.api('PUT', '/c/news/' + nw.id, { slug: nw.slug });
  ok((await fetch(`${BASE}/news/${nw.slug}.html`)).status === 200, 'renaming back makes the original URL live again');

  console.log('Site search');
  const sq = async q => (await page('/search.html?q=' + encodeURIComponent(q)));
  ok((await sq('Quercus')).includes('<mark>Quercus</mark>'), 'search finds seeded content with highlight');
  r = await A.api('POST', '/c/news', { title: 'Zebrafish symbiont discovery', date: '2026-09-01', kind: 'news', excerpt: 'A unique microbe was found.', body: '<p>Details about the Xylophage enzyme.</p>', status: 'draft' });
  const zid = r.data.id;
  ok(!(await sq('Zebrafish')).includes('Zebrafish symbiont'), 'draft news is NOT searchable');
  await A.api('PUT', '/c/news/' + zid, { status: 'published' });
  ok((await sq('Zebrafish')).includes('/news/zebrafish-symbiont-discovery.html'), 'published news appears in search immediately');
  ok((await sq('xylophage')).includes('Zebrafish symbiont'), 'full-text body (rich text) is searchable');
  await A.api('DELETE', '/c/news/' + zid);
  ok(!(await sq('Zebrafish')).includes('Zebrafish symbiont'), 'deleted news disappears from search');
  ok(!(await sq('<script>alert(1)</script>')).includes('<script>alert(1)'), 'search query is escaped');
  const sm = await page('/sitemap.xml');
  ok(sm.includes('<urlset') && sm.includes('/news/') && !sm.includes('/search.html'), 'sitemap.xml lists pages and news (not search)');
  await A.api('PUT', '/settings', { show_search: 0 });
  ok(!(await page('/')).includes('class="header-search"'), 'search icon can be hidden from settings');
  await A.api('PUT', '/settings', { show_search: 1 });

  console.log('Publications & backups');
  const bulkIds = [];
  for (let i = 0; i < 55; i++) bulkIds.push((await A.api('POST', '/c/publications', { title: `Zanthoxylum chemistry report ${i}`, year: 1995 + (i % 30), status: 'published' })).data.id);
  const allQ = await sq('zanthoxylum');
  const shownN = (allQ.match(/class="pub-item"/g) || []).length, statusN = +((allQ.match(/role="status">(\d+)/) || [])[1] || 0);
  ok(statusN === 55 && shownN === 55, `search shows ALL matches, not just 50 (${shownN}/${statusN})`);
  ok(bulkIds.every(Boolean), 'publication without a category can be created');
  for (const id of bulkIds) await A.api('DELETE', '/c/publications/' + id);
  const pubsHtml = await page('/publications.html'), pubsN = (await A.api('GET', '/c/publications')).data.filter(p => p.status === 'published').length;
  ok((pubsHtml.match(/class="pub-item"/g) || []).length === pubsN && pubsHtml.includes(`Showing ${pubsN} of ${pubsN} publications`), 'publications page lists every published paper + count');
  r = await A.api('POST', '/c/publications', { title: 'An old 1987 field survey of steppe beetles', authors: 'Old, A.', year: 1987, journal: 'Archive', status: 'published' });
  const oldPub = r.data.id;
  const ph1987 = await page('/publications.html');
  ok(ph1987.includes('value="1987"') && ph1987.includes('An old 1987 field survey'), 'old publication (1987) listed + year filter option added');
  ok((await sq('steppe beetles')).includes('An old 1987 field survey'), 'old publication found by site search');
  await A.api('DELETE', '/c/publications/' + oldPub);
  ok(!(await page('/publications.html')).includes('An old 1987 field survey') && !(await sq('steppe beetles')).includes('An old 1987'), 'deleted publication removed everywhere');
  ok((await E.api('GET', '/backup/status')).status === 403, 'editor cannot see backup status');
  r = await A.api('POST', '/backup/run');
  ok(r.status === 200 && r.data.status.last_local.ok && /^ecobiome-.*\.zip$/.test(r.data.status.last_local.file), '"Backup now" creates a server backup');
  ok((await A.api('GET', '/backup/list')).data.some(f => f.name === r.data.status.last_local.file), 'new backup listed for download');

  console.log('Lockout');
  for (let i = 0; i < 5; i++) await login('editor@test.uz', 'wrong-password-' + i);
  const locked = await login('editor@test.uz', 'EditorPass123');
  ok(locked.status === 401 && locked.body.includes('bloklangan'), 'account locked after 5 failed attempts');

  console.log('Backup export / import');
  const zip = await A.api('GET', '/backup/export');
  ok(zip.status === 200 && Buffer.from(zip.data).slice(0, 2).toString() === 'PK', 'backup ZIP exported');
  await A.api('PUT', '/b/home_about', { quote: 'Changed after backup.' });
  fd = new FormData(); fd.append('file', new Blob([zip.data], { type: 'application/zip' }), 'backup.zip');
  r = await A.api('POST', '/backup/import', fd);
  ok(r.status === 200 && r.data.safetyBackup, 'backup imported (safety copy made)');
  ok((await page('/')).includes('A brand new PI quote.'), 'content restored from backup');
  ok((await A.api('GET', '/model')).status === 401, 'sessions cleared after import');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
