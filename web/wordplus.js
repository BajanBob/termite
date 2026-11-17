// Termite Word extras: templates, page setup, headers and footers, columns, spacing, contents page,
// footnotes, comments, symbols, change case, format painter, table tools, AI writing help, read aloud, print.
const T = window.termite;
const $ = s => document.querySelector(s);
const ed = $('#doc');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const status = (m, ms) => T.status(m, ms);

/* ---------- remember the selection (menus steal focus) ---------- */
let saved = null;
document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); });
function restore(){ ed.focus({ preventScroll: true }); if (saved && ed.contains(saved.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } return getSelection(); }
const changed = () => ed.dispatchEvent(new Event('input', { bubbles: true }));
const exec = (c, v = null) => { restore(); document.execCommand('styleWithCSS', false, true); document.execCommand(c, false, v); changed(); };

/* ---------- page settings ---------- */
const DEF = { size: 'A4', orient: 'portrait', margins: [1, 1, 1, 1], cols: 1, header: { text: '', align: 'center' }, footer: { text: '', align: 'center' }, titlePg: false };
let ps = { ...DEF }; try { ps = { ...DEF, ...JSON.parse(localStorage.getItem('termite.page') || '{}') }; } catch (e) {}
const IN = { A4: [8.27, 11.69], Letter: [8.5, 11], Legal: [8.5, 14], A5: [5.83, 8.27] };
T.page = { get: () => ps };
function applyPage(){
  let [w, h] = IN[ps.size] || IN.A4; if (ps.orient === 'landscape') [w, h] = [h, w];
  ed.style.width = Math.round(w * 96) + 'px'; ed.style.minHeight = Math.round(h * 96) + 'px';
  const [t, r, b, l] = ps.margins.map(v => Math.round(v * 96) + 'px');
  if (innerWidth > 760) { ed.style.padding = `${t} ${r} ${b} ${l}`; ed.style.setProperty('--mt', t); ed.style.setProperty('--mb', b); ed.style.setProperty('--ml', l); ed.style.setProperty('--mr', r); }
  ed.style.columnCount = ps.cols > 1 ? ps.cols : ''; ed.style.columnGap = ps.cols > 1 ? '0.4in' : '';
  const prev = o => o?.text ? o.text.replace(/\{page\}/g, '1').replace(/\{pages\}/g, '#').replace(/\{date\}/g, new Date().toLocaleDateString()).replace(/\{title\}/g, $('#w-name').value) : '';
  ed.dataset.hdr = prev(ps.header); ed.dataset.ftr = prev(ps.footer); ed.dataset.hal = ps.header.align; ed.dataset.fal = ps.footer.align;
  if (!ed.dataset.hdr) delete ed.dataset.hdr; if (!ed.dataset.ftr) delete ed.dataset.ftr;
  try { localStorage.setItem('termite.page', JSON.stringify(ps)); } catch (e) {}
}

/* ---------- dialogs ---------- */
const dlg = document.createElement('dialog'); dlg.className = 'k-dlg pt-dlg'; document.body.append(dlg);
function modal(title, html, buttons = [['cancel', 'Cancel'], ['ok', 'OK']], wide = false){
  return new Promise(res => {
    dlg.classList.toggle('wide', wide);
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><div class="pt-body">${html}</div><div class="acts">${buttons.map(([v, l], i) => `<button class="btn${i === buttons.length - 1 ? ' primary' : ''}" value="${v}" type="${i === buttons.length - 1 ? 'submit' : 'button'}">${esc(l)}</button>`).join('')}</div></form>`;
    const f = dlg.querySelector('form'); const done = v => { const d = { button: v, form: f }; f.querySelectorAll('[name]').forEach(el => { if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; } else d[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); dlg.close(); res(v === 'cancel' ? null : d); };
    f.querySelectorAll('.acts button[type=button]').forEach(b => b.onclick = () => done(b.value)); f.onsubmit = e => { e.preventDefault(); done(f.querySelector('.acts button[type=submit]').value); };
    dlg.oncancel = () => res(null); dlg.showModal(); f.querySelector('input,textarea,select')?.focus();
  });
}
const fld = (n, l, v = '', t = 'text', x = '') => `<label class="kf"><span>${l}</span><input name="${n}" type="${t}" value="${esc(v)}" ${x}></label>`;
const sel = (n, l, o, v) => `<label class="kf"><span>${l}</span><select name="${n}">${o.map(([a, b]) => `<option value="${esc(a)}"${a == v ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
const ask = async (title, label, v = '', multi = false) => { const r = await modal(title, multi ? `<label class="kf"><span>${label}</span><textarea name="v" rows="4">${esc(v)}</textarea></label>` : fld('v', label, v)); return r ? r.v.trim() : null; };

/* ---------- menus on the ribbon ---------- */
const MENUS = {
  Templates: [['tpl', 'Choose a template…']],
  Insert: [['toc', 'Contents page'], ['fn', 'Footnote'], ['cmt', 'Comment on selection'], ['sym', 'Symbol…'], ['date', 'Date and time'], ['sigline', 'Signature line'], ['hr', 'Horizontal line']],
  Layout: [['page', 'Page setup…'], ['hf', 'Header and footer…'], ['pnum', 'Page numbers'], '-', ['col1', 'One column'], ['col2', 'Two columns'], ['col3', 'Three columns'], '-', ['ls1', 'Line spacing 1.0'], ['ls115', 'Line spacing 1.15'], ['ls15', 'Line spacing 1.5'], ['ls2', 'Line spacing 2.0'], ['sa0', 'No space after paragraphs'], ['sa8', 'Space after paragraphs']],
  Table: [['rowA', 'Insert row above'], ['rowB', 'Insert row below'], ['colL', 'Insert column left'], ['colR', 'Insert column right'], '-', ['delRow', 'Delete row'], ['delCol', 'Delete column'], ['delTab', 'Delete table'], ['hdrRow', 'Shade header row']],
  Review: [['cmts', 'Show comments'], ['read', 'Read aloud'], ['stats', 'Word count and reading time'], ['upd', 'Update contents and footnotes']],
  Aa: [['up', 'UPPERCASE'], ['low', 'lowercase'], ['sent', 'Sentence case.'], ['title', 'Capitalise Each Word'], ['tog', 'tOGGLE cASE']],
  '✨ AI': [['ai:improve', 'Improve writing'], ['ai:fix', 'Fix spelling and grammar'], ['ai:short', 'Make it shorter'], ['ai:long', 'Make it longer'], ['ai:formal', 'More formal'], ['ai:friendly', 'More friendly'], ['ai:summary', 'Summarise'], ['ai:translate', 'Translate…'], ['ai:continue', 'Continue writing'], ['ai:ask', 'Ask AI to…']],
};
const grp = document.createElement('div'); grp.className = 'grp wp-grp'; grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'More Word tools');
grp.innerHTML = Object.keys(MENUS).map(k => `<button class="tb" data-menu="${esc(k)}" aria-haspopup="true">${esc(k)}${k === 'Templates' ? '' : ' ▾'}</button>`).join('')
  + `<button class="tb" id="wp-paint" aria-pressed="false" title="Format painter: copy the formatting here, then select text to paint it on" aria-label="Format painter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="14" height="6" rx="1"/><path d="M17 6h3v5h-8v3M12 14v7"/></svg></button>`
  + `<button class="tb" id="wp-print" title="Print" aria-label="Print"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/></svg></button>`;
$('#w-find').before(grp);
const menu = document.createElement('div'); menu.className = 'more-menu wp-menu'; menu.hidden = true; document.body.append(menu);
grp.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
grp.addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (!b) return; const k = b.dataset.menu;
  if (k === 'Templates') { act('tpl'); return; }
  if (!menu.hidden && menu.dataset.for === k) { menu.hidden = true; return; }
  menu.dataset.for = k; menu.innerHTML = MENUS[k].map(i => i === '-' ? '<hr>' : `<button class="tb mi" data-act="${i[0]}">${esc(i[1])}</button>`).join('');
  const r = b.getBoundingClientRect(); menu.style.cssText = `position:fixed;top:${r.bottom + 4}px;left:${Math.min(r.left, innerWidth - 240)}px`; menu.hidden = false; });
menu.addEventListener('mousedown', e => e.preventDefault());
menu.addEventListener('click', e => { const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return; menu.hidden = true; act(a); });
addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-menu]')) menu.hidden = true; });

async function act(a){
  try {
    if (a.startsWith('ai:')) return ai(a.slice(3));
    const F = { tpl: templates, toc: insertToc, fn: insertFootnote, cmt: addComment, sym: symbols, date: insertDate, sigline: sigLine, hr: () => exec('insertHTML', '<hr><p><br></p>'),
      page: pageSetup, hf: headerFooter, pnum: () => { ps.footer = { text: 'Page {page} of {pages}', align: 'center' }; applyPage(); status('Page numbers added to the footer. They show in the saved Word file and PDF.', 6000); },
      col1: () => cols(1), col2: () => cols(2), col3: () => cols(3), ls1: () => spacing(1), ls115: () => spacing(1.15), ls15: () => spacing(1.5), ls2: () => spacing(2), sa0: () => after(0), sa8: () => after(8),
      rowA: () => table('rowA'), rowB: () => table('rowB'), colL: () => table('colL'), colR: () => table('colR'), delRow: () => table('delRow'), delCol: () => table('delCol'), delTab: () => table('delTab'), hdrRow: () => table('hdrRow'),
      cmts: toggleComments, read: readAloud, stats, upd: () => { updateToc(); renumber(); status('Contents and footnotes updated.'); },
      up: () => recase(s => s.toUpperCase()), low: () => recase(s => s.toLowerCase()), sent: () => recase(s => s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase())),
      title: () => recase(s => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())), tog: () => recase(s => [...s].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')) };
    await F[a]();
  } catch (e) { status(e.message || String(e), 8000); }
}

/* ---------- templates ---------- */
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const TPL = {
  blank: ['Blank document', () => '<p><br></p>'],
  letter: ['Letter', () => `<p style="text-align:right">Your Name<br>Street address<br>Town, Parish<br>Phone · Email</p><p>${today()}</p><p>Recipient Name<br>Company<br>Address</p><p><b>Re: Subject of the letter</b></p><p>Dear Recipient,</p><p>Opening paragraph: say why you are writing.</p><p>Middle paragraph: the details, facts or request.</p><p>Closing paragraph: what you would like to happen next, and thanks.</p><p>Yours sincerely,</p><p><br><br>Your Name<br>Title</p>`],
  memo: ['Memo', () => `<h1 class="title">Memo</h1><table><tbody><tr><th>To</th><td>Name or team</td></tr><tr><th>From</th><td>Your name</td></tr><tr><th>Date</th><td>${today()}</td></tr><tr><th>Subject</th><td>What this is about</td></tr></tbody></table><h2>Purpose</h2><p>One or two sentences.</p><h2>Details</h2><ul><li>Point one</li><li>Point two</li></ul><h2>Action needed</h2><p>Who does what, by when.</p>`],
  cv: ['CV / résumé', () => `<h1 class="title" style="text-align:center">Your Name</h1><p style="text-align:center">Town, Country · phone · email · linkedin.com/in/you</p><h2>Profile</h2><p>Three lines on who you are, your strengths and the role you want.</p><h2>Experience</h2><h3>Job title · Company · 2022 to now</h3><ul><li>Achievement with a number in it</li><li>Responsibility that matters for the next job</li></ul><h3>Job title · Company · 2019 to 2022</h3><ul><li>Achievement</li></ul><h2>Education</h2><p><b>Qualification</b>, School or college, Year</p><h2>Skills</h2><p>Skill · Skill · Skill · Languages</p><h2>References</h2><p>Available on request.</p>`],
  invoice: ['Invoice', () => `<table><tbody><tr><td><h1 class="title">INVOICE</h1><p>Your Business<br>Address<br>Phone · Email</p></td><td style="text-align:right"><p><b>Invoice no.</b> 0001<br><b>Date</b> ${today()}<br><b>Due</b> 30 days</p></td></tr></tbody></table><p><b>Bill to:</b><br>Customer name<br>Address</p><table><tbody><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr><tr><td>Item or service</td><td>1</td><td>0.00</td><td>0.00</td></tr><tr><td>Item or service</td><td>1</td><td>0.00</td><td>0.00</td></tr><tr><td></td><td></td><th>Total</th><th>0.00</th></tr></tbody></table><p>Payment details: bank, account, reference.</p><p>Thank you for your business.</p>`],
  report: ['Report', () => `<h1 class="title">Report title</h1><p><em>Prepared by Your Name · ${today()}</em></p><div class="toc" contenteditable="false"></div><hr class="pb"><h1>Summary</h1><p>The key findings in a few lines.</p><h1>Background</h1><p>Why this report was written.</p><h1>Findings</h1><h2>Finding one</h2><p>Detail.</p><h2>Finding two</h2><p>Detail.</p><h1>Recommendations</h1><ol><li>Recommendation</li><li>Recommendation</li></ol><h1>Appendix</h1><p>Supporting material.</p>`],
  minutes: ['Meeting minutes', () => `<h1 class="title">Meeting minutes</h1><table><tbody><tr><th>Date</th><td>${today()}</td></tr><tr><th>Time / place</th><td></td></tr><tr><th>Present</th><td></td></tr><tr><th>Apologies</th><td></td></tr><tr><th>Chair</th><td></td></tr></tbody></table><h2>1. Previous minutes</h2><p>Agreed as a true record.</p><h2>2. Matters arising</h2><p></p><h2>3. Agenda item</h2><p>Discussion and decision.</p><h2>Actions</h2><table><tbody><tr><th>Action</th><th>Who</th><th>By when</th></tr><tr><td></td><td></td><td></td></tr></tbody></table><h2>Next meeting</h2><p>Date, time and place.</p>`],
  newsletter: ['Newsletter (two columns)', () => { ps.cols = 2; applyPage(); return `<h1 class="title">Newsletter name</h1><p><em>Issue 1 · ${today()}</em></p><h2>Lead story</h2><p>Write your main story here. Two columns are set for this document; change it in Layout.</p><h2>News in brief</h2><ul><li>Item</li><li>Item</li></ul><h2>Dates for your diary</h2><p>Event · date · place</p><h2>Contact</h2><p>Phone · email · web</p>`; }],
};
async function templates(){
  const r = await modal('Templates', `<div class="wp-tpls">${Object.entries(TPL).map(([k, [n]]) => `<label class="wp-tpl"><input type="radio" name="t" value="${k}"${k === 'blank' ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>`, [['cancel', 'Cancel'], ['ok', 'Use template']], true);
  if (!r) return; if (ed.textContent.trim() && !(await T.ask('Replace the current document with this template? Save it first if you need it.', 'Replace'))) return;
  if (r.t !== 'newsletter' && ps.cols > 1) { ps.cols = 1; applyPage(); }
  T.writer.load(TPL[r.t][1](), (r.t === 'blank' ? 'Untitled' : TPL[r.t][0].replace(/\s*\(.*\)/, '')) + '.docx'); updateToc(); renumber(); applyPage();
}

/* ---------- page setup, header and footer, columns, spacing ---------- */
async function pageSetup(){
  const m = ps.margins;
  const r = await modal('Page setup', sel('size', 'Paper size', [['A4', 'A4'], ['Letter', 'US Letter'], ['Legal', 'US Legal'], ['A5', 'A5']], ps.size) + sel('orient', 'Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape']], ps.orient)
    + `<div class="kf-row">${fld('t', 'Top margin (in)', m[0], 'number', 'step="0.1" min="0.2" max="3"')}${fld('b', 'Bottom', m[2], 'number', 'step="0.1" min="0.2" max="3"')}${fld('l', 'Left', m[3], 'number', 'step="0.1" min="0.2" max="3"')}${fld('r', 'Right', m[1], 'number', 'step="0.1" min="0.2" max="3"')}</div>`
    + sel('cols', 'Columns', [['1', 'One'], ['2', 'Two'], ['3', 'Three']], String(ps.cols)), [['narrow', 'Narrow margins'], ['cancel', 'Cancel'], ['ok', 'Apply']], true);
  if (!r) return; ps.size = r.size; ps.orient = r.orient; ps.cols = +r.cols;
  ps.margins = r.button === 'narrow' ? [0.5, 0.5, 0.5, 0.5] : [+r.t || 1, +r.r || 1, +r.b || 1, +r.l || 1]; applyPage(); status('Page setup applied. It\'s used when you save as Word or make a PDF.');
}
async function headerFooter(){
  const al = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];
  const r = await modal('Header and footer', `<p class="muted">Use {page}, {pages}, {date} and {title} anywhere.</p><div class="kf-row">${fld('h', 'Header', ps.header.text)}${sel('ha', 'Align', al, ps.header.align)}</div><div class="kf-row">${fld('f', 'Footer', ps.footer.text)}${sel('fa', 'Align', al, ps.footer.align)}</div>
    <label class="k-check"><input type="checkbox" name="first" ${ps.titlePg ? 'checked' : ''}> <span>No header or footer on the first page (cover page)</span></label>`, [['clear', 'Remove both'], ['cancel', 'Cancel'], ['ok', 'Apply']], true);
  if (!r) return; if (r.button === 'clear') { ps.header = { text: '', align: 'center' }; ps.footer = { text: '', align: 'center' }; }
  else { ps.header = { text: r.h, align: r.ha }; ps.footer = { text: r.f, align: r.fa }; ps.titlePg = r.first; } applyPage();
}
function cols(n){ ps.cols = n; applyPage(); status(n > 1 ? `${n} columns. They show in the Word file and the PDF.` : 'One column.'); }
function blocksInSelection(){ restore(); const r = saved; if (!r) return []; const out = []; const w = document.createTreeWalker(ed, NodeFilter.SHOW_ELEMENT, { acceptNode: n => /^(P|H[1-6]|LI|PRE)$/.test(n.tagName) || (n.tagName === 'DIV' && ![...n.children].some(c => /^(P|DIV|UL|OL|TABLE|H\d)$/.test(c.tagName)) && n !== ed && !n.closest('.toc,.fnlist')) ? 1 : 3 });
  let n; while ((n = w.nextNode())) if (r.intersectsNode(n)) out.push(n);
  if (!out.length) { let b = r.startContainer; while (b && b !== ed && !(b.nodeType === 1 && /^(P|H[1-6]|LI|PRE|DIV)$/.test(b.tagName))) b = b.parentNode; if (b && b !== ed) out.push(b); } return out; }
function spacing(v){ const bs = blocksInSelection(); if (!bs.length) { status('Click in a paragraph first.'); return; } bs.forEach(b => { b.style.lineHeight = String(+(v * 1.25).toFixed(3)); b.dataset.ls = v; }); changed(); status(`Line spacing ${v} on ${bs.length} paragraph${bs.length > 1 ? 's' : ''}.`); }
function after(pt){ const bs = blocksInSelection(); if (!bs.length) { status('Click in a paragraph first.'); return; } bs.forEach(b => { b.style.marginBottom = pt + 'pt'; b.dataset.sa = pt; }); changed(); }

/* ---------- contents page ---------- */
function insertToc(){ exec('insertHTML', '<div class="toc" contenteditable="false"></div><p><br></p>'); updateToc(); status('Contents added from your headings. Review › Update contents refreshes it; Word fills in page numbers when it opens the file.', 8000); }
function updateToc(){ ed.querySelectorAll('.toc').forEach(t => { const hs = [...ed.querySelectorAll('h1:not(.title),h2,h3')].filter(h => !h.closest('.toc'));
  t.innerHTML = `<p class="toc-h">Contents</p>` + (hs.length ? hs.map((h, i) => { h.id ||= 'h-' + Math.random().toString(36).slice(2, 8); return `<div class="toc-e" data-lvl="${h.tagName[1]}" data-to="${h.id}">${esc(h.textContent.trim() || 'Untitled')}</div>`; }).join('') : '<p class="muted">Add headings (Heading 1, 2 or 3) and update the contents.</p>'); }); changed(); }
ed.addEventListener('click', e => { const t = e.target.closest('.toc-e'); if (t) { document.getElementById(t.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });

/* ---------- footnotes ---------- */
async function insertFootnote(){ const r = saved?.cloneRange(); const note = await ask('Footnote', 'Footnote text'); if (!note) return; saved = r;
  if (!r || !ed.contains(r.startContainer)) { status('Click in the text where the footnote number should go.'); return; }
  const at = r.cloneRange(); at.collapse(false); const span = document.createElement('span'); span.className = 'fn'; span.contentEditable = 'false'; span.dataset.note = note; span.textContent = '*';
  const after = document.createTextNode('\u200b'); at.insertNode(after); at.insertNode(span); const s = getSelection(), c = document.createRange(); c.setStart(after, 1); c.collapse(true); s.removeAllRanges(); s.addRange(c); renumber(); changed(); }
function renumber(){
  const fns = [...ed.querySelectorAll('span.fn')]; fns.forEach((f, i) => f.textContent = String(i + 1));
  let list = ed.querySelector('.fnlist'); if (!fns.length) { list?.remove(); return; }
  if (!list) { list = document.createElement('div'); list.className = 'fnlist'; list.contentEditable = 'false'; }
  ed.append(list); list.innerHTML = '<hr><ol>' + fns.map(f => `<li>${esc(f.dataset.note)}</li>`).join('') + '</ol>';
}
ed.addEventListener('click', async e => { const f = e.target.closest('span.fn'); if (!f) return; const r = await modal('Footnote ' + f.textContent, `<label class="kf"><textarea name="v" rows="3">${esc(f.dataset.note)}</textarea></label>`, [['del', 'Delete footnote'], ['cancel', 'Cancel'], ['ok', 'Save']]);
  if (!r) return; if (r.button === 'del') f.remove(); else f.dataset.note = r.v.trim(); renumber(); changed(); });
let rt; ed.addEventListener('input', () => { clearTimeout(rt); rt = setTimeout(() => { if (ed.querySelector('span.fn') || ed.querySelector('.fnlist')) renumber(); drawComments(); }, 400); });

/* ---------- comments ---------- */
const pane = document.createElement('aside'); pane.className = 'wp-cmts'; pane.hidden = true; pane.innerHTML = '<div class="pt-dh"><b>Comments</b><button class="tb" data-x aria-label="Close">✕</button></div><div class="wp-cl"></div>'; $('#wstage').append(pane);
pane.querySelector('[data-x]').onclick = () => pane.hidden = true;
function toggleComments(){ pane.hidden = !pane.hidden; drawComments(); }
function drawComments(){ if (pane.hidden) return; const cs = [...ed.querySelectorAll('span.cmt')];
  pane.querySelector('.wp-cl').innerHTML = cs.length ? cs.map((c, i) => `<div class="wp-c" data-i="${i}"><q>${esc(c.textContent.slice(0, 60))}</q><p>${esc(c.dataset.c)}</p><small>${esc(c.dataset.a || '')} · ${esc(new Date(c.dataset.d).toLocaleString())}</small><div><button class="btn" data-ed="${i}">Edit</button><button class="btn" data-rs="${i}">Resolve</button></div></div>`).join('') : '<p class="muted">No comments. Select some text, then Insert › Comment.</p>';
  pane.querySelectorAll('.wp-c').forEach(el => el.onclick = async e => { const c = cs[+el.dataset.i]; if (e.target.dataset.rs != null) { c.replaceWith(...c.childNodes); changed(); drawComments(); return; }
    if (e.target.dataset.ed != null) { const t = await ask('Edit comment', 'Comment', c.dataset.c, true); if (t) { c.dataset.c = t; changed(); drawComments(); } return; }
    c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1200); }); }
async function addComment(){
  const r = saved?.cloneRange(); if (!r || r.collapsed) { status('Select the text you want to comment on first.'); return; }
  let a = r.commonAncestorContainer; if (a.nodeType === 3) a = a.parentNode; if (a === ed || [...a.querySelectorAll?.('p,h1,h2,h3,li,div,table') || []].length) { status('Select text within one paragraph to comment on it.'); return; }
  let author = ''; try { author = localStorage.getItem('termite.author') || ''; } catch (e) {}
  if (!author) { author = await ask('Your name', 'Name shown on your comments', '') || 'Reviewer'; try { localStorage.setItem('termite.author', author); } catch (e) {} }
  const text = await ask('Comment', 'Your comment', '', true); if (!text) return;
  const span = document.createElement('span'); span.className = 'cmt'; span.dataset.c = text; span.dataset.a = author; span.dataset.d = new Date().toISOString(); span.title = author + ': ' + text;
  span.append(r.extractContents()); r.insertNode(span); changed(); pane.hidden = false; drawComments(); status('Comment added. It saves into the Word file as a real Word comment.');
}

/* ---------- symbols, date, signature line ---------- */
const SYMS = '© ® ™ € £ $ ¥ ¢ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π Ω µ α β γ Δ θ λ σ → ← ↑ ↓ ↔ ⇒ ✓ ✗ ★ ☆ • · … – — ‘ ’ “ ” « » § ¶ † ‡ ½ ¼ ¾ ⅓ ² ³ ¹ ‰ № ☐ ☑ ♀ ♂ ☎ ✉ ♪ ☀ ☂ ⚓ 🌴'.split(' ');
async function symbols(){ const r = saved?.cloneRange(); const pick = await new Promise(res => { modal('Symbol', `<div class="wp-syms">${SYMS.map(s => `<button type="button" class="tb" data-s="${s}">${s}</button>`).join('')}</div>`, [['cancel', 'Close']]).then(() => res(null));
    dlg.querySelector('.wp-syms').onclick = e => { const s = e.target.dataset.s; if (s) { dlg.close(); res(s); } }; }); if (!pick) return; saved = r; exec('insertText', pick); }
function insertDate(){ exec('insertText', new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); }
function sigLine(){ exec('insertHTML', '<p><br></p><p>______________________________<br>Signature</p><p>Name: ______________________ Date: ______________</p><p><br></p>'); }

/* ---------- change case ---------- */
function recase(fn){ restore(); const s = getSelection(); const t = s.toString(); if (!t) { status('Select some text first.'); return; } document.execCommand('insertText', false, fn(t)); changed(); }

/* ---------- format painter ---------- */
let paint = null; const pb = $('#wp-paint');
pb.onclick = () => { if (paint) { paint = null; pb.setAttribute('aria-pressed', 'false'); ed.classList.remove('painting'); return; }
  const n = saved?.startContainer; const el = n && (n.nodeType === 1 ? n : n.parentElement); if (!el || !ed.contains(el)) { status('Click in text with the formatting you want to copy.'); return; }
  const cs = getComputedStyle(el); const deco = []; for (let a = el; a && a !== ed; a = a.parentElement) deco.push(getComputedStyle(a).textDecorationLine, a.tagName);
  paint = { b: parseInt(cs.fontWeight) >= 600, i: cs.fontStyle === 'italic', u: deco.some(d => /underline|^U$/.test(d)), s: deco.some(d => /line-through|^S$|^STRIKE$/.test(d)), color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), size: Math.round(parseFloat(cs.fontSize) * .75), bg: (() => { for (let a = el; a && a !== ed; a = a.parentElement) { const b = getComputedStyle(a).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return null; })() };
  pb.setAttribute('aria-pressed', 'true'); ed.classList.add('painting'); status('Now select the text to paint the formatting on.'); };
ed.addEventListener('mouseup', () => setTimeout(() => { if (!paint) return; const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return; const p = paint; paint = null; pb.setAttribute('aria-pressed', 'false'); ed.classList.remove('painting');
  document.execCommand('styleWithCSS', false, true); document.execCommand('removeFormat'); if (p.b) document.execCommand('bold'); if (p.i) document.execCommand('italic'); if (p.u) document.execCommand('underline'); if (p.s) document.execCommand('strikeThrough');
  document.execCommand('foreColor', false, p.color); if (p.bg) document.execCommand('hiliteColor', false, p.bg); document.execCommand('fontName', false, p.family);
  document.execCommand('fontSize', false, '7'); ed.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach(el => { if (el.tagName === 'FONT') { const sp = document.createElement('span'); sp.append(...el.childNodes); el.replaceWith(sp); el = sp; } el.style.fontSize = p.size + 'pt'; });
  changed(); status('Formatting painted.'); }, 10));

/* ---------- table tools ---------- */
function table(op){
  restore(); let c = saved?.startContainer; while (c && c !== ed && !(c.nodeType === 1 && /^(TD|TH)$/.test(c.tagName))) c = c.parentNode;
  if (!c || c === ed) { status('Click inside a table cell first.'); return; }
  const row = c.parentElement, tab = row.closest('table'), idx = [...row.children].indexOf(c), blank = tag => { const x = document.createElement(tag); x.innerHTML = '<br>'; return x; };
  if (op === 'rowA' || op === 'rowB') { const nr = document.createElement('tr'); [...row.children].forEach(() => nr.append(blank('td'))); row[op === 'rowA' ? 'before' : 'after'](nr); }
  if (op === 'colL' || op === 'colR') for (const r of tab.rows) { const ref = r.children[Math.min(idx, r.children.length - 1)], tag = ref?.tagName === 'TH' && r === tab.rows[0] ? 'th' : 'td'; ref ? ref[op === 'colL' ? 'before' : 'after'](blank(tag)) : r.append(blank(tag)); }
  if (op === 'delRow') { if (tab.rows.length === 1) tab.remove(); else row.remove(); }
  if (op === 'delCol') { if (row.children.length === 1) tab.remove(); else for (const r of tab.rows) r.children[idx]?.remove(); }
  if (op === 'delTab') tab.remove();
  if (op === 'hdrRow') [...tab.rows[0].children].forEach(x => { if (x.tagName === 'TD') { const th = document.createElement('th'); th.innerHTML = x.innerHTML; x.replaceWith(th); } });
  changed();
}

/* ---------- AI writing help ---------- */
const GOALS = { improve: 'Improve the writing: clearer, smoother and more engaging, same meaning and length', fix: 'Fix spelling, grammar and punctuation only; change nothing else', short: 'Make it about half as long, keeping every key point', long: 'Expand it to about twice the length with useful detail; don\'t invent facts', formal: 'Rewrite in a more formal, professional tone', friendly: 'Rewrite in a warmer, friendlier tone', summary: 'Summarise it in a short paragraph followed by 3-5 bullet points (use "- " for bullets)', continue: 'Continue writing from where it ends, matching the style, for about two paragraphs' };
async function ai(kind){
  const m = await import('./kiosk/ai.js'); if (!(await m.usable()).length) { status('Connect an AI first: Kiosk › AI settings (free keys from Groq, Gemini or OpenRouter), or use Termite inside Claude.', 9000); return; }
  const r = saved?.cloneRange(); let text = r && !r.collapsed ? r.toString() : ''; const whole = !text;
  if (whole && !['summary', 'continue', 'ask'].includes(kind)) { status('Select the text you want the AI to work on.'); return; }
  if (whole) text = ed.innerText.slice(-12000);
  let goal = GOALS[kind];
  if (kind === 'translate') { const lang = await ask('Translate', 'Into which language?', 'Spanish'); if (!lang) return; goal = `Translate into ${lang}, natural and accurate`; }
  if (kind === 'ask') { const q = await ask('Ask AI', whole ? 'What should the AI write or do?' : 'What should the AI do with the selected text?', '', true); if (!q) return; goal = q; }
  status('Writing…', 0);
  let out; try { out = (await m.ask(`${goal}.\n\nReturn only the resulting text (no preamble, no quotes). Separate paragraphs with a blank line.\n\nTEXT:\n${text}`, { maxTokens: 3000 })).text.trim(); } catch (e) { status(e.message, 9000); return; }
  $('#status').classList.add('hide');
  const res = await modal('AI suggestion', `<label class="kf"><textarea name="v" rows="12" class="pt-text">${esc(out)}</textarea></label>`, kind === 'continue' || whole ? [['copy', 'Copy'], ['cancel', 'Cancel'], ['below', 'Insert']] : [['copy', 'Copy'], ['below', 'Insert below'], ['cancel', 'Cancel'], ['replace', 'Replace selection']], true);
  if (!res) return; const html = res.v.split(/\n{2,}/).map(p => /^\s*[-•]\s/m.test(p) ? '<ul>' + p.split('\n').map(l => `<li>${esc(l.replace(/^\s*[-•]\s*/, ''))}</li>`).join('') + '</ul>' : `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  if (res.button === 'copy') { try { await navigator.clipboard.writeText(res.v); status('Copied.'); } catch (e) { status('Select the text and copy it.'); } return; }
  saved = r; restore();
  if (res.button === 'replace') { if (!/\n\n/.test(res.v) && !/^\s*[-•]\s/m.test(res.v)) document.execCommand('insertText', false, res.v); else document.execCommand('insertHTML', false, html); }
  else { const s = getSelection(); if (whole || !s.rangeCount) { const rr = document.createRange(); rr.selectNodeContents(ed); rr.collapse(false); const fl = ed.querySelector('.fnlist'); if (fl) rr.setStartBefore(fl); s.removeAllRanges(); s.addRange(rr); } else { s.collapseToEnd(); let b = s.anchorNode; while (b && b.parentNode !== ed) b = b.parentNode; if (b) { const rr = document.createRange(); rr.setStartAfter(b); s.removeAllRanges(); s.addRange(rr); } } document.execCommand('insertHTML', false, html); }
  changed();
}

/* ---------- review: read aloud, stats ---------- */
let reading = null;
async function readAloud(){
  if (reading) { reading.stop(); reading = null; status('Stopped reading.'); return; }
  const r = saved; const text = (r && !r.collapsed ? r.toString() : ed.innerText).trim(); if (!text) return;
  let tts = null; try { if (window.claude?.use) tts = await window.claude.use('tts'); } catch (e) {}
  if (tts) { reading = { stop: () => tts.stop() }; const lines = text.split(/\n+/).filter(Boolean).map(t => ({ text: t.slice(0, 1900) })); status('Reading aloud… choose Review › Read aloud again to stop.', 4000); try { await tts.speak(lines); } catch (e) {} reading = null; return; }
  if (!window.speechSynthesis) { status('This device can\'t read aloud.'); return; }
  speechSynthesis.cancel(); text.split(/(?<=[.!?])\s+/).forEach(s => speechSynthesis.speak(new SpeechSynthesisUtterance(s))); reading = { stop: () => speechSynthesis.cancel() };
  status('Reading aloud… choose Review › Read aloud again to stop.', 4000); const t = setInterval(() => { if (!speechSynthesis.speaking) { clearInterval(t); reading = null; } }, 1000);
}
async function stats(){ const t = ed.innerText || '', w = (t.match(/\S+/g) || []).length, s = (t.match(/[^.!?]+[.!?]+/g) || []).length, p = [...ed.querySelectorAll('p,li,h1,h2,h3')].filter(x => x.textContent.trim()).length;
  await modal('Word count', `<table class="wp-stats"><tr><th>Words</th><td>${w.toLocaleString()}</td></tr><tr><th>Characters (no spaces)</th><td>${t.replace(/\s/g, '').length.toLocaleString()}</td></tr><tr><th>Characters (with spaces)</th><td>${t.length.toLocaleString()}</td></tr><tr><th>Paragraphs</th><td>${p}</td></tr><tr><th>Sentences</th><td>${s}</td></tr><tr><th>Reading time</th><td>about ${Math.max(1, Math.round(w / 230))} min</td></tr><tr><th>Speaking time</th><td>about ${Math.max(1, Math.round(w / 140))} min</td></tr><tr><th>Footnotes / comments</th><td>${ed.querySelectorAll('span.fn').length} / ${ed.querySelectorAll('span.cmt').length}</td></tr></table>`, [['ok', 'Close']]); }

/* ---------- print ---------- */
$('#wp-print').onclick = () => {
  if (window.claude) { status('Claude pages can\'t print. Use Make PDF and print that from your device, or use the Termite app.', 8000); return; }
  if (window.TermiteAndroid) { status('To print on Android, use Make PDF, then Share it to your printer app.', 8000); return; }
  let area = $('#print-area'); if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.append(area); }
  let [w, h] = IN[ps.size] || IN.A4; if (ps.orient === 'landscape') [w, h] = [h, w];
  let st = $('#wp-print-style'); if (!st) { st = document.createElement('style'); st.id = 'wp-print-style'; document.head.append(st); }
  st.textContent = `@page{size:${w}in ${h}in;margin:${ps.margins[0]}in ${ps.margins[1]}in ${ps.margins[2]}in ${ps.margins[3]}in}`;
  area.innerHTML = `<div class="paper printing" style="position:static;width:auto;padding:0;column-count:${ps.cols > 1 ? ps.cols : 'auto'}">${ed.innerHTML}</div>`;
  area.querySelectorAll('hr.pb').forEach(x => { x.style.breakAfter = 'page'; x.style.border = '0'; });
  setTimeout(() => { window.print(); setTimeout(() => area.innerHTML = '', 1000); }, 100);
};

/* ---------- start ---------- */
applyPage(); renumber();
$('#w-name').addEventListener('change', applyPage);
export default { applyPage };
