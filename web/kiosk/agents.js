// Kiosk writing agents: Pitch Deck, Brochure and Business Plan.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const THEMES = {
  amber:  { name: 'Amber',  bg: '#ffffff', ink: '#1c2430', accent: '#a8520a', soft: '#fbe9d7', dark: '#2a1a0c' },
  ocean:  { name: 'Ocean',  bg: '#ffffff', ink: '#13263a', accent: '#0f6fa8', soft: '#dceefa', dark: '#0b2a40' },
  forest: { name: 'Forest', bg: '#ffffff', ink: '#17261b', accent: '#2f7d4a', soft: '#e0f1e6', dark: '#10301c' },
  slate:  { name: 'Slate',  bg: '#ffffff', ink: '#1d2229', accent: '#4a5568', soft: '#e7eaef', dark: '#151a21' },
  coral:  { name: 'Coral',  bg: '#ffffff', ink: '#2a1b1b', accent: '#d2553f', soft: '#fbe3dd', dark: '#3a1610' },
};
const themeSel = id => `<select id="${id}" aria-label="Colour theme">${Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('')}</select>`;
const field = (id, label, ph = '', rows = 0, val = '') => `<label class="kf"><span>${label}</span>${rows ? `<textarea id="${id}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea>` : `<input id="${id}" placeholder="${esc(ph)}" value="${esc(val)}">`}</label>`;
const filesField = id => `<label class="kf"><span>Background files (optional)</span><div class="kfiles"><label class="kb">Attach<input type="file" id="${id}" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.xlsx"></label><span class="muted" id="${id}-l">Plans, notes, figures — the agent reads them.</span></div></label>`;
async function readFiles(K, input){ const out = []; for (const f of input.files) { try { out.push(`=== ${f.name} ===\n` + (await K.readText(f)).slice(0, 25000)); } catch (e) {} } return out.join('\n\n'); }
const remember = (key, ids, $) => { try { const v = JSON.parse(localStorage.getItem(key) || '{}'); ids.forEach(i => { if (v[i] != null && $('#' + i)) $('#' + i).value = v[i]; }); } catch (e) {} ids.forEach(i => $('#' + i)?.addEventListener('input', () => { try { const v = JSON.parse(localStorage.getItem(key) || '{}'); v[i] = $('#' + i).value; localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} })); };

async function slidesToPdf(K, nodes, w, h, name){
  await K.lib('html2canvas'); await K.lib('jspdf'); const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait' });
  for (let i = 0; i < nodes.length; i++) { K.status(`Making the PDF… ${i + 1} of ${nodes.length}`, 0);
    const cv = await html2canvas(nodes[i], { scale: 2, backgroundColor: '#ffffff', logging: false }); if (i) pdf.addPage([w, h], w > h ? 'landscape' : 'portrait');
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h); }
  return pdf.output('blob');
}
const editable = el => el.querySelectorAll('[data-k]').forEach(n => n.contentEditable = 'true');

/* =================== PITCH DECK AGENT =================== */
export function pitch(root, K){
  const $ = s => root.querySelector(s);
  root.innerHTML = `<div class="k-head"><div><h2>Pitch Deck Agent</h2><p>Describe the business. The agent drafts an investor-ready deck you can edit, then save as PowerPoint or PDF.</p></div></div>
  <div class="k-split"><form class="k-form" id="p-form">
    ${field('p-co', 'Company name', 'e.g. Coral Reef Foods')}${field('p-one', 'One-line description', 'What you do, for whom')}
    ${field('p-prob', 'Problem', 'The pain your customers feel', 2)}${field('p-sol', 'Your solution', 'How you fix it', 2)}
    ${field('p-mkt', 'Market and customers', 'Who buys, how many, how big', 2)}${field('p-model', 'How you make money', 'Pricing, channels', 2)}
    ${field('p-trac', 'Traction so far', 'Sales, users, partners, milestones', 2)}${field('p-comp', 'Competition and your edge', '', 2)}
    ${field('p-team', 'Team', 'Founders and key people', 2)}${field('p-ask', 'The ask', 'e.g. $250k for 12 months: hiring, marketing, equipment')}
    <div class="kf-row"><label class="kf"><span>Audience</span><select id="p-aud"><option>Investors</option><option>Bank or lender</option><option>Grant panel</option><option>Customers or partners</option></select></label>
    <label class="kf"><span>Slides</span><select id="p-n"><option>8</option><option selected>10</option><option>12</option><option>15</option></select></label><label class="kf"><span>Theme</span>${themeSel('p-theme')}</label></div>
    ${filesField('p-files')}
    <div class="kf-row"><button class="kb primary" type="submit" id="p-go">Create the deck</button><span class="muted" id="p-st"></span></div>
  </form>
  <div class="k-out"><div class="k-out-bar" id="p-bar" hidden><span class="muted">Click any text to edit it.</span><button class="kb" id="p-pptx">Save PowerPoint</button><button class="kb" id="p-pdf">Save PDF</button><button class="kb" id="p-share">Share</button><button class="kb" id="p-again">Redo</button></div>
    <div id="p-deck" class="deck"><div class="k-empty">Your slides appear here.</div></div></div></div>`;
  const ids = ['p-co', 'p-one', 'p-prob', 'p-sol', 'p-mkt', 'p-model', 'p-trac', 'p-comp', 'p-team', 'p-ask', 'p-aud', 'p-n', 'p-theme']; remember('termite.pitch', ids, $);
  $('#p-files').onchange = e => $('#p-files-l').textContent = [...e.target.files].map(f => f.name).join(', ') || 'None';
  let deck = null;
  async function make(){
    const v = id => $('#' + id).value.trim(); if (!v('p-co') && !v('p-one') && !$('#p-files').files.length) { K.status('Give at least the company name and what it does.'); return; }
    $('#p-go').disabled = true; $('#p-st').textContent = 'Reading your notes…';
    const files = await readFiles(K, $('#p-files'));
    const prompt = `Create a ${v('p-n')}-slide pitch deck for ${v('p-aud')}. Follow the proven structure (title, problem, solution, market size, product, business model, traction, competition, go-to-market, team, financials, the ask, closing) trimmed to fit. Be concrete and persuasive; short bullets (max 12 words, 3-5 per slide); one strong headline per slide. Use only facts given; where a number is missing write a clear placeholder like [add monthly revenue].
Company: ${v('p-co')}\nOne-liner: ${v('p-one')}\nProblem: ${v('p-prob')}\nSolution: ${v('p-sol')}\nMarket: ${v('p-mkt')}\nBusiness model: ${v('p-model')}\nTraction: ${v('p-trac')}\nCompetition: ${v('p-comp')}\nTeam: ${v('p-team')}\nAsk: ${v('p-ask')}\n${files ? 'BACKGROUND FILES:\n' + files : ''}
JSON shape: {"slides":[{"layout":"title|bullets|stat|split|closing","title":"","subtitle":"","bullets":[""],"stat":{"value":"","label":""},"notes":"speaker notes, 2-3 sentences"}]}`;
    try { const { data, by } = await K.ai.askJSON(prompt, { maxTokens: 6000, onStatus: s => $('#p-st').textContent = s });
      deck = { slides: (data.slides || data).filter(Boolean), company: v('p-co') || 'Pitch deck' }; render(); $('#p-st').textContent = 'Drafted with ' + by + '.'; }
    catch (e) { $('#p-st').textContent = ''; K.status(e.message, 9000); }
    $('#p-go').disabled = false;
  }
  function render(){
    const t = THEMES[$('#p-theme').value]; const box = $('#p-deck'); box.innerHTML = ''; $('#p-bar').hidden = false;
    deck.slides.forEach((s, i) => { const d = document.createElement('div'); d.className = 'slide lay-' + (s.layout || 'bullets'); d.style.cssText = `--bg:${t.bg};--ink:${t.ink};--ac:${t.accent};--soft:${t.soft};--dark:${t.dark}`;
      const bl = (s.bullets || []).filter(Boolean);
      d.innerHTML = s.layout === 'title' || s.layout === 'closing'
        ? `<div class="sl-hero"><h1 data-k="title">${esc(s.title)}</h1><p data-k="subtitle">${esc(s.subtitle || bl[0] || '')}</p></div>`
        : s.layout === 'stat' && s.stat?.value ? `<h2 data-k="title">${esc(s.title)}</h2><div class="sl-stat"><b data-k="sv">${esc(s.stat.value)}</b><span data-k="sl">${esc(s.stat.label)}</span></div><ul>${bl.map(b => `<li data-k="b">${esc(b)}</li>`).join('')}</ul>`
        : `<h2 data-k="title">${esc(s.title)}</h2>${s.subtitle ? `<p class="sl-sub" data-k="subtitle">${esc(s.subtitle)}</p>` : ''}<ul${s.layout === 'split' ? ' class="two"' : ''}>${bl.map(b => `<li data-k="b">${esc(b)}</li>`).join('')}</ul>`;
      d.insertAdjacentHTML('beforeend', `<div class="sl-foot"><span>${esc(deck.company)}</span><span>${i + 1}</span></div>`);
      d.addEventListener('input', () => sync(d, i)); editable(d); box.append(d);
      if (s.notes) { const n = document.createElement('p'); n.className = 'sl-notes'; n.textContent = 'Notes: ' + s.notes; box.append(n); } });
  }
  function sync(d, i){ const s = deck.slides[i]; s.title = d.querySelector('[data-k=title]')?.innerText || s.title; const sub = d.querySelector('[data-k=subtitle]'); if (sub) s.subtitle = sub.innerText;
    s.bullets = [...d.querySelectorAll('[data-k=b]')].map(x => x.innerText.trim()).filter(Boolean); if (s.stat) { s.stat.value = d.querySelector('[data-k=sv]')?.innerText || s.stat.value; s.stat.label = d.querySelector('[data-k=sl]')?.innerText || s.stat.label; } }
  async function pptx(){
    await K.lib('pptxgen'); const t = THEMES[$('#p-theme').value], P = new PptxGenJS(); P.layout = 'LAYOUT_WIDE'; P.title = deck.company;
    const C = c => c.replace('#', '');
    deck.slides.forEach((s, i) => { const sl = P.addSlide(); const hero = s.layout === 'title' || s.layout === 'closing';
      sl.background = { color: hero ? C(t.dark) : C(t.bg) };
      if (hero) { sl.addText(s.title || '', { x: 0.8, y: 2.3, w: 11.7, h: 1.6, fontSize: 44, bold: true, color: 'FFFFFF', fontFace: 'Calibri' }); sl.addText(s.subtitle || '', { x: 0.8, y: 3.9, w: 11.7, h: 1, fontSize: 22, color: C(t.soft) }); sl.addShape(P.ShapeType.rect, { x: 0.8, y: 2.1, w: 1.2, h: 0.08, fill: { color: C(t.accent) } }); }
      else { sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C(t.accent) } }); sl.addText(s.title || '', { x: 0.7, y: 0.45, w: 12, h: 0.9, fontSize: 32, bold: true, color: C(t.ink) });
        let y = 1.5; if (s.subtitle) { sl.addText(s.subtitle, { x: 0.7, y, w: 12, h: 0.6, fontSize: 18, color: C(t.accent) }); y += 0.7; }
        if (s.layout === 'stat' && s.stat?.value) { sl.addText(s.stat.value, { x: 0.7, y, w: 5.5, h: 1.5, fontSize: 60, bold: true, color: C(t.accent) }); sl.addText(s.stat.label || '', { x: 0.7, y: y + 1.4, w: 5.5, h: 0.8, fontSize: 18, color: C(t.ink) });
          sl.addText((s.bullets || []).map(b => ({ text: b, options: { bullet: true } })), { x: 6.6, y, w: 6.2, h: 4.5, fontSize: 20, color: C(t.ink), valign: 'top', paraSpaceAfter: 8 }); }
        else sl.addText((s.bullets || []).map(b => ({ text: b, options: { bullet: { code: '25A0' } } })), { x: 0.7, y, w: 12, h: 5.4 - (y - 1.5), fontSize: 22, color: C(t.ink), valign: 'top', paraSpaceAfter: 10 });
        sl.addText(`${deck.company}   ${i + 1}`, { x: 0.7, y: 6.9, w: 12, h: 0.4, fontSize: 11, color: '888888', align: 'right' }); }
      if (s.notes) sl.addNotes(s.notes); });
    return P.write({ outputType: 'blob' });
  }
  const pdf = () => slidesToPdf(K, [...root.querySelectorAll('.slide')], 960, 540);
  $('#p-form').onsubmit = e => { e.preventDefault(); make(); };
  $('#p-theme').onchange = () => deck && render(); $('#p-again').onclick = make;
  $('#p-pptx').onclick = () => K.busy('Building PowerPoint…', async () => K.save(await pptx(), deck.company + ' pitch deck.pptx'));
  $('#p-pdf').onclick = () => K.busy('Making the PDF…', async () => K.save(await pdf(), deck.company + ' pitch deck.pdf'));
  $('#p-share').onclick = () => K.share({ name: deck.company + ' pitch deck', make: { pptx: { label: 'PowerPoint', build: async () => ({ blob: await pptx(), filename: deck.company + ' pitch deck.pptx' }) }, pdf: { label: 'PDF', build: async () => ({ blob: await pdf(), filename: deck.company + ' pitch deck.pdf' }) } } });
}

/* =================== BROCHURE AGENT =================== */
export function brochure(root, K){
  const $ = s => root.querySelector(s);
  root.innerHTML = `<div class="k-head"><div><h2>Brochure Agent</h2><p>A print-ready tri-fold brochure (A4, both sides). The agent writes it; you add your photo and logo and fine-tune the words.</p></div></div>
  <div class="k-split"><form class="k-form" id="b-form">
    ${field('b-co', 'Business or event name')}${field('b-what', 'What you offer', 'Services, products, programme', 3)}
    ${field('b-who', 'Who it is for', 'Your ideal reader')}${field('b-why', 'Why choose you', 'Experience, guarantees, awards', 2)}
    ${field('b-cta', 'What should readers do?', 'e.g. Call to book a free visit')}${field('b-contact', 'Contact details', 'Phone, email, website, address', 2)}
    <div class="kf-row"><label class="kf"><span>Tone</span><select id="b-tone"><option>Warm and friendly</option><option>Professional</option><option>Premium</option><option>Bold and energetic</option></select></label><label class="kf"><span>Theme</span>${themeSel('b-theme')}</label></div>
    <div class="kf-row"><label class="kb">Cover photo<input type="file" id="b-img" accept="image/*" hidden></label><label class="kb">Logo<input type="file" id="b-logo" accept="image/*" hidden></label><span class="muted" id="b-imgs"></span></div>
    ${filesField('b-files')}
    <div class="kf-row"><button class="kb primary" type="submit" id="b-go">Create the brochure</button><span class="muted" id="b-st"></span></div>
  </form>
  <div class="k-out"><div class="k-out-bar" id="b-bar" hidden><span class="muted">Click any text to edit. Print double-sided, flip on the short edge, fold in three.</span><button class="kb" id="b-pdf">Save PDF</button><button class="kb" id="b-share">Share</button><button class="kb" id="b-again">Redo</button></div>
    <div id="b-out"><div class="k-empty">Your brochure appears here.</div></div></div></div>`;
  remember('termite.brochure', ['b-co', 'b-what', 'b-who', 'b-why', 'b-cta', 'b-contact', 'b-tone', 'b-theme'], $);
  const pics = {}; const pick = (inp, key) => inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { pics[key] = r.result; $('#b-imgs').textContent = Object.keys(pics).map(k => k === 'img' ? 'photo ✓' : 'logo ✓').join(' · '); if (data) render(); }; r.readAsDataURL(f); };
  pick($('#b-img'), 'img'); pick($('#b-logo'), 'logo'); $('#b-files').onchange = e => $('#b-files-l').textContent = [...e.target.files].map(f => f.name).join(', ');
  let data = null;
  async function make(){
    const v = id => $('#' + id).value.trim(); if (!v('b-co') && !v('b-what')) { K.status('Tell the agent the business name and what it offers.'); return; }
    $('#b-go').disabled = true; const files = await readFiles(K, $('#b-files'));
    const prompt = `Write the copy for a tri-fold brochure. Tone: ${v('b-tone')}. Keep it tight: it must fit six narrow panels. Use only facts given; invent no prices, awards or testimonials (use [placeholder] where useful).
Business: ${v('b-co')}\nOffer: ${v('b-what')}\nAudience: ${v('b-who')}\nWhy us: ${v('b-why')}\nCall to action: ${v('b-cta')}\nContact: ${v('b-contact')}\n${files ? 'FILES:\n' + files : ''}
JSON: {"cover":{"headline":"max 6 words","tagline":"max 14 words"},"flap":{"heading":"","body":"max 45 words","bullets":["max 4"]},"inside":[{"heading":"","body":"max 55 words","bullets":["max 4, short"]},{"heading":"","body":"","bullets":[]},{"heading":"","body":"","bullets":[]}],"back":{"heading":"","cta":"","contact":["lines"]}}`;
    try { const r = await K.ai.askJSON(prompt, { maxTokens: 3000, onStatus: s => $('#b-st').textContent = s }); data = r.data; render(); $('#b-st').textContent = 'Written with ' + r.by + '.'; }
    catch (e) { $('#b-st').textContent = ''; K.status(e.message, 9000); }
    $('#b-go').disabled = false;
  }
  const panel = p => `<div class="bp"><h3 data-k>${esc(p?.heading)}</h3><p data-k>${esc(p?.body)}</p>${p?.bullets?.length ? `<ul>${p.bullets.map(b => `<li data-k>${esc(b)}</li>`).join('')}</ul>` : ''}</div>`;
  function render(){
    const t = THEMES[$('#b-theme').value], name = $('#b-co').value.trim(); $('#b-bar').hidden = false;
    const st = `--ink:${t.ink};--ac:${t.accent};--soft:${t.soft};--dark:${t.dark}`;
    $('#b-out').innerHTML = `<p class="muted">Outside</p><div class="bro" style="${st}">${panel(data.flap)}
      <div class="bp back"><h3 data-k>${esc(data.back?.heading)}</h3><p class="cta" data-k>${esc(data.back?.cta)}</p>${(data.back?.contact || []).map(c => `<p data-k>${esc(c)}</p>`).join('')}${pics.logo ? `<img class="logo" src="${pics.logo}" alt="">` : ''}</div>
      <div class="bp cover">${pics.img ? `<img class="hero" src="${pics.img}" alt="">` : '<div class="hero ph"></div>'}${pics.logo ? `<img class="logo" src="${pics.logo}" alt="">` : `<div class="mark">${esc(name)}</div>`}<h1 data-k>${esc(data.cover?.headline)}</h1><p data-k>${esc(data.cover?.tagline)}</p></div></div>
      <p class="muted">Inside</p><div class="bro" style="${st}">${(data.inside || []).slice(0, 3).map(panel).join('')}</div>`;
    editable($('#b-out'));
  }
  const pdf = () => slidesToPdf(K, [...root.querySelectorAll('.bro')], 842, 595);
  $('#b-form').onsubmit = e => { e.preventDefault(); make(); }; $('#b-again').onclick = make; $('#b-theme').onchange = () => data && render();
  const nm = () => ($('#b-co').value.trim() || 'Brochure') + ' brochure.pdf';
  $('#b-pdf').onclick = () => K.busy('Making the PDF…', async () => K.save(await pdf(), nm()));
  $('#b-share').onclick = () => K.share({ name: nm().replace(/\.pdf$/, ''), make: { pdf: { label: 'PDF', build: async () => ({ blob: await pdf(), filename: nm() }) } } });
}

/* =================== BUSINESS PLAN WRITER =================== */
export function plan(root, K){
  const $ = s => root.querySelector(s);
  const SECTIONS = ['Executive summary', 'Company overview', 'Products and services', 'Market analysis', 'Competitive analysis', 'Marketing and sales plan', 'Operations plan', 'Management and organisation', 'Financial plan', 'Funding request', 'Risks and mitigation', 'Milestones and next steps'];
  root.innerHTML = `<div class="k-head"><div><h2>Business Plan Writer</h2><p>The agent outlines the plan, writes each section in turn, then builds three-year projections in Harry. The finished plan opens in Word mode, ready to edit and save.</p></div></div>
  <div class="k-split"><form class="k-form" id="bp-form">
    ${field('bp-co', 'Business name')}${field('bp-what', 'What the business does', '', 3)}${field('bp-where', 'Location and market', 'e.g. Bridgetown, Barbados; tourists and locals')}
    ${field('bp-cust', 'Customers', '', 2)}${field('bp-comp', 'Competitors', '', 2)}${field('bp-team', 'Owners and team', '', 2)}
    ${field('bp-money', 'Money', 'Start-up costs, prices, expected sales, funding needed', 3)}
    <div class="kf-row"><label class="kf"><span>Purpose</span><select id="bp-for"><option>Bank loan</option><option>Investors</option><option>Grant application</option><option>Internal planning</option></select></label><label class="kf"><span>Currency</span><input id="bp-cur" value="$" style="width:60px"></label></div>
    <div class="k-checks">${SECTIONS.map((s, i) => `<label><input type="checkbox" value="${esc(s)}" ${i < 11 ? 'checked' : ''}> ${s}</label>`).join('')}</div>
    <label class="k-check"><input type="checkbox" id="bp-fin" checked> Also build 3-year projections in Harry the Accountant</label>
    ${filesField('bp-files')}
    <div class="kf-row"><button class="kb primary" type="submit" id="bp-go">Write the plan</button><button class="kb" type="button" id="bp-stop" hidden>Stop</button></div>
  </form>
  <div class="k-out"><ol class="k-steps" id="bp-steps"><li class="muted">Progress appears here as each section is written.</li></ol></div></div>`;
  remember('termite.plan', ['bp-co', 'bp-what', 'bp-where', 'bp-cust', 'bp-comp', 'bp-team', 'bp-money', 'bp-for', 'bp-cur'], $);
  $('#bp-files').onchange = e => $('#bp-files-l').textContent = [...e.target.files].map(f => f.name).join(', ');
  let stop = false; $('#bp-stop').onclick = () => { stop = true; };
  $('#bp-form').onsubmit = async e => {
    e.preventDefault(); const v = id => $('#' + id).value.trim(); if (!v('bp-co') || !v('bp-what')) { K.status('Give the business name and what it does.'); return; }
    const chosen = [...root.querySelectorAll('.k-checks input:checked')].map(i => i.value); if (!chosen.length) return;
    stop = false; $('#bp-go').disabled = true; $('#bp-stop').hidden = false; const steps = $('#bp-steps'); steps.innerHTML = '';
    const step = t => { const li = document.createElement('li'); li.textContent = t; li.className = 'run'; steps.append(li); return li; };
    const brief = `Business: ${v('bp-co')}\nWhat it does: ${v('bp-what')}\nLocation/market: ${v('bp-where')}\nCustomers: ${v('bp-cust')}\nCompetitors: ${v('bp-comp')}\nTeam: ${v('bp-team')}\nMoney: ${v('bp-money')}\nPurpose of plan: ${v('bp-for')}\nCurrency: ${v('bp-cur')}`;
    const files = await readFiles(K, $('#bp-files'));
    let html = `<h1 class="title">${esc(v('bp-co'))} — Business Plan</h1><p><em>Prepared ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long' })} · ${esc(v('bp-for'))}</em></p><hr class="pb">`;
    try {
      let s = step('Planning the outline…');
      const { data: outline } = await K.ai.askJSON(`You are a business plan consultant. Plan a business plan for a ${v('bp-for').toLowerCase()} with these sections: ${chosen.join('; ')}. For each, list 3-5 key points it must cover, based strictly on the brief and files.\n${brief}\n${files ? 'FILES:\n' + files : ''}\nJSON: {"sections":[{"title":"","points":[""]}],"missing":["facts the owner should supply"]}`, { maxTokens: 3000 });
      s.className = 'ok'; s.textContent = 'Outline ready';
      const written = [];
      for (const sec of outline.sections || []) {
        if (stop) break; s = step('Writing: ' + sec.title + '…');
        const r = await K.ai.ask(`Write the "${sec.title}" section of a business plan (${v('bp-for')}). Cover: ${(sec.points || []).join('; ')}.
Use clear, confident, plain English. 180-350 words. Use short paragraphs, and a bulleted list or a small table where it genuinely helps. Use only facts from the brief and files; where a figure is needed but missing, write [add …]. Output simple HTML only (<p>, <ul><li>, <table><tr><th>/<td>, <b>) with no heading for the section itself.
BRIEF:\n${brief}\n${files ? 'FILES:\n' + files.slice(0, 20000) : ''}\nALREADY WRITTEN (keep consistent, don't repeat):\n${written.map(w => w.title + ': ' + w.text.replace(/<[^>]+>/g, ' ').slice(0, 400)).join('\n')}`, { maxTokens: 2500 });
        const body = r.text.replace(/```html?|```/g, '').replace(/<\/?(html|body|head|h1|h2)[^>]*>/gi, '').trim();
        written.push({ title: sec.title, text: body }); html += `<h1>${esc(sec.title)}</h1>${body}`; s.className = 'ok'; s.textContent = sec.title + ' ✓';
      }
      if ((outline.missing || []).length) html += `<h2>Information still needed</h2><ul>${outline.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
      if ($('#bp-fin').checked && !stop) {
        s = step('Building 3-year projections in Harry…');
        const { data: fin } = await K.ai.askJSON(`From this brief, build simple 3-year annual projections. Use only given figures; where missing make conservative, clearly labelled assumptions.\n${brief}\n${files.slice(0, 15000)}\nJSON: {"assumptions":[["label", number, "unit or note"]],"revenue_lines":[["name", y1, y2, y3]],"cost_lines":[["name", y1, y2, y3]],"startup_costs":number,"funding":number}`, { maxTokens: 2500 });
        K.harryProjection(v('bp-co'), fin, v('bp-cur')); s.className = 'ok'; s.textContent = 'Projections built in Harry ✓ (sheet "Projections")';
      }
      K.openInWord(html, v('bp-co') + ' business plan'); step('Done: the plan is open in Word mode. Save it as .docx or PDF from there.').className = 'ok';
    } catch (err) { step(err.message || String(err)).className = 'bad'; }
    $('#bp-go').disabled = false; $('#bp-stop').hidden = true;
  };
}
