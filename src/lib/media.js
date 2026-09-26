const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { db } = require('../db');
const config = require('../config');
const { slugify, cleanText } = require('./sanitize');
const { COLLECTIONS } = require('../content/model');

// Detect the real file type from magic bytes (never trust the client's mimetype / extension)
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 6).toString() === 'GIF87a' || buf.slice(0, 6).toString() === 'GIF89a') return 'image/gif';
  if (buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

const SIZES = { lg: 1920, md: 1000, sm: 400 };

async function saveUpload(file, alt, userId) {
  const type = sniff(file.buffer);
  if (!type) { const e = new Error('Ruxsat etilgan turlar: JPG, PNG, WEBP, GIF, PDF'); e.status = 415; throw e; }
  const now = new Date();
  const rel = path.posix.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const dir = path.join(config.uploadsDir, rel);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${crypto.randomBytes(6).toString('hex')}-${slugify(path.parse(file.originalname).name).slice(0, 50) || 'file'}`;
  const originalName = cleanText(file.originalname, 200);

  if (type === 'application/pdf') {
    const name = `${base}.pdf`;
    fs.writeFileSync(path.join(dir, name), file.buffer);
    const url = `/uploads/${rel}/${name}`;
    const info = db.prepare('INSERT INTO media (file, original_name, mime, size, alt, variants, uploaded_by) VALUES (?,?,?,?,?,?,?)')
      .run(url, originalName, type, file.size, cleanText(alt, 300), '{}', userId);
    return get(info.lastInsertRowid);
  }

  let meta;
  try { meta = await sharp(file.buffer, { limitInputPixels: 50e6 }).metadata(); }
  catch { const e = new Error(`"${originalName}" rasmini o'qib bo'lmadi (fayl shikastlangan yoki juda katta)`); e.status = 422; throw e; }
  const variants = {};
  let mainWidth, mainHeight, mainSize;
  for (const [k, w] of Object.entries(SIZES)) {
    const name = `${base}-${k}.webp`;
    const out = await sharp(file.buffer, { limitInputPixels: 50e6 }).rotate()
      .resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, name));
    variants[k] = `/uploads/${rel}/${name}`;
    if (k === 'lg') { mainWidth = out.width; mainHeight = out.height; mainSize = out.size; }
  }
  const info = db.prepare('INSERT INTO media (file, original_name, mime, size, width, height, alt, variants, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(variants.lg, originalName, 'image/webp', mainSize, mainWidth || meta.width, mainHeight || meta.height, cleanText(alt, 300), JSON.stringify(variants), userId);
  return get(info.lastInsertRowid);
}

function get(id) {
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  if (m) m.variants = JSON.parse(m.variants || '{}');
  return m;
}
function list() {
  return db.prepare('SELECT * FROM media ORDER BY id DESC').all().map(m => ({ ...m, variants: JSON.parse(m.variants || '{}') }));
}

// Find where a media file is referenced (any variant URL), across all content.
function usage(m) {
  const urls = [m.file, ...Object.values(m.variants || {})];
  const hits = [];
  const check = (where, text) => { if (urls.some(u => text.includes(u))) hits.push(where); };
  for (const [name, c] of Object.entries(COLLECTIONS)) {
    for (const r of db.prepare(`SELECT * FROM ${c.table}`).all()) check(`${c.label}: ${r[c.titleField]}`, JSON.stringify(r));
  }
  for (const r of db.prepare('SELECT key, data FROM blocks').all()) check(`Blok: ${r.key}`, r.data);
  for (const r of db.prepare('SELECT * FROM pages').all()) check(`Sahifa: ${r.slug}`, JSON.stringify(r));
  for (const r of db.prepare('SELECT key, value FROM settings').all()) check(`Sozlama: ${r.key}`, r.value);
  return hits;
}

function remove(m) {
  for (const u of new Set([m.file, ...Object.values(m.variants || {})])) {
    const p = path.join(config.uploadsDir, u.replace(/^\/uploads\//, ''));
    if (p.startsWith(config.uploadsDir + path.sep)) fs.rmSync(p, { force: true });
  }
  db.prepare('DELETE FROM media WHERE id = ?').run(m.id);
}

module.exports = { saveUpload, get, list, usage, remove, sniff };
