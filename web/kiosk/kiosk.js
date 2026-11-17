// Kiosk: Termite's studio of AI agents and creative tools.
import * as ai from './ai.js';

const T = window.termite;
const host = document.getElementById('kstage');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  harry: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  finance: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pitch: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8M7 12l3-3 2 2 4-4"/>',
  brochure: '<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
  plan: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  picture: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  jingle: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3z"/>',
  voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  ai: '<path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h0"/>',
};
const STUDIOS = [
  { id: 'harry', name: 'Harry the Accountant', blurb: 'Spreadsheets with an AI accountant. Give him files and a job.', keys: /harry|spreadsheet|excel|xlsx|sheet|account|bookkeep|reconcil|p&l|profit and loss|balance sheet|ledger|invoice|expense|budget|cash ?flow|vat|tax/ },
  { id: 'finance', name: 'Financial Analysis', blurb: 'NPV, IRR, loans, break-even, ratios, forecasts.', keys: /npv|irr|loan|mortgage|break.?even|ratio|forecast|depreciat|investment|roi|payback|interest/ },
  { id: 'pitch', name: 'Pitch Deck Agent', blurb: 'An investor-ready deck, saved as PowerPoint or PDF.', keys: /pitch|deck|slides?|investor|presentation|powerpoint/ },
  { id: 'brochure', name: 'Brochure Agent', blurb: 'Print-ready tri-fold brochure copy and layout.', keys: /brochure|flyer|leaflet|pamphlet|tri.?fold/ },
  { id: 'plan', name: 'Business Plan Writer', blurb: 'Full plan, section by section, plus projections.', keys: /business plan|plan for|grant|bank loan application|executive summary|start.?up plan/ },
  { id: 'picture', name: 'Picture Editor', blurb: 'Crop, adjust, filters, text, drawing, AI captions.', keys: /photo|picture|image|crop|edit (a|my) (pic|photo)|filter|resize|jpe?g|png/ },
  { id: 'jingle', name: 'Jingle & Music Studio', blurb: 'Lyrics, chords and melody played by a built-in band.', keys: /jingle|song|music|lyrics|melody|tune|beat|advert(isement)? song|radio ad/ },
  { id: 'voice', name: 'VoiceOver', blurb: 'Scripts voiced by AI voices, your own recording or a hired actor.', keys: /voice.?over|narrat|voice actor|narrator|read (it|this) aloud|voice for|announcer/ },
  { id: 'video', name: 'Video & Movie Maker', blurb: 'Clips, photos, titles, captions and music to video.', keys: /video|movie|film|clip|reel|tiktok|youtube|status|slideshow|montage/ },
];
const FIELD = { harry: '#h-ask', pitch: '#p-one', brochure: '#b-what', plan: '#bp-what', jingle: '#j-msg', voice: '#vo-brief' };

/* ---------- learns what you use, to suggest it (on this device only) ---------- */
const USE = 'termite.kiosk.use';
const usage = () => { try { return JSON.parse(localStorage.getItem(USE) || '{}'); } catch (e) { return {}; } };
function used(id){ const u = usage(), now = Date.now(), h = new Date().getHours(); const r = u[id] || { score: 0, t: now, hours: Array(24).fill(0) };
  r.score = r.score * Math.pow(0.5, (now - r.t) / (7 * 864e5)) + 1; r.t = now; r.hours[h] = (r.hours[h] || 0) + 1; u[id] = r; try { localStorage.setItem(USE, JSON.stringify(u)); } catch (e) {} }
function suggestions(){ const u = usage(), now = Date.now(), h = new Date().getHours();
  return Object.entries(u).map(([id, r]) => { const hr = r.hours || []; const near = (hr[h] || 0) + 0.5 * ((hr[(h + 23) % 24] || 0) + (hr[(h + 1) % 24] || 0)); const tot = hr.reduce((a, b) => a + b, 0) || 1;
    return { id, s: r.score * Math.pow(0.5, (now - r.t) / (7 * 864e5)) * (1 + 2 * near / tot) }; }).filter(x => STUDIOS.some(s => s.id === x.id)).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.id); }

/* ---------- shared helpers given to every studio ---------- */
const libs = {}; const LIBFILE = { chart: 'chart', exceljs: 'exceljs', pptxgen: 'pptxgen', html2canvas: 'html2canvas', jspdf: 'jspdf', mammoth: 'mammoth', jszip: 'jszip' };
const lib = n => libs[n] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/' + LIBFILE[n] + '.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + n)); document.head.append(s); });
const dlg = document.createElement('dialog'); dlg.className = 'k-dlg'; document.body.append(dlg);
function form(title, fields, okLabel = 'OK'){
  return new Promise(res => {
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${fields.map(f => f.type === 'select' ? `<label class="kf"><span>${esc(f.label)}</span><select name="${f.id}">${f.options.map(([v, l]) => `<option value="${esc(v)}"${v == f.value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
      : f.type === 'note' ? `<div class="k-note">${esc(f.value).replace(/\n/g, '<br>')}</div>` : `<label class="kf"><span>${esc(f.label)}</span><input name="${f.id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}"></label>`).join('')}
      <div class="acts"><button class="btn" value="cancel" type="button">Cancel</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div></form>`;
    const fm = dlg.querySelector('form'); const done = v => { dlg.close(); res(v); };
    fm.onsubmit = e => { e.preventDefault(); const o = {}; fields.forEach(f => { const el = fm.elements[f.id]; if (el) o[f.id] = el.value; }); done(o); };
    fm.querySelector('[value=cancel]').onclick = () => done(null); dlg.oncancel = () => done(null);
    dlg.showModal(); fm.querySelector('input,select')?.focus();
  });
}
async function readText(f){
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf')) { const d = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise; let t = ''; for (let p = 1; p <= Math.min(d.numPages, 60); p++) { const c = await (await d.getPage(p)).getTextContent(); t += c.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n\n'; } d.destroy(); return t; }
  if (n.endsWith('.docx')) { await lib('mammoth'); return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value; }
  if (n.endsWith('.xlsx')) { await lib('exceljs'); const x = new ExcelJS.Workbook(); await x.xlsx.load(await f.arrayBuffer()); let t = ''; x.eachSheet(ws => { t += `Sheet ${ws.name}:\n`; ws.eachRow({ includeEmpty: false }, r => { t += r.values.slice(1).map(v => v && typeof v === 'object' ? (v.result ?? v.text ?? v.formula ?? '') : v ?? '').join('\t') + '\n'; }); }); return t; }
  return f.text();
}
const K = {
  ai, lib, readText, shared: {},
  status: (m, ms) => T.status(m, ms), save: (b, n) => T.save(b, n), share: j => T.share(j), confirm: (m, y) => T.ask(m, y),
  prompt: async (label, value = '') => (await form(label, [{ id: 'v', label, value }]))?.v?.trim() || null,
  choose: async (title, opts) => (await form(title, [{ id: 'v', label: 'Choose', type: 'select', value: opts[0][0], options: opts }]))?.v || null,
  form, note: (title, text) => form(title, [{ id: 'n', type: 'note', value: text }], 'Close'),
  busy: async (label, fn) => { T.status(label, 0); try { await fn(); } catch (e) { T.status(e.message || String(e), 8000); } },
  go: id => show(id),
  openInWord: (html, name) => { T.writer.load(html, name + '.docx'); T.setMode('write'); },
  harryProjection: async (name, fin, cur) => { const h = await mountStudio('harry'); h.projection(name, fin, cur); },
};

/* ---------- layout ---------- */
host.innerHTML = `<nav class="k-rail" aria-label="Kiosk">${[['home', 'Home'], ...STUDIOS.map(s => [s.id, s.name.replace(' the Accountant', '').replace(' Agent', '').replace(' & Music Studio', '').replace(' & Movie Maker', '').replace(' Writer', '')]), ['ai', 'AI settings'], ['about', 'About']]
  .map(([id, l]) => `<button data-go="${id}" title="${esc(l)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg><span>${esc(l)}</span></button>`).join('')}</nav><div class="k-main" id="k-main"></div>`;
const main = host.querySelector('#k-main'), panes = {}, apis = {};
host.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
async function mountStudio(id){
  if (id === 'finance') id = 'harry';
  if (id in apis) return apis[id];
  const p = document.createElement('section'); p.className = 'k-pane'; p.hidden = true; main.append(p); panes[id] = p;
  if (id === 'harry') apis[id] = (await import('./harry.js')).mount(p, K);
  else if (['pitch', 'brochure', 'plan'].includes(id)) apis[id] = (await import('./agents.js'))[id](p, K) || null;
  else if (['picture', 'jingle', 'video'].includes(id)) apis[id] = (await import('./media.js'))[id](p, K) || null;
  else if (id === 'voice') apis[id] = (await import('./voice.js')).voice(p, K);
  else if (id === 'home') apis[id] = home(p); else if (id === 'ai') apis[id] = aiPane(p); else if (id === 'about') apis[id] = about(p);
  return apis[id];
}
async function show(id, intent){
  const real = id === 'finance' ? 'harry' : id;
  host.querySelectorAll('[data-go]').forEach(b => b.setAttribute('aria-current', String(b.dataset.go === id)));
  let api; try { api = await mountStudio(real); } catch (e) { T.status('Couldn\'t open that studio: ' + (e.message || e), 8000); return; }
  for (const [k, p] of Object.entries(panes)) p.hidden = k !== real;
  main.scrollTop = 0;
  if (STUDIOS.some(s => s.id === id)) used(id);
  if (id === 'finance') setTimeout(() => api?.kit?.(), 60);
  if (id === 'home') refreshHome();
  api?.refresh?.();
  if (id === 'voice' && intent) panes.voice.querySelector('details')?.setAttribute('open', '');
  if (intent && FIELD[real]) { const el = panes[real].querySelector(FIELD[real]); if (el) { if (real === 'harry' && panes.harry.querySelector('#h-agent').hidden) api.openAgent?.(); el.value = intent; el.focus(); } }
}

/* ---------- home ---------- */
let refreshHome = () => {};
function home(p){
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  p.innerHTML = `<div class="k-home"><div class="k-hero"><h1>${greet}. What are we making today?</h1>
    <form class="k-askbar" id="k-ask"><input id="k-q" placeholder="Ask Kiosk, e.g. “make a 30-second jingle for my bakery” or “turn these sales into a P&amp;L”" aria-label="Ask Kiosk"><button class="kb primary">Go</button></form>
    <div class="k-ai" id="k-aistat"></div></div>
    <div id="k-sugg"></div>
    <h3 class="k-sub">All studios</h3><div class="k-tiles">${STUDIOS.map(s => `<button class="k-tile" data-go="${s.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[s.id]}</svg><b>${esc(s.name)}</b><span>${esc(s.blurb)}</span></button>`).join('')}</div></div>`;
  p.querySelectorAll('.k-tile').forEach(b => b.onclick = () => show(b.dataset.go));
  p.querySelector('#k-ask').onsubmit = async e => { e.preventDefault(); const q = p.querySelector('#k-q').value.trim(); if (!q) return; const id = await route(q); p.querySelector('#k-q').value = ''; show(id, q); };
  refreshHome = async () => {
    const ids = await ai.usable(); const st = p.querySelector('#k-aistat');
    st.innerHTML = ids.length ? `<span class="dot on"></span>AI ready: ${ids.map(ai.nameOf).map(esc).join(' · ')}${ai.settings().mode === 'council' && ids.length > 1 ? ' (council mode)' : ''}` : `<span class="dot"></span>No AI connected yet. <button class="linkbtn" data-go="ai">Set up AI</button> — Groq, Gemini and OpenRouter have free keys.`;
    st.querySelector('[data-go]')?.addEventListener('click', () => show('ai'));
    const sg = suggestions(); p.querySelector('#k-sugg').innerHTML = sg.length ? `<h3 class="k-sub">Suggested for you</h3><div class="k-chips">${sg.map(id => { const s = STUDIOS.find(x => x.id === id); return `<button class="k-chip" data-go="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${ICON[id]}</svg>${esc(s.name)}</button>`; }).join('')}</div>` : '';
    p.querySelectorAll('#k-sugg [data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  };
  return {};
}
async function route(q){
  const ql = q.toLowerCase(), hits = STUDIOS.map(s => ({ ...s, at: ql.search(s.keys) })).filter(s => s.at >= 0).sort((a, b) => a.at - b.at);
  if (hits.length === 1) return hits[0].id;
  if ((await ai.usable()).length) { try { const { data } = await ai.askJSON(`Pick the one studio that best fits this request: "${q}". Studios: ${STUDIOS.map(s => `${s.id} (${s.blurb})`).join('; ')}. JSON: {"studio":"id"}`, { maxTokens: 200, mode: 'fallback' }); if (STUDIOS.some(s => s.id === data.studio)) return data.studio; } catch (e) {} }
  return hits[0]?.id || 'harry';
}

/* ---------- AI settings ---------- */
function aiPane(p){
  const S = ai.settings(), inClaude = !!window.claude;
  const draw = () => {
    p.innerHTML = `<div class="k-head"><div><h2>AI settings</h2><p>Kiosk uses a coalition of AI models: Claude, Venice AI and free models. If one is busy or fails, the next takes over. Keys are kept only on this device.</p></div></div>
    ${inClaude ? `<div class="k-note">You're using Termite inside Claude, so <b>Claude works here with no key</b>. Claude's pages can't contact other AI services, so Venice and the free models work only in the Termite apps for Windows, Linux and Android.</div>` : ''}
    <div class="k-card"><h4>How the coalition works</h4><label class="k-check"><input type="radio" name="mode" value="fallback" ${S.mode === 'fallback' ? 'checked' : ''}> <span><b>Fastest</b>: use the first model in the list, fall back to the next if it fails.</span></label>
      <label class="k-check"><input type="radio" name="mode" value="council" ${S.mode === 'council' ? 'checked' : ''}> <span><b>Council</b>: ask up to three models at once, then merge the best of their answers. Slower, often better.</span></label></div>
    <div class="k-provs">${S.order.map((id, i) => id === 'here' ? `<div class="k-card prov"><div class="prov-h"><b>Claude in Claude</b><span class="badge ${inClaude ? 'ok' : ''}">${inClaude ? 'Available' : 'Only inside Claude'}</span><span class="ord"><button class="kb ic" data-up="${i}" aria-label="Move up">↑</button><button class="kb ic" data-dn="${i}" aria-label="Move down">↓</button></span></div><p class="muted">Uses your Claude account when Termite is opened as a Claude page.</p></div>`
      : (() => { const P = ai.PROVIDERS[id], c = S.p[id]; return `<div class="k-card prov"><div class="prov-h"><label class="k-check"><input type="checkbox" data-on="${id}" ${c.on ? 'checked' : ''}> <b>${esc(P.label)}</b></label>${P.free ? '<span class="badge ok">Free</span>' : ''}<span class="ord"><button class="kb ic" data-up="${i}" aria-label="Move up">↑</button><button class="kb ic" data-dn="${i}" aria-label="Move down">↓</button></span></div>
        <p class="muted">${esc(P.note)} <a href="${P.keyUrl}" target="_blank" rel="noopener">${P.nokey ? 'Get Ollama' : 'Get a key'}</a></p>
        <div class="kf-row">${P.nokey ? '' : `<label class="kf"><span>API key</span><input type="password" data-key="${id}" value="${esc(c.key)}" autocomplete="off" placeholder="Paste key"></label>`}<label class="kf"><span>Model</span><input data-model="${id}" value="${esc(c.model)}" list="ml-${id}"><datalist id="ml-${id}"></datalist></label></div>
        <div class="kf-row"><button class="kb" data-test="${id}">Test</button><button class="kb" data-models="${id}">Load models</button><span class="muted" id="st-${id}"></span></div></div>`; })()).join('')}</div>`;
    p.querySelectorAll('[name=mode]').forEach(r => r.onchange = () => { S.mode = r.value; ai.saveSettings(); });
    p.querySelectorAll('[data-on]').forEach(x => x.onchange = () => { S.p[x.dataset.on].on = x.checked; ai.saveSettings(); });
    p.querySelectorAll('[data-key]').forEach(x => x.onchange = () => { S.p[x.dataset.key].key = x.value.trim(); if (x.value.trim()) { S.p[x.dataset.key].on = true; p.querySelector(`[data-on="${x.dataset.key}"]`).checked = true; } ai.saveSettings(); });
    p.querySelectorAll('[data-model]').forEach(x => x.onchange = () => { S.p[x.dataset.model].model = x.value.trim(); ai.saveSettings(); });
    p.querySelectorAll('[data-up],[data-dn]').forEach(b => b.onclick = () => { const i = +(b.dataset.up ?? b.dataset.dn), j = b.dataset.up != null ? i - 1 : i + 1; if (j < 0 || j >= S.order.length) return; [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; ai.saveSettings(); draw(); });
    p.querySelectorAll('[data-test]').forEach(b => b.onclick = async () => { const id = b.dataset.test, st = p.querySelector('#st-' + id); st.textContent = 'Testing…'; try { const t = await ai.test(id); st.textContent = '✓ Connected: ' + t.slice(0, 40); } catch (e) { st.textContent = '✗ ' + e.message; } });
    p.querySelectorAll('[data-models]').forEach(b => b.onclick = async () => { const id = b.dataset.models, st = p.querySelector('#st-' + id); st.textContent = 'Loading…'; try { const m = await ai.listModels(id); p.querySelector('#ml-' + id).innerHTML = m.map(x => `<option value="${esc(x)}">`).join(''); st.textContent = m.length + ' models: click the Model box to choose.'; } catch (e) { st.textContent = '✗ ' + e.message; } });
  };
  draw(); return {};
}

/* ---------- about and licence ---------- */
function about(p){
  p.innerHTML = `<div class="k-head"><div><h2>About Kiosk</h2><p>Termite's studio of AI agents and creative tools.</p></div></div>
  <div class="k-card"><h4>License</h4><p><b>Termite and Kiosk © 2026 Kammie Holder, Ai Innovation Studio.</b><br>Licensed under the Apache License, Version 2.0.</p></div>
  <div class="k-card"><h4>How the smart features work</h4><ul>
    <li><b>Agentic:</b> Harry and the writing agents plan, act, check their own results and fix errors before handing over.</li>
    <li><b>Coalition AI:</b> Claude, Venice AI and free models (OpenRouter, Groq, Gemini, Ollama), with automatic fallback or a council that merges answers.</li>
    <li><b>Predictive:</b> Harry's forecasts test several methods on your own recent figures and pick the most accurate; anomaly checks flag unusual numbers.</li>
    <li><b>Learns your habits:</b> the home screen suggests studios from what you use and when, kept only on this device.</li>
    <li><b>Private by design:</b> your files are processed on your device. Text goes only to the AI services you switch on.</li></ul></div>
  <div class="k-card"><h4>Built with</h4><p class="muted">pdf.js (Apache-2.0), ExcelJS (MIT), PptxGenJS (MIT), Chart.js (MIT), mammoth (BSD-2), JSZip (MIT), jsPDF (MIT), html2canvas (MIT). The Picture Editor is Termite's own tool, made in the spirit of desktop photo editors. It is not affiliated with NCH Software, Microsoft, Adobe or any AI provider named here.</p></div>`;
  return {};
}

show('home');
export default { show };
