// Termite PDF tools: organise, merge, split, convert, sign, stamp, retype, redact, watermark,
// page numbers, protect, compress, scan to text (OCR), compare and print.
const T = window.termite;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loaded = {};
const lib = n => loaded[n] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/' + n + '.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + n)); document.head.append(s); });
const PL = async () => { await lib('pdf-lib'); return window.PDFLib; };
const base = () => T.pdfName().replace(/\.pdf$/i, '');
const bytes = async () => new Uint8Array(await T.pdfBytes());
const status = (m, ms) => T.status(m, ms);
async function busy(label, fn){ status(label, 0); try { return await fn(); } catch (e) { status(e.message || String(e), 9000); } }
async function loadDoc(u8){ const { PDFDocument } = await PL(); try { return await PDFDocument.load(u8, { updateMetadata: false }); }
  catch (e) { if (/encrypt|password/i.test(e.message)) { const pw = await promptText('This PDF is password protected. Enter its password to change it.', '', 'password'); if (pw == null) throw new Error('Cancelled.'); return PDFDocument.load(u8, { password: pw, updateMetadata: false }); } throw e; } }
const pickFiles = (accept, multiple = true) => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => res([...i.files]); i.oncancel = () => res([]); i.click(); });
function parseRanges(s, max){ const out = []; for (const part of String(s).split(/[,;]+/)) { const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+|end))?$/i); if (!m) continue; const a = +m[1], b = m[2] ? (/end/i.test(m[2]) ? max : +m[2]) : a; for (let i = Math.max(1, a); i <= Math.min(max, b); i++) out.push(i); } return out; }

/* ---------- dialogs ---------- */
const dlg = document.createElement('dialog'); dlg.className = 'k-dlg pt-dlg'; document.body.append(dlg);
function modal(title, bodyHTML, buttons = [['cancel', 'Cancel'], ['ok', 'OK']], wide = false){
  return new Promise(res => {
    dlg.classList.toggle('wide', wide);
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><div class="pt-body">${bodyHTML}</div><div class="acts">${buttons.map(([v, l], i) => `<button class="btn${i === buttons.length - 1 ? ' primary' : ''}" value="${v}" type="${i === buttons.length - 1 ? 'submit' : 'button'}">${esc(l)}</button>`).join('')}</div></form>`;
    const f = dlg.querySelector('form'); const done = v => { const data = {}; f.querySelectorAll('[name]').forEach(el => { if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; } else data[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); dlg.close(); res(v === 'cancel' ? null : { button: v, ...data, form: f }); };
    f.querySelectorAll('.acts button[type=button]').forEach(b => b.onclick = () => done(b.value));
    f.onsubmit = e => { e.preventDefault(); done(f.querySelector('button[type=submit]').value); };
    dlg.oncancel = () => res(null);
    dlg.showModal(); res.dlg = f;
    dlg._ready?.(f);
  });
}
const promptText = async (label, value = '', type = 'text') => { const r = await modal(label, `<label class="kf"><input name="v" type="${type}" value="${esc(value)}" autocomplete="off"></label>`); return r ? r.v : null; };
const fld = (name, label, value = '', type = 'text', extra = '') => `<label class="kf"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const sel = (name, label, opts, value) => `<label class="kf"><span>${label}</span><select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v == value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const chk = (name, label, on) => `<label class="k-check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> <span>${label}</span></label>`;

/* ---------- the drawer ---------- */
const GROUPS = [
  ['Organise', [['organise', 'Organise pages', 'Reorder, rotate, delete, insert or extract pages'], ['merge', 'Combine files', 'Join several PDFs into one'], ['split', 'Split', 'Break into parts by page ranges'], ['img2pdf', 'Images to PDF', 'Turn photos or scans into a PDF'], ['pdf2img', 'Export as images', 'Save pages as JPG or PNG']]],
  ['Edit', [['retype', 'Cover and retype', 'White out text and type the correction'], ['image', 'Add image', 'Place a picture or logo on a page'], ['stamp', 'Stamp', 'Approved, Paid, Confidential, Draft…'], ['watermark', 'Watermark', 'Diagonal text on every page'], ['numbers', 'Page numbers, header and footer', 'Number pages, add titles or dates']]],
  ['Sign and protect', [['sign', 'Fill and sign', 'Draw, type or upload your signature'], ['redact', 'Redact', 'Permanently black out private details'], ['protect', 'Password protect', 'Lock with a password (AES-256)'], ['unlock', 'Remove password', 'Save an unlocked copy'], ['compress', 'Reduce file size', 'Make the PDF smaller to send']]],
  ['Scan and review', [['ocr', 'Scan to text (OCR)', 'Make scanned pages searchable and copyable'], ['compare', 'Compare two PDFs', 'See what changed between versions'], ['print', 'Print', 'Print the document']]],
];
const drawer = document.createElement('aside'); drawer.className = 'pt-drawer'; drawer.hidden = true; drawer.setAttribute('aria-label', 'All PDF tools');
drawer.innerHTML = `<div class="pt-dh"><b>All tools</b><button class="tb" data-close aria-label="Close">✕</button></div>` + GROUPS.map(([g, items]) => `<h4>${g}</h4>` + items.map(([id, n, d]) => `<button class="pt-item" data-tool="${id}"><b>${n}</b><span>${d}</span></button>`).join('')).join('');
document.body.append(drawer);
drawer.querySelector('[data-close]').onclick = () => drawer.hidden = true;
drawer.addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (!b) return; drawer.hidden = true; run(b.dataset.tool); });
export const toggle = () => { drawer.hidden = !drawer.hidden; };
async function run(id){ if (!T.pdf()) { status('Open a PDF first.'); return; } try { await TOOLS[id](); } catch (e) { if (e.message !== 'Cancelled.') status(e.message || String(e), 9000); } }

/* ---------- rendering helpers ---------- */
async function renderPage(pdf, n, scale){ const page = await pdf.getPage(n), vp = page.getViewport({ scale }); const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, annotationMode: window.pdfjsLib.AnnotationMode.ENABLE_FORMS }).promise; return { canvas: c, page, vp }; }
const toBlob = (c, type = 'image/jpeg', q = .9) => new Promise(r => c.toBlob(r, type, q));
async function saveZip(files, name){ await lib('jszip'); const z = new JSZip(); for (const [n, data] of files) z.file(n, data); T.save(await z.generateAsync({ type: 'blob', compression: 'DEFLATE' }), name); }
async function finish(u8, name, msg){ const choice = await modal('Done', `<p class="muted">${esc(msg)}</p>`, [['save', 'Save a copy'], ['open', 'Open it here']]);
  if (!choice) return; if (choice.button === 'save') T.save(new Blob([u8], { type: 'application/pdf' }), name); else { await T.openPdfData(u8, name); status('Opened "' + name + '".'); } }

/* ---------- organise pages ---------- */
async function organise(){
  const src = await bytes(); const pdf = T.pdf(); const sources = { cur: { u8: src, pdf } };
  let pages = [...Array(pdf.numPages)].map((_, i) => ({ s: 'cur', i, rot: 0, key: Math.random() })), picked = new Set(), seq = 1;
  const ov = document.createElement('div'); ov.className = 'pt-full'; ov.innerHTML = `<div class="pt-fbar"><b>Organise pages</b><span class="muted" id="og-n"></span><span class="sp"></span>
    <button class="tb" data-a="rl">⟲ Rotate left</button><button class="tb" data-a="rr">⟳ Rotate right</button><button class="tb" data-a="dup">Duplicate</button><button class="tb" data-a="del">Delete</button>
    <button class="tb" data-a="blank">Insert blank</button><button class="tb" data-a="ins">Insert from PDF</button><button class="tb" data-a="ext">Extract selected</button><button class="tb" data-a="all">Select all</button>
    <button class="tb" data-a="cancel">Cancel</button><button class="tb primary" data-a="apply">Apply changes</button></div><p class="muted pt-hint">Click to select (Shift-click for a range). Drag pages to reorder.</p><div class="pt-grid" id="og-grid"></div>`;
  document.body.append(ov); const grid = ov.querySelector('#og-grid'); const thumbs = new Map();
  async function thumb(p){ const k = p.s + ':' + p.i; if (p.s === 'blank') return null; if (!thumbs.has(k)) thumbs.set(k, (async () => { const { canvas } = await renderPage(sources[p.s].pdf, p.i + 1, .35); return canvas.toDataURL('image/jpeg', .8); })()); return thumbs.get(k); }
  let last = null, dragFrom = null;
  async function draw(){
    ov.querySelector('#og-n').textContent = `${pages.length} pages${picked.size ? ' · ' + picked.size + ' selected' : ''}`;
    grid.innerHTML = pages.map((p, k) => `<div class="pt-card${picked.has(p.key) ? ' on' : ''}" draggable="true" data-k="${k}"><div class="pt-th" style="transform:rotate(${p.rot}deg)">${p.s === 'blank' ? '<div class="pt-blank">Blank</div>' : '<img alt="">'}</div><span>${k + 1}${p.s !== 'cur' && p.s !== 'blank' ? ' · added' : ''}</span></div>`).join('');
    grid.querySelectorAll('.pt-card').forEach(async el => { const p = pages[+el.dataset.k]; const im = el.querySelector('img'); if (im) im.src = await thumb(p);
      el.onclick = e => { const k = +el.dataset.k; if (e.shiftKey && last != null) { for (let i = Math.min(last, k); i <= Math.max(last, k); i++) picked.add(pages[i].key); } else picked.has(p.key) ? picked.delete(p.key) : picked.add(p.key); last = k; draw(); };
      el.ondragstart = () => dragFrom = +el.dataset.k; el.ondragover = e => e.preventDefault();
      el.ondrop = e => { e.preventDefault(); const to = +el.dataset.k; if (dragFrom == null || dragFrom === to) return; const [m] = pages.splice(dragFrom, 1); pages.splice(to, 0, m); dragFrom = null; draw(); }; });
  }
  const selected = () => pages.filter(p => picked.has(p.key));
  const insertAt = () => { const idx = pages.map((p, i) => picked.has(p.key) ? i : -1).filter(i => i >= 0).pop(); return idx == null ? pages.length : idx + 1; };
  async function build(list){ const { PDFDocument, degrees, PageSizes } = await PL(); const out = await PDFDocument.create(); const loadedDocs = {};
    for (const p of list) { if (p.s === 'blank') { const prev = out.getPageCount() ? out.getPage(out.getPageCount() - 1).getSize() : { width: PageSizes.A4[0], height: PageSizes.A4[1] }; out.addPage([prev.width, prev.height]); continue; }
      loadedDocs[p.s] ||= await loadDoc(sources[p.s].u8); const [cp] = await out.copyPages(loadedDocs[p.s], [p.i]); cp.setRotation(degrees(((cp.getRotation().angle + p.rot) % 360 + 360) % 360)); out.addPage(cp); }
    return out.save(); }
  ov.addEventListener('click', async e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'cancel') { ov.remove(); return; }
    if (a === 'all') { if (picked.size === pages.length) picked.clear(); else pages.forEach(p => picked.add(p.key)); }
    if ((a === 'rl' || a === 'rr' || a === 'del' || a === 'dup' || a === 'ext') && !picked.size) { status('Select pages first.'); return; }
    if (a === 'rl' || a === 'rr') selected().forEach(p => p.rot = (p.rot + (a === 'rr' ? 90 : -90) + 360) % 360);
    if (a === 'del') { if (picked.size === pages.length) { status('A PDF needs at least one page.'); return; } pages = pages.filter(p => !picked.has(p.key)); picked.clear(); }
    if (a === 'dup') { const at = insertAt(); pages.splice(at, 0, ...selected().map(p => ({ ...p, key: Math.random() }))); }
    if (a === 'blank') pages.splice(insertAt(), 0, { s: 'blank', i: 0, rot: 0, key: Math.random() });
    if (a === 'ins') { const [f] = await pickFiles('application/pdf,.pdf', false); if (!f) return; const u8 = new Uint8Array(await f.arrayBuffer()); const id = 'f' + seq++;
      const d = await window.pdfjsLib.getDocument({ data: u8.slice(0), isEvalSupported: false }).promise; sources[id] = { u8, pdf: d }; pages.splice(insertAt(), 0, ...[...Array(d.numPages)].map((_, i) => ({ s: id, i, rot: 0, key: Math.random() }))); }
    if (a === 'ext') return busy('Extracting pages…', async () => { const u8 = await build(selected()); T.save(new Blob([u8], { type: 'application/pdf' }), base() + ' (pages).pdf'); });
    if (a === 'apply') return busy('Rebuilding the PDF…', async () => { const u8 = await build(pages); ov.remove(); await T.openPdfData(u8, T.pdfName()); status('Pages updated. Use Save copy to keep the changes.', 6000); });
    draw(); });
  draw();
}

/* ---------- combine, split, images ---------- */
async function merge(){
  let list = [{ name: T.pdfName() + ' (open now)', u8: await bytes() }];
  const body = () => `<ol class="pt-list">${list.map((f, i) => `<li><span>${esc(f.name)}</span><button type="button" class="tb" data-up="${i}" aria-label="Move up">↑</button><button type="button" class="tb" data-dn="${i}" aria-label="Move down">↓</button><button type="button" class="tb" data-rm="${i}" aria-label="Remove">✕</button></li>`).join('')}</ol><button type="button" class="btn" data-add>Add PDFs…</button>`;
  dlg._ready = f => { const wire = () => { f.querySelector('.pt-body').innerHTML = body(); f.querySelector('[data-add]').onclick = async () => { for (const x of await pickFiles('application/pdf,.pdf')) list.push({ name: x.name, u8: new Uint8Array(await x.arrayBuffer()) }); wire(); };
    f.querySelectorAll('[data-up],[data-dn],[data-rm]').forEach(b => b.onclick = () => { const i = +(b.dataset.up ?? b.dataset.dn ?? b.dataset.rm); if (b.dataset.rm != null) list.splice(i, 1); else { const j = b.dataset.up != null ? i - 1 : i + 1; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; } wire(); }); }; wire(); };
  const r = await modal('Combine files', body(), [['cancel', 'Cancel'], ['ok', 'Combine']]); dlg._ready = null; if (!r) return;
  if (list.length < 2) { status('Add at least one more PDF to combine.'); return; }
  await busy('Combining…', async () => { const { PDFDocument } = await PL(); const out = await PDFDocument.create();
    for (const f of list) { const d = await loadDoc(f.u8); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p)); }
    await finish(await out.save(), base() + ' (combined).pdf', `${list.length} files combined into ${out.getPageCount()} pages.`); });
}
async function split(){
  const n = T.pdf().numPages;
  const r = await modal('Split', sel('mode', 'How', [['each', 'One file per page'], ['every', 'Every N pages'], ['ranges', 'By page ranges']], 'every') + fld('every', 'N (pages per part)', 2, 'number', 'min="1"') + fld('ranges', 'Ranges (one part each, e.g. 1-3, 4-6, 7-end)', `1-${Math.ceil(n / 2)}, ${Math.ceil(n / 2) + 1}-end`), [['cancel', 'Cancel'], ['ok', 'Split']]);
  if (!r) return;
  const parts = r.mode === 'each' ? [...Array(n)].map((_, i) => [i + 1]) : r.mode === 'every' ? [...Array(Math.ceil(n / Math.max(1, +r.every || 1)))].map((_, k) => [...Array(Math.max(1, +r.every || 1))].map((_, j) => k * Math.max(1, +r.every || 1) + j + 1).filter(p => p <= n))
    : r.ranges.split(',').map(s => parseRanges(s, n)).filter(a => a.length);
  if (!parts.length) { status('Those page ranges didn\'t match any pages.'); return; }
  await busy('Splitting…', async () => { const { PDFDocument } = await PL(); const src = await loadDoc(await bytes()); const files = [];
    for (const pg of parts) { const out = await PDFDocument.create(); (await out.copyPages(src, pg.map(p => p - 1))).forEach(p => out.addPage(p)); files.push([`${base()} pages ${pg[0]}${pg.length > 1 ? '-' + pg.at(-1) : ''}.pdf`, await out.save()]); }
    if (files.length === 1) T.save(new Blob([files[0][1]], { type: 'application/pdf' }), files[0][0]); else await saveZip(files, base() + ' (split).zip');
    status(`Split into ${files.length} file${files.length > 1 ? 's (saved together in one .zip)' : ''}.`, 6000); });
}
async function img2pdf(){
  const files = await pickFiles('image/*'); if (!files.length) return;
  const r = await modal('Images to PDF', sel('size', 'Page size', [['fit', 'Same as each picture'], ['a4', 'A4'], ['letter', 'US Letter']], 'a4') + chk('margin', 'Add a white margin', true), [['cancel', 'Cancel'], ['ok', 'Make PDF']]); if (!r) return;
  await busy('Making the PDF…', async () => { const { PDFDocument, PageSizes } = await PL(); const out = await PDFDocument.create();
    for (const f of files) { const im = new Image(); im.src = URL.createObjectURL(f); await im.decode(); const c = document.createElement('canvas'); const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)); c.width = im.naturalWidth * k; c.height = im.naturalHeight * k; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      const img = await out.embedJpg(await (await toBlob(c, 'image/jpeg', .88)).arrayBuffer()); let [w, h] = r.size === 'fit' ? [c.width * .75, c.height * .75] : r.size === 'a4' ? PageSizes.A4 : PageSizes.Letter; if (r.size !== 'fit' && c.width > c.height) [w, h] = [h, w];
      const m = r.margin ? 24 : 0, s = Math.min((w - 2 * m) / img.width, (h - 2 * m) / img.height); const page = out.addPage([w, h]); page.drawImage(img, { x: (w - img.width * s) / 2, y: (h - img.height * s) / 2, width: img.width * s, height: img.height * s }); }
    await finish(await out.save(), (files[0].name.replace(/\.[^.]+$/, '') || 'Images') + '.pdf', `${files.length} picture${files.length > 1 ? 's' : ''} turned into a PDF.`); });
}
async function pdf2img(){
  const n = T.pdf().numPages;
  const r = await modal('Export as images', sel('fmt', 'Format', [['image/jpeg', 'JPG (smaller)'], ['image/png', 'PNG (sharpest)']], 'image/jpeg') + sel('dpi', 'Quality', [['96', 'Screen (96 dpi)'], ['150', 'Good (150 dpi)'], ['300', 'Print (300 dpi)']], '150') + fld('pages', 'Pages', `1-${n}`), [['cancel', 'Cancel'], ['ok', 'Export']]); if (!r) return;
  await busy('Exporting pages…', async () => { const files = [], ext = r.fmt === 'image/png' ? 'png' : 'jpg';
    for (const p of parseRanges(r.pages, n)) { status(`Exporting page ${p}…`, 0); const { canvas } = await renderPage(T.pdf(), p, +r.dpi / 72); files.push([`${base()} page ${p}.${ext}`, await toBlob(canvas, r.fmt, .9)]); }
    if (files.length === 1) T.save(files[0][1], files[0][0]); else await saveZip(files, base() + ' (images).zip'); status(`${files.length} page${files.length > 1 ? 's' : ''} exported.`); });
}

/* ---------- watermark and page numbers ---------- */
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
async function watermark(){
  const n = T.pdf().numPages;
  const r = await modal('Watermark', fld('text', 'Text', 'CONFIDENTIAL') + `<div class="kf-row">${fld('size', 'Size', 60, 'number')}${fld('angle', 'Angle', 45, 'number')}${fld('op', 'Opacity %', 18, 'number')}${fld('col', 'Colour', '#c0392b', 'color')}</div>` + fld('pages', 'Pages', `1-${n}`), [['cancel', 'Cancel'], ['ok', 'Add watermark']]); if (!r || !r.text) return;
  await busy('Adding the watermark…', async () => { const { StandardFonts, rgb, degrees } = await PL(); const d = await loadDoc(await bytes()); const f = await d.embedFont(StandardFonts.HelveticaBold); const [R, G, B] = hex(r.col), size = +r.size || 60, a = (+r.angle || 0) * Math.PI / 180;
    for (const p of parseRanges(r.pages, n)) { const pg = d.getPage(p - 1), { width, height } = pg.getSize(), tw = f.widthOfTextAtSize(r.text, size);
      pg.drawText(r.text, { x: width / 2 - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a), y: height / 2 - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a), size, font: f, color: rgb(R, G, B), opacity: (+r.op || 18) / 100, rotate: degrees(+r.angle || 0) }); }
    await T.openPdfData(await d.save(), T.pdfName()); status('Watermark added. Use Save copy to keep it.', 6000); });
}
async function numbers(){
  const n = T.pdf().numPages;
  const r = await modal('Page numbers, header and footer', `<p class="muted">Use {page}, {pages}, {date} and {file} anywhere.</p><div class="kf-row">${fld('hl', 'Header left', '')}${fld('hc', 'Header centre', '')}${fld('hr', 'Header right', '')}</div><div class="kf-row">${fld('fl', 'Footer left', '')}${fld('fc', 'Footer centre', 'Page {page} of {pages}')}${fld('fr', 'Footer right', '')}</div>
    <div class="kf-row">${fld('size', 'Text size', 10, 'number')}${fld('start', 'First number', 1, 'number')}${fld('pages', 'Pages', `1-${n}`)}</div>${chk('skip', 'Leave the first page blank (cover page)', false)}`, [['cancel', 'Cancel'], ['ok', 'Apply']], true); if (!r) return;
  await busy('Adding page numbers…', async () => { const { StandardFonts, rgb } = await PL(); const d = await loadDoc(await bytes()); const f = await d.embedFont(StandardFonts.Helvetica); const size = +r.size || 10, date = new Date().toLocaleDateString(); const list = parseRanges(r.pages, n).filter(p => !(r.skip && p === 1));
    const fill = t => t.replace(/\{page\}/g, String(list.indexOf(cur) + (+r.start || 1))).replace(/\{pages\}/g, String(list.length + (+r.start || 1) - 1)).replace(/\{date\}/g, date).replace(/\{file\}/g, base()); let cur;
    for (cur of list) { const pg = d.getPage(cur - 1), { width, height } = pg.getSize(), m = 28;
      for (const [k, y] of [['h', height - m], ['f', m - size / 2]]) for (const [al, x] of [['l', 'L'], ['c', 'C'], ['r', 'R']]) { const t = fill(r[k + al] || ''); if (!t) continue; const tw = f.widthOfTextAtSize(t, size);
        pg.drawText(t, { x: x === 'L' ? m + 8 : x === 'C' ? (width - tw) / 2 : width - m - 8 - tw, y, size, font: f, color: rgb(.25, .25, .25) }); } }
    await T.openPdfData(await d.save(), T.pdfName()); status('Done. Use Save copy to keep it.', 6000); });
}

/* ---------- placing things on pages: signature, image, stamp, retype ---------- */
let placing = [];
const bar = document.createElement('div'); bar.className = 'pt-place'; bar.hidden = true; bar.innerHTML = `<span id="pp-msg">Drag to move, drag the corner to resize.</span><button class="tb" data-p="more">Add another</button><button class="tb" data-p="cancel">Cancel</button><button class="tb primary" data-p="apply">Apply to PDF</button>`; document.body.append(bar);
let addAnother = null;
bar.addEventListener('click', async e => { const a = e.target.closest('[data-p]')?.dataset.p; if (!a) return;
  if (a === 'cancel') { placing.forEach(p => p.el.remove()); placing = []; bar.hidden = true; }
  if (a === 'more') addAnother?.();
  if (a === 'apply') applyPlacements(); });
function waitForPageClick(msg){
  status(msg, 0); return new Promise(res => { const host = $('#viewerContainer'); const h = e => { const pg = e.target.closest('.page'); if (!pg) return; e.preventDefault(); e.stopPropagation(); host.removeEventListener('click', h, true); host.classList.remove('pt-aim'); $('#status').classList.add('hide');
    const r = pg.getBoundingClientRect(); res({ pg, x: e.clientX - r.left, y: e.clientY - r.top }); }; host.classList.add('pt-aim'); host.addEventListener('click', h, true); }); }
function overlay(at, kind, payload, w, h){
  const el = document.createElement('div'); el.className = 'pt-ov ' + kind; el.style.cssText = `left:${Math.max(0, at.x - w / 2)}px;top:${Math.max(0, at.y - h / 2)}px;width:${w}px;height:${h}px`;
  if (kind === 'retype') el.innerHTML = `<div class="pt-txt" contenteditable="true" spellcheck="true">${esc(payload.text || '')}</div>`; else el.innerHTML = `<img src="${payload.src}" alt="" draggable="false">`;
  el.insertAdjacentHTML('beforeend', '<i class="pt-rz"></i><button class="pt-x" aria-label="Remove">✕</button>'); at.pg.append(el);
  const item = { el, kind, payload, pageNumber: +at.pg.dataset.pageNumber }; placing.push(item);
  el.querySelector('.pt-x').onclick = () => { el.remove(); placing = placing.filter(p => p !== item); if (!placing.length) bar.hidden = true; };
  let mode = null, sx, sy, ox, oy, ow, oh, ratio = w / h;
  el.addEventListener('pointerdown', e => { if (e.target.classList.contains('pt-x') || (e.target.classList.contains('pt-txt') && !e.altKey && document.activeElement === e.target)) return; mode = e.target.classList.contains('pt-rz') ? 'rz' : 'mv'; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; ow = el.offsetWidth; oh = el.offsetHeight; el.setPointerCapture(e.pointerId); if (mode === 'mv' && kind !== 'retype') e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (!mode) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (mode === 'mv') { el.style.left = ox + dx + 'px'; el.style.top = oy + dy + 'px'; } else { const nw = Math.max(30, ow + dx); el.style.width = nw + 'px'; el.style.height = (kind === 'retype' ? Math.max(18, oh + dy) : nw / ratio) + 'px'; } });
  el.addEventListener('pointerup', () => mode = null);
  if (kind === 'retype') setTimeout(() => el.querySelector('.pt-txt').focus(), 50);
  bar.hidden = false; return item;
}
async function applyPlacements(){
  if (!placing.length) return;
  await busy('Applying…', async () => { const { rgb, StandardFonts } = await PL(); const d = await loadDoc(await bytes()); const font = await d.embedFont(StandardFonts.Helvetica); const embedded = new Map();
    for (const it of placing) { const view = T.viewer().getPageView(it.pageNumber - 1), vp = view.viewport, el = it.el;
      const [x1, y1] = vp.convertToPdfPoint(el.offsetLeft, el.offsetTop), [x2, y2] = vp.convertToPdfPoint(el.offsetLeft + el.offsetWidth, el.offsetTop + el.offsetHeight);
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), page = d.getPage(it.pageNumber - 1);
      if (it.kind === 'retype') { page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) }); const txt = el.querySelector('.pt-txt').innerText.replace(/ /g, ' ').trim(); const size = Math.max(5, parseFloat(getComputedStyle(el.querySelector('.pt-txt')).fontSize) / vp.scale);
        txt.split('\n').forEach((line, i) => page.drawText(line, { x: x + 2, y: y + h - size * (i + 1) - 1 + size * .15, size, font, color: rgb(0, 0, 0) })); continue; }
      let img = embedded.get(it.payload.src); if (!img) { const b = await (await fetch(it.payload.src)).arrayBuffer(); img = /^data:image\/png/.test(it.payload.src) ? await d.embedPng(b) : await d.embedJpg(b); embedded.set(it.payload.src, img); }
      page.drawImage(img, { x, y, width: w, height: h }); }
    placing.forEach(p => p.el.remove()); placing = []; bar.hidden = true; await T.openPdfData(await d.save(), T.pdfName()); status('Applied. Use Save copy to keep it, or Share to send it.', 7000); });
}
async function placeImage(src, w0 = 180){ const im = new Image(); im.src = src; await im.decode(); const at = await waitForPageClick('Click on the page where it should go.'); const w = Math.min(w0, at.pg.clientWidth * .6); overlay(at, 'img', { src }, w, w * im.naturalHeight / im.naturalWidth); }
async function toPngDataURL(file){ const im = new Image(); im.src = URL.createObjectURL(file); await im.decode(); const c = document.createElement('canvas'); const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)); c.width = im.naturalWidth * k; c.height = im.naturalHeight * k; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/png'); }

async function signature(){
  let saved = null; try { saved = localStorage.getItem('termite.sig'); } catch (e) {}
  const r = await modal('Fill and sign', `<div class="pt-tabs"><button type="button" class="tb on" data-t="draw">Draw</button><button type="button" class="tb" data-t="type">Type</button><button type="button" class="tb" data-t="upload">Upload</button>${saved ? '<button type="button" class="tb" data-t="saved">Saved</button>' : ''}</div>
    <div data-p="draw"><canvas class="pt-sig" width="600" height="200"></canvas><button type="button" class="btn" data-clear>Clear</button></div>
    <div data-p="type" hidden>${fld('name', 'Your name', '')}${sel('font', 'Style', [['"Segoe Script","Brush Script MT","Snell Roundhand",cursive', 'Script'], ['"Lucida Handwriting","Bradley Hand",cursive', 'Handwriting'], ['Georgia,serif', 'Formal']], '')}</div>
    <div data-p="upload" hidden><input type="file" accept="image/*" data-up><p class="muted">A photo of your signature on white paper works; the white is made see-through.</p></div>
    <div data-p="saved" hidden>${saved ? `<img src="${saved}" alt="Saved signature" style="max-width:100%;max-height:120px;background:#fff">` : ''}</div>
    ${chk('remember', 'Remember this signature on this device', true)}${chk('date', 'Also add today\'s date next to it', false)}<input type="hidden" name="tab" value="draw">`, [['cancel', 'Cancel'], ['ok', 'Place signature']]);
  if (!r) return; const f = r.form; let src = null;
  if (r.tab === 'draw') { const c = f.querySelector('canvas'); src = trimCanvas(c); }
  else if (r.tab === 'type') { if (!r.name) { status('Type your name first.'); return; } const c = document.createElement('canvas'); c.width = 900; c.height = 260; const g = c.getContext('2d'); g.fillStyle = '#0b2a6b'; g.font = `140px ${r.font}`; g.textBaseline = 'middle'; g.fillText(r.name, 20, 130); src = trimCanvas(c); }
  else if (r.tab === 'upload') { src = f._upload; } else src = saved;
  if (!src) { status('Make a signature first.'); return; }
  if (r.remember) try { localStorage.setItem('termite.sig', src); } catch (e) {}
  await placeImage(src, 170); addAnother = () => placeImage(src, 170);
  if (r.date) { const c = document.createElement('canvas'); c.width = 520; c.height = 90; const g = c.getContext('2d'); g.fillStyle = '#111'; g.font = '56px Helvetica, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(new Date().toLocaleDateString(), 6, 45); await placeImage(trimCanvas(c), 110); }
}
dlg.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return; const f = dlg.querySelector('form'); f.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b === t)); f.querySelectorAll('[data-p]').forEach(p => p.hidden = p.dataset.p !== t.dataset.t); f.elements.tab.value = t.dataset.t; });
dlg.addEventListener('change', async e => { if (!e.target.matches('[data-up]')) return; const file = e.target.files[0]; if (!file) return; const src = await toPngDataURL(file); const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const l = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 3; if (l > 200) d.data[i + 3] = 0; } g.putImageData(d, 0, 0); dlg.querySelector('form')._upload = trimCanvas(c); });
dlg.addEventListener('pointerdown', e => { const c = e.target.closest('canvas.pt-sig'); if (!c) return; const g = c.getContext('2d'); g.lineWidth = 4; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#0b2a6b'; const r = c.getBoundingClientRect(), k = c.width / r.width;
  g.beginPath(); g.moveTo((e.clientX - r.left) * k, (e.clientY - r.top) * k); c.setPointerCapture(e.pointerId); const mv = ev => { g.lineTo((ev.clientX - r.left) * k, (ev.clientY - r.top) * k); g.stroke(); }; c.addEventListener('pointermove', mv); c.addEventListener('pointerup', () => c.removeEventListener('pointermove', mv), { once: true }); });
dlg.addEventListener('click', e => { if (e.target.matches('[data-clear]')) { const c = dlg.querySelector('canvas.pt-sig'); c.getContext('2d').clearRect(0, 0, c.width, c.height); } });
function trimCanvas(c){ const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null; const o = document.createElement('canvas'), p = 6; o.width = x1 - x0 + 2 * p; o.height = y1 - y0 + 2 * p; o.getContext('2d').drawImage(c, x0 - p, y0 - p, o.width, o.height, 0, 0, o.width, o.height); return o.toDataURL('image/png'); }
async function addImage(){ const [f] = await pickFiles('image/*', false); if (!f) return; const src = await toPngDataURL(f); await placeImage(src, 200); addAnother = () => placeImage(src, 200); }
async function stamp(){
  const r = await modal('Stamp', sel('label', 'Stamp', ['APPROVED', 'PAID', 'RECEIVED', 'CONFIDENTIAL', 'DRAFT', 'REJECTED', 'COPY', 'FINAL', 'URGENT', 'VOID'].map(x => [x, x]), 'APPROVED') + fld('col', 'Colour', '#1f7a3a', 'color') + chk('date', 'Add today\'s date', true) + fld('by', 'Initials or name (optional)', ''), [['cancel', 'Cancel'], ['ok', 'Place stamp']]); if (!r) return;
  const c = document.createElement('canvas'); c.width = 760; c.height = r.date || r.by ? 300 : 200; const g = c.getContext('2d'); g.strokeStyle = g.fillStyle = r.col; g.lineWidth = 12; g.globalAlpha = .9;
  g.beginPath(); g.roundRect ? g.roundRect(10, 10, 740, c.height - 20, 28) : g.rect(10, 10, 740, c.height - 20); g.stroke(); g.font = 'bold 120px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r.label, 380, r.date || r.by ? 110 : 100, 700);
  if (r.date || r.by) { g.font = '52px Helvetica, Arial, sans-serif'; g.fillText([r.date ? new Date().toLocaleDateString() : '', r.by].filter(Boolean).join('  ·  '), 380, 225, 700); }
  const src = c.toDataURL('image/png'); await placeImage(src, 190); addAnother = () => placeImage(src, 190);
}
async function retype(){ const at = await waitForPageClick('Click the text you want to cover and correct.'); overlay(at, 'retype', { text: '' }, 220, 26); addAnother = async () => overlay(await waitForPageClick('Click where the next correction goes.'), 'retype', { text: '' }, 220, 26);
  status('Type the correction in the white box. Resize it to cover the old text, then Apply.', 7000); }

/* ---------- redact ---------- */
async function redact(){
  const r = await modal('Redact', `<p class="muted">Redaction removes what's underneath for good: the affected pages are rebuilt as images, so the hidden text can't be copied or recovered. Then save the result as a new file.</p>` + fld('term', 'Find and mark every place a word or number appears (optional)', '') + `<p class="muted">After this you can also drag boxes over anything else on the pages.</p>`, [['cancel', 'Cancel'], ['ok', 'Start marking']]); if (!r) return;
  const pdf = T.pdf(), marks = []; const host = $('#viewerContainer');
  const addMark = (pageNumber, rect) => { const pv = T.viewer().getPageView(pageNumber - 1); const [a, b, c2, d] = pv.viewport.convertToViewportRectangle(rect); const el = document.createElement('div'); el.className = 'pt-red'; el.style.cssText = `left:${Math.min(a, c2)}px;top:${Math.min(b, d)}px;width:${Math.abs(c2 - a)}px;height:${Math.abs(d - b)}px`; el.title = 'Click to remove'; pv.div.append(el); const m = { pageNumber, rect, el }; marks.push(m); el.onclick = ev => { ev.stopPropagation(); el.remove(); marks.splice(marks.indexOf(m), 1); }; };
  if (r.term) { const t = r.term.toLowerCase(); for (let p = 1; p <= pdf.numPages; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); for (const it of tc.items) { const s = (it.str || '').toLowerCase(); let i = s.indexOf(t); while (i >= 0 && s.length) { const [A, B, C, D, E, F] = it.transform, fh = Math.hypot(C, D) || 10, w = it.width / s.length; addMark(p, [E + w * i - 1, F - fh * .25, E + w * (i + t.length) + 1, F + fh * .9]); i = s.indexOf(t, i + t.length); } } }
    status(`${marks.length} match${marks.length === 1 ? '' : 'es'} marked. Drag to mark more; click a box to unmark.`, 7000); }
  let start = null, box = null, pvRef = null;
  const down = e => { const pg = e.target.closest('.page'); if (!pg || e.target.classList.contains('pt-red')) return; e.preventDefault(); pvRef = pg; const rr = pg.getBoundingClientRect(); start = { x: e.clientX - rr.left, y: e.clientY - rr.top }; box = document.createElement('div'); box.className = 'pt-red drawing'; pg.append(box); };
  const move = e => { if (!box) return; const rr = pvRef.getBoundingClientRect(), x = e.clientX - rr.left, y = e.clientY - rr.top; Object.assign(box.style, { left: Math.min(x, start.x) + 'px', top: Math.min(y, start.y) + 'px', width: Math.abs(x - start.x) + 'px', height: Math.abs(y - start.y) + 'px' }); };
  const up = () => { if (!box) return; const n = +pvRef.dataset.pageNumber, vp = T.viewer().getPageView(n - 1).viewport; const L = box.offsetLeft, Tp = box.offsetTop, W = box.offsetWidth, H = box.offsetHeight; box.remove(); box = null; if (W < 4 || H < 4) return;
    const [x1, y1] = vp.convertToPdfPoint(L, Tp), [x2, y2] = vp.convertToPdfPoint(L + W, Tp + H); addMark(n, [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]); };
  host.addEventListener('pointerdown', down, true); addEventListener('pointermove', move); addEventListener('pointerup', up); host.classList.add('pt-aim');
  const rb = document.createElement('div'); rb.className = 'pt-place'; rb.innerHTML = `<span>Drag boxes over anything private. Click a box to remove it.</span><button class="tb" data-r="cancel">Cancel</button><button class="tb primary" data-r="apply">Redact and save</button>`; document.body.append(rb);
  const stop = () => { host.removeEventListener('pointerdown', down, true); removeEventListener('pointermove', move); removeEventListener('pointerup', up); host.classList.remove('pt-aim'); rb.remove(); marks.forEach(m => m.el.remove()); };
  rb.onclick = async e => { const a = e.target.closest('[data-r]')?.dataset.r; if (!a) return; if (a === 'cancel') { stop(); return; }
    if (!marks.length) { status('Mark something to redact first.'); return; }
    const list = marks.map(m => ({ pageNumber: m.pageNumber, rect: m.rect })); stop();
    await busy('Redacting…', async () => { const { PDFDocument } = await PL(); const src = await loadDoc(await bytes()); const out = await PDFDocument.create(); const byPage = {}; list.forEach(m => (byPage[m.pageNumber] ||= []).push(m.rect));
      for (let p = 1; p <= pdf.numPages; p++) {
        if (!byPage[p]) { const [cp] = await out.copyPages(src, [p - 1]); out.addPage(cp); continue; }
        status(`Redacting page ${p}…`, 0); const { canvas, vp } = await renderPage(pdf, p, 2.5); const g = canvas.getContext('2d'); g.fillStyle = '#000';
        for (const rc of byPage[p]) { const [a, b, c2, d] = vp.convertToViewportRectangle(rc); g.fillRect(Math.min(a, c2) - 1, Math.min(b, d) - 1, Math.abs(c2 - a) + 2, Math.abs(d - b) + 2); }
        const img = await out.embedJpg(await (await toBlob(canvas, 'image/jpeg', .92)).arrayBuffer()); const w = vp.width / 2.5, h = vp.height / 2.5; out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h }); }
      out.setTitle(''); out.setAuthor(''); out.setSubject(''); out.setKeywords([]); out.setProducer('Termite'); out.setCreator('Termite');
      const u8 = await out.save(), nm = base() + ' (redacted).pdf'; await T.openPdfData(u8, nm); T.save(new Blob([u8], { type: 'application/pdf' }), nm);
      status(`Redacted ${list.length} area${list.length > 1 ? 's' : ''} on ${Object.keys(byPage).length} page${Object.keys(byPage).length > 1 ? 's' : ''}. Hidden details and document properties were removed.`, 9000); }); };
}

/* ---------- protect, unlock, compress ---------- */
async function protect(){
  const r = await modal('Password protect', fld('pw', 'Password to open the PDF', '', 'password', 'autocomplete="new-password"') + fld('pw2', 'Type it again', '', 'password', 'autocomplete="new-password"') + chk('print', 'Allow printing', true) + chk('copy', 'Allow copying text', false) + chk('edit', 'Allow changes', false) + `<p class="muted">Uses AES-256 encryption. Keep the password safe: it can't be recovered.</p>`, [['cancel', 'Cancel'], ['ok', 'Protect and save']]); if (!r) return;
  if (!r.pw || r.pw.length < 4) { status('Use a password of at least 4 characters.'); return; } if (r.pw !== r.pw2) { status('The two passwords don\'t match.'); return; }
  await busy('Encrypting…', async () => { const d = await loadDoc(await bytes()); const owner = crypto.getRandomValues(new Uint32Array(4)).join('-');
    d.encrypt({ userPassword: r.pw, ownerPassword: owner, permissions: { printing: r.print ? 'highResolution' : false, copying: !!r.copy, modifying: !!r.edit, annotating: !!r.edit, fillingForms: true, contentAccessibility: true, documentAssembly: !!r.edit } });
    T.save(new Blob([await d.save()], { type: 'application/pdf' }), base() + ' (protected).pdf'); status('Saved a password-protected copy. The copy open here stays unlocked.', 7000); });
}
async function unlock(){
  const pw = await promptText('Enter the PDF\'s current password', '', 'password'); if (pw == null) return;
  await busy('Unlocking…', async () => { const { PDFDocument } = await PL(); const d = await PDFDocument.load(await bytes(), { password: pw, updateMetadata: false }); const u8 = await d.save();
    T.save(new Blob([u8], { type: 'application/pdf' }), base() + ' (unlocked).pdf'); status('Saved an unlocked copy.'); });
}
async function compress(){
  const before = (await bytes()).length;
  const r = await modal('Reduce file size', `<p class="muted">Now ${(before / 1048576).toFixed(2)} MB.</p>` + sel('level', 'How much', [['light', 'Light: tidy the file, everything stays editable'], ['medium', 'Medium: pages become 150 dpi images'], ['strong', 'Strong: pages become 96 dpi images (smallest)']], 'medium') + `<p class="muted">Medium and Strong turn each page into a picture, which suits scans. Text then isn't selectable; run Scan to text afterwards if you need it.</p>`, [['cancel', 'Cancel'], ['ok', 'Reduce']]); if (!r) return;
  await busy('Reducing…', async () => { const { PDFDocument } = await PL(); let u8;
    if (r.level === 'light') { const d = await loadDoc(await bytes()); u8 = await d.save({ useObjectStreams: true }); }
    else { const pdf = T.pdf(), out = await PDFDocument.create(), sc = r.level === 'strong' ? 96 / 72 : 150 / 72, q = r.level === 'strong' ? .55 : .7;
      for (let p = 1; p <= pdf.numPages; p++) { status(`Page ${p} of ${pdf.numPages}…`, 0); const { canvas, vp } = await renderPage(pdf, p, sc); const img = await out.embedJpg(await (await toBlob(canvas, 'image/jpeg', q)).arrayBuffer()); const w = vp.width / sc, h = vp.height / sc; out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h }); }
      u8 = await out.save({ useObjectStreams: true }); }
    const pct = Math.round((1 - u8.length / before) * 100);
    if (u8.length >= before) { status('This PDF is already as small as it gets at that level. Try a stronger level.', 7000); return; }
    await finish(u8, base() + ' (smaller).pdf', `${(before / 1048576).toFixed(2)} MB → ${(u8.length / 1048576).toFixed(2)} MB (${pct}% smaller).`); });
}

/* ---------- scan to text (OCR) ---------- */
let ocrWorker = null;
async function ocr(){
  const pdf = T.pdf(), n = pdf.numPages; const empty = [];
  for (let p = 1; p <= n; p++) { const tc = await (await pdf.getPage(p)).getTextContent(); if (tc.items.filter(i => i.str?.trim()).length < 3) empty.push(p); }
  const r = await modal('Scan to text (OCR)', `<p class="muted">${empty.length ? `${empty.length} of ${n} page${n > 1 ? 's look' : ' looks'} like a scan with no text.` : 'Every page already has text; OCR will add a second, recognised text layer.'} Recognition runs on this device; nothing is uploaded.</p>` + fld('pages', 'Pages to read', empty.length ? empty.join(', ') : `1-${n}`) + sel('out', 'Then', [['pdf', 'Make the PDF searchable (keeps the look)'], ['word', 'Open the text in Word mode'], ['copy', 'Show the text to copy']], 'pdf'), [['cancel', 'Cancel'], ['ok', 'Start']]); if (!r) return;
  const pages = parseRanges(r.pages, n); if (!pages.length) return;
  await busy('Starting the text reader…', async () => {
    await lib('tesseract/tesseract'); const base_ = new URL('lib/tesseract/', location.href).href;
    try { ocrWorker ||= await Tesseract.createWorker('eng', 1, { workerPath: base_ + 'worker.min.js', corePath: base_, langPath: base_.replace(/\/$/, ''), gzip: true, logger: m => { if (m.status === 'recognizing text') status(`Reading page ${cur}… ${Math.round(m.progress * 100)}%`, 0); } }); }
    catch (e) { throw new Error(window.claude ? 'Scan to text can\'t start inside Claude pages. It works in the Termite apps for Windows, Linux and Android.' : 'The text reader couldn\'t start: ' + (e.message || e)); }
    let cur = 0; const texts = [], pdfs = {};
    for (cur of pages) { status(`Reading page ${cur}…`, 0); const { canvas } = await renderPage(pdf, cur, 2); await ocrWorker.setParameters({ user_defined_dpi: '144' });
      const res = await ocrWorker.recognize(canvas, {}, { text: true, pdf: r.out === 'pdf' }); texts.push([cur, res.data.text]); if (res.data.pdf) pdfs[cur] = new Uint8Array(res.data.pdf); }
    const words = texts.reduce((a, [, t]) => a + (t.match(/\S+/g) || []).length, 0);
    if (r.out === 'pdf') { const { PDFDocument } = await PL(); const src = await loadDoc(await bytes()); const out = await PDFDocument.create();
      for (let p = 1; p <= n; p++) { if (pdfs[p]) { const od = await PDFDocument.load(pdfs[p]); const [cp] = await out.copyPages(od, [0]); const orig = src.getPage(p - 1).getSize(), s = cp.getSize(); cp.scale(orig.width / s.width, orig.height / s.height); out.addPage(cp); } else { const [cp] = await out.copyPages(src, [p - 1]); out.addPage(cp); } }
      await T.openPdfData(await out.save(), base() + ' (searchable).pdf'); status(`Recognised ${words} words. The PDF is now searchable; use Save copy to keep it.`, 8000); }
    else if (r.out === 'word') { T.writer.load(texts.map(([p, t]) => `<h2>Page ${p}</h2>` + t.split(/\n{2,}/).map(par => `<p>${esc(par.replace(/\n/g, ' ').trim())}</p>`).join('')).join('<hr class="pb">'), base() + '.docx'); T.setMode('write'); status(`Recognised ${words} words and opened them in Word mode.`, 7000); }
    else await modal('Recognised text', `<textarea class="pt-text" rows="16" readonly>${esc(texts.map(([p, t]) => `— Page ${p} —\n${t}`).join('\n'))}</textarea>`, [['ok', 'Close']], true);
  });
}

/* ---------- compare ---------- */
async function compare(){
  const [f] = await pickFiles('application/pdf,.pdf', false); if (!f) return;
  await busy('Comparing…', async () => {
    const other = await window.pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
    const lines = async d => { const out = []; for (let p = 1; p <= d.numPages; p++) { const tc = await (await d.getPage(p)).getTextContent(); let line = ''; for (const it of tc.items) { line += it.str; if (it.hasEOL) { if (line.trim()) out.push({ p, t: line.trim().replace(/\s+/g, ' ') }); line = ''; } else line += ''; } if (line.trim()) out.push({ p, t: line.trim().replace(/\s+/g, ' ') }); } return out; };
    const A = (await lines(T.pdf())).slice(0, 5000), B = (await lines(other)).slice(0, 5000);
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i].t === B[j].t ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = []; let i = 0, j = 0; while (i < n && j < m) { if (A[i].t === B[j].t) { ops.push(['=', A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', A[i++]]); else ops.push(['+', B[j++]]); }
    while (i < n) ops.push(['-', A[i++]]); while (j < m) ops.push(['+', B[j++]]);
    const del = ops.filter(o => o[0] === '-').length, add = ops.filter(o => o[0] === '+').length;
    const html = ops.map((o, k) => { if (o[0] !== '=') return `<div class="cmp ${o[0] === '-' ? 'del' : 'add'}"><small>p.${o[1].p}</small>${esc(o[1].t)}</div>`; const near = ops.slice(Math.max(0, k - 1), k + 2).some(x => x[0] !== '='); return near ? `<div class="cmp same"><small>p.${o[1].p}</small>${esc(o[1].t)}</div>` : ''; }).join('').replace(/(<\/div>)(?=<div class="cmp same">)/g, '$1');
    await modal(`Compared with ${f.name}`, `<p class="muted"><span class="cmp-key del">${del} line${del === 1 ? '' : 's'} only in ${esc(T.pdfName())}</span> <span class="cmp-key add">${add} only in ${esc(f.name)}</span></p><div class="cmp-box">${del + add ? html : '<p>The text is the same. (Pictures and layout aren\'t compared.)</p>'}</div>`, [['ok', 'Close']], true);
  });
}

/* ---------- print ---------- */
async function print(){
  if (window.claude) { status('Claude pages can\'t print. Save a copy and print it from your device, or use the Termite app.', 8000); return; }
  if (window.TermiteAndroid) { status('To print on Android, use Share and pick your printer app, or save the PDF and open it in Files › Print.', 9000); return; }
  await busy('Preparing to print…', async () => { const pdf = T.pdf(); let area = $('#print-area'); if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.append(area); } area.innerHTML = '';
    for (let p = 1; p <= pdf.numPages; p++) { status(`Preparing page ${p} of ${pdf.numPages}…`, 0); const { canvas } = await renderPage(pdf, p, 2); const im = new Image(); im.src = canvas.toDataURL('image/jpeg', .92); area.append(im); }
    $('#status').classList.add('hide'); await new Promise(r => setTimeout(r, 300)); window.print(); setTimeout(() => area.innerHTML = '', 1000); });
}

const TOOLS = { organise, merge, split, img2pdf, pdf2img, watermark, numbers, sign: signature, image: addImage, stamp, retype, redact, protect, unlock, compress, ocr, compare, print };
export { run };
