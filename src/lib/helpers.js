// Helpers available inside public templates
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');

const { slugify } = require('./sanitize');
const fs = require('fs');
const path = require('path');
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
// "/css/style.css" → "/css/style.css?v=<file-time>" so browsers and Cloudflare fetch a new copy whenever the file changes
function asset(p) {
  try { return `${p}?v=${Math.floor(fs.statSync(path.join(PUBLIC_DIR, p)).mtimeMs).toString(36)}`; } catch { return p; }
}

module.exports = {
  esc,
  slug: slugify,
  asset,
  pad2: n => String(n).padStart(2, '0'),
  paras: t => String(t || '').split(/\n\s*\n/).map(s => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
  lines: t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean),
  tel: p => String(p || '').replace(/[^\d+]/g, ''),
  fmtDate: iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : (iso || '');
  },
};
