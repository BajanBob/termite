// Harry the Accountant: a spreadsheet with an AI accountant who works on it for you.
import { parse, evaluate, shiftFormula, literal, isErr, colName, colIndex, addr, parseAddr, parseRange, fromSerial, FUNCTIONS } from './formula.js';

const ROWS = 200, COLS = 26;
export function mount(root, K){
  const $ = s => root.querySelector(s);
  const blankSheet = name => ({ name, cells: {}, rows: ROWS, cols: COLS, charts: [], widths: {} });
  let wb = { sheets: [blankSheet('Sheet1')], cur: 0, currency: '$' }, fileName = 'Harry workbook';
  try { const d = JSON.parse(localStorage.getItem('termite.harry') || 'null'); if (d?.sheets?.length) { wb = d; fileName = d.fileName || fileName; } } catch (e) {}
  const S = () => wb.sheets[wb.cur];
  let sel = { r0: 0, c0: 0, r1: 0, c1: 0 }, act = { r: 0, c: 0 }, editing = null, undo = [], redo = [];

  root.innerHTML = `
  <div class="k-head"><div><h2>Harry the Accountant</h2><p>Give Harry your files and tell him the job. He builds the workbook with real formulas you can check.</p></div>
    <div class="k-acts"><button class="kb" data-a="toolkit">Financial analysis ▾</button><button class="kb primary" data-a="agent">Ask Harry</button></div></div>
  <div class="k-tool" role="toolbar" aria-label="Spreadsheet">
    <input class="k-name" id="h-file" aria-label="Workbook name">
    <button class="kb" data-a="new">New</button><button class="kb" data-a="open">Open</button><input type="file" id="h-open" accept=".xlsx,.csv,.txt" hidden>
    <button class="kb primary" data-a="save">Save .xlsx</button><button class="kb" data-a="csv">CSV</button><button class="kb" data-a="share">Share</button>
    <span class="k-sep"></span>
    <button class="kb ic" data-a="undo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button class="kb ic" data-a="redo" title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>
    <button class="kb ic" data-a="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
    <select id="h-fmt" aria-label="Number format"><option value="">General</option><option value="number">1,234.56</option><option value="integer">1,235</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="date">Date</option></select>
    <label class="kb ic swatch" title="Fill colour"><span>■</span><input type="color" id="h-fill" value="#fff2cc"></label>
    <button class="kb ic" data-a="nofill" title="No fill" aria-label="No fill">⌫</button>
    <button class="kb" data-a="sum" title="AutoSum">Σ Sum</button>
    <span class="k-sep"></span>
    <button class="kb" data-a="chart">Chart</button><button class="kb" data-a="forecast">Forecast</button><button class="kb" data-a="anom">Find anomalies</button><button class="kb" data-a="insight">Explain</button>
  </div>
  <div class="h-fx"><input id="h-addr" aria-label="Cell" readonly><span class="fx">fx</span><input id="h-bar" aria-label="Cell contents" placeholder="Type a value, or a formula like =SUM(B2:B10)" list="h-fns" autocomplete="off"><datalist id="h-fns">${FUNCTIONS.map(f => `<option value="=${f}(">`).join('')}</datalist></div>
  <div class="h-body">
    <div class="h-main">
      <div class="h-grid" id="h-grid" tabindex="0" aria-label="Spreadsheet grid"></div>
      <div class="h-charts" id="h-charts"></div>
      <div class="h-foot"><div class="h-tabs" id="h-tabs"></div><div class="h-stat" id="h-stat" aria-live="polite"></div></div>
    </div>
    <aside class="h-agent" id="h-agent" hidden>
      <div class="ag-head"><b>Harry</b><span class="muted">Your agentic accountant</span><button class="kb ic" data-a="agent" aria-label="Close">✕</button></div>
      <div class="ag-log" id="h-log"><div class="msg harry">Good day! Give me your bank statements, sales records or trial balance (Excel, CSV, PDF or Word), then tell me what you need: a P&amp;L, a budget, a cash-flow forecast, a reconciliation, ratios. I'll build it here with formulas so every number can be checked.</div></div>
      <div class="ag-files" id="h-files"></div>
      <textarea id="h-ask" rows="3" placeholder="e.g. Build a monthly profit and loss from the attached sales and expenses, with totals and a margin %."></textarea>
      <div class="ag-row"><label class="kb">Attach files<input type="file" id="h-attach" multiple hidden accept=".xlsx,.csv,.txt,.pdf,.docx,.md,.json"></label><button class="kb primary" id="h-run">Run</button><button class="kb" id="h-stop" hidden>Stop</button></div>
    </aside>
  </div>
  <div class="k-menu" id="h-kit" hidden></div>`;

  /* ---------- evaluation ---------- */
  const astCache = new Map(); let vcache = new Map(), stack = new Set();
  const sheetBy = name => name == null ? null : wb.sheets.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  function valueAt(si, r, c){
    const sh = wb.sheets[si]; if (!sh) return { err: '#REF!' };
    const key = si + ':' + r + ':' + c; if (vcache.has(key)) return vcache.get(key);
    const cell = sh.cells[addr(r, c)]; let v = '';
    if (cell) {
      const raw = cell.raw;
      if (typeof raw === 'string' && raw[0] === '=' && raw.length > 1) {
        if (stack.has(key)) return { err: '#CIRC!' };
        stack.add(key);
        try { let ast = astCache.get(raw); if (!ast) { try { ast = parse(raw.slice(1)); } catch (e) { ast = { k: 'errlit', v: '#NAME?' }; } astCache.set(raw, ast); }
          v = evaluate(ast, { get: (sn, rr, cc) => { const i = sn == null ? si : sheetBy(sn); return i < 0 ? { err: '#REF!' } : valueAt(i, rr, cc); } });
          if (Array.isArray(v)) v = v[0]?.[0] ?? ''; if (v === undefined || v === null) v = 0;
        } finally { stack.delete(key); }
      } else v = raw ?? '';
    }
    vcache.set(key, v); return v;
  }
  const value = (r, c) => valueAt(wb.cur, r, c);
  const show = (v, fmt) => {
    if (isErr(v)) return v.err; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (v === '' || v == null) return '';
    if (typeof v !== 'number') return String(v);
    if (fmt === 'currency') return (v < 0 ? '-' : '') + wb.currency + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (fmt === 'number') return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (fmt === 'integer') return Math.round(v).toLocaleString('en-US');
    if (fmt === 'percent') return (v * 100).toFixed(2) + '%';
    if (fmt === 'date') { const d = fromSerial(v); return isNaN(d) ? String(v) : d.toISOString().slice(0, 10); }
    return Math.abs(v) >= 1e11 || (Math.abs(v) < 1e-6 && v !== 0) ? v.toExponential(4) : String(+v.toPrecision(11));
  };

  /* ---------- grid ---------- */
  const grid = $('#h-grid'); let tds = [];
  function build(){
    const sh = S(); grow(sh);
    let tw = 44; for (let c = 0; c < sh.cols; c++) tw += sh.widths[c] || 96;
    let h = `<table class="h-tab" style="width:${tw}px"><colgroup><col style="width:44px">${[...Array(sh.cols)].map((_, c) => `<col style="width:${sh.widths[c] || 96}px">`).join('')}</colgroup><thead><tr><th class="corner"></th>`;
    for (let c = 0; c < sh.cols; c++) h += `<th class="ch" data-c="${c}" style="width:${sh.widths[c] || 96}px">${colName(c)}<i class="rz" data-c="${c}"></i></th>`;
    h += '</tr></thead><tbody>';
    for (let r = 0; r < sh.rows; r++) { h += `<tr><th class="rh" data-r="${r}">${r + 1}</th>`; for (let c = 0; c < sh.cols; c++) h += `<td data-r="${r}" data-c="${c}"></td>`; h += '</tr>'; }
    grid.innerHTML = h + '</tbody></table>';
    tds = []; grid.querySelectorAll('td').forEach(td => { (tds[+td.dataset.r] ||= [])[+td.dataset.c] = td; });
    paint(); tabs(); charts();
  }
  function grow(sh){ let mr = 0, mc = 0; for (const a in sh.cells) { const p = parseAddr(a); if (p) { mr = Math.max(mr, p.r); mc = Math.max(mc, p.c); } } sh.rows = Math.max(sh.rows, ROWS, mr + 20); sh.cols = Math.max(sh.cols, COLS, mc + 3); }
  function paint(){
    vcache = new Map(); const sh = S();
    for (let r = 0; r < tds.length; r++) for (let c = 0; c < tds[r].length; c++) {
      const td = tds[r][c], cell = sh.cells[addr(r, c)];
      if (!cell) { if (td.textContent || td.className || td.style.cssText) { td.textContent = ''; td.className = ''; td.style.cssText = ''; } continue; }
      const v = value(r, c); td.textContent = show(v, cell.fmt);
      td.className = (typeof v === 'number' ? 'n' : '') + (isErr(v) ? ' err' : '') + (cell.b ? ' b' : '');
      td.style.background = cell.bg || '';
    }
    paintSel(); save();
  }
  function paintSel(){
    grid.querySelectorAll('.sel,.act').forEach(e => e.classList.remove('sel', 'act'));
    for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) tds[r]?.[c]?.classList.add('sel');
    tds[act.r]?.[act.c]?.classList.add('act');
    $('#h-addr').value = sel.r0 === sel.r1 && sel.c0 === sel.c1 ? addr(act.r, act.c) : addr(sel.r0, sel.c0) + ':' + addr(sel.r1, sel.c1);
    const cell = S().cells[addr(act.r, act.c)]; if (!editing) $('#h-bar').value = cell ? String(cell.raw ?? '') : '';
    $('#h-fmt').value = cell?.fmt || '';
    const ns = []; for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) { const v = value(r, c); if (typeof v === 'number') ns.push(v); }
    $('#h-stat').textContent = ns.length > 1 ? `Sum ${show(ns.reduce((a, b) => a + b, 0))} · Average ${show(ns.reduce((a, b) => a + b, 0) / ns.length)} · Count ${ns.length}` : '';
  }
  const ensureVisible = () => tds[act.r]?.[act.c]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  /* ---------- changes and history ---------- */
  function snapshot(){ undo.push(JSON.stringify(wb)); if (undo.length > 60) undo.shift(); redo = []; }
  function setRaw(sh, a, raw, keep = true){
    const old = sh.cells[a] || {}; const empty = raw === '' || raw == null;
    if (empty && !old.b && !old.bg && !old.fmt) { delete sh.cells[a]; return; }
    const v = typeof raw === 'string' && raw[0] === '=' ? raw : literal(raw);
    sh.cells[a] = { ...(keep ? old : {}), raw: empty ? '' : v };
    if (!old.fmt && typeof raw === 'string') { if (/%\s*$/.test(raw) && typeof v === 'number') sh.cells[a].fmt = 'percent'; else if (/^[-(]?[$£€]/.test(raw.trim()) && typeof v === 'number') sh.cells[a].fmt = 'currency'; else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw.trim())) sh.cells[a].fmt = 'date'; }
  }
  function commit(raw){ snapshot(); setRaw(S(), addr(act.r, act.c), raw); const sh = S(); if (act.r >= sh.rows - 5 || act.c >= sh.cols - 2) build(); else paint(); }
  function selCells(fn){ snapshot(); const sh = S(); for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) fn(sh, addr(r, c)); paint(); }
  let saveT; function save(){ clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('termite.harry', JSON.stringify({ ...wb, fileName })); } catch (e) {} }, 500); }

  /* ---------- editing ---------- */
  function startEdit(initial){
    const td = tds[act.r][act.c]; editing = document.createElement('input'); editing.className = 'h-edit';
    const cell = S().cells[addr(act.r, act.c)]; editing.value = initial ?? (cell ? String(cell.raw ?? '') : '');
    const g = grid.getBoundingClientRect(), b = td.getBoundingClientRect();
    Object.assign(editing.style, { left: b.left - g.left + grid.scrollLeft + 'px', top: b.top - g.top + grid.scrollTop + 'px', minWidth: b.width + 'px', height: b.height + 'px' });
    grid.append(editing); editing.focus(); if (initial == null) editing.select();
    editing.addEventListener('input', () => $('#h-bar').value = editing.value);
    editing.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); endEdit(true); move(e.key === 'Tab' ? 0 : e.shiftKey ? -1 : 1, e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0); }
      else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
    });
    editing.addEventListener('blur', () => setTimeout(() => editing && document.activeElement !== editing && endEdit(true), 150));
  }
  function endEdit(keep){ if (!editing) return; const v = editing.value; editing.remove(); editing = null; if (keep) commit(v); grid.focus({ preventScroll: true }); paintSel(); }
  function move(dr, dc, extend){
    const sh = S(); act = { r: Math.min(sh.rows - 1, Math.max(0, act.r + dr)), c: Math.min(sh.cols - 1, Math.max(0, act.c + dc)) };
    if (extend) { sel = { r0: Math.min(anchor.r, act.r), c0: Math.min(anchor.c, act.c), r1: Math.max(anchor.r, act.r), c1: Math.max(anchor.c, act.c) }; }
    else { sel = { r0: act.r, c0: act.c, r1: act.r, c1: act.c }; anchor = { ...act }; }
    paintSel(); ensureVisible();
  }
  let anchor = { r: 0, c: 0 }, dragging = false;
  grid.addEventListener('mousedown', e => {
    if (e.target.classList.contains('rz')) return startResize(e);
    const td = e.target.closest('td'), th = e.target.closest('th');
    if (editing && td && editing.value.startsWith('=') && /[(,+\-*/^&=<>:]$/.test(editing.value)) { e.preventDefault(); editing.value += addr(+td.dataset.r, +td.dataset.c); $('#h-bar').value = editing.value; editing.focus(); return; }
    if (editing) endEdit(true);
    if (td) { const r = +td.dataset.r, c = +td.dataset.c; if (e.shiftKey) { act = { r, c }; sel = { r0: Math.min(anchor.r, r), c0: Math.min(anchor.c, c), r1: Math.max(anchor.r, r), c1: Math.max(anchor.c, c) }; } else { act = anchor = { r, c }; sel = { r0: r, c0: c, r1: r, c1: c }; } dragging = true; paintSel(); }
    else if (th?.dataset.c) { const c = +th.dataset.c; act = anchor = { r: 0, c }; sel = { r0: 0, c0: c, r1: S().rows - 1, c1: c }; paintSel(); }
    else if (th?.dataset.r) { const r = +th.dataset.r; act = anchor = { r, c: 0 }; sel = { r0: r, c0: 0, r1: r, c1: S().cols - 1 }; paintSel(); }
  });
  grid.addEventListener('mouseover', e => { if (!dragging) return; const td = e.target.closest('td'); if (!td) return; const r = +td.dataset.r, c = +td.dataset.c; sel = { r0: Math.min(anchor.r, r), c0: Math.min(anchor.c, c), r1: Math.max(anchor.r, r), c1: Math.max(anchor.c, c) }; paintSel(); });
  addEventListener('mouseup', () => dragging = false);
  grid.addEventListener('dblclick', e => { if (e.target.closest('td')) startEdit(); });
  function startResize(e){ e.preventDefault(); const c = +e.target.dataset.c, th = e.target.parentElement, x0 = e.clientX, w0 = th.offsetWidth;
    const col = grid.querySelectorAll('col')[c + 1], tab = grid.querySelector('table'), t0 = tab.offsetWidth;
    const mv = ev => { const w = Math.max(40, w0 + ev.clientX - x0); th.style.width = w + 'px'; if (col) col.style.width = w + 'px'; tab.style.width = t0 + (w - w0) + 'px'; S().widths[c] = w; }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); save(); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up); }
  grid.addEventListener('keydown', e => {
    if (editing) return; const m = e.ctrlKey || e.metaKey, k = e.key;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) { e.preventDefault(); move(...arrows[k], e.shiftKey); }
    else if (k === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); } else if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (k === 'F2') { e.preventDefault(); startEdit(); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); selCells((sh, a) => { if (sh.cells[a]) { sh.cells[a].raw = ''; if (!sh.cells[a].b && !sh.cells[a].bg && !sh.cells[a].fmt) delete sh.cells[a]; } }); }
    else if (m && k.toLowerCase() === 'z') { e.preventDefault(); act_('undo'); } else if (m && k.toLowerCase() === 'y') { e.preventDefault(); act_('redo'); }
    else if (m && k.toLowerCase() === 'b') { e.preventDefault(); act_('bold'); }
    else if (m && k.toLowerCase() === 'd') { e.preventDefault(); fill(1, 0); } else if (m && k.toLowerCase() === 'r') { e.preventDefault(); fill(0, 1); }
    else if (m && k.toLowerCase() === 'a') { e.preventDefault(); sel = { r0: 0, c0: 0, r1: S().rows - 1, c1: S().cols - 1 }; paintSel(); }
    else if (!m && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(k); }
  });
  function fill(down, right){ const sh = S(); snapshot();
    if (down) for (let c = sel.c0; c <= sel.c1; c++) { const src = sh.cells[addr(sel.r0, c)]; for (let r = sel.r0 + 1; r <= sel.r1; r++) { if (!src) { delete sh.cells[addr(r, c)]; continue; } sh.cells[addr(r, c)] = { ...src, raw: shiftFormula(src.raw, r - sel.r0, 0) }; } }
    if (right) for (let r = sel.r0; r <= sel.r1; r++) { const src = sh.cells[addr(r, sel.c0)]; for (let c = sel.c0 + 1; c <= sel.c1; c++) { if (!src) { delete sh.cells[addr(r, c)]; continue; } sh.cells[addr(r, c)] = { ...src, raw: shiftFormula(src.raw, 0, c - sel.c0) }; } }
    paint(); }

  /* ---------- clipboard ---------- */
  let clip = null;
  grid.addEventListener('copy', e => { if (editing) return; e.preventDefault(); const sh = S(); const rows = [];
    for (let r = sel.r0; r <= sel.r1; r++) { const row = []; for (let c = sel.c0; c <= sel.c1; c++) row.push(show(value(r, c), sh.cells[addr(r, c)]?.fmt)); rows.push(row.join('\t')); }
    const text = rows.join('\n'); e.clipboardData.setData('text/plain', text);
    clip = { text, r0: sel.r0, c0: sel.c0, cells: [...Array(sel.r1 - sel.r0 + 1)].map((_, i) => [...Array(sel.c1 - sel.c0 + 1)].map((_, j) => sh.cells[addr(sel.r0 + i, sel.c0 + j)] ? { ...sh.cells[addr(sel.r0 + i, sel.c0 + j)] } : null)) }; });
  grid.addEventListener('paste', e => { if (editing) return; e.preventDefault(); const text = e.clipboardData.getData('text/plain'); const sh = S(); snapshot();
    if (clip && clip.text === text) clip.cells.forEach((row, i) => row.forEach((cell, j) => { const a = addr(act.r + i, act.c + j); if (cell) sh.cells[a] = { ...cell, raw: shiftFormula(cell.raw, act.r - clip.r0, act.c - clip.c0) }; else delete sh.cells[a]; }));
    else text.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, i) => line.split('\t').forEach((v, j) => setRaw(sh, addr(act.r + i, act.c + j), v)));
    build(); });

  /* ---------- formula bar ---------- */
  $('#h-bar').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit($('#h-bar').value); move(1, 0); grid.focus(); } if (e.key === 'Escape') { paintSel(); grid.focus(); } });
  $('#h-fmt').onchange = e => { const f = e.target.value; selCells((sh, a) => { sh.cells[a] = { ...(sh.cells[a] || { raw: '' }), fmt: f || undefined }; }); grid.focus(); };
  $('#h-fill').oninput = e => selCells((sh, a) => { sh.cells[a] = { ...(sh.cells[a] || { raw: '' }), bg: e.target.value }; });
  $('#h-file').value = fileName; $('#h-file').onchange = e => { fileName = e.target.value.trim() || 'Harry workbook'; save(); };

  /* ---------- tabs ---------- */
  function tabs(){
    const t = $('#h-tabs'); t.innerHTML = '';
    wb.sheets.forEach((s, i) => { const b = document.createElement('button'); b.className = 'h-sheet' + (i === wb.cur ? ' on' : ''); b.textContent = s.name; b.title = 'Double-click to rename';
      b.onclick = () => { if (i !== wb.cur) { wb.cur = i; sel = { r0: 0, c0: 0, r1: 0, c1: 0 }; act = anchor = { r: 0, c: 0 }; build(); } };
      b.ondblclick = async () => { const n = await K.prompt('Rename sheet', s.name); if (n && !wb.sheets.some((x, j) => j !== i && x.name.toLowerCase() === n.toLowerCase())) { s.name = n; tabs(); save(); } };
      t.append(b); });
    const add = document.createElement('button'); add.className = 'h-sheet add'; add.textContent = '+'; add.title = 'Add a sheet'; add.onclick = () => { snapshot(); wb.sheets.push(blankSheet(uniqueName('Sheet' + (wb.sheets.length + 1)))); wb.cur = wb.sheets.length - 1; build(); }; t.append(add);
    if (wb.sheets.length > 1) { const del = document.createElement('button'); del.className = 'h-sheet add'; del.textContent = '🗑'; del.title = 'Delete this sheet';
      del.onclick = async () => { if (await K.confirm(`Delete the sheet "${S().name}"?`, 'Delete')) { snapshot(); wb.sheets.splice(wb.cur, 1); wb.cur = Math.max(0, wb.cur - 1); build(); } }; t.append(del); }
  }
  const uniqueName = n => { let x = n, i = 2; while (wb.sheets.some(s => s.name.toLowerCase() === x.toLowerCase())) x = n + ' ' + i++; return x; };

  /* ---------- charts ---------- */
  async function charts(){
    const box = $('#h-charts'); box.innerHTML = ''; const list = S().charts || []; if (!list.length) return;
    await K.lib('chart'); const css = getComputedStyle(document.body);
    list.forEach((ch, i) => {
      const card = document.createElement('div'); card.className = 'h-chart'; card.innerHTML = `<div class="hc-h"><b></b><button class="kb ic" aria-label="Remove chart">✕</button></div><div class="hc-c"><canvas></canvas></div>`;
      card.querySelector('b').textContent = ch.title || 'Chart'; card.querySelector('button').onclick = () => { snapshot(); S().charts.splice(i, 1); charts(); save(); };
      box.append(card); const data = chartData(ch.range, ch.rows); if (!data) return;
      const pal = ['#a8520a', '#2e6f9e', '#5b8c3a', '#8e44ad', '#c0392b', '#16a085', '#7f8c8d'];
      new Chart(card.querySelector('canvas'), { type: ch.type === 'area' ? 'line' : ch.type, data: { labels: data.labels, datasets: data.sets.map((d, j) => ({ label: d.label, data: d.data, borderColor: ch.type === 'pie' ? '#fff' : pal[j % 7], backgroundColor: ch.type === 'pie' ? data.labels.map((_, k) => pal[k % 7]) : pal[j % 7] + (ch.type === 'line' ? '' : 'cc'), fill: ch.type === 'area', tension: .25, borderDash: d.dash ? [6, 4] : undefined })) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: css.getPropertyValue('--ink') } } }, scales: ch.type === 'pie' ? {} : { x: { ticks: { color: css.getPropertyValue('--muted') } }, y: { ticks: { color: css.getPropertyValue('--muted') } } } } });
    });
  }
  function chartData(range, byRows){
    const R = parseRange(range); if (!R) return null; const rows = [];
    if (byRows?.length) { const labels = []; for (let c = R.c0 + 1; c <= R.c1; c++) labels.push(show(value(R.r0, c), ''));
      return { labels, sets: byRows.map(rn => ({ label: String(value(rn - 1, R.c0)), data: labels.map((_, k) => { const v = value(rn - 1, R.c0 + 1 + k); return typeof v === 'number' ? v : null; }) })) }; }
    for (let r = R.r0; r <= R.r1; r++) { const row = []; for (let c = R.c0; c <= R.c1; c++) row.push(value(r, c)); rows.push(row); }
    const header = rows[0].some(v => typeof v === 'string' && v !== '') && rows.length > 1 && rows[0].slice(1).every(v => typeof v !== 'number') ? rows.shift() : null;
    const labelCol = rows.every(r => typeof r[0] !== 'number' || rows[0].length > 1 && typeof r[0] === 'number' && R.c1 > R.c0 && header && typeof header[0] === 'string') && R.c1 > R.c0;
    const labels = labelCol ? rows.map(r => show(r[0], '')) : rows.map((_, i) => String(i + 1));
    const start = labelCol ? 1 : 0, sets = [];
    for (let j = start; j < rows[0].length; j++) sets.push({ label: header ? String(header[j] ?? colName(R.c0 + j)) : colName(R.c0 + j), data: rows.map(r => typeof r[j] === 'number' ? r[j] : null), dash: /forecast|low|high/i.test(header?.[j] || '') });
    return { labels, sets };
  }
  async function newChart(){
    if (sel.r0 === sel.r1 && sel.c0 === sel.c1) { K.status('Select the data for the chart first, including the header row.'); return; }
    const type = await K.choose('Chart type', [['bar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie']]); if (!type) return;
    snapshot(); (S().charts ||= []).push({ range: addr(sel.r0, sel.c0) + ':' + addr(sel.r1, sel.c1), type, title: S().cells[addr(sel.r0, sel.c0)]?.raw && sel.r1 > sel.r0 ? String(value(sel.r0, sel.c1)) : 'Chart' }); charts(); save();
  }

  /* ---------- predictive: forecast and anomalies ---------- */
  function series(){
    const cols = []; for (let c = sel.c0; c <= sel.c1; c++) { const v = []; for (let r = sel.r0; r <= sel.r1; r++) v.push(value(r, c)); cols.push(v); }
    const ycol = cols.length - 1; let start = 0; while (start < cols[ycol].length && typeof cols[ycol][start] !== 'number') start++;
    const ys = cols[ycol].slice(start).filter(v => typeof v === 'number'); return { ys, start, ycol };
  }
  function holt(y, a, b){ let l = y[0], t = y.length > 1 ? y[1] - y[0] : 0, sse = 0; const fit = [];
    for (let i = 1; i < y.length; i++) { const f = l + t; fit.push(f); sse += (y[i] - f) ** 2; const nl = a * y[i] + (1 - a) * (l + t); t = b * (nl - l) + (1 - b) * t; l = nl; } return { l, t, sse, fit }; }
  function bestHolt(y){ let best = null; for (let a = 0.1; a <= 0.95; a += 0.05) for (let b = 0.05; b <= 0.6; b += 0.05) { const h = holt(y, a, b); if (!best || h.sse < best.sse) best = { ...h, a, b }; } return best; }
  function linear(y){ const n = y.length, xs = y.map((_, i) => i + 1), mx = (n + 1) / 2, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0; y.forEach((v, i) => { sxy += (xs[i] - mx) * (v - my); sxx += (xs[i] - mx) ** 2; }); const b = sxx ? sxy / sxx : 0; return { a: my - b * mx, b }; }
  const mape = (act, pred) => act.reduce((s, v, i) => s + (v ? Math.abs((v - pred[i]) / v) : 0), 0) / act.length;
  function predict(y, h, method){
    const lin = () => { const m = linear(y); return [...Array(h)].map((_, k) => m.a + m.b * (y.length + k + 1)); };
    const hw = () => { const m = bestHolt(y); return [...Array(h)].map((_, k) => m.l + (k + 1) * m.t); };
    const ma = () => { const w = Math.min(3, y.length); const av = y.slice(-w).reduce((s, v) => s + v, 0) / w; return Array(h).fill(av); };
    const F = { linear: lin, holt: hw, average: ma };
    if (method !== 'auto') return { f: F[method](), method };
    const k = Math.max(1, Math.min(4, Math.floor(y.length / 4))), train = y.slice(0, -k), test = y.slice(-k); let best = 'linear', score = Infinity;
    if (train.length >= 3) for (const m of ['linear', 'holt', 'average']) { const sv = y; y = train; const p = F[m]().slice(0, k); y = sv; const e = mape(test, p.length === k ? p : test.map(() => p[0])); if (e < score) { score = e; best = m; } }
    return { f: F[best](), method: best, err: score };
  }
  async function forecast(){
    const { ys, start, ycol } = series();
    if (ys.length < 4) { K.status('Select a column with at least 4 numbers (for example monthly sales), then press Forecast.'); return; }
    const ans = await K.form('Forecast the next periods', [{ id: 'h', label: 'How many periods ahead', type: 'number', value: 6 }, { id: 'm', label: 'Method', type: 'select', value: 'auto', options: [['auto', 'Let Harry choose (tests each on your recent data)'], ['linear', 'Straight-line trend'], ['holt', 'Smoothed trend (Holt)'], ['average', 'Recent average']] }]);
    if (!ans) return; const h = Math.min(120, Math.max(1, +ans.h || 6));
    const { f, method, err } = predict(ys, h, ans.m);
    const fitted = method === 'linear' ? (() => { const m = linear(ys); return ys.map((_, i) => m.a + m.b * (i + 1)); })() : method === 'holt' ? [ys[0], ...bestHolt(ys).fit] : ys.map((v, i) => i < 3 ? v : (ys[i - 1] + ys[i - 2] + ys[i - 3]) / 3);
    const sd = Math.sqrt(ys.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0) / Math.max(1, ys.length - 2));
    snapshot(); const sh = S(), col = sel.c0 + ycol, lastRow = sel.r0 + start + ys.length - 1, out = sel.c1 + 1, hdr = sel.r0 + start - 1;
    if (hdr >= 0) { setRaw(sh, addr(hdr, out), 'Forecast', false); setRaw(sh, addr(hdr, out + 1), 'Low (95%)', false); setRaw(sh, addr(hdr, out + 2), 'High (95%)', false); [out, out + 1, out + 2].forEach(c => sh.cells[addr(hdr, c)].b = true); }
    const yr = addr(sel.r0 + start, col) + ':' + addr(lastRow, col);
    f.forEach((v, k) => { const r = lastRow + 1 + k, step = Math.sqrt(k + 1);
      if (method === 'linear') setRaw(sh, addr(r, out), `=ROUND(FORECAST.LINEAR(${ys.length + k + 1},${colName(col)}$${sel.r0 + start + 1}:${colName(col)}$${lastRow + 1},{${ys.map((_, i) => i + 1).join(',')}}),2)`, false); else setRaw(sh, addr(r, out), String(+v.toFixed(2)), false);
      setRaw(sh, addr(r, out + 1), String(+(v - 1.96 * sd * step).toFixed(2)), false); setRaw(sh, addr(r, out + 2), String(+(v + 1.96 * sd * step).toFixed(2)), false);
      const fm = sh.cells[addr(sel.r0 + start, col)]?.fmt || 'number'; [out, out + 1, out + 2].forEach(c => { sh.cells[addr(r, c)].fmt = fm; sh.cells[addr(r, c)].bg = '#eef4fb'; }); });
    if (hdr >= 0) (sh.charts ||= []).push({ range: addr(hdr, col) + ':' + addr(lastRow + h, out), type: 'line', title: 'Forecast' });
    build(); K.status(`Forecast added: ${({ linear: 'straight-line trend', holt: 'smoothed trend (Holt)', average: 'recent average' })[method]}${err != null && isFinite(err) ? `, ${(err * 100).toFixed(1)}% average error on your latest periods` : ''}. Shaded cells are predictions with a 95% range.`, 9000);
  }
  function anomalies(){
    const pts = []; for (let r = sel.r0; r <= sel.r1; r++) for (let c = sel.c0; c <= sel.c1; c++) { const v = value(r, c); if (typeof v === 'number') pts.push({ r, c, v }); }
    if (pts.length < 6) { K.status('Select at least 6 numbers to check for anything unusual.'); return []; }
    const s = pts.map(p => p.v).sort((a, b) => a - b), q = p => { const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
    const q1 = q(.25), q3 = q(.75), iqr = q3 - q1, med = q(.5), mad = q(.5) && s.map(v => Math.abs(v - med)).sort((a, b) => a - b)[Math.floor(s.length / 2)];
    const odd = pts.filter(p => (iqr > 0 && (p.v < q1 - 1.5 * iqr || p.v > q3 + 1.5 * iqr)) && (!mad || Math.abs(0.6745 * (p.v - med) / mad) > 2.5));
    snapshot(); odd.forEach(p => { const a = addr(p.r, p.c); S().cells[a] = { ...S().cells[a], bg: '#fde2e1' }; }); paint();
    K.status(odd.length ? `${odd.length} unusual value${odd.length > 1 ? 's' : ''} marked in red: ${odd.slice(0, 6).map(p => addr(p.r, p.c) + ' (' + show(p.v, S().cells[addr(p.r, p.c)]?.fmt) + ')').join(', ')}${odd.length > 6 ? '…' : ''}. Ask Harry to look into them.` : 'Nothing unusual found in the selection.', 9000);
    return odd;
  }

  /* ---------- financial analysis templates ---------- */
  const KIT = {
    loan: ['Loan and mortgage', () => { const rows = [['Loan calculator'], ['Amount borrowed', 250000], ['Annual interest rate', 0.065], ['Years', 25], ['Payments per year', 12], [], ['Payment each period', '=-PMT(B3/B5,B4*B5,B2)'], ['Total paid', '=B7*B4*B5'], ['Total interest', '=B8-B2'], [], ['Period', 'Payment', 'Interest', 'Principal', 'Balance']];
      for (let i = 1; i <= 360; i++) { const r = 11 + i; rows.push([i, `=IF(A${r}<=$B$4*$B$5,$B$7,0)`, `=IF(A${r}<=$B$4*$B$5,${i === 1 ? '$B$2' : 'E' + (r - 1)}*$B$3/$B$5,0)`, `=B${r}-C${r}`, `=MAX(0,${i === 1 ? '$B$2' : 'E' + (r - 1)}-D${r})`]); }
      return { rows, fmt: { currency: ['B2', 'B7:B9', 'B12:E371'], percent: ['B3'] }, bold: ['A1', 'A11:E11', 'A7:B9'] }; }],
    invest: ['Investment appraisal (NPV, IRR, payback)', () => ({ rows: [['Investment appraisal'], ['Discount rate', 0.1], [], ['Year', 'Cash flow', 'Discounted', 'Cumulative'], [0, -100000, '=B5/(1+$B$2)^A5', '=B5'],
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(y => [y, [25000, 30000, 32000, 30000, 28000, 20000, 15000, 10000][y - 1], `=B${5 + y}/(1+$B$2)^A${5 + y}`, `=D${4 + y}+B${5 + y}`]), [],
      ['Net present value', '=NPV(B2,B6:B13)+B5'], ['Internal rate of return', '=IRR(B5:B13)'], ['Payback (years)', '=IF(D13<0,"Not within period",COUNTIF(D5:D13,"<0")-1+(-INDEX(D5:D13,COUNTIF(D5:D13,"<0"))/INDEX(B5:B13,COUNTIF(D5:D13,"<0")+1)))'], ['Profitability index', '=(B15-B5)/-B5'], ['Verdict', '=IF(B15>0,"Worth doing: it earns more than the discount rate","Not worth it at this discount rate")']],
      fmt: { currency: ['B5:D13', 'B15'], percent: ['B2', 'B16'], number: ['B18'] }, bold: ['A1', 'A4:D4', 'A15:B19'] })],
    breakeven: ['Break-even analysis', () => ({ rows: [['Break-even analysis'], ['Fixed costs per month', 12000], ['Selling price per unit', 45], ['Variable cost per unit', 27], ['Expected sales (units)', 900], [],
      ['Contribution per unit', '=B3-B4'], ['Contribution margin', '=B7/B3'], ['Break-even units', '=ROUNDUP(B2/B7,0)'], ['Break-even sales', '=B9*B3'], ['Margin of safety (units)', '=B5-B9'], ['Margin of safety %', '=B11/B5'], ['Expected profit', '=B5*B7-B2'], [],
      ['Units', 'Revenue', 'Total cost', 'Profit'], ...[0, 200, 400, 600, 800, 1000, 1200].map((u, i) => [u, `=A${16 + i}*$B$3`, `=$B$2+A${16 + i}*$B$4`, `=B${16 + i}-C${16 + i}`])],
      fmt: { currency: ['B2:B4', 'B7', 'B10', 'B13', 'B16:D22'], percent: ['B8', 'B12'], integer: ['B9', 'B11'] }, bold: ['A1', 'A15:D15', 'A9:B9', 'A13:B13'], chart: { range: 'A15:D22', type: 'line', title: 'Break-even chart' } })],
    ratios: ['Ratio analysis', () => ({ rows: [['Ratio analysis'], ['Enter figures from the accounts', 'This year', 'Last year'], ['Revenue', 500000, 450000], ['Cost of sales', 300000, 280000], ['Operating profit', 80000, 60000], ['Interest expense', 8000, 9000], ['Net profit', 55000, 40000],
      ['Current assets', 150000, 130000], ['Inventory', 40000, 45000], ['Trade receivables', 60000, 55000], ['Total assets', 600000, 560000], ['Current liabilities', 90000, 95000], ['Trade payables', 45000, 50000], ['Total debt', 200000, 220000], ['Equity', 310000, 245000], [],
      ['Ratio', 'This year', 'Last year', 'What it tells you'],
      ['Gross margin', '=(B3-B4)/B3', '=(C3-C4)/C3', 'Profit kept from each sale before overheads'], ['Operating margin', '=B5/B3', '=C5/C3', 'Profit from running the business'], ['Net margin', '=B7/B3', '=C7/C3', 'Profit left after everything'],
      ['Return on assets', '=B7/B11', '=C7/C11', 'How hard the assets work'], ['Return on equity', '=B7/B15', '=C7/C15', "Owners' return"], ['Current ratio', '=B8/B12', '=C8/C12', 'Above 1.5 is usually comfortable'], ['Quick ratio', '=(B8-B9)/B12', '=(C8-C9)/C12', 'Can bills be paid without selling stock?'],
      ['Debt to equity', '=B14/B15', '=C14/C15', 'How much is borrowed per $ of equity'], ['Interest cover', '=B5/B6', '=C5/C6', 'Times operating profit covers interest'], ['Asset turnover', '=B3/B11', '=C3/C11', 'Sales per $ of assets'],
      ['Receivable days', '=B10/B3*365', '=C10/C3*365', 'Days customers take to pay'], ['Payable days', '=B13/B4*365', '=C13/C4*365', 'Days you take to pay suppliers'], ['Inventory days', '=B9/B4*365', '=C9/C4*365', 'Days stock sits before sale']],
      fmt: { currency: ['B3:C15'], percent: ['B18:C22'], number: ['B23:C27'], integer: ['B28:C30'] }, bold: ['A1', 'A2:C2', 'A17:D17'] })],
    budget: ['Budget vs actual', () => ({ rows: [['Budget vs actual'], ['Category', 'Budget', 'Actual', 'Variance', 'Variance %', 'Status'],
      ...[['Sales', 120000, 131500], ['Cost of sales', -60000, -66200], ['Salaries', -30000, -30000], ['Rent', -6000, -6000], ['Marketing', -5000, -7400], ['Utilities', -1500, -1320], ['Other', -2000, -1650]].map((r, i) => [...r, `=C${3 + i}-B${3 + i}`, `=IFERROR(D${3 + i}/ABS(B${3 + i}),0)`, `=IF(D${3 + i}>=0,"Favourable","Adverse")`]),
      ['Net', '=SUM(B3:B9)', '=SUM(C3:C9)', '=C10-B10', '=IFERROR(D10/ABS(B10),0)', '=IF(D10>=0,"Favourable","Adverse")']],
      fmt: { currency: ['B3:D10'], percent: ['E3:E10'] }, bold: ['A1', 'A2:F2', 'A10:F10'], chart: { range: 'A2:C9', type: 'bar', title: 'Budget vs actual' } })],
    cash: ['12-month cash-flow forecast', () => { const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], C = i => colName(i + 1);
      const rows = [['Cash-flow forecast', ...m], ['Opening balance', 20000, ...m.slice(1).map((_, i) => `=${C(i)}10`)], ['Cash sales', ...m.map(() => 18000)], ['Customer receipts', ...m.map(() => 12000)], ['Total receipts', ...m.map((_, i) => `=SUM(${C(i)}3:${C(i)}4)`)],
        ['Suppliers', ...m.map(() => -14000)], ['Wages', ...m.map(() => -9000)], ['Overheads', ...m.map(() => -4500)], ['Total payments', ...m.map((_, i) => `=SUM(${C(i)}6:${C(i)}8)`)], ['Closing balance', ...m.map((_, i) => `=${C(i)}2+${C(i)}5+${C(i)}9`)]];
      return { rows, fmt: { currency: ['B2:M10'] }, bold: ['A1:M1', 'A5:M5', 'A9:M10'], chart: { range: 'A1:M1', type: 'line', title: 'Closing balance', rows: [10] } }; }],
    deprec: ['Depreciation schedule', () => ({ rows: [['Depreciation schedule'], ['Asset cost', 50000], ['Residual value', 5000], ['Useful life (years)', 5], [], ['Year', 'Straight-line', 'Reducing balance (double)', 'Book value (straight-line)', 'Book value (reducing)'],
      ...[1, 2, 3, 4, 5].map(y => [y, '=SLN($B$2,$B$3,$B$4)', `=DDB($B$2,$B$3,$B$4,A${6 + y})`, `=$B$2-SUM($B$7:B${6 + y})`, `=$B$2-SUM($C$7:C${6 + y})`])],
      fmt: { currency: ['B2:B3', 'B7:E11'] }, bold: ['A1', 'A6:E6'] })],
  };
  function applyTemplate(key){
    const [title, make] = KIT[key]; const t = make(); snapshot();
    const sh = blankSheet(uniqueName(title.replace(/\s*\(.*\)/, '').slice(0, 28))); sh.widths = { 0: 190, 1: 120, 2: 120, 3: 140, 4: 130, 5: 110 };
    t.rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '' && v != null) setRaw(sh, addr(r, c), typeof v === 'number' ? v : String(v), false); }));
    const each = (range, fn) => { const R = parseRange(range); for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) { const a = addr(r, c); if (sh.cells[a]) fn(sh.cells[a]); } };
    for (const [f, ranges] of Object.entries(t.fmt || {})) ranges.forEach(rg => each(rg, c => c.fmt = f));
    (t.bold || []).forEach(rg => each(rg, c => c.b = true));
    t.rows.forEach((row, r) => { if (row.length >= 2 && typeof row[1] === 'number' && r < 16 && !/Year|Period|Units/.test(row[0])) { const a = addr(r, 1); if (sh.cells[a] && key !== 'cash' && key !== 'budget' && key !== 'invest') sh.cells[a].bg = '#fff8e1'; } });
    if (t.chart) sh.charts.push({ ...t.chart });
    wb.sheets.push(sh); wb.cur = wb.sheets.length - 1; act = anchor = { r: 1, c: 1 }; sel = { r0: 1, c0: 1, r1: 1, c1: 1 }; build();
    K.status(`${title} added. Change the shaded inputs and everything recalculates.`, 6000);
  }
  function kitMenu(btn){
    const m = $('#h-kit'); m.innerHTML = Object.entries(KIT).map(([k, [t]]) => `<button data-k="${k}">${t}</button>`).join('') + '<hr><button data-k="__ask">Ask Harry to analyse my data…</button>';
    const b = btn.getBoundingClientRect(), r = root.getBoundingClientRect(); m.style.top = b.bottom - r.top + 4 + 'px'; m.style.left = Math.max(8, b.right - r.left - 270) + 'px'; m.hidden = false;
    m.onclick = e => { const k = e.target.dataset.k; if (!k) return; m.hidden = true; if (k === '__ask') { openAgent(); $('#h-ask').value = 'Analyse the data in this workbook: key totals, trends, margins and ratios, anything unusual, and what I should do next. Put the analysis on a new sheet with formulas.'; } else applyTemplate(k); };
  }
  addEventListener('click', e => { const m = $('#h-kit'); if (!m.hidden && !m.contains(e.target) && !e.target.closest('[data-a=toolkit]')) m.hidden = true; });

  /* ---------- files ---------- */
  async function readBook(file){
    if (/\.csv$|\.txt$/i.test(file.name)) { const sh = blankSheet(uniqueName(file.name.replace(/\.[^.]+$/, '').slice(0, 28))); parseCSV(await file.text()).forEach((row, r) => row.forEach((v, c) => setRaw(sh, addr(r, c), v, false))); return [sh]; }
    await K.lib('exceljs'); const x = new ExcelJS.Workbook(); await x.xlsx.load(await file.arrayBuffer()); const out = [];
    x.eachSheet(ws => { const sh = blankSheet(uniqueName(ws.name)); ws.columns?.forEach((col, i) => { if (col?.width) sh.widths[i] = Math.round(col.width * 7.5); });
      ws.eachRow({ includeEmpty: false }, (row, rn) => row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const a = addr(rn - 1, cn - 1), v = cell.value; let raw;
        if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) raw = v.formula ? '=' + v.formula : (v.result ?? '');
        else if (v instanceof Date) raw = (v.getTime() - Date.UTC(1899, 11, 30)) / 864e5;
        else if (v && typeof v === 'object' && v.richText) raw = v.richText.map(t => t.text).join('');
        else if (v && typeof v === 'object' && 'text' in v) raw = v.text;
        else if (v && typeof v === 'object' && 'error' in v) raw = v.error;
        else raw = v;
        const nf = cell.numFmt || '', c = { raw: typeof raw === 'string' && raw[0] === '=' ? raw : (typeof raw === 'string' ? raw : raw) };
        if (/%/.test(nf)) c.fmt = 'percent'; else if (/[$£€]/.test(nf)) c.fmt = 'currency'; else if (/[dy]{2}/i.test(nf) || v instanceof Date) c.fmt = 'date'; else if (/0\.00/.test(nf)) c.fmt = 'number'; else if (/#,##0$/.test(nf)) c.fmt = 'integer';
        if (cell.font?.bold) c.b = true; const fg = cell.fill?.fgColor?.argb; if (cell.fill?.type === 'pattern' && fg && fg.length === 8 && !/^FFFFFFFF$/i.test(fg)) c.bg = '#' + fg.slice(2).toLowerCase();
        sh.cells[a] = c; }));
      out.push(sh); });
    return out;
  }
  function parseCSV(t){ const rows = [[]]; let f = '', q = false; const d = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : t.includes('\t') && !t.includes(',') ? '\t' : ',';
    for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; } else if (ch === '"') q = true; else if (ch === d) { rows.at(-1).push(f); f = ''; } else if (ch === '\n') { rows.at(-1).push(f.replace(/\r$/, '')); rows.push([]); f = ''; } else f += ch; }
    if (f !== '' || rows.at(-1).length) rows.at(-1).push(f); if (rows.at(-1).length === 1 && rows.at(-1)[0] === '') rows.pop(); return rows; }
  async function toXlsx(){
    await K.lib('exceljs'); const x = new ExcelJS.Workbook(); x.creator = 'Termite Kiosk · Harry the Accountant';
    const nf = { currency: `"${wb.currency}"#,##0.00;-"${wb.currency}"#,##0.00`, number: '#,##0.00', integer: '#,##0', percent: '0.00%', date: 'yyyy-mm-dd' };
    wb.sheets.forEach((sh, si) => { const ws = x.addWorksheet(sh.name.slice(0, 31));
      for (const [i, w] of Object.entries(sh.widths || {})) ws.getColumn(+i + 1).width = Math.round(w / 7.5);
      for (const [a, c] of Object.entries(sh.cells)) { const p = parseAddr(a), cell = ws.getCell(p.r + 1, p.c + 1);
        if (typeof c.raw === 'string' && c.raw[0] === '=') { const v = valueAt(si, p.r, p.c); cell.value = { formula: c.raw.slice(1), result: isErr(v) ? { error: v.err } : v }; }
        else if (c.fmt === 'date' && typeof c.raw === 'number') cell.value = fromSerial(c.raw); else cell.value = c.raw === '' ? null : c.raw;
        if (c.fmt) cell.numFmt = nf[c.fmt]; if (c.b) cell.font = { bold: true }; if (c.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + c.bg.slice(1).toUpperCase() } }; } });
    return new Blob([await x.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function toCSV(){ const sh = S(); let mr = -1, mc = -1; for (const a in sh.cells) { const p = parseAddr(a); mr = Math.max(mr, p.r); mc = Math.max(mc, p.c); }
    const out = []; for (let r = 0; r <= mr; r++) { const row = []; for (let c = 0; c <= mc; c++) { const v = value(r, c), s = isErr(v) ? v.err : typeof v === 'number' ? String(v) : String(v ?? ''); row.push(/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s); } out.push(row.join(',')); }
    return new Blob([out.join('\r\n')], { type: 'text/csv' }); }

  /* ---------- Harry, the agent ---------- */
  let files = [], aborter = null;
  const log = (cls, html) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; $('#h-log').append(d); d.scrollIntoView({ block: 'end' }); return d; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function openAgent(){ const a = $('#h-agent'); a.hidden = !a.hidden; if (!a.hidden) $('#h-ask').focus(); }
  function chips(){ $('#h-files').innerHTML = files.map((f, i) => `<span class="chip">${esc(f.name)}<button data-i="${i}" aria-label="Remove">✕</button></span>`).join(''); }
  $('#h-files').onclick = e => { const i = e.target.dataset.i; if (i != null) { files.splice(+i, 1); chips(); } };
  $('#h-attach').onchange = async e => { for (const f of e.target.files) { const d = { name: f.name, text: '' };
      try { if (/\.(xlsx|csv)$/i.test(f.name)) { d.sheets = await readBook(f); d.text = d.sheets.map(s => `Sheet "${s.name}":\n` + dump(s, 200, 26)).join('\n'); } else d.text = await K.readText(f); } catch (err) { d.text = '(Could not read this file: ' + err.message + ')'; }
      files.push(d); } e.target.value = ''; chips(); };
  function dump(sh, maxR = 80, maxC = 20){
    const lines = []; const keys = Object.keys(sh.cells).map(a => ({ a, ...parseAddr(a) })).filter(k => k.r < maxR && k.c < maxC).sort((x, y) => x.r - y.r || x.c - y.c);
    let row = -1, line = []; const si = wb.sheets.indexOf(sh);
    for (const k of keys) { if (k.r !== row) { if (line.length) lines.push(line.join(' | ')); line = []; row = k.r; } const c = sh.cells[k.a]; let s = `${k.a}=${typeof c.raw === 'string' ? c.raw : c.raw}`; if (si >= 0 && typeof c.raw === 'string' && c.raw[0] === '=') { const v = valueAt(si, k.r, k.c); s += ' →' + (isErr(v) ? v.err : typeof v === 'number' ? +v.toFixed(4) : v); } line.push(s); }
    if (line.length) lines.push(line.join(' | ')); return lines.join('\n') || '(empty)';
  }
  const SYSTEM = `You are Harry the Accountant, a meticulous chartered accountant and spreadsheet expert working directly inside a spreadsheet app. You are agentic: you plan, act on the workbook, check the results and fix mistakes.
Reply ONLY with JSON: {"plan":"one or two sentences","actions":[...],"message":"plain-English summary for the user: what you built, key figures, any assumptions or concerns","done":true|false}
Actions you can use (sheet defaults to the active sheet):
- {"op":"addSheet","name":"P&L"}
- {"op":"setRows","sheet":"P&L","start":"A1","rows":[["Item","Jan","Feb"],["Sales",1200,1350],["Total","=SUM(B2:B3)","=SUM(C2:C3)"]]}
- {"op":"setCells","sheet":"P&L","cells":{"B10":"=B8-B9","A10":"Net profit"}}
- {"op":"format","sheet":"P&L","range":"B2:C10","format":"currency|number|integer|percent|date|general","bold":true,"fill":"#fff2cc"}
- {"op":"chart","sheet":"P&L","range":"A1:C3","type":"bar|line|area|pie","title":"Sales"}
- {"op":"clear","sheet":"P&L","range":"A1:D20"}
- {"op":"renameSheet","from":"Sheet1","to":"Data"}
Rules: Use real formulas (SUM, SUMIF(S), AVERAGE, IF, IFERROR, VLOOKUP, XLOOKUP, INDEX/MATCH, ROUND, PMT, NPV, IRR, FV, PV, RATE, SLN, DDB, FORECAST.LINEAR, TREND, STDEV and more) so every figure can be audited; do not paste hand-calculated totals. Numbers as numbers (no currency symbols inside values); dates as yyyy-mm-dd text. Label everything, bold headers and totals, format money as currency and rates as percent. Never invent data that is not in the files or instructions: say what is missing instead. Keep each reply under about 400 cells; if the job is bigger, do part of it with "done":false and continue in the next turn. After each turn you will see the computed results and any errors; fix errors before setting "done":true.`;
  function apply(acts){
    const touched = [];
    const sheetFor = n => { if (!n) return S(); let i = sheetBy(n); if (i < 0) { wb.sheets.push(blankSheet(n)); i = wb.sheets.length - 1; } return wb.sheets[i]; };
    for (const a of acts || []) { try {
      if (a.op === 'addSheet') { if (sheetBy(a.name) < 0) wb.sheets.push(blankSheet(String(a.name).slice(0, 31))); wb.cur = sheetBy(a.name); }
      else if (a.op === 'renameSheet') { const i = sheetBy(a.from); if (i >= 0 && sheetBy(a.to) < 0) wb.sheets[i].name = a.to; }
      else if (a.op === 'setRows') { const sh = sheetFor(a.sheet), p = parseAddr(a.start || 'A1'); (a.rows || []).forEach((row, i) => (row || []).forEach((v, j) => { if (v === null || v === undefined) return; const ad = addr(p.r + i, p.c + j); setRaw(sh, ad, typeof v === 'number' ? v : String(v)); touched.push([sh, ad]); })); wb.cur = wb.sheets.indexOf(sh); }
      else if (a.op === 'setCells') { const sh = sheetFor(a.sheet); for (const [ad, v] of Object.entries(a.cells || {})) { if (!parseAddr(ad)) continue; setRaw(sh, ad.toUpperCase().replace(/\$/g, ''), typeof v === 'number' ? v : String(v)); touched.push([sh, ad.toUpperCase()]); } wb.cur = wb.sheets.indexOf(sh); }
      else if (a.op === 'format' || a.op === 'clear') { const sh = sheetFor(a.sheet), R = parseRange(a.range || ''); if (!R) continue;
        for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) { const ad = addr(r, c); if (a.op === 'clear') { delete sh.cells[ad]; continue; } const cell = sh.cells[ad] || { raw: '' };
          if (a.format) cell.fmt = a.format === 'general' ? undefined : a.format; if (a.bold != null) cell.b = !!a.bold; if (a.fill) cell.bg = a.fill; sh.cells[ad] = cell; } }
      else if (a.op === 'chart') { const sh = sheetFor(a.sheet); if (parseRange(a.range || '')) (sh.charts ||= []).push({ range: a.range, type: a.type || 'bar', title: a.title || 'Chart' }); }
    } catch (e) {} }
    return touched;
  }
  async function runAgent(){
    const ask = $('#h-ask').value.trim(); if (!ask && !files.length) { $('#h-ask').focus(); return; }
    log('you', esc(ask || '(no instruction)') + (files.length ? `<div class="muted">📎 ${files.map(f => esc(f.name)).join(', ')}</div>` : ''));
    $('#h-ask').value = ''; $('#h-run').hidden = true; $('#h-stop').hidden = false; aborter = new AbortController();
    const status = log('harry pending', 'Thinking…');
    const ctx = () => `WORKBOOK "${fileName}" (active sheet: ${S().name})\n` + wb.sheets.map(s => `--- Sheet "${s.name}" ---\n${dump(s)}`).join('\n');
    const fileText = files.map(f => `=== FILE: ${f.name} ===\n${f.text.slice(0, 30000)}`).join('\n\n');
    const msgs = [{ role: 'user', content: `${ctx()}\n\n${fileText ? 'ATTACHED FILES:\n' + fileText + '\n\n' : ''}TASK: ${ask || 'Review the attached files and build a useful summary workbook.'}` }];
    snapshot();
    try {
      for (let turn = 1; turn <= 4; turn++) {
        const r = await K.ai.ask(msgs, { system: SYSTEM, maxTokens: 8000, signal: aborter.signal, onStatus: s => status.textContent = s });
        let j; try { j = K.ai.extractJSON(r.text); } catch (e) { msgs.push({ role: 'assistant', content: r.text }, { role: 'user', content: 'Reply with the JSON format only.' }); continue; }
        if (j.plan) log('harry plan', '<b>Plan:</b> ' + esc(j.plan));
        const touched = apply(j.actions); vcache = new Map(); build();
        const errs = touched.map(([sh, a]) => { const p = parseAddr(a), v = valueAt(wb.sheets.indexOf(sh), p.r, p.c); return isErr(v) ? `${sh.name}!${a} ${sh.cells[a]?.raw} → ${v.err}` : null; }).filter(Boolean);
        if (j.message) log('harry', esc(j.message).replace(/\n/g, '<br>') + `<div class="muted">${touched.length} cells · ${esc(r.by)}</div>`);
        if (j.done !== false && !errs.length) break;
        status.textContent = errs.length ? `Fixing ${errs.length} formula error${errs.length > 1 ? 's' : ''}…` : 'Continuing…';
        msgs.push({ role: 'assistant', content: JSON.stringify(j) }, { role: 'user', content: `Applied. Current workbook:\n${ctx()}\n\n${errs.length ? 'ERRORS to fix:\n' + errs.slice(0, 40).join('\n') : 'No errors.'}\n${j.done === false ? 'Continue the task.' : 'Fix the errors.'}` });
      }
      status.remove();
    } catch (e) { status.className = 'msg harry err'; status.textContent = e.name === 'AbortError' ? 'Stopped.' : (e.message || String(e)); }
    $('#h-run').hidden = false; $('#h-stop').hidden = true; aborter = null;
  }
  $('#h-run').onclick = runAgent; $('#h-stop').onclick = () => aborter?.abort();
  $('#h-ask').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAgent(); });
  async function explain(){
    const R = sel.r0 === sel.r1 && sel.c0 === sel.c1 ? null : addr(sel.r0, sel.c0) + ':' + addr(sel.r1, sel.c1);
    openAgent(); $('#h-agent').hidden = false; $('#h-ask').value = R ? `Explain what the figures in ${S().name}!${R} show: trends, anything unusual, and what I should do about it. Don't change the workbook unless something is wrong.` : `Explain what this sheet (${S().name}) shows and check it for mistakes.`; runAgent();
  }

  /* ---------- toolbar ---------- */
  async function act_(a, btn){
    if (a === 'undo' && undo.length) { redo.push(JSON.stringify(wb)); wb = JSON.parse(undo.pop()); build(); }
    else if (a === 'redo' && redo.length) { undo.push(JSON.stringify(wb)); wb = JSON.parse(redo.pop()); build(); }
    else if (a === 'bold') { const on = !S().cells[addr(act.r, act.c)]?.b; selCells((sh, ad) => { sh.cells[ad] = { ...(sh.cells[ad] || { raw: '' }), b: on }; }); }
    else if (a === 'nofill') selCells((sh, ad) => { if (sh.cells[ad]) delete sh.cells[ad].bg; });
    else if (a === 'sum') autosum();
    else if (a === 'chart') newChart(); else if (a === 'forecast') forecast(); else if (a === 'anom') anomalies(); else if (a === 'insight') explain();
    else if (a === 'agent') openAgent(); else if (a === 'toolkit') kitMenu(btn);
    else if (a === 'new') { if (await K.confirm('Start a new workbook? Save this one first if you need it.', 'Start new')) { snapshot(); wb = { sheets: [blankSheet('Sheet1')], cur: 0, currency: wb.currency }; fileName = 'Harry workbook'; $('#h-file').value = fileName; build(); } }
    else if (a === 'open') $('#h-open').click();
    else if (a === 'save') K.busy('Building the Excel file…', async () => K.save(await toXlsx(), fileName + '.xlsx'));
    else if (a === 'csv') K.save(toCSV(), fileName + ' - ' + S().name + '.csv');
    else if (a === 'share') K.share({ name: fileName, make: { xlsx: { label: 'Excel (.xlsx)', build: async () => ({ blob: await toXlsx(), filename: fileName + '.xlsx' }) }, csv: { label: 'CSV (this sheet)', build: async () => ({ blob: toCSV(), filename: fileName + '.csv' }) } } });
    grid.focus({ preventScroll: true });
  }
  function autosum(){
    const sh = S(); snapshot();
    if (sel.r1 > sel.r0 || sel.c1 > sel.c0) { for (let c = sel.c0; c <= sel.c1; c++) { setRaw(sh, addr(sel.r1 + 1, c), `=SUM(${addr(sel.r0, c)}:${addr(sel.r1, c)})`); sh.cells[addr(sel.r1 + 1, c)].b = true; } }
    else { let r = act.r - 1; while (r >= 0 && typeof value(r, act.c) === 'number') r--; if (r === act.r - 1) { K.status('Select the numbers to add up, or click the cell under a column of numbers.'); return; } setRaw(sh, addr(act.r, act.c), `=SUM(${addr(r + 1, act.c)}:${addr(act.r - 1, act.c)})`); }
    paint();
  }
  root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => act_(b.dataset.a, b)));
  $('#h-open').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const sheets = await readBook(f); snapshot(); const empty = wb.sheets.length === 1 && !Object.keys(wb.sheets[0].cells).length; wb = { sheets: empty ? sheets : [...wb.sheets, ...sheets], cur: empty ? 0 : wb.sheets.length, currency: wb.currency }; if (empty) { fileName = f.name.replace(/\.[^.]+$/, ''); $('#h-file').value = fileName; } build(); K.status('Opened ' + f.name + '.'); }
    catch (err) { K.status('Couldn\'t open that file: ' + err.message, 7000); } };

  function projection(name, fin, cur){
    if (cur) wb.currency = cur; snapshot();
    const sh = blankSheet(uniqueName('Projections')); sh.widths = { 0: 220, 1: 120, 2: 120, 3: 120, 4: 200 };
    const rows = [[`${name} — 3-year projections`], [], ['Assumptions', 'Value', '', '', 'Note']];
    (fin.assumptions || []).forEach(a => rows.push([a[0], a[1], '', '', a[2] || '']));
    rows.push([], ['', 'Year 1', 'Year 2', 'Year 3'], ['Income']); const r0 = rows.length + 1;
    (fin.revenue_lines || []).forEach(l => rows.push([l[0], l[1], l[2], l[3]])); const r1 = rows.length;
    rows.push(['Total income', `=SUM(B${r0}:B${r1})`, `=SUM(C${r0}:C${r1})`, `=SUM(D${r0}:D${r1})`]); const ti = rows.length;
    rows.push(['Costs']); const c0 = rows.length + 1; (fin.cost_lines || []).forEach(l => rows.push([l[0], l[1], l[2], l[3]])); const c1 = rows.length;
    rows.push(['Total costs', `=SUM(B${c0}:B${c1})`, `=SUM(C${c0}:C${c1})`, `=SUM(D${c0}:D${c1})`]); const tc = rows.length;
    rows.push(['Profit before tax', `=B${ti}-B${tc}`, `=C${ti}-C${tc}`, `=D${ti}-D${tc}`]); const pr = rows.length;
    rows.push(['Profit margin', `=IFERROR(B${pr}/B${ti},0)`, `=IFERROR(C${pr}/C${ti},0)`, `=IFERROR(D${pr}/D${ti},0)`]); const pm = rows.length;
    rows.push([], ['Start-up costs', fin.startup_costs || 0], ['Funding raised', fin.funding || 0]); const su = rows.length - 1, fu = rows.length;
    rows.push(['Cash at end of year', `=B${fu}-B${su}+B${pr}`, `=B${rows.length + 1}+C${pr}`, `=C${rows.length + 1}+D${pr}`]); const ce = rows.length;
    rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '' && v != null) setRaw(sh, addr(r, c), typeof v === 'number' ? v : String(v), false); }));
    const set = (range, fn) => { const R = parseRange(range); for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) { const a = addr(r, c); if (sh.cells[a]) fn(sh.cells[a]); } };
    set(`B${r0}:D${tc + 1}`, c => c.fmt = 'currency'); set(`B${pm}:D${pm}`, c => c.fmt = 'percent'); set(`B${su}:D${ce}`, c => c.fmt = 'currency');
    [1, 3, r0 - 2, r0 - 1, ti, c0 - 1, tc, pr, ce].forEach(r => set(`A${r}:E${r}`, c => c.b = true));
    sh.charts.push({ range: `A${r0 - 2}:D${r0 - 2}`, type: 'bar', title: 'Income, costs and profit', rows: [ti, tc, pr] });
    wb.sheets.push(sh); wb.cur = wb.sheets.length - 1; build();
  }

  build(); grid.focus({ preventScroll: true });
  return { openAgent, applyTemplate, projection, openFile: async f => { const sheets = await readBook(f); wb.sheets.push(...sheets); wb.cur = wb.sheets.length - sheets.length; build(); }, kit: () => kitMenu(root.querySelector('[data-a=toolkit]')) };
}
