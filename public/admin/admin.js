/* Ecobiome admin panel — vanilla JS single-page app */
(function () {
  'use strict';

  const CSRF = document.querySelector('meta[name="csrf-token"]').content;
  const ME = JSON.parse(document.getElementById('me').textContent);
  const IS_ADMIN = ME.role === 'admin';
  let MODEL = null;

  // ---------- DOM helper (never uses innerHTML for data) ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'multiple') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = k => {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) return k.forEach(add);
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  // replaceChildren that skips null/false (native one would print "null")
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); return el; };
  const escAttr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const fmtDateTime = s => { if (!s) return ''; const d = new Date(s.replace(' ', 'T') + (s.includes('Z') || s.includes('T') ? '' : 'Z')); return isNaN(d) ? s : d.toLocaleString(); };
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------- API ----------
  async function api(method, url, body) {
    const init = { method, credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF, 'Accept': 'application/json' } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    const r = await fetch('/admin/api' + url, init);
    if (r.status === 401) { location.href = '/admin/login'; throw new Error('Sessiya tugadi'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'Xatolik yuz berdi'); e.status = r.status; e.fields = data.fields; e.data = data; throw e; }
    return data;
  }

  // ---------- Toasts / modals ----------
  function toast(msg, type = 'ok') {
    const t = h('div', { class: 'toast' + (type === 'error' ? ' error' : ''), role: 'status', text: msg });
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
  }
  function showError(e) { toast(e.message || String(e), 'error'); }

  function modal({ title, body, foot, wide, onClose }) {
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } },
      h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h2', { text: title }), h('button', { class: 'icon-btn', 'aria-label': 'Yopish', text: '✕', onclick: close })),
        h('div', { class: 'modal-body' }, body),
        foot ? h('div', { class: 'modal-foot' }, foot) : null));
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey);
    const focusable = back.querySelector('input, select, textarea, button:not(.icon-btn)');
    (focusable || back.querySelector('.icon-btn')).focus();
    return { close, el: back };
  }
  function confirmDialog(message, { ok = 'Tasdiqlash', danger = false } = {}) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); m.close(); } };
      const m = modal({
        title: 'Tasdiqlang', body: h('p', { text: message }), onClose: () => finish(false),
        foot: [h('button', { class: 'btn btn-outline', text: 'Bekor qilish', onclick: () => finish(false) }),
               h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: ok, onclick: () => finish(true) })],
      });
    });
  }

  // ---------- Sortable (mouse, touch and keyboard) ----------
  function makeSortable(container, onEnd) {
    const ids = () => [...container.children].filter(c => c.dataset.id).map(c => Number(c.dataset.id));
    container.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.handle');
      if (!handle || handle.classList.contains('disabled')) return;
      const item = handle.closest('[data-id]');
      if (!item || item.parentElement !== container) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      item.classList.add('dragging');
      const before = ids().join();
      const move = ev => {
        const y = ev.clientY;
        let target = null;
        for (const s of container.children) {
          if (s === item || !s.dataset.id) continue;
          const r = s.getBoundingClientRect();
          if (y < r.top + r.height / 2) { target = s; break; }
        }
        if (target) { if (item.nextElementSibling !== target) container.insertBefore(item, target); }
        else if (container.lastElementChild !== item) container.appendChild(item);
        if (ev.clientY < 80) window.scrollBy(0, -14); else if (ev.clientY > innerHeight - 60) window.scrollBy(0, 14);
      };
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        item.classList.remove('dragging');
        if (ids().join() !== before) onEnd(ids());
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
    container.addEventListener('keydown', e => {
      const handle = e.target.closest('.handle');
      if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const item = handle.closest('[data-id]');
      if (!item || item.parentElement !== container) return;
      e.preventDefault();
      const sib = e.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
      if (!sib || !sib.dataset.id) return;
      if (e.key === 'ArrowUp') container.insertBefore(item, sib); else container.insertBefore(sib, item);
      handle.focus();
      onEnd(ids());
    });
  }
  const handleEl = disabled => h('button', { type: 'button', class: 'handle' + (disabled ? ' disabled' : ''), title: 'Sudrab tartiblang (yoki ↑/↓)', 'aria-label': 'Tartibni o\'zgartirish', tabindex: disabled ? '-1' : null, text: '⠿' });

  // ---------- Preview URL (adds ?preview=1 before the hash) ----------
  function previewUrl(path) {
    const [base, hash] = String(path).split('#');
    return base + (base.includes('?') ? '&' : '?') + 'preview=1' + (hash ? '#' + hash : '');
  }

  // ---------- Reference options cache (per view) ----------
  let refCache = {};
  async function refRows(collection) {
    if (!refCache[collection]) refCache[collection] = api('GET', '/c/' + collection);
    return refCache[collection];
  }

  // ======================================================================
  //  Media: upload + picker
  // ======================================================================
  async function uploadFiles(fileList) {
    const fd = new FormData();
    [...fileList].forEach(f => fd.append('files', f));
    const out = await api('POST', '/media', fd);
    toast(`${out.length} ta fayl yuklandi`);
    return out;
  }
  function dropzone(onFiles, accept) {
    const input = h('input', { type: 'file', multiple: true, accept: accept || 'image/jpeg,image/png,image/webp,image/gif,application/pdf', hidden: true,
      onchange: () => { if (input.files.length) onFiles(input.files); input.value = ''; } });
    const dz = h('div', { class: 'dropzone' },
      h('p', { style: { margin: '0 0 8px' }, text: 'Fayllarni shu yerga tashlang yoki' }),
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Kompyuterdan tanlash', onclick: () => input.click() }),
      h('p', { class: 'small muted', style: { margin: '8px 0 0' }, text: 'JPG, PNG, WEBP, GIF (avtomatik WEBP ga o\'giriladi va kichraytiriladi) yoki PDF' }), input);
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
    return dz;
  }
  const isPdf = m => m.mime === 'application/pdf';
  const mediaThumb = m => isPdf(m) ? '' : (m.variants.sm || m.file);

  // Resolves with the chosen media record (or null)
  function pickMedia(kind = 'image') {
    return new Promise(resolve => {
      let picked = null;
      const grid = h('div', { class: 'media-grid' });
      const search = h('input', { type: 'search', placeholder: 'Qidirish…', 'aria-label': 'Qidirish' });
      let all = [];
      const draw = () => {
        const q = search.value.toLowerCase().trim();
        fill(grid, );
        const rows = all.filter(m => (kind === 'pdf' ? isPdf(m) : !isPdf(m)) && (!q || (m.original_name + ' ' + m.alt).toLowerCase().includes(q)));
        if (!rows.length) grid.appendChild(h('p', { class: 'muted', text: 'Hozircha fayl yo\'q. Yuqoridan yuklang.' }));
        rows.forEach(m => grid.appendChild(h('div', { class: 'media-item pickable', tabindex: '0', role: 'button', 'aria-label': m.original_name,
          onclick: () => choose(m), onkeydown: e => { if (e.key === 'Enter') choose(m); } },
          h('div', { class: 'img', style: mediaThumb(m) ? { backgroundImage: `url("${mediaThumb(m)}")` } : null, text: isPdf(m) ? 'PDF' : '' }),
          h('div', { class: 'info' }, h('span', { class: 'name', text: m.original_name }), h('span', { class: 'muted', text: m.alt || '— alt yo\'q —' })))));
      };
      const choose = m => { picked = m; mdl.close(); };
      const mdl = modal({
        title: kind === 'pdf' ? 'PDF tanlash' : 'Rasm tanlash', wide: true, onClose: () => resolve(picked),
        body: [dropzone(async files => {
          try { const up = await uploadFiles(files); all = [...up, ...all]; if (up.length === 1 && (kind === 'pdf') === isPdf(up[0])) return choose(up[0]); draw(); } catch (e) { showError(e); }
        }, kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/gif'), h('div', { class: 'toolbar' }, search), grid],
      });
      search.addEventListener('input', draw);
      api('GET', '/media').then(r => { all = r; draw(); }).catch(showError);
    });
  }

  // ======================================================================
  //  Rich text editor (contenteditable, sanitised again on the server)
  // ======================================================================
  function richEditor(initial) {
    const area = h('div', { class: 'rte-area', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true' });
    area.innerHTML = initial || '<p></p>'; // value comes from our own sanitised DB field
    const source = h('textarea', { class: 'rte-source', hidden: true, 'aria-label': 'HTML manba' });
    let sourceMode = false;
    const exec = (cmd, arg) => { area.focus(); document.execCommand(cmd, false, arg); };
    const btn = (label, title, fn) => h('button', { type: 'button', title, 'aria-label': title, text: label, onmousedown: e => e.preventDefault(), onclick: fn });
    const bar = h('div', { class: 'rte-bar' },
      btn('B', 'Qalin', () => exec('bold')), btn('I', 'Kursiv', () => exec('italic')),
      h('span', { class: 'sep' }),
      btn('H2', 'Sarlavha 2', () => exec('formatBlock', '<h2>')), btn('H3', 'Sarlavha 3', () => exec('formatBlock', '<h3>')), btn('¶', 'Paragraf', () => exec('formatBlock', '<p>')),
      h('span', { class: 'sep' }),
      btn('• —', 'Ro\'yxat', () => exec('insertUnorderedList')), btn('1.', 'Raqamli ro\'yxat', () => exec('insertOrderedList')), btn('❝', 'Iqtibos', () => exec('formatBlock', '<blockquote>')),
      h('span', { class: 'sep' }),
      btn('🔗', 'Havola', () => {
        const url = prompt('Havola (https://…, /sahifa.html, mailto:…):', 'https://');
        if (!url) return;
        if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim())) return toast('Havola noto\'g\'ri', 'error');
        exec('createLink', url.trim());
      }),
      btn('⛓̸', 'Havolani olib tashlash', () => exec('unlink')),
      btn('🖼', 'Rasm qo\'shish', async () => {
        const sel = window.getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        const m = await pickMedia('image'); if (!m) return;
        area.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
        document.execCommand('insertHTML', false, `<img src="${escAttr(m.variants.md || m.file)}" alt="${escAttr(m.alt)}">`);
      }),
      h('span', { class: 'sep' }),
      btn('Tx', 'Formatni tozalash', () => exec('removeFormat')), btn('↶', 'Orqaga', () => exec('undo')), btn('↷', 'Oldinga', () => exec('redo')),
      h('span', { class: 'sep' }),
      btn('</>', 'HTML ko\'rinish', e => {
        sourceMode = !sourceMode;
        if (sourceMode) { source.value = area.innerHTML; } else { area.innerHTML = source.value; }
        area.hidden = sourceMode; source.hidden = !sourceMode;
        e.currentTarget.classList.toggle('on', sourceMode);
        [...bar.querySelectorAll('button')].forEach(b => { if (b !== e.currentTarget) b.disabled = sourceMode; });
      }));
    area.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (_) {}
    return { el: h('div', { class: 'rte' }, bar, area, source), get: () => sourceMode ? source.value : area.innerHTML, focusEl: area };
  }

  // ======================================================================
  //  Form engine — builds a form from the content model
  // ======================================================================
  const WIDE = new Set(['textarea', 'paragraphs', 'richtext', 'image', 'file', 'list', 'tags', 'repeater', 'relation']);

  function fieldControl(f, value, ctx) {
    switch (f.type) {
      case 'text': case 'email': case 'url': case 'slug': case 'number': case 'date': {
        const type = { number: 'number', date: 'date', email: 'email' }[f.type] || 'text';
        const inp = h('input', { type, value: value ?? '', maxlength: f.max || null, step: f.type === 'number' ? (f.integer ? '1' : 'any') : null,
          placeholder: f.placeholder || (f.type === 'slug' ? 'Bo\'sh qoldirilsa — avtomatik' : (f.type === 'url' ? '/sahifa.html, https://…, #anchor' : null)) });
        return { el: inp, get: () => inp.value, focusEl: inp };
      }
      case 'textarea': case 'paragraphs': case 'list': {
        const ta = h('textarea', { rows: f.type === 'list' ? 4 : (f.type === 'paragraphs' ? 6 : 3), maxlength: f.max || null });
        ta.value = f.type === 'list' ? (value || []).join('\n') : (value ?? '');
        const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 600) + 'px'; };
        ta.addEventListener('input', grow); requestAnimationFrame(grow);
        return { el: ta, get: () => f.type === 'list' ? ta.value.split('\n').map(s => s.trim()).filter(Boolean) : ta.value, focusEl: ta };
      }
      case 'select': {
        const sel = h('select', null, f.options.map(([v, l]) => h('option', { value: v, text: l })));
        sel.value = value ?? f.options[0][0];
        return { el: sel, get: () => sel.value, focusEl: sel };
      }
      case 'checkbox': {
        const cb = h('input', { type: 'checkbox', checked: !!value });
        return { el: h('label', { class: 'check' }, cb, 'Ha'), get: () => cb.checked ? 1 : 0, focusEl: cb, inlineLabel: true };
      }
      case 'image': case 'file': {
        const kind = f.type === 'file' ? 'pdf' : 'image';
        const inp = h('input', { type: 'text', value: value || '', placeholder: kind === 'pdf' ? '/uploads/…pdf' : '/uploads/… yoki https://…', 'aria-label': f.label + ' havolasi' });
        const prev = h('div', { class: 'preview' });
        const draw = () => {
          const u = inp.value.trim();
          prev.style.backgroundImage = kind === 'image' && u ? `url("${u.replace(/["\\\n]/g, '')}")` : '';
          prev.textContent = !u ? 'Tanlanmagan' : (kind === 'pdf' ? '📄 PDF' : '');
        };
        inp.addEventListener('input', draw); draw();
        const setFrom = m => {
          inp.value = m.file; draw();
          const alt = f.altField && ctx.controls[f.altField];
          if (alt && !alt.get() && m.alt) alt.set(m.alt);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const up = h('input', { type: 'file', hidden: true, accept: kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/gif',
          onchange: async () => { if (!up.files.length) return; try { const [m] = await uploadFiles(up.files); setFrom(m); } catch (e) { showError(e); } up.value = ''; } });
        return {
          el: h('div', { class: 'media-field' }, prev, h('div', { class: 'controls' }, inp,
            h('div', { class: 'btns' },
              h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Kutubxonadan tanlash', onclick: async () => { const m = await pickMedia(kind); if (m) setFrom(m); } }),
              h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Yangi yuklash', onclick: () => up.click() }),
              h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Tozalash', onclick: () => { inp.value = ''; draw(); inp.dispatchEvent(new Event('input', { bubbles: true })); } }), up))),
          get: () => inp.value.trim(), focusEl: inp,
        };
      }
      case 'tags': {
        let tags = [...(value || [])];
        const wrap = h('div', { class: 'tags-input' });
        const inp = h('input', { type: 'text', placeholder: 'Teg yozib Enter bosing', 'aria-label': f.label });
        const draw = () => {
          fill(wrap, ...tags.map((t, i) => h('span', { class: 'chip' }, t, h('button', { type: 'button', 'aria-label': t + ' tegini o\'chirish', text: '×', onclick: () => { tags.splice(i, 1); draw(); } }))), inp);
        };
        const commit = () => { inp.value.split(',').map(s => s.trim()).filter(Boolean).forEach(t => { if (!tags.includes(t)) tags.push(t); }); inp.value = ''; draw(); inp.focus(); };
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          else if (e.key === 'Backspace' && !inp.value && tags.length) { tags.pop(); draw(); inp.focus(); }
        });
        inp.addEventListener('blur', () => { if (inp.value.trim()) commit(); });
        wrap.addEventListener('click', e => { if (e.target === wrap) inp.focus(); });
        draw();
        return { el: wrap, get: () => [...tags, ...inp.value.split(',').map(s => s.trim()).filter(t => t && !tags.includes(t))], focusEl: inp };
      }
      case 'repeater': {
        const list = h('div', { class: 'repeater' });
        let seq = 0;
        const addRow = (row = {}) => {
          const inputs = {};
          const r = h('div', { class: 'rep-row', dataset: { id: String(++seq) } }, handleEl(false),
            h('div', { class: 'rep-fields' }, f.fields.map(sf => { inputs[sf.name] = h('input', { type: 'text', value: row[sf.name] || '', placeholder: sf.placeholder || sf.label, 'aria-label': sf.label, maxlength: sf.max || null }); return inputs[sf.name]; })),
            h('button', { type: 'button', class: 'icon-btn', title: 'Qatorni o\'chirish', 'aria-label': 'Qatorni o\'chirish', text: '✕', onclick: () => r.remove() }));
          r._get = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
          list.appendChild(r);
        };
        (value || []).forEach(addRow);
        makeSortable(list, () => {});
        return {
          el: h('div', null, list, h('button', { type: 'button', class: 'btn btn-outline btn-sm', style: { marginTop: '8px' }, text: '+ Qator qo\'shish', onclick: () => { addRow(); list.lastElementChild.querySelector('input').focus(); } })),
          get: () => [...list.children].map(r => r._get()).filter(o => Object.values(o).some(Boolean)),
        };
      }
      case 'ref': {
        const sel = h('select', null, h('option', { value: '', text: '— tanlanmagan —' }));
        let pending = value ?? '';
        refRows(f.collection).then(rows => {
          rows.filter(r => !f.where || Object.entries(f.where).every(([k, v]) => r[k] === v))
            .filter(r => !(f.collection === ctx.collection && r.id === ctx.itemId))
            .forEach(r => sel.appendChild(h('option', { value: String(r[f.valueField]), text: r[f.labelField] })));
          sel.value = pending === null ? '' : String(pending);
          pending = undefined;
        }).catch(showError);
        return { el: sel, get: () => { const v = pending !== undefined ? (pending ?? '') : sel.value; return v === '' ? null : v; }, focusEl: sel };
      }
      case 'relation': {
        const chosen = new Set((value || []).map(Number));
        const opts = h('div', { class: 'opts' }, h('span', { class: 'muted small', text: 'Yuklanmoqda…' }));
        const search = h('input', { type: 'search', placeholder: 'Qidirish…', 'aria-label': f.label + ' — qidirish' });
        let rows = [];
        const draw = () => {
          const q = search.value.toLowerCase();
          fill(opts, ...rows.filter(r => !q || String(r[f.labelField]).toLowerCase().includes(q)).map(r => {
            const cb = h('input', { type: 'checkbox', checked: chosen.has(r.id), onchange: () => { cb.checked ? chosen.add(r.id) : chosen.delete(r.id); } });
            return h('label', null, cb, r[f.labelField], r.status === 'draft' ? h('span', { class: 'pill draft', text: 'draft' }) : null);
          }));
        };
        refRows(f.collection).then(r => { rows = r; draw(); }).catch(showError);
        search.addEventListener('input', draw);
        return { el: h('div', { class: 'relation' }, search, opts), get: () => [...chosen] };
      }
      case 'richtext': return richEditor(value);
      default: {
        const inp = h('input', { type: 'text', value: value ?? '' });
        return { el: inp, get: () => inp.value, focusEl: inp };
      }
    }
  }

  function buildForm(fields, values, ctx = {}) {
    ctx.controls = {};
    const ordered = [...fields.filter(f => f.name === 'status'), ...fields.filter(f => f.name !== 'status')];
    const groups = new Map();
    for (const f of ordered) {
      const g = f.group || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(f);
    }
    const root = h('div', { class: 'form' });
    for (const [g, fs] of groups) {
      const grid = h('div', { class: 'form-grid' });
      for (const f of fs) {
        const c = fieldControl(f, values[f.name], ctx);
        const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 7);
        if (c.focusEl) c.focusEl.id = id;
        const err = h('div', { class: 'err', hidden: true, role: 'alert' });
        const wrap = h('div', { class: 'field' + (WIDE.has(f.type) ? ' span2' : '') },
          h('label', { class: 'label', for: c.focusEl ? id : null }, f.label, f.required ? h('span', { class: 'req', text: ' *' }) : null),
          c.el, f.help ? h('div', { class: 'hint', text: f.help }) : null, err);
        c.wrap = wrap; c.err = err;
        c.set = v => { if (c.focusEl) { c.focusEl.value = v; c.focusEl.dispatchEvent(new Event('input')); } };
        ctx.controls[f.name] = c;
        grid.appendChild(wrap);
      }
      root.appendChild(g ? h('fieldset', { class: 'group' }, h('legend', { text: g }), grid) : h('div', { class: 'panel' }, grid));
    }
    const getValues = () => Object.fromEntries(Object.entries(ctx.controls).map(([k, c]) => [k, c.get()]));
    let initial = null;
    const snapshot = () => JSON.stringify(getValues());
    setTimeout(() => { initial = snapshot(); }, 400); // after async ref options are applied
    return {
      el: root, values: getValues,
      isDirty: () => initial !== null && snapshot() !== initial,
      markClean: () => { initial = snapshot(); },
      setErrors(map = {}) {
        let first = null;
        for (const [k, c] of Object.entries(ctx.controls)) {
          const msg = map[k];
          c.wrap.classList.toggle('has-error', !!msg);
          c.err.hidden = !msg; c.err.textContent = msg || '';
          if (msg && !first) first = c;
        }
        if (first) { first.wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focusEl && first.focusEl.focus({ preventScroll: true }); }
      },
    };
  }

  // ======================================================================
  //  Layout: nav, crumbs, router, unsaved-changes guard
  // ======================================================================
  const view = $('#view');
  let currentForm = null;
  let lastHash = location.hash || '#/';
  let unread = 0;

  const navHref = key => key === 'dashboard' ? '#/' : key.startsWith('c:') ? '#/c/' + key.slice(2) : key.startsWith('b:') ? '#/b/' + key.slice(2) : key.startsWith('p:') ? '#/p/' + key.slice(2) : '#/' + key;
  const collapsed = new Set();

  function renderNav() {
    const nav = $('#nav');
    const hash = location.hash || '#/';
    fill(nav, ...MODEL.nav.map(g => {
      const items = g.items.filter(([, , o]) => !(o && o.adminOnly) || IS_ADMIN);
      if (!items.length) return null;
      const hasActive = items.some(([k]) => hash === navHref(k) || (hash.startsWith(navHref(k) + '/') && navHref(k) !== '#/'));
      const grp = h('div', { class: 'nav-group' + (collapsed.has(g.label) && !hasActive ? ' collapsed' : '') },
        h('button', { type: 'button', text: g.label, 'aria-expanded': String(!(collapsed.has(g.label) && !hasActive)),
          onclick: () => { collapsed.has(g.label) ? collapsed.delete(g.label) : collapsed.add(g.label); renderNav(); } }),
        h('ul', null, items.map(([k, label]) => {
          const href = navHref(k);
          const active = hash === href || (href !== '#/' && hash.startsWith(href + '/'));
          return h('li', null, h('a', { href, class: active ? 'active' : null, 'aria-current': active ? 'page' : null }, label,
            k === 'messages' && unread ? h('span', { class: 'badge', text: String(unread) }) : null));
        })));
      return grp;
    }).filter(Boolean));
  }
  function setCrumbs(...parts) {
    fill($('#crumbs'), ...parts.flatMap((p, i) => [i ? ' / ' : '', i === parts.length - 1 ? h('strong', { text: p }) : p]));
    document.title = parts[parts.length - 1] + ' — Admin panel';
  }
  async function refreshUnread() {
    try { unread = (await api('GET', '/dashboard')).unread; renderNav(); } catch (_) {}
  }

  function pageHead(title, ...actions) {
    return h('div', { class: 'page-head' }, h('h1', { text: title }), actions.length ? h('div', { class: 'actions' }, actions) : null);
  }
  const loading = () => fill(view, h('p', { class: 'muted', text: 'Yuklanmoqda…' }));

  async function route() {
    const hash = location.hash || '#/';
    if (currentForm && currentForm.isDirty() && hash !== lastHash) {
      if (!confirm('Saqlanmagan o\'zgarishlar bor. Sahifadan chiqilsinmi?')) { history.replaceState(null, '', lastHash); return; }
    }
    currentForm = null; refCache = {};
    lastHash = hash;
    $('#app').classList.remove('nav-open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
    renderNav();
    const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    loading();
    try {
      if (!p.length) await viewDashboard();
      else if (p[0] === 'c' && p[2]) await viewItem(p[1], p[2]);
      else if (p[0] === 'c') await viewCollection(p[1]);
      else if (p[0] === 'b') await viewSingle('block', p[1]);
      else if (p[0] === 'p') await viewSingle('page', p[1]);
      else if (p[0] === 'settings') await viewSingle('settings');
      else if (p[0] === 'messages') await viewMessages();
      else if (p[0] === 'media') await viewMedia();
      else if (p[0] === 'history') await viewHistory();
      else if (p[0] === 'users') await viewUsers();
      else if (p[0] === 'backup') await viewBackup();
      else if (p[0] === 'profile') await viewProfile();
      else fill(view, h('p', { text: 'Sahifa topilmadi.' }));
    } catch (e) {
      fill(view, h('div', { class: 'alert alert-error', text: e.message }));
    }
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', e => { if (currentForm && currentForm.isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if ($('.modal-back')) return; const b = $('#save-btn'); if (b) b.click(); }
  });

  // ======================================================================
  //  Revisions modal (used by every editor)
  // ======================================================================
  function snapshotView(snap) {
    return h('dl', { class: 'kv' }, Object.entries(snap).filter(([k]) => !['created_at', 'updated_at', 'sort'].includes(k)).flatMap(([k, v]) => [
      h('dt', { text: k }),
      h('dd', { text: v === null || v === undefined ? '—' : (typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v).replace(/<[^>]+>/g, ' ').slice(0, 600)) }),
    ]));
  }
  async function openRevisions(entity, entityId, onRestored) {
    const list = h('div', { class: 'list' }, h('p', { class: 'empty', text: 'Yuklanmoqda…' }));
    const m = modal({ title: 'Versiyalar tarixi', wide: true, body: list });
    try {
      const revs = await api('GET', `/revisions?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(entityId)}`);
      if (!revs.length) return fill(list, h('p', { class: 'empty', text: 'Hali versiyalar yo\'q.' }));
      fill(list, ...revs.map((r, i) => h('div', { class: 'row' },
        h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: `${actionLabel(r.action)} — ${fmtDateTime(r.created_at)}` }),
          h('div', { class: 'row-meta', text: (r.user_name || 'tizim') + (i === 0 ? ' · joriy versiya' : '') })),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-ghost btn-sm', text: 'Ko\'rish', onclick: async () => { const full = await api('GET', '/revisions/' + r.id); modal({ title: 'Versiya #' + r.id, wide: true, body: snapshotView(full.snapshot) }); } }),
          i === 0 && r.action !== 'delete' ? null : h('button', { class: 'btn btn-outline btn-sm', text: 'Qaytarish', onclick: async () => {
            if (!await confirmDialog('Shu versiyaga qaytarilsinmi? Joriy holat ham tarixda saqlanib qoladi.', { ok: 'Qaytarish' })) return;
            try { await api('POST', `/revisions/${r.id}/restore`); toast('Versiya tiklandi'); m.close(); onRestored && onRestored(); } catch (e) { showError(e); }
          } })))));
    } catch (e) { fill(list, h('p', { class: 'empty', text: e.message })); }
  }
  const actionLabel = a => ({ create: 'Yaratildi', update: 'Tahrirlandi', delete: 'O\'chirildi', restore: 'Tiklandi' }[a] || a);

  // ======================================================================
  //  Dashboard
  // ======================================================================
  async function viewDashboard() {
    setCrumbs('Bosh panel');
    const d = await api('GET', '/dashboard');
    unread = d.unread; renderNav();
    const show = ['people', 'projects', 'publications', 'news', 'services', 'research_areas', 'facilities', 'hero_slides'];
    fill(view, 
      pageHead('Xush kelibsiz, ' + ME.name, h('a', { class: 'btn btn-accent', href: '/', target: '_blank', rel: 'noopener', text: 'Saytni ochish ↗' })),
      h('div', { class: 'stat-grid' },
        h('a', { class: 'stat-card', href: '#/messages' }, h('div', { class: 'n', text: String(d.unread) }), h('div', { class: 'l', text: 'O\'qilmagan xabarlar' })),
        h('a', { class: 'stat-card', href: '#/media' }, h('div', { class: 'n', text: String(d.media) }), h('div', { class: 'l', text: 'Media fayllar' })),
        show.map(k => h('a', { class: 'stat-card', href: '#/c/' + k },
          h('div', { class: 'n', text: String(d.counts[k].total) }),
          h('div', { class: 'l', text: MODEL.collections[k].label + (d.counts[k].drafts ? ` · ${d.counts[k].drafts} draft` : '') })))),
      h('div', { class: 'panel' }, h('h2', { text: 'So\'nggi o\'zgarishlar' }),
        d.recent.length ? h('div', { class: 'list' }, d.recent.map(r => h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: r.label || r.entity }), h('div', { class: 'row-meta', text: `${actionLabel(r.action)} · ${r.user_name || 'tizim'} · ${fmtDateTime(r.created_at)}` })))))
          : h('p', { class: 'muted', text: 'Hali o\'zgarish yo\'q.' }),
        h('p', { style: { margin: '12px 0 0' } }, h('a', { href: '#/history', text: 'Butun tarix →' }))));
  }

  // ======================================================================
  //  Collection list
  // ======================================================================
  function displayValue(col, f, row, refMaps) {
    const v = row[f.name];
    if (f.type === 'select') return (f.options.find(o => o[0] === v) || [, v])[1];
    if (f.type === 'ref') return refMaps[f.name]?.get(String(v)) || (v ?? '');
    if (Array.isArray(v)) return v.join(', ');
    return v === null || v === undefined ? '' : String(v);
  }

  async function viewCollection(name) {
    const col = MODEL.collections[name];
    if (!col) throw new Error('Bo\'lim topilmadi');
    setCrumbs(col.label);
    const [rows] = await Promise.all([api('GET', '/c/' + name)]);
    const fieldBy = Object.fromEntries(col.fields.map(f => [f.name, f]));
    const refMaps = {};
    for (const f of col.fields.filter(f => f.type === 'ref')) {
      const rr = await refRows(f.collection);
      refMaps[f.name] = new Map(rr.map(r => [String(r[f.valueField]), r[f.labelField]]));
    }
    const imgField = col.list.find(n => fieldBy[n]?.type === 'image');
    const textCols = col.list.filter(n => n !== imgField && n !== col.titleField);

    // Toolbar: search + status + model filters
    const search = h('input', { type: 'search', placeholder: 'Qidirish…', 'aria-label': 'Qidirish' });
    const statusSel = h('select', { 'aria-label': 'Holat' }, h('option', { value: '', text: 'Barcha holatlar' }), h('option', { value: 'published', text: 'Published' }), h('option', { value: 'draft', text: 'Draft' }));
    const filterSels = col.filters.map(fn => {
      const f = fieldBy[fn];
      let opts;
      if (f?.type === 'select') opts = f.options;
      else if (f?.type === 'ref') opts = [...refMaps[fn].entries()];
      else opts = [...new Set(rows.map(r => r[fn]).filter(v => v !== '' && v !== null))].sort().reverse().map(v => [String(v), String(v)]);
      return h('select', { 'aria-label': f?.label || fn, dataset: { field: fn } }, h('option', { value: '', text: (f?.label || fn) + ': barchasi' }), opts.map(([v, l]) => h('option', { value: v, text: l })));
    });
    const listWrap = h('div');
    const hint = h('p', { class: 'small muted', style: { margin: '8px 2px 0' } });

    const draw = () => {
      const q = search.value.toLowerCase().trim();
      const filtering = !!(q || statusSel.value || filterSels.some(s => s.value));
      const match = r => (!q || JSON.stringify(r).toLowerCase().includes(q)) && (!statusSel.value || r.status === statusSel.value)
        && filterSels.every(s => !s.value || String(r[s.dataset.field]) === s.value);
      const visible = rows.filter(match);
      hint.textContent = filtering ? 'Filtr yoki qidiruv yoqilganda sudrab tartiblash o\'chiriladi.'
        : (name === 'news' ? 'Saytda yangiliklar sana bo\'yicha tartiblanadi; bir xil sanadagilar — shu ro\'yxatdagi tartibda.'
          : name === 'publications' ? 'Saytda maqolalar yil bo\'yicha guruhlanadi; yil ichidagi tartib — shu ro\'yxatdagidek.'
          : '⠿ belgisini sudrab (yoki Tab + ↑/↓) tartibni o\'zgartiring. Tartib darhol saqlanadi.');

      const rowEl = (r, child) => h('div', { class: 'row' + (child ? ' child' : ''), dataset: { id: String(r.id) } },
        handleEl(filtering),
        imgField ? (r[imgField] ? h('img', { class: 'thumb', src: r[imgField], alt: '', loading: 'lazy' }) : h('div', { class: 'thumb' })) : null,
        h('div', { class: 'row-main' },
          h('a', { class: 'row-title', href: `#/c/${name}/${r.id}`, text: r[col.titleField] || '(nomsiz)' }),
          h('div', { class: 'row-meta', text: textCols.map(n => displayValue(col, fieldBy[n], r, refMaps)).filter(Boolean).join(' · ') })),
        h('span', { class: 'pill' + (r.status === 'draft' ? ' draft' : ''), text: r.status === 'draft' ? 'Draft' : 'Published' }),
        h('div', { class: 'row-actions' },
          h('a', { class: 'icon-btn', href: previewUrl(col.preview.replace('{slug}', r.slug || '')), target: '_blank', rel: 'noopener', title: 'Saytda ko\'rish', 'aria-label': 'Saytda ko\'rish', text: '↗' }),
          h('a', { class: 'icon-btn', href: `#/c/${name}/${r.id}`, title: 'Tahrirlash', 'aria-label': 'Tahrirlash', text: '✎' }),
          h('button', { class: 'icon-btn', title: 'O\'chirish', 'aria-label': 'O\'chirish', text: '🗑', onclick: () => del(r) })));

      const saveOrder = async ids => { try { await api('POST', `/c/${name}/reorder`, { ids }); ids.forEach((id, i) => { const r = rows.find(x => x.id === id); if (r) r.sort = i; }); toast('Tartib saqlandi'); } catch (e) { showError(e); } };

      if (!visible.length) return fill(listWrap, h('div', { class: 'list' }, h('p', { class: 'empty', text: rows.length ? 'Hech narsa topilmadi.' : 'Hali yozuv yo\'q. "+ Yangi qo\'shish" tugmasini bosing.' })));

      // Group rows (menu by location with nested children, people by group), otherwise one list
      let groups;
      if (name === 'menu_items' && !filtering) {
        const locs = fieldBy.location.options;
        groups = locs.map(([v, l]) => ({ label: l, rows: visible.filter(r => r.location === v && !r.parent_id) }));
      } else if (name === 'people') {
        groups = fieldBy.grp.options.map(([v, l]) => ({ label: l, rows: visible.filter(r => r.grp === v) }));
      } else groups = [{ label: '', rows: visible }];

      fill(listWrap, ...groups.filter(g => g.rows.length).map(g => {
        const box = h('div', { class: 'list' });
        g.rows.forEach(r => {
          if (name === 'menu_items' && !filtering) {
            const kids = visible.filter(c => c.parent_id === r.id);
            const wrap = h('div', { dataset: { id: String(r.id) } }, rowEl(r, false));
            wrap.firstChild.removeAttribute('data-id');
            if (kids.length) {
              const sub = h('div', { style: { paddingLeft: '28px', background: '#FAFCF8' } }, kids.map(k => rowEl(k, true)));
              makeSortable(sub, saveOrder); wrap.appendChild(sub);
            }
            box.appendChild(wrap);
          } else box.appendChild(rowEl(r, !!r.parent_id));
        });
        makeSortable(box, saveOrder);
        return h('div', { style: { marginBottom: '16px' } }, g.label ? h('h2', { text: g.label, style: { margin: '6px 2px 8px' } }) : null, box);
      }));
    };

    const del = async r => {
      if (!await confirmDialog(`"${r[col.titleField]}" o'chirilsinmi? Keyinroq "O'zgarishlar tarixi" bo'limidan tiklash mumkin.`, { ok: 'O\'chirish', danger: true })) return;
      try { await api('DELETE', `/c/${name}/${r.id}`); rows.splice(rows.indexOf(r), 1); draw(); toast('O\'chirildi'); } catch (e) { showError(e); }
    };

    [search, statusSel, ...filterSels].forEach(el => el.addEventListener('input', debounce(draw, 120)));
    fill(view, 
      pageHead(col.label, h('a', { class: 'btn btn-primary', href: `#/c/${name}/new`, text: '+ Yangi qo\'shish' })),
      h('div', { class: 'toolbar' }, search, statusSel, filterSels, h('span', { class: 'small muted', text: `${rows.length} ta yozuv` })),
      listWrap, hint);
    draw();
  }

  // ======================================================================
  //  Item editor
  // ======================================================================
  function defaultsFor(fields) {
    const v = {};
    for (const f of fields) {
      if (f.name === 'status') v.status = 'draft';
      else if (f.type === 'select') v[f.name] = f.options[0][0];
      else if (f.type === 'date') v[f.name] = new Date().toISOString().slice(0, 10);
      else if (f.name === 'year') v[f.name] = new Date().getFullYear();
    }
    return v;
  }

  function saveBar({ onSave, previewHref, onVersions, onDelete, backHref }) {
    const dirtyNote = h('span', { class: 'dirty-dot', hidden: true, text: '● Saqlanmagan o\'zgarishlar' });
    const saveBtn = h('button', { class: 'btn btn-primary', id: 'save-btn', type: 'button', text: 'Saqlash', title: 'Ctrl+S' });
    saveBtn.addEventListener('click', async () => { saveBtn.disabled = true; try { await onSave(); } finally { saveBtn.disabled = false; } });
    const bar = h('div', { class: 'savebar' }, saveBtn,
      previewHref ? h('a', { class: 'btn btn-outline', href: previewHref, target: '_blank', rel: 'noopener', text: 'Saytda ko\'rish ↗' }) : null,
      onVersions ? h('button', { class: 'btn btn-ghost', type: 'button', text: 'Versiyalar', onclick: onVersions }) : null,
      dirtyNote, h('span', { class: 'spacer' }),
      backHref ? h('a', { class: 'btn btn-ghost', href: backHref, text: '← Ro\'yxatga' }) : null,
      onDelete ? h('button', { class: 'btn btn-danger', type: 'button', text: 'O\'chirish', onclick: onDelete }) : null);
    const timer = setInterval(() => { if (!document.body.contains(bar)) return clearInterval(timer); dirtyNote.hidden = !(currentForm && currentForm.isDirty()); }, 700);
    return bar;
  }

  async function viewItem(name, idParam) {
    const col = MODEL.collections[name];
    if (!col) throw new Error('Bo\'lim topilmadi');
    const isNew = idParam === 'new';
    const values = isNew ? defaultsFor(col.fields) : await api('GET', `/c/${name}/${idParam}`);
    const title = isNew ? 'Yangi yozuv' : (values[col.titleField] || '(nomsiz)');
    setCrumbs(col.label, title);
    const form = buildForm(col.fields, values, { collection: name, itemId: isNew ? null : values.id });
    currentForm = form;
    const save = async () => {
      form.setErrors({});
      try {
        const saved = isNew ? await api('POST', `/c/${name}`, form.values()) : await api('PUT', `/c/${name}/${values.id}`, form.values());
        form.markClean();
        toast(saved.status === 'draft' ? 'Saqlandi (draft — saytda ko\'rinmaydi)' : 'Saqlandi va saytda e\'lon qilindi');
        if (isNew) location.hash = `#/c/${name}/${saved.id}`; else route();
      } catch (e) { if (e.fields) form.setErrors(e.fields); showError(e); }
    };
    fill(view, 
      pageHead(title),
      isNew ? h('p', { class: 'help', text: 'Yangi yozuv avval "Draft" holatida saqlanadi. Tekshirib bo\'lgach "Holat"ni "Published" qiling.' }) : null,
      form.el,
      saveBar({
        onSave: save, backHref: `#/c/${name}`,
        previewHref: isNew ? null : previewUrl(col.preview.replace('{slug}', values.slug || '')),
        onVersions: isNew ? null : () => openRevisions(tableOf(name), values.id, route),
        onDelete: isNew ? null : async () => {
          if (!await confirmDialog(`"${title}" o'chirilsinmi? Tarixdan tiklash mumkin.`, { ok: 'O\'chirish', danger: true })) return;
          try { await api('DELETE', `/c/${name}/${values.id}`); form.markClean(); toast('O\'chirildi'); location.hash = `#/c/${name}`; } catch (e) { showError(e); }
        },
      }));
  }
  const tableOf = name => name; // collection keys equal table names

  // ======================================================================
  //  Blocks, pages, settings (single-record editors)
  // ======================================================================
  async function viewSingle(kind, key) {
    let fields, url, title, preview, entity, entityId, help, group;
    if (kind === 'block') {
      const b = MODEL.blocks[key]; if (!b) throw new Error('Blok topilmadi');
      fields = b.fields; url = '/b/' + key; title = b.label; preview = b.preview; entity = 'block'; entityId = key; help = b.help;
      group = (MODEL.pages[b.page] || {}).label;
    } else if (kind === 'page') {
      const p = MODEL.pages[key]; if (!p) throw new Error('Sahifa topilmadi');
      fields = key === 'home' ? MODEL.pageFields.filter(f => f.group === 'SEO') : key === 'search' ? MODEL.pageFields.filter(f => !f.group.startsWith('CTA')) : MODEL.pageFields;
      url = '/p/' + key; title = 'Sahifa sozlamalari'; preview = p.url; entity = 'page'; entityId = key; group = p.label;
      if (key === 'home') help = 'Home sahifasida page-hero va CTA yo\'q — bu yerda faqat SEO sozlanadi.';
    } else {
      if (!IS_ADMIN) throw new Error('Faqat Admin uchun');
      fields = MODEL.settingsFields; url = '/settings'; title = 'Umumiy sozlamalar'; preview = '/'; entity = 'settings'; entityId = 'site';
    }
    setCrumbs(...[group, title].filter(Boolean));
    const values = await api('GET', url);
    const form = buildForm(fields, values, {});
    currentForm = form;
    const save = async () => {
      form.setErrors({});
      try { await api('PUT', url, form.values()); form.markClean(); toast('Saqlandi'); } catch (e) { if (e.fields) form.setErrors(e.fields); showError(e); }
    };
    fill(view, pageHead(title + (group ? ' — ' + group : '')), help ? h('p', { class: 'help', text: help }) : null, form.el,
      saveBar({ onSave: save, previewHref: previewUrl(preview), onVersions: () => openRevisions(entity, entityId, route) }));
  }

  // ======================================================================
  //  Messages
  // ======================================================================
  async function viewMessages() {
    setCrumbs('Xabarlar');
    let rows = await api('GET', '/messages');
    const search = h('input', { type: 'search', placeholder: 'Ism, email, mavzu yoki matn…', 'aria-label': 'Qidirish' });
    const state = h('select', { 'aria-label': 'Holat' }, h('option', { value: '', text: 'Hammasi' }), h('option', { value: '0', text: 'O\'qilmagan' }), h('option', { value: '1', text: 'O\'qilgan' }));
    const list = h('div', { class: 'list' });
    const setRead = async (m, v) => { await api('PUT', '/messages/' + m.id, { is_read: v }); m.is_read = v ? 1 : 0; refreshUnread(); };
    const draw = () => {
      const q = search.value.toLowerCase().trim();
      const vis = rows.filter(m => (!q || JSON.stringify(m).toLowerCase().includes(q)) && (state.value === '' || String(m.is_read) === state.value));
      if (!vis.length) return fill(list, h('p', { class: 'empty', text: rows.length ? 'Hech narsa topilmadi.' : 'Hali xabar kelmagan. Contact forma Sozlamalar → "Home sahifada contact formani ko\'rsatish" orqali yoqiladi.' }));
      fill(list, ...vis.map(m => {
        const body = h('div', { hidden: true },
          h('dl', { class: 'kv' }, h('dt', { text: 'Email' }), h('dd', null, h('a', { href: 'mailto:' + m.email, text: m.email })),
            h('dt', { text: 'Tashkilot' }), h('dd', { text: m.institution || '—' }), h('dt', { text: 'IP' }), h('dd', { text: m.ip || '—' })),
          h('div', { class: 'msg-body', text: m.message }),
          h('div', { class: 'toolbar' },
            h('a', { class: 'btn btn-primary btn-sm', href: `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: ' + (m.subject || ''))}`, text: 'Javob yozish' }),
            h('button', { class: 'btn btn-outline btn-sm', text: 'O\'qilmagan deb belgilash', onclick: async () => { await setRead(m, 0); draw(); } }),
            h('button', { class: 'btn btn-danger btn-sm', text: 'O\'chirish', onclick: async () => {
              if (!await confirmDialog('Xabar butunlay o\'chirilsinmi?', { ok: 'O\'chirish', danger: true })) return;
              await api('DELETE', '/messages/' + m.id); rows = rows.filter(x => x !== m); refreshUnread(); draw();
            } })));
        const row = h('div', { class: 'row' + (m.is_read ? '' : ' unread'), style: { flexWrap: 'wrap' } },
          h('div', { class: 'row-main' },
            h('a', { class: 'row-title', href: '#', text: `${m.name} — ${m.subject || '(mavzusiz)'}`, onclick: async e => {
              e.preventDefault(); body.hidden = !body.hidden;
              if (!body.hidden && !m.is_read) { await setRead(m, 1); row.classList.remove('unread'); pill.remove(); }
            } }),
            h('div', { class: 'row-meta', text: `${m.email} · ${fmtDateTime(m.created_at)}` })));
        const pill = m.is_read ? h('span') : h('span', { class: 'pill unread', text: 'Yangi' });
        row.appendChild(pill);
        const wrap = h('div', null, row, h('div', { style: { padding: '0 14px' } }, body));
        return wrap;
      }));
    };
    [search, state].forEach(el => el.addEventListener('input', debounce(draw, 120)));
    fill(view, pageHead('Xabarlar'), h('div', { class: 'toolbar' }, search, state), list);
    draw();
  }

  // ======================================================================
  //  Media library
  // ======================================================================
  async function viewMedia() {
    setCrumbs('Media kutubxona');
    let rows = await api('GET', '/media');
    const search = h('input', { type: 'search', placeholder: 'Nomi yoki alt matni…', 'aria-label': 'Qidirish' });
    const type = h('select', { 'aria-label': 'Turi' }, h('option', { value: '', text: 'Barcha turlar' }), h('option', { value: 'image', text: 'Rasmlar' }), h('option', { value: 'pdf', text: 'PDF' }));
    const grid = h('div', { class: 'media-grid' });
    const draw = () => {
      const q = search.value.toLowerCase().trim();
      const vis = rows.filter(m => (!q || (m.original_name + ' ' + m.alt).toLowerCase().includes(q)) && (!type.value || (type.value === 'pdf') === isPdf(m)));
      if (!vis.length) return fill(grid, h('p', { class: 'muted', text: rows.length ? 'Hech narsa topilmadi.' : 'Hali fayl yuklanmagan.' }));
      fill(grid, ...vis.map(m => {
        const alt = h('input', { type: 'text', value: m.alt, placeholder: 'Alt matni', 'aria-label': 'Alt matni', onchange: async () => {
          try { Object.assign(m, await api('PUT', '/media/' + m.id, { alt: alt.value })); toast('Alt matni saqlandi'); } catch (e) { showError(e); }
        } });
        return h('div', { class: 'media-item' },
          h('a', { class: 'img', href: m.file, target: '_blank', rel: 'noopener', style: mediaThumb(m) ? { backgroundImage: `url("${mediaThumb(m)}")` } : null, text: isPdf(m) ? 'PDF' : '', 'aria-label': 'Faylni ochish' }),
          h('div', { class: 'info' },
            h('span', { class: 'name', title: m.original_name, text: m.original_name }),
            h('span', { class: 'muted', text: fmtSize(m.size) + (m.width ? ` · ${m.width}×${m.height}` : '') }),
            isPdf(m) ? null : alt,
            h('div', { class: 'acts' },
              h('button', { class: 'btn btn-ghost btn-sm', text: 'Havola', title: 'Havolani nusxalash', onclick: async () => { try { await navigator.clipboard.writeText(m.file); toast('Havola nusxalandi: ' + m.file); } catch (_) { prompt('Havola:', m.file); } } }),
              h('button', { class: 'btn btn-ghost btn-sm', text: 'Qayerda?', onclick: async () => {
                const used = await api('GET', `/media/${m.id}/usage`);
                modal({ title: 'Fayl ishlatilgan joylar', body: used.length ? h('ul', null, used.map(u => h('li', { text: u }))) : h('p', { text: 'Hech qayerda ishlatilmagan.' }) });
              } }),
              h('button', { class: 'btn btn-ghost btn-sm', text: '🗑', title: 'O\'chirish', 'aria-label': 'O\'chirish', onclick: async () => {
                if (!await confirmDialog(`"${m.original_name}" o'chirilsinmi?`, { ok: 'O\'chirish', danger: true })) return;
                try { await api('DELETE', '/media/' + m.id); }
                catch (e) {
                  if (e.status !== 409) return showError(e);
                  if (!await confirmDialog(`Bu fayl ishlatilmoqda:\n${e.data.used.join('\n')}\n\nBaribir o'chirilsinmi? U joylarda rasm ko'rinmay qoladi.`, { ok: 'Baribir o\'chirish', danger: true })) return;
                  await api('DELETE', `/media/${m.id}?force=1`);
                }
                rows = rows.filter(x => x !== m); draw(); toast('O\'chirildi');
              } }))));
      }));
    };
    [search, type].forEach(el => el.addEventListener('input', debounce(draw, 120)));
    fill(view, pageHead('Media kutubxona'),
      dropzone(async files => { try { rows = [...await uploadFiles(files), ...rows]; draw(); } catch (e) { showError(e); } }),
      h('div', { class: 'toolbar' }, search, type), grid);
    draw();
  }

  // ======================================================================
  //  History (all revisions)
  // ======================================================================
  function entityName(r) {
    if (r.entity === 'block') return 'Blok';
    if (r.entity === 'page') return 'Sahifa';
    if (r.entity === 'settings') return 'Sozlamalar';
    return MODEL.collections[r.entity]?.label || r.entity;
  }
  function entityLink(r) {
    if (r.entity === 'block') return '#/b/' + r.entity_id;
    if (r.entity === 'page') return '#/p/' + r.entity_id;
    if (r.entity === 'settings') return '#/settings';
    return `#/c/${r.entity}/${r.entity_id}`;
  }
  async function viewHistory() {
    setCrumbs('O\'zgarishlar tarixi');
    const rows = await api('GET', '/revisions?limit=500');
    const search = h('input', { type: 'search', placeholder: 'Yozuv nomi yoki foydalanuvchi…', 'aria-label': 'Qidirish' });
    const ent = h('select', { 'aria-label': 'Bo\'lim' }, h('option', { value: '', text: 'Barcha bo\'limlar' }),
      [...new Set(rows.map(r => r.entity))].map(e => h('option', { value: e, text: entityName({ entity: e }) })));
    const act = h('select', { 'aria-label': 'Amal' }, h('option', { value: '', text: 'Barcha amallar' }), ['create', 'update', 'delete', 'restore'].map(a => h('option', { value: a, text: actionLabel(a) })));
    const list = h('div', { class: 'list' });
    const draw = () => {
      const q = search.value.toLowerCase().trim();
      const vis = rows.filter(r => (!q || (r.label + ' ' + r.user_name).toLowerCase().includes(q)) && (!ent.value || r.entity === ent.value) && (!act.value || r.action === act.value));
      if (!vis.length) return fill(list, h('p', { class: 'empty', text: 'Hech narsa topilmadi.' }));
      fill(list, ...vis.slice(0, 300).map(r => h('div', { class: 'row' },
        h('div', { class: 'row-main' },
          r.action === 'delete' ? h('span', { class: 'row-title', text: r.label || r.entity_id }) : h('a', { class: 'row-title', href: entityLink(r), text: r.label || r.entity_id }),
          h('div', { class: 'row-meta', text: `${entityName(r)} · ${actionLabel(r.action)} · ${r.user_name || 'tizim'} · ${fmtDateTime(r.created_at)}` })),
        h('span', { class: 'pill' + (r.action === 'delete' ? ' draft' : ''), text: actionLabel(r.action) }),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-ghost btn-sm', text: 'Ko\'rish', onclick: async () => { const full = await api('GET', '/revisions/' + r.id); modal({ title: `${entityName(r)}: ${r.label}`, wide: true, body: snapshotView(full.snapshot) }); } }),
          h('button', { class: 'btn btn-outline btn-sm', text: r.action === 'delete' ? 'Tiklash' : 'Shu versiyaga qaytarish', onclick: async () => {
            if (!await confirmDialog(r.action === 'delete' ? `"${r.label}" qayta tiklansinmi?` : 'Shu versiyaga qaytarilsinmi?', { ok: 'Tasdiqlash' })) return;
            try { const res = await api('POST', `/revisions/${r.id}/restore`); toast('Tiklandi'); if (res.type === 'collection') location.hash = `#/c/${res.collection}/${res.data.id}`; else route(); } catch (e) { showError(e); }
          } })))));
    };
    [search, ent, act].forEach(el => el.addEventListener('input', debounce(draw, 120)));
    fill(view, pageHead('O\'zgarishlar tarixi'),
      h('p', { class: 'help', text: 'Har bir saqlash, o\'chirish va tiklash shu yerda qayd qilinadi (har bir yozuv uchun oxirgi 50 ta versiya). O\'chirilgan yozuvni "Tiklash" orqali qaytarish mumkin.' }),
      h('div', { class: 'toolbar' }, search, ent, act), list);
    draw();
  }

  // ======================================================================
  //  Users (admin)
  // ======================================================================
  async function viewUsers() {
    if (!IS_ADMIN) throw new Error('Faqat Admin uchun');
    setCrumbs('Foydalanuvchilar');
    let rows = await api('GET', '/users');
    const search = h('input', { type: 'search', placeholder: 'Ism yoki email…', 'aria-label': 'Qidirish' });
    const tbody = h('tbody');
    const openForm = u => {
      const isNew = !u;
      const fields = [
        { name: 'name', label: 'Ism', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'role', label: 'Rol', type: 'select', options: [['editor', 'Editor — faqat kontent'], ['admin', 'Admin — hammasi + foydalanuvchilar']] },
        { name: 'is_active', label: 'Faol', type: 'checkbox' },
        { name: 'password', label: isNew ? 'Parol' : 'Yangi parol (o\'zgartirmasangiz bo\'sh qoldiring)', type: 'text', required: isNew, help: 'Kamida 10 belgi, harf va raqam' },
      ];
      const form = buildForm(fields, u ? { ...u, password: '' } : { role: 'editor', is_active: 1 });
      form.el.querySelector('input[id^="f_password"]').type = 'password';
      const m = modal({
        title: isNew ? 'Yangi foydalanuvchi' : u.name, body: [form.el,
          u && u.locked_until && u.locked_until > Date.now() ? h('p', { class: 'help', text: 'Hisob noto\'g\'ri urinishlar sabab vaqtincha bloklangan.' }) : null],
        foot: [h('button', { class: 'btn btn-outline', text: 'Bekor qilish', onclick: () => m.close() }),
          u && u.locked_until ? h('button', { class: 'btn btn-outline', text: 'Blokdan chiqarish', onclick: async () => { await api('PUT', '/users/' + u.id, { ...u, unlock: true }); toast('Blokdan chiqarildi'); m.close(); viewUsers(); } }) : null,
          h('button', { class: 'btn btn-primary', text: 'Saqlash', onclick: async () => {
            form.setErrors({});
            const v = form.values(); v.is_active = !!v.is_active;
            try { await api(isNew ? 'POST' : 'PUT', isNew ? '/users' : '/users/' + u.id, v); toast('Saqlandi'); m.close(); viewUsers(); }
            catch (e) { if (e.fields) form.setErrors(e.fields); showError(e); }
          } })],
      });
    };
    const draw = () => {
      const q = search.value.toLowerCase().trim();
      fill(tbody, ...rows.filter(u => !q || (u.name + ' ' + u.email).toLowerCase().includes(q)).map(u => h('tr', null,
        h('td', null, h('strong', { text: u.name }), u.id === ME.id ? h('span', { class: 'muted', text: ' (siz)' }) : null),
        h('td', { text: u.email }),
        h('td', { text: u.role === 'admin' ? 'Admin' : 'Editor' }),
        h('td', null, h('span', { class: 'pill' + (u.is_active ? '' : ' draft'), text: u.is_active ? 'Faol' : 'O\'chirilgan' })),
        h('td', { class: 'small', text: u.last_login_at ? fmtDateTime(u.last_login_at) : '—' }),
        h('td', null, h('button', { class: 'btn btn-ghost btn-sm', text: 'Tahrirlash', onclick: () => openForm(u) }),
          u.id === ME.id ? null : h('button', { class: 'btn btn-ghost btn-sm', text: '🗑', 'aria-label': 'O\'chirish', onclick: async () => {
            if (!await confirmDialog(`${u.name} o'chirilsinmi?`, { ok: 'O\'chirish', danger: true })) return;
            try { await api('DELETE', '/users/' + u.id); rows = rows.filter(x => x !== u); draw(); toast('O\'chirildi'); } catch (e) { showError(e); }
          } })))));
    };
    search.addEventListener('input', draw);
    fill(view, pageHead('Foydalanuvchilar', h('button', { class: 'btn btn-primary', text: '+ Yangi foydalanuvchi', onclick: () => openForm(null) })),
      h('div', { class: 'toolbar' }, search),
      h('div', { class: 'table-wrap' }, h('table', { class: 'simple' }, h('thead', null, h('tr', null, ['Ism', 'Email', 'Rol', 'Holat', 'Oxirgi kirish', ''].map(t => h('th', { text: t })))), tbody)));
    draw();
  }

  // ======================================================================
  //  Backup (admin)
  // ======================================================================
  async function viewBackup() {
    if (!IS_ADMIN) throw new Error('Faqat Admin uchun');
    setCrumbs('Backup');
    const [files, info] = await Promise.all([api('GET', '/backup/list'), api('GET', '/backup/status')]);
    const st = info.status || {};
    const line = (label, value, cls) => [h('dt', { text: label }), h('dd', null, cls ? h('span', { class: 'pill ' + cls, text: value }) : value)];
    const local = st.last_local, off = st.last_offsite;
    const runBtn = h('button', { class: 'btn btn-accent', text: 'Hozir backup olish', onclick: async () => {
      runBtn.disabled = true; runBtn.textContent = 'Backup olinmoqda…';
      try {
        const r = await api('POST', '/backup/run');
        const o = r.status.last_offsite;
        toast(r.status.last_local?.ok ? ('Backup olindi' + (r.offsite ? (o?.ok ? ' va onlayn xotiraga yuborildi' : ' — lekin onlayn yuborishda xato') : '')) : 'Backup xatosi', r.status.last_local?.ok && (!r.offsite || o?.ok) ? 'ok' : 'error');
        viewBackup();
      } catch (e) { showError(e); runBtn.disabled = false; runBtn.textContent = 'Hozir backup olish'; }
    } });
    const statusPanel = h('div', { class: 'panel' }, h('h2', { text: 'Avtomatik backup holati' }),
      h('dl', { class: 'kv' },
        line('Kunlik backup', info.auto ? `Yoqilgan — har kuni ${String(info.hour).padStart(2, '0')}:00 da, serverda oxirgi ${info.keep} ta nusxa saqlanadi` : 'O\'chirilgan (.env: BACKUP_AUTO=0)', info.auto ? '' : 'draft'),
        line('Oxirgi backup', local ? (local.ok ? `${fmtDateTime(local.at)} · ${local.file} · ${fmtSize(local.size)}` : `XATO (${fmtDateTime(local.at)}): ${local.error}`) : 'Hali olinmagan'),
        line('Onlayn nusxa', info.offsite ? `${info.offsite} — ${info.offsiteKeepDays} kundan eski nusxalar o'chiriladi` : 'Sozlanmagan — faqat serverda saqlanmoqda'),
        info.offsite ? line('Oxirgi onlayn yuborish', off ? (off.ok ? `✓ ${fmtDateTime(off.at)} · ${off.file}` : `✗ XATO (${fmtDateTime(off.at)}): ${off.error}`) : 'Hali yuborilmagan') : null),
      !info.offsite ? h('p', { class: 'help', style: { marginTop: '14px' }, text: 'Server buzilsa yoki o\'chirilsa, bu yerdagi backup\'lar ham yo\'qoladi. Nusxalar avtomatik Google Drive (yoki boshqa onlayn xotira)ga ham yuborilishi uchun .env faylida OFFSITE_REMOTE ni sozlang — README, 6-bo\'lim.' }) : null,
      info.offsite && off && !off.ok ? h('p', { class: 'alert alert-error', style: { marginTop: '14px' }, text: 'Onlayn yuborish ishlamayapti: ' + off.error }) : null,
      h('div', { style: { marginTop: '14px' } }, runBtn));
    const input = h('input', { type: 'file', accept: '.zip,application/zip', 'aria-label': 'Backup fayl' });
    const importBtn = h('button', { class: 'btn btn-danger', text: 'Import qilish', onclick: async () => {
      if (!input.files.length) return toast('Avval .zip faylni tanlang', 'error');
      if (!await confirmDialog('Barcha kontent, foydalanuvchilar va media backup\'dagi holatga almashtiriladi. Hozirgi holat avtomatik ravishda backups/ papkasiga saqlanadi. Import tugagach qaytadan kirishingiz kerak bo\'ladi. Davom etilsinmi?', { ok: 'Ha, import qilish', danger: true })) return;
      importBtn.disabled = true; importBtn.textContent = 'Import qilinmoqda…';
      try {
        const fd = new FormData(); fd.append('file', input.files[0]);
        const r = await fetch('/admin/api/backup/import', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Import xatosi');
        alert(`Import muvaffaqiyatli. ${d.files} ta media fayl tiklandi.\nOldingi holat: backups/${d.safetyBackup}\n\nEndi qaytadan kiring.`);
        location.href = '/admin/login';
      } catch (e) { showError(e); importBtn.disabled = false; importBtn.textContent = 'Import qilish'; }
    } });
    fill(view, pageHead('Backup'), statusPanel,
      h('div', { class: 'panel' }, h('h2', { text: 'Eksport' }),
        h('p', { class: 'muted', text: 'Butun baza (kontent, foydalanuvchilar, xabarlar, tarix) va barcha yuklangan fayllar bitta .zip arxivga yig\'iladi.' }),
        h('a', { class: 'btn btn-primary', href: '/admin/api/backup/export', text: '⬇ Backup yuklab olish' })),
      h('div', { class: 'panel' }, h('h2', { text: 'Import (tiklash)' }),
        h('p', { class: 'muted', text: 'Shu panel orqali olingan .zip backup faylini tanlang.' }),
        h('div', { class: 'toolbar' }, input, importBtn)),
      h('div', { class: 'panel' }, h('h2', { text: 'Serverdagi backup\'lar' }),
        h('p', { class: 'small muted', text: 'Kunlik avtomatik backup\'lar, "Hozir backup olish" natijalari va import oldidan olingan nusxalar.' }),
        files.length ? h('div', { class: 'list' }, files.map(f => h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-title', text: f.name }), h('div', { class: 'row-meta', text: fmtSize(f.size) })),
          h('a', { class: 'btn btn-outline btn-sm', href: '/admin/api/backup/file/' + encodeURIComponent(f.name), text: 'Yuklab olish' }))))
          : h('p', { class: 'muted', text: 'Hali yo\'q.' })));
  }

  // ======================================================================
  //  Profile
  // ======================================================================
  async function viewProfile() {
    setCrumbs('Profil');
    const fields = [
      { name: 'current', label: 'Joriy parol', type: 'text', required: true },
      { name: 'password', label: 'Yangi parol', type: 'text', required: true, help: 'Kamida 10 belgi, harf va raqam' },
      { name: 'repeat', label: 'Yangi parolni takrorlang', type: 'text', required: true },
    ];
    const form = buildForm(fields, {});
    form.el.querySelectorAll('input').forEach(i => { i.type = 'password'; i.autocomplete = 'new-password'; });
    fill(view, pageHead('Profil'),
      h('div', { class: 'panel' }, h('dl', { class: 'kv' }, h('dt', { text: 'Ism' }), h('dd', { text: ME.name }), h('dt', { text: 'Email' }), h('dd', { text: ME.email }), h('dt', { text: 'Rol' }), h('dd', { text: IS_ADMIN ? 'Admin' : 'Editor' }))),
      h('h2', { text: 'Parolni o\'zgartirish' }), form.el,
      h('div', { class: 'savebar' }, h('button', { class: 'btn btn-primary', id: 'save-btn', text: 'Parolni saqlash', onclick: async () => {
        const v = form.values();
        if (v.password !== v.repeat) return form.setErrors({ repeat: 'Parollar mos emas' });
        try { await api('PUT', '/profile/password', { current: v.current, password: v.password }); toast('Parol o\'zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi.'); form.el.querySelectorAll('input').forEach(i => i.value = ''); form.setErrors({}); }
        catch (e) { if (e.fields) form.setErrors(e.fields); showError(e); }
      } })));
  }

  // ======================================================================
  //  Boot
  // ======================================================================
  $('#menu-btn').addEventListener('click', () => {
    const open = $('#app').classList.toggle('nav-open');
    $('#menu-btn').setAttribute('aria-expanded', String(open));
  });
  $('#app').addEventListener('click', e => { if ($('#app').classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('#menu-btn')) $('#app').classList.remove('nav-open'); });

  api('GET', '/model').then(m => { MODEL = m; refreshUnread(); route(); }).catch(showError);
})();
