const sanitizeHtml = require('sanitize-html');

class ValidationError extends Error {
  constructor(errors) { super('Validation failed'); this.errors = errors; this.status = 422; }
}

// Strip control characters (keep \n and \t), normalise newlines, trim.
function cleanText(v, max = 2000) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}

// Allow only safe URL schemes. Returns '' for anything else (javascript:, data:, vbscript:, ...).
function safeUrl(v, { allowMailTel = true } = {}) {
  const s = cleanText(v, 2000);
  if (!s) return '';
  if (/[\s<>"'`\\]/.test(s)) return '';
  if (s.startsWith('#') || (s.startsWith('/') && !s.startsWith('//'))) return s;
  if (/^https?:\/\/[^/]/i.test(s)) return s;
  if (allowMailTel && /^(mailto:|tel:)/i.test(s)) return s;
  if (/^[a-z0-9][\w.-]*\.html(#[\w-]*)?$/i.test(s)) return '/' + s; // "people.html" → "/people.html"
  return '';
}

const RICH_OPTIONS = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr', 'img', 'figure', 'figcaption', 'sub', 'sup'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    b: 'strong', i: 'em',
    a: (tag, attribs) => {
      const out = { href: attribs.href || '' };
      if (attribs.title) out.title = attribs.title;
      if (attribs.target === '_blank') { out.target = '_blank'; out.rel = 'noopener noreferrer'; }
      return { tagName: 'a', attribs: out };
    },
    img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
  },
  exclusiveFilter: frame => frame.tag === 'p' && !frame.text.trim() && !frame.mediaChildren?.length,
};
function sanitizeRich(html, max = 200000) {
  return sanitizeHtml(String(html || '').slice(0, max), RICH_OPTIONS).trim();
}

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;
const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80).replace(/^-|-$/g, '');

// Validate + clean a payload against a field list. `partial` skips missing fields.
function validate(fields, input, { partial = false } = {}) {
  const out = {}, errors = {};
  for (const fd of fields) {
    if (fd.type === 'relation') {
      if (input[fd.name] !== undefined) out[fd.name] = [...new Set((Array.isArray(input[fd.name]) ? input[fd.name] : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
      continue;
    }
    if (partial && !(fd.name in input)) continue;
    const raw = input[fd.name];
    let v;
    switch (fd.type) {
      case 'richtext': v = sanitizeRich(raw); break;
      case 'textarea': case 'paragraphs': v = cleanText(raw, fd.max || 20000); break;
      case 'number': {
        if (raw === '' || raw === null || raw === undefined) { v = null; break; }
        v = Number(raw);
        if (!Number.isFinite(v)) { errors[fd.name] = 'Raqam kiriting'; continue; }
        if (fd.integer) v = Math.round(v);
        if (fd.min !== undefined && v < fd.min) { errors[fd.name] = `Kamida ${fd.min}`; continue; }
        break;
      }
      case 'date':
        v = cleanText(raw, 10);
        if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[fd.name] = 'Sana formati: YYYY-MM-DD'; continue; }
        break;
      case 'select':
        v = cleanText(raw, 60);
        if (v && !fd.options.some(o => o[0] === v)) { errors[fd.name] = 'Noto\'g\'ri qiymat'; continue; }
        if (!v && fd.options.length) v = fd.options[0][0];
        break;
      case 'checkbox': v = raw === true || raw === 1 || raw === '1' || raw === 'on' || raw === 'true' ? 1 : 0; break;
      case 'image': case 'file': v = safeUrl(raw, { allowMailTel: false }); if (raw && !v) { errors[fd.name] = 'Noto\'g\'ri havola'; continue; } break;
      case 'url': v = safeUrl(raw); if (raw && String(raw).trim() && !v) { errors[fd.name] = 'Havola http(s)://, /, #, mailto: yoki tel: bilan boshlanishi kerak'; continue; } break;
      case 'email': v = cleanText(raw, 254); if (v && !EMAIL_RE.test(v)) { errors[fd.name] = 'Email noto\'g\'ri'; continue; } break;
      case 'slug': v = slugify(raw || input[fd.from]); break;
      case 'list': case 'tags': {
        let arr = Array.isArray(raw) ? raw : String(raw || '').split(fd.type === 'tags' ? /[,\n]/ : /\n/);
        v = arr.map(x => cleanText(x, 500)).filter(Boolean).slice(0, 200);
        break;
      }
      case 'repeater': {
        const rows = Array.isArray(raw) ? raw : [];
        const cleaned = [];
        for (const row of rows.slice(0, 100)) {
          const r = {};
          for (const sub of fd.fields) r[sub.name] = sub.type === 'url' ? safeUrl(row?.[sub.name]) : cleanText(row?.[sub.name], sub.max || 1000);
          if (Object.values(r).some(Boolean)) cleaned.push(r);
        }
        v = cleaned;
        break;
      }
      case 'ref': {
        const empty = raw === '' || raw === null || raw === undefined;
        // id-refs are nullable INTEGER columns; key-refs (e.g. publication category) are NOT NULL TEXT → ''
        v = fd.valueField === 'id' ? (empty || !Number.isInteger(+raw) ? null : +raw) : (empty ? '' : cleanText(raw, 80));
        break;
      }
      default: v = cleanText(raw, fd.max || 2000);
    }
    if (fd.required && (v === '' || v === null || (Array.isArray(v) && !v.length))) { errors[fd.name] = 'Majburiy maydon'; continue; }
    out[fd.name] = v;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

module.exports = { ValidationError, cleanText, safeUrl, sanitizeRich, validate, slugify, EMAIL_RE };
