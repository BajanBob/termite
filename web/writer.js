// Termite Write: a Word-style editor that opens, edits and saves .docx, converts PDF to Word and exports PDF.
const $ = s => document.querySelector(s);
const T = window.termite;
const ed = $('#doc');
let docName = 'Untitled.docx';

/* ---------- libraries, loaded only when needed ---------- */
const loaded = {};
const lib = n => loaded[n] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/' + n + '.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + n)); document.head.append(s); });

/* ---------- selection and commands ---------- */
let saved = null;
document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) { saved = s.getRangeAt(0).cloneRange(); refresh(); } });
function restore(){ ed.focus({ preventScroll: true }); if (saved && ed.contains(saved.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } }
function cmd(c, v = null){ restore(); document.execCommand('styleWithCSS', false, true); const ok = document.execCommand(c, false, v); changed(); return ok; }
document.querySelectorAll('#wbar button, #wbar select, #wbar input').forEach(b => b.addEventListener('mousedown', e => { if (b.tagName === 'BUTTON') e.preventDefault(); }));
document.querySelectorAll('#wbar [data-cmd]').forEach(b => b.onclick = () => { cmd(b.dataset.cmd, b.dataset.val || null); refresh(); });

$('#w-style').onchange = e => { const v = e.target.value; restore();
  document.execCommand('formatBlock', false, v === 'title' ? 'h1' : v);
  const blk = blockOf(getSelection().anchorNode); if (blk) blk.classList.toggle('title', v === 'title'); changed(); refresh(); };
$('#w-font').onchange = e => cmd('fontName', e.target.value);
$('#w-size').onchange = e => { const pt = e.target.value; restore(); document.execCommand('styleWithCSS', false, true); document.execCommand('fontSize', false, '7');
  ed.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach(el => { if (el.tagName === 'FONT') { const sp = document.createElement('span'); sp.append(...el.childNodes); el.replaceWith(sp); el = sp; } el.style.fontSize = pt + 'pt'; });
  changed(); };
$('#w-color').oninput = e => cmd('foreColor', e.target.value);
$('#w-hl').oninput = e => { if (!cmd('hiliteColor', e.target.value)) cmd('backColor', e.target.value); };
$('#w-undo').onclick = () => cmd('undo'); $('#w-redo').onclick = () => cmd('redo');
$('#w-zoom').onchange = e => { ed.style.zoom = e.target.value; };

const blockOf = n => { while (n && n !== ed) { if (n.nodeType === 1 && /^(P|DIV|H[1-6]|LI|PRE|TD|TH)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
function refresh(){
  for (const [id, c] of [['w-b','bold'],['w-i','italic'],['w-u','underline'],['w-s','strikeThrough'],['w-ul','insertUnorderedList'],['w-ol','insertOrderedList'],['w-al','justifyLeft'],['w-ac','justifyCenter'],['w-ar','justifyRight'],['w-aj','justifyFull']])
    { let on = false; try { on = document.queryCommandState(c); } catch(e){} $('#' + id).setAttribute('aria-pressed', String(on)); }
  const n = getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement); if (!el || !ed.contains(el)) return;
  const blk = blockOf(n), tag = blk ? blk.tagName.toLowerCase() : 'p';
  $('#w-style').value = blk?.classList.contains('title') ? 'title' : (['h1','h2','h3','pre'].includes(tag) ? tag : 'p');
  const cs = getComputedStyle(el), pt = Math.round(parseFloat(cs.fontSize) * 0.75); const sz = $('#w-size');
  if (![...sz.options].some(o => o.value == pt)) { const o = new Option(pt, pt); o.dataset.extra = 1; sz.append(o); } sz.value = pt;
  const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const f = $('#w-font'); if ([...f.options].some(o => o.value === fam)) f.value = fam;
}

/* ---------- document state, draft and counts ---------- */
let dt;
function changed(){ ed.classList.toggle('blank', !ed.textContent.trim() && !ed.querySelector('img,table')); clearTimeout(dt); dt = setTimeout(() => { count(); try { localStorage.setItem('termite.draft', JSON.stringify({ name: docName, html: ed.innerHTML })); $('#w-saved').textContent = 'Draft kept on this device'; } catch(e){} }, 600); }
ed.addEventListener('input', changed);
function count(){ const t = ed.innerText || '', w = (t.match(/\S+/g) || []).length; $('#w-count').textContent = `${w.toLocaleString()} word${w === 1 ? '' : 's'} · ${t.replace(/\s/g,'').length.toLocaleString()} characters · about ${Math.max(1, Math.ceil(ed.scrollHeight / 1123))} page${ed.scrollHeight > 1123 ? 's' : ''}`; }
function setName(n){ docName = n; $('#w-name').value = n.replace(/\.docx$/i, ''); }
$('#w-name').onchange = e => { docName = (e.target.value.trim() || 'Untitled') + '.docx'; changed(); };
function load(html, name){ ed.innerHTML = clean(html) || '<p><br></p>'; setName(name); ed.style.zoom = $('#w-zoom').value; changed(); count(); ed.scrollIntoView({ block: 'start' }); $('#w-saved').textContent = ''; }
function clean(html){
  const d = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  d.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(n => n.remove());
  d.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); });
  return d.body.innerHTML.trim();
}
const escH = s => s.replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));

/* ---------- new and open ---------- */
$('#w-new').onclick = async () => { if (ed.textContent.trim() && !(await T.ask('Start a new document? Save this one first if you want to keep it.', 'Start new'))) return; load('<p><br></p>', 'Untitled.docx'); ed.focus(); };
async function openFile(f){
  const name = f.name, base = name.replace(/\.[^.]+$/, '');
  try {
    if (/\.docx$/i.test(name)) {
      T.status('Opening ' + name + '…', 0); await lib('mammoth');
      const r = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() }, { styleMap: ['u => u', 'strike => s', "p[style-name='Title'] => h1.title:fresh"] });
      load(r.value, base + '.docx'); T.status('Opened ' + name + '. Fonts and colours from Word may look simpler here.', 5000);
    } else if (/\.html?$/i.test(name)) load(await f.text(), base + '.docx');
    else if (/\.(txt|md|csv)$/i.test(name)) load((await f.text()).split(/\r?\n\r?\n/).map(p => '<p>' + escH(p).replace(/\r?\n/g, '<br>') + '</p>').join(''), base + '.docx');
    else if (/\.doc$/i.test(name)) { T.status('Old .doc files (Word 97–2003) can\'t be opened here. In Word, use Save As → .docx, then open that.', 8000); return; }
    else { T.status('Termite can open PDF, Word (.docx), text and web pages.', 5000); return; }
    T.setMode('write');
  } catch (e) { T.status('Couldn\'t open ' + name + ': ' + (e.message || e), 8000); }
}

/* ---------- insert: table, image, link, page break ---------- */
$('#w-table').onclick = () => { $('#dlg-table').showModal(); };
$('#tb-form').onsubmit = e => { e.preventDefault(); $('#dlg-table').close(); const r = Math.min(50, Math.max(1, +$('#tb-r').value || 3)), c = Math.min(12, Math.max(1, +$('#tb-c').value || 3)), h = $('#tb-h').checked;
  let html = '<table><tbody>'; for (let i = 0; i < r; i++) { html += '<tr>'; for (let j = 0; j < c; j++) html += (h && i === 0 ? '<th>' : '<td>') + '<br>' + (h && i === 0 ? '</th>' : '</td>'); html += '</tr>'; }
  cmd('insertHTML', html + '</tbody></table><p><br></p>'); };
$('#tb-cancel').onclick = () => $('#dlg-table').close();
$('#w-img').onclick = () => $('#w-imgfile').click();
$('#w-imgfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; cmd('insertImage', await shrink(f)); };
async function shrink(f){ const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  const im = new Image(); im.src = url; await im.decode().catch(() => {}); if (!im.naturalWidth || im.naturalWidth <= 1600) return url;
  const c = document.createElement('canvas'), s = 1600 / im.naturalWidth; c.width = 1600; c.height = Math.round(im.naturalHeight * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL(/png/.test(f.type) ? 'image/png' : 'image/jpeg', 0.88); }
$('#w-link').onclick = () => { $('#ln-url').value = 'https://'; $('#ln-text').value = saved ? saved.toString() : ''; $('#dlg-link').showModal(); $('#ln-url').select(); };
$('#ln-form').onsubmit = e => { e.preventDefault(); $('#dlg-link').close(); let u = $('#ln-url').value.trim(); if (!u || u === 'https://') return; if (!/^(https?:|mailto:)/i.test(u)) u = 'https://' + u;
  const t = $('#ln-text').value.trim(); if (saved && !saved.collapsed && saved.toString() === t) cmd('createLink', u); else cmd('insertHTML', `<a href="${u.replace(/"/g, '&quot;')}">${escH(t || u)}</a>&nbsp;`); };
$('#ln-cancel').onclick = () => $('#dlg-link').close();
$('#w-pb').onclick = () => cmd('insertHTML', '<hr class="pb" title="Page break"><p><br></p>');

/* ---------- find and replace ---------- */
$('#w-find').onclick = () => { const d = $('#dlg-find'); if (saved && !saved.collapsed) $('#fr-q').value = saved.toString(); d.show(); $('#fr-q').focus(); $('#fr-q').select(); };
$('#fr-close').onclick = () => $('#dlg-find').close();
function textMap(){ const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); const parts = []; let full = '', n; while ((n = w.nextNode())) { parts.push({ n, s: full.length }); full += n.data; } return { parts, full }; }
function locate(parts, i){ for (let k = parts.length - 1; k >= 0; k--) if (parts[k].s <= i) return [parts[k].n, i - parts[k].s]; return [parts[0].n, 0]; }
function findNext(back = false){
  const q = $('#fr-q').value, cs = $('#fr-case').checked; if (!q) return false;
  const { parts, full } = textMap(); if (!parts.length) return false;
  const hay = cs ? full : full.toLowerCase(), nd = cs ? q : q.toLowerCase();
  let from = 0; const s = getSelection();
  if (s.rangeCount && ed.contains(s.anchorNode)) { const r = s.getRangeAt(0), p = parts.find(p => p.n === (back ? r.startContainer : r.endContainer)); if (p) from = p.s + (back ? r.startOffset : r.endOffset); }
  let i = back ? hay.lastIndexOf(nd, from - 1) : hay.indexOf(nd, from); if (i < 0) i = back ? hay.lastIndexOf(nd) : hay.indexOf(nd);
  const total = hay.split(nd).length - 1; $('#fr-n').textContent = total ? `${total} found` : 'Not found'; if (i < 0) return false;
  const r = document.createRange(), [a, ao] = locate(parts, i), [b, bo] = locate(parts, i + q.length - 1); r.setStart(a, ao); r.setEnd(b, bo + 1);
  s.removeAllRanges(); s.addRange(r); saved = r.cloneRange(); (a.parentElement || ed).scrollIntoView({ block: 'center' }); return true;
}
$('#fr-next').onclick = () => findNext(); $('#fr-prev').onclick = () => findNext(true);
$('#fr-q').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey); } };
$('#fr-one').onclick = () => { const q = $('#fr-q').value, s = getSelection(), cs = $('#fr-case').checked;
  if (s.rangeCount && ed.contains(s.anchorNode) && (cs ? s.toString() === q : s.toString().toLowerCase() === q.toLowerCase())) { document.execCommand('insertText', false, $('#fr-r').value); changed(); } findNext(); };
$('#fr-all').onclick = () => { const q = $('#fr-q').value; if (!q) return; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + ($('#fr-case').checked ? '' : 'i')); let n = 0;
  for (const { n: t } of textMap().parts) { const v = t.data.replace(re, () => (n++, $('#fr-r').value)); if (v !== t.data) t.data = v; }
  $('#fr-n').textContent = n ? `Replaced ${n}` : 'Not found'; changed(); };

/* ---------- PDF to Word ---------- */
async function fromPdf(pdf, name){
  T.status('Turning the PDF into an editable document…', 0); let html = '', empty = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim() !== '' || i.hasEOL).map(i => { const [a, b, c, d, e, f] = i.transform; const h = Math.hypot(c, d) || i.height || 10; return { s: i.str, x: e, y: vp.height - f, h, w: i.width }; }).filter(i => i.s);
    if (!items.some(i => i.s.trim())) { empty++; html += `<p><em>(Page ${p} has no selectable text; it may be a scanned image.)</em></p>`; }
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of items) { const L = lines.find(l => Math.abs(l.y - it.y) < Math.max(l.h, it.h) * 0.5); if (L) { L.items.push(it); L.h = Math.max(L.h, it.h); } else lines.push({ y: it.y, h: it.h, items: [it] }); }
    lines.sort((a, b) => a.y - b.y);
    for (const l of lines) { l.items.sort((a, b) => a.x - b.x); let t = '', end = null; for (const it of l.items) { if (end !== null && it.x - end > l.h * 0.2 && !/\s$/.test(t) && !/^\s/.test(it.s)) t += ' '; t += it.s; end = it.x + it.w; }
      l.t = t.replace(/\s+/g, ' ').trim(); l.x0 = l.items[0].x; l.x1 = end; }
    const hs = lines.filter(l => l.t).map(l => l.h).sort((a, b) => a - b), body = hs[Math.floor(hs.length / 2)] || 10;
    let para = null; const flush = () => { if (!para) return; const big = para.h >= body * 1.6 ? 'h1' : para.h >= body * 1.25 ? 'h2' : 'p'; const mid = (para.x0 + para.x1) / 2;
      const centred = Math.abs(mid - vp.width / 2) < vp.width * 0.04 && (para.x1 - para.x0) < vp.width * 0.6; html += `<${big}${centred ? ' style="text-align:center"' : ''}>${escH(para.t)}</${big}>`; para = null; };
    let prev = null;
    for (const l of lines) { if (!l.t) continue;
      const gap = prev ? l.y - prev.y : 0, same = para && Math.abs(l.h - para.h) < body * 0.15 && gap < l.h * 1.75 && !/^([•\-–▪◦*]|\d+[.)])\s/.test(l.t);
      if (same) { para.t = /-$/.test(para.t) ? para.t.slice(0, -1) + l.t : para.t + ' ' + l.t; para.x0 = Math.min(para.x0, l.x0); para.x1 = Math.max(para.x1, l.x1); }
      else { flush(); para = { t: l.t, h: l.h, x0: l.x0, x1: l.x1 }; } prev = l; }
    flush(); if (p < pdf.numPages) html += '<hr class="pb" title="Page break">';
  }
  load(html, name.replace(/\.pdf$/i, '') + '.docx'); T.setMode('write');
  T.status(empty === pdf.numPages ? 'This PDF is all scanned images, so there was no text to turn into Word.' : 'Converted to an editable document. Text comes across; pictures and exact layout don\'t.', 7000);
}

/* ---------- build a real .docx ---------- */
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const x = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const hex = c => { const m = c && c.match(/[\d.]+/g); if (!m || (m.length > 3 && +m[3] === 0)) return null; return m.slice(0, 3).map(v => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase(); };
const INLINE = /^(A|B|STRONG|I|EM|U|INS|S|STRIKE|DEL|SPAN|FONT|BR|IMG|SUB|SUP|CODE|MARK|SMALL|BIG|LABEL|ABBR|CITE|Q|KBD|TIME)$/;
const GENERIC = { serif: 'Times New Roman', 'sans-serif': 'Arial', monospace: 'Courier New', 'system-ui': 'Calibri' };

function buildDocx(){
  const rels = [], media = [], ols = []; let rid = 10, pic = 0;
  const rel = (type, target, ext) => { const id = 'rId' + (++rid); rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${x(target)}"${ext ? ' TargetMode="External"' : ''}/>`); return id; };

  function runs(nodes, blk, pre){
    let out = '', started = false;
    const walk = (n, link) => {
      if (n.nodeType === 3) { let t = n.data; if (!pre) { t = t.replace(/[ \t\r\n]+/g, ' '); if (!started) t = t.replace(/^ +/, ''); } if (!t) return; started = true; out += run(t, n.parentElement, blk, link, pre); return; }
      if (n.nodeType !== 1) return;
      const tg = n.tagName;
      if (tg === 'BR') { out += '<w:r><w:br/></w:r>'; return; }
      if (tg === 'IMG') { out += image(n); return; }
      if (tg === 'A' && n.getAttribute('href')) { const before = out; out = ''; n.childNodes.forEach(c => walk(c, true)); const inner = out; out = before + `<w:hyperlink r:id="${rel('hyperlink', n.href, true)}">${inner}</w:hyperlink>`; return; }
      if (/^(UL|OL|TABLE|P|DIV|H[1-6])$/.test(tg)) { const t = n.innerText; if (t) out += run(t.replace(/\s+/g, ' '), n, blk, link); return; }
      n.childNodes.forEach(c => walk(c, link));
    };
    nodes.forEach(n => walk(n, false));
    return out;
  }
  function run(t, el, blk, link, pre){
    const cs = getComputedStyle(el); let rp = '', u = false, s = false, bg = null, va = null;
    for (let a = el; a && a !== blk.parentNode && a !== ed; a = a.parentElement) { const st = getComputedStyle(a), d = st.textDecorationLine || '';
      if (/^(U|INS)$/.test(a.tagName) || d.includes('underline')) u = true; if (/^(S|STRIKE|DEL)$/.test(a.tagName) || d.includes('line-through')) s = true;
      if (!bg && a.tagName !== 'TD' && a.tagName !== 'TH') bg = hex(st.backgroundColor); if (!va && a.tagName === 'SUB') va = 'subscript'; if (!va && a.tagName === 'SUP') va = 'superscript'; }
    if (link) rp += '<w:rStyle w:val="Hyperlink"/>';
    let fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); fam = GENERIC[fam] || fam; if (pre) fam = 'Courier New';
    if (fam) rp += `<w:rFonts w:ascii="${x(fam)}" w:hAnsi="${x(fam)}" w:cs="${x(fam)}"/>`;
    if (parseInt(cs.fontWeight) >= 600) rp += '<w:b/>'; if (cs.fontStyle === 'italic') rp += '<w:i/>'; if (s) rp += '<w:strike/>';
    const col = hex(cs.color); if (!link && col && col !== '000000') rp += `<w:color w:val="${col}"/>`;
    const hp = Math.round(parseFloat(cs.fontSize) * 1.5); rp += `<w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/>`;
    if (u && !link) rp += '<w:u w:val="single"/>'; if (bg) rp += `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>`; if (va) rp += `<w:vertAlign w:val="${va}"/>`;
    return t.split('\n').map(p => `<w:r><w:rPr>${rp}</w:rPr><w:t xml:space="preserve">${x(p)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');
  }
  function image(img){
    const m = /^data:image\/(png|jpe?g|gif);base64,(.*)$/i.exec(img.getAttribute('src') || ''); if (!m) return '';
    const ext = m[1].toLowerCase().replace('jpg', 'jpeg'), n = ++pic, file = `image${n}.${ext}`; media.push({ file, b64: m[2] });
    const id = rel('image', 'media/' + file), w = img.width || img.naturalWidth || 300, h = img.height || img.naturalHeight || 200, cx = Math.round(w * 9525), cy = Math.round(h * 9525);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"${img.alt ? ` descr="${x(img.alt)}"` : ''}/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  function para(nodes, blk, ctx){
    const pre = blk.tagName === 'PRE';
    if (!nodes.some(n => n.nodeType === 1 || n.data.trim() || pre)) return '';
    const cs = getComputedStyle(blk); let pp = '';
    const st = blk.classList?.contains('title') ? 'Title' : ({ H1: 'Heading1', H2: 'Heading2', H3: 'Heading3', H4: 'Heading3', H5: 'Heading3', H6: 'Heading3' })[blk.tagName];
    if (st) pp += `<w:pStyle w:val="${st}"/>`; else if (ctx.num) pp += '<w:pStyle w:val="ListParagraph"/>';
    if (ctx.num) pp += `<w:numPr><w:ilvl w:val="${ctx.lvl}"/><w:numId w:val="${ctx.num}"/></w:numPr>`;
    if (ctx.cell) pp += '<w:spacing w:after="0"/>';
    const ind = (ctx.indent || 0) + (/^(P|DIV|H\d|PRE)$/.test(blk.tagName) ? Math.round(parseFloat(cs.marginLeft) * 15) : 0);
    if (ind > 0 && !ctx.num) pp += `<w:ind w:left="${ind}"/>`;
    const jc = { center: 'center', right: 'right', end: 'right', justify: 'both' }[cs.textAlign]; if (jc) pp += `<w:jc w:val="${jc}"/>`;
    return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${runs(nodes, blk, pre)}</w:p>`;
  }
  function list(el, lvl){
    let num = 1; if (el.tagName === 'OL') { num = 2 + ols.length; ols.push({ num, lvl, start: +el.getAttribute('start') || 1 }); }
    let out = '';
    for (const li of el.children) { if (li.tagName !== 'LI') { out += blocks(li, {}); continue; }
      let inl = [], first = true; const fl = () => { if (inl.length) { out += para(inl, li, first ? { num, lvl } : { indent: 720 * (lvl + 1) }) || (first ? para([document.createTextNode(' ')], li, { num, lvl }) : ''); first = false; inl = []; } };
      for (const c of li.childNodes) { if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) { fl(); out += list(c, Math.min(8, lvl + 1)); } else if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName)) { inl.push(...c.childNodes); } else inl.push(c); }
      fl(); }
    return out;
  }
  function table(t){
    const cols = Math.max(1, ...[...t.rows].map(r => [...r.cells].reduce((a, c) => a + (c.colSpan || 1), 0)));
    const b = ['top','left','bottom','right','insideH','insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');
    let out = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${b}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + Math.floor(9026 / cols) + '"/>'.repeat(cols)}</w:tblGrid>`;
    for (const r of t.rows) { out += '<w:tr>'; for (const c of r.cells) { const bg = hex(getComputedStyle(c).backgroundColor);
      let inner = blocks(c, { cell: true }); if (!/<\/w:p>$/.test(inner)) inner += '<w:p/>';
      out += `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${c.colSpan > 1 ? `<w:gridSpan w:val="${c.colSpan}"/>` : ''}${bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>` : ''}</w:tcPr>${inner}</w:tc>`; } out += '</w:tr>'; }
    return out + '</w:tbl>';
  }
  function blocks(box, ctx){
    let out = '', inl = [];
    const fl = () => { if (inl.length) { out += para(inl, box, ctx); inl = []; } };
    for (const n of box.childNodes) {
      if (n.nodeType === 3 || (n.nodeType === 1 && INLINE.test(n.tagName))) { inl.push(n); continue; }
      if (n.nodeType !== 1) continue; fl();
      const tg = n.tagName;
      if (/^(UL|OL)$/.test(tg)) out += list(n, 0);
      else if (tg === 'TABLE') out += table(n) + (ctx.cell ? '' : '');
      else if (tg === 'HR') out += n.classList.contains('pb') ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>';
      else if ([...n.children].some(c => !INLINE.test(c.tagName))) out += blocks(n, { ...ctx, indent: (ctx.indent || 0) + Math.round(parseFloat(getComputedStyle(n).marginLeft) * 15) });
      else out += para([...n.childNodes], n, ctx);
    }
    fl(); return out;
  }

  const body = blocks(ed, {}) + '<w:p/>';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const lvl = (i, fmt, text) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>' : ''}</w:lvl>`;
  const bul = ['•', '◦', '▪'], fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${[...Array(9)].map((_, i) => lvl(i, 'bullet', bul[i % 3])).join('')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${[...Array(9)].map((_, i) => lvl(i, fmts[i % 3], `%${i + 1}.`)).join('')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${ols.map(o => `<w:num w:numId="${o.num}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${o.lvl}"><w:startOverride w:val="${o.start}"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`;
  const hd = (id, name, sz, lvlN, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${lvlN >= 0 ? `<w:outlineLvl w:val="${lvlN}"/>` : ''}</w:pPr><w:rPr>${extra}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${hd('Title', 'Title', 56, -1)}${hd('Heading1', 'heading 1', 40, 0, '<w:b/><w:color w:val="1F3864"/>')}${hd('Heading2', 'heading 2', 32, 1, '<w:b/><w:color w:val="1F3864"/>')}${hd('Heading3', 'heading 3', 26, 2, '<w:b/><w:color w:val="1F3864"/>')}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z'), title = docName.replace(/\.docx$/i, '');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Termite</Application></Properties>`);
  zip.file('word/document.xml', doc); zip.file('word/styles.xml', styles); zip.file('word/numbering.xml', numbering);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${rels.join('')}</Relationships>`);
  for (const m of media) zip.file('word/media/' + m.file, m.b64, { base64: true });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}
async function docxBlob(){ await lib('jszip'); return buildDocx(); }

/* ---------- export PDF: each page drawn exactly as it looks, so it reads the same on any phone ---------- */
async function pdfBlob(){
  await lib('html2canvas'); await lib('jspdf'); const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true }), PW = 595.28, PX = 794, M = 76, LIM = 1123 - 2 * M, k = PW / PX;
  const sections = [[]]; for (const n of ed.childNodes) { if (n.nodeType === 1 && n.matches('hr.pb')) sections.push([]); else sections.at(-1).push(n.cloneNode(true)); }
  let first = true, pages = 0;
  for (const sec of sections) {
    const box = document.createElement('div'); box.className = 'paper printing'; box.append(...sec); $('#printbay').append(box);
    await Promise.all([...box.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
    const top = box.getBoundingClientRect().top, H = Math.ceil(box.getBoundingClientRect().height);
    const cuts = [...box.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,pre,tr,img,hr')].map(e => Math.ceil(e.getBoundingClientRect().bottom - top) + 2).sort((a, b) => a - b);
    let y = 0;
    do {
      let end = Math.min(H, y + LIM); if (end < H) { const c = cuts.filter(v => v > y + 60 && v <= end).pop(); if (c) end = c; }
      const h = Math.max(1, end - y), win = document.createElement('div'); win.style.cssText = `position:relative;width:${PX}px;height:${h}px;overflow:hidden;background:#fff`;
      const inner = box.cloneNode(true); inner.style.top = -y + 'px'; win.append(inner); $('#printbay').append(win);
      const cv = await html2canvas(win, { scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: PX });
      win.remove(); if (!first) pdf.addPage(); first = false; pages++;
      if (end > y) pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, M * k, PW, h * k);
      y = end; T.status(`Making the PDF… page ${pages}`, 0);
    } while (y < H - 1);
    box.remove();
  }
  pdf.setProperties({ title: docName.replace(/\.docx$/i, ''), creator: 'Termite' });
  return pdf.output('blob');
}

/* ---------- save, export, share ---------- */
const base = () => docName.replace(/\.docx$/i, '');
async function busy(label, fn){ T.status(label, 0); try { return await fn(); } catch (e) { T.status('Something went wrong: ' + (e.message || e), 7000); } }
$('#w-save').onclick = () => busy('Building the Word file…', async () => { const b = await docxBlob(); await T.save(b, base() + '.docx'); });
$('#w-pdf').onclick = () => busy('Making the PDF…', async () => { const b = await pdfBlob(); const u8 = new Uint8Array(await b.arrayBuffer());
  await T.openPdfData(u8, base() + '.pdf'); T.setMode('pdf'); T.status('Here is your PDF. Use Save copy or Share to keep or send it.', 6000); });
$('#w-share').onclick = () => T.share({ name: base(), text: ed.innerText,
  make: { docx: { label: 'Word (.docx)', build: async () => ({ blob: await docxBlob(), filename: base() + '.docx' }) }, pdf: { label: 'PDF', build: async () => ({ blob: await pdfBlob(), filename: base() + '.pdf' }) } } });

ed.addEventListener('keydown', e => { const m = e.ctrlKey || e.metaKey; if (!m) return; const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); $('#w-save').click(); } else if (k === 'h') { e.preventDefault(); $('#w-find').click(); } else if (k === 'f') { e.preventDefault(); e.stopPropagation(); $('#w-find').click(); } });
ed.addEventListener('paste', () => setTimeout(() => { ed.querySelectorAll('script,style,iframe,object,embed').forEach(n => n.remove()); changed(); }));

/* ---------- start ---------- */
let draft = null; try { draft = JSON.parse(localStorage.getItem('termite.draft') || 'null'); } catch(e){}
if (draft && draft.html) { load(draft.html, draft.name || 'Untitled.docx'); $('#w-saved').textContent = 'Your last draft is back'; }
else load('<h1 class="title">Untitled document</h1><p>Start typing here. Use the toolbar above for styles, lists, tables and pictures, then Save .docx, make a PDF, or Share.</p>', 'Untitled.docx');

T.writer = { openFile, fromPdf, docxBlob, pdfBlob, load };
