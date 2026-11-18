// Kiosk Matrix: three AI assistants (Claude, DeepSeek and DaVinci). Chat with one, or ask all three side by side.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'termite.matrix.v1';

const ASSIST = {
  claude: { name: 'Claude', by: 'Anthropic', color: '#d97757', tag: 'Careful thinking, writing and analysis', engines: ['here', 'claude'],
    setup: 'Claude works with no key when you use Termite inside the Claude app. In the Termite apps, add an Anthropic API key in AI settings.',
    system: 'You are Claude, an AI assistant made by Anthropic, working inside Termite (a PDF, Word and creative app) in its Matrix studio. Be warm, clear and genuinely helpful. Use short paragraphs and bullet points where they help. If the user includes their open document, base your answer on it and say when something isn\'t in it.',
    starters: [['Summarise my open document', true], ['Improve the writing in my document', true], ['Draft a polite reply email to this', true], ['Explain this simply, as if I\'m 12', false]] },
  deepseek: { name: 'DeepSeek', by: 'DeepSeek', color: '#4d6bfe', tag: 'Maths, logic, code and step-by-step reasoning', engines: ['deepseek'],
    setup: 'Add a DeepSeek API key in AI settings (platform.deepseek.com › API keys). It costs very little per question.',
    system: 'You are DeepSeek, an AI assistant working inside Termite\'s Matrix studio. You excel at maths, logic, code and step-by-step reasoning. Show your working when it helps, then give a clear final answer. If the user includes their open document, base your answer on it.',
    starters: [['Check the numbers and maths in my document', true], ['Work this out step by step: ', false], ['Write an Excel formula that ', false], ['Find the weak points in this argument', true]] },
  davinci: { name: 'DaVinci', by: 'Termite', color: '#b8860b', tag: 'Creative director: ideas, design, art direction and image prompts', engines: null,
    setup: 'DaVinci runs on any AI you have set up. Connect one in AI settings (Groq, Gemini and OpenRouter have free keys).',
    system: 'You are DaVinci, Termite\'s creative director, in the Renaissance spirit of art joined with engineering. You help with ideas, names, branding, design, layout, colour, art direction, storytelling and detailed prompts for image generators. Be imaginative but practical: give concrete options (names, palettes with hex codes, layouts, taglines, ready-to-use image prompts). You are an AI persona, not the historical Leonardo da Vinci, and you never claim to be him.',
    starters: [['10 brand name ideas, with a tagline each, for ', false], ['A colour palette with hex codes for ', false], ['An image prompt for a poster about ', false], ['Design a one-page flyer layout from my document', true]] },
  free: { name: 'Free AI', by: 'OpenRouter · Groq · Gemini · Ollama', color: '#1f9d6b', tag: 'Costs nothing: the best free model you\'ve connected', engines: null,
    setup: 'Add a free key in AI settings: Gemini (Google AI Studio), Groq or OpenRouter take a minute and cost nothing. Or install Ollama to run AI on this computer.',
    system: 'You are a friendly, capable AI assistant inside Termite\'s Matrix studio (Termite is a PDF, Word and creative app). Be clear and practical; use short paragraphs and bullet points where they help. If the user includes their open document, base your answer on it.',
    starters: [['Summarise my open document', true], ['Write a short professional email about ', false], ['Give me 10 ideas for ', false], ['Explain this simply', true]] },
};
const IDS = Object.keys(ASSIST);              // the tabs
const ALL = ['claude', 'deepseek', 'davinci']; // who answers in "All three"

function md(t){
  const lines = String(t || '').replace(/\r/g, '').split('\n'); let out = '', list = null, code = null;
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const l of lines) {
    if (/^```/.test(l)) { if (code === null) { close(); code = ''; } else { out += `<pre><code>${esc(code)}</code></pre>`; code = null; } continue; }
    if (code !== null) { code += l + '\n'; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); out += `<h${Math.min(6, m[1].length + 3)}>${inline(m[2])}</h${Math.min(6, m[1].length + 3)}>`; }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (!l.trim()) close();
    else { close(); out += `<p>${inline(l)}</p>`; }
  }
  if (code !== null) out += `<pre><code>${esc(code)}</code></pre>`;
  close(); return out;
}

export function matrix(root, K){
  const T = window.termite, ai = K.ai;
  const $ = s => root.querySelector(s);
  let st = { cur: 'claude', threads: { claude: [], deepseek: [], davinci: [], free: [] }, rounds: [], engine: '', withDoc: false };
  try { const s = JSON.parse(localStorage.getItem(STORE) || '{}'); st = { ...st, ...s, threads: { ...st.threads, ...(s.threads || {}) } }; } catch (e) {}
  const keep = () => { try { const slim = { ...st, threads: Object.fromEntries(IDS.map(id => [id, st.threads[id].slice(-40).map(({ role, content, by }) => ({ role, content, by }))])), rounds: st.rounds.slice(-8) }; localStorage.setItem(STORE, JSON.stringify(slim)); } catch (e) {} };
  let busy = 0, stop = null;

  // Who answers for each seat, in order. Free models stand in when a paid one has no credit (or Free AI only is on).
  const FREE_IDS = () => ai.settings().order.filter(x => x !== 'here' && ai.PROVIDERS[x]?.free);
  async function chain(id){
    const S = ai.settings(), out = [], add = async (e, model, stand) => { if (await ai.ready(e) && !(S.freeOnly && ai.isPaid(e)) && !ai.restingNow(e) && !out.some(o => o.e === e && o.model === model)) out.push({ e, model, stand }); };
    if (id === 'claude') { for (const e of ASSIST.claude.engines) await add(e); }
    if (id === 'deepseek') { await add('deepseek'); if (await ai.ready('openrouter')) await add('openrouter', await ai.freeDeepSeek()); }
    if (id === 'free') { for (const e of FREE_IDS()) await add(e); return out; }
    if (id === 'davinci' && st.engine) await add(st.engine);
    const free = FREE_IDS(), rot = id === 'claude' && free.length > 1 ? [...free.slice(1), free[0]] : free;   // different seats lean on different free models
    for (const e of (id === 'davinci' ? (await ai.usable()) : rot)) await add(e, undefined, id !== 'davinci');
    return out;
  }
  async function engineFor(id){ return (await chain(id))[0] || null; }
  const SEAT = { claude: 'You are an AI assistant sitting in Termite\'s "Claude" seat, standing in because Claude itself isn\'t available right now: focus on careful thinking, clear writing and analysis. Don\'t claim to be Claude.',
    deepseek: 'You are an AI assistant sitting in Termite\'s "DeepSeek" seat, standing in because DeepSeek itself isn\'t available right now: focus on maths, logic, code and step-by-step reasoning. Don\'t claim to be DeepSeek.' };
  /** Ask a seat, falling through its chain. Returns { text, by }. */
  async function askSeat(id, messages, signal){
    const tries = await chain(id), errs = [];
    if (!tries.length) throw new Error(`${ASSIST[id].name} isn't connected. ${ASSIST[id].setup}`);
    for (const t of tries) {
      const sys = t.stand && SEAT[id] ? SEAT[id] + '\n\n' + ASSIST[id].system.replace(/^You are (Claude|DeepSeek)[^.]*\./, '') : ASSIST[id].system;
      try { const x = await ai.askOne(t.e, messages, { system: sys, maxTokens: 3000, signal, model: t.model });
        const why = errs.length ? ` (${ASSIST[id].name}: ${errs[0]})` : '';
        const by = id === 'free' ? `${x.by} · free` : id === 'davinci' ? `DaVinci, thinking with ${x.by}` : t.stand ? `Answered by ${x.by}, free, in ${ASSIST[id].name}'s seat${why}` : x.by + (t.model && /:free$/.test(t.model) ? ' · free' : '');
        return { text: x.text, by };
      } catch (e) { if (e.name === 'AbortError') throw e; errs.push(ai.isBilling(e) ? 'needs API credit' : (e.message || String(e)).slice(0, 90)); }
    }
    throw new Error(`${ASSIST[id].name} couldn't answer. ${errs.join(' · ')}`);
  }
  async function docContext(){
    try {
      const word = !document.getElementById('wstage')?.hidden;
      if (word) { const t = document.getElementById('doc')?.innerText || ''; if (t.trim()) return { name: 'your Word document', text: t.slice(0, 20000) }; }
      const pdf = T.pdf(); if (!pdf) return null; let t = '';
      for (let p = 1; p <= Math.min(pdf.numPages, 30) && t.length < 20000; p++) { const c = await (await pdf.getPage(p)).getTextContent(); t += c.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n\n'; }
      return t.trim() ? { name: '"' + T.pdfName() + '"', text: t.slice(0, 20000) } : null;
    } catch (e) { return null; }
  }
  const avatar = id => id === 'all' ? '<span class="mx-av mx-all">◆</span>' : `<span class="mx-av" style="--c:${ASSIST[id].color}">${ASSIST[id].name[0]}</span>`;

  root.innerHTML = `<div class="k-head"><div><h2>Matrix</h2><p>Chat with <b>Claude</b>, <b>DeepSeek</b>, <b>DaVinci</b> or <b>Free AI</b>, or ask the first three at once and compare their answers side by side. No credit on a paid service? Free models step in by themselves (blue dot), or tick <b>Free AI only</b>.</p></div></div>
    <div class="mx-tabs" role="tablist">${IDS.map(id => `<button class="mx-tab" role="tab" data-a="${id}">${avatar(id)}<span><b>${ASSIST[id].name}</b><small>${esc(ASSIST[id].tag)}</small></span><i class="mx-dot" id="mx-dot-${id}"></i></button>`).join('')}
      <button class="mx-tab" role="tab" data-a="all">${avatar('all')}<span><b>All three</b><small>Same question, three answers, side by side</small></span></button></div>
    <div class="mx-setup" id="mx-setup" hidden></div>
    <div class="mx-stage" id="mx-stage" aria-live="polite"></div>
    <div class="mx-starters" id="mx-starters"></div>
    <form class="mx-compose" id="mx-form">
      <textarea id="mx-in" rows="2" placeholder="Ask anything…" aria-label="Your message"></textarea>
      <div class="mx-bar"><label class="k-check"><input type="checkbox" id="mx-doc" ${st.withDoc ? 'checked' : ''}> <span>Include my open document</span></label>
        <label class="k-check" title="Never use paid services (Claude API, Venice, DeepSeek API); free models answer every seat"><input type="checkbox" id="mx-free"> <span>Free AI only</span></label>
        <label class="kf inline" id="mx-eng-l" hidden><span>DaVinci thinks with</span><select id="mx-eng"></select></label>
        <span class="spacer"></span><button type="button" class="kb" id="mx-clear">New chat</button><button type="button" class="kb" id="mx-stop" hidden>Stop</button><button class="kb primary" id="mx-send">Send</button></div>
    </form>`;

  const stage = $('#mx-stage'), input = $('#mx-in');
  $('#mx-doc').onchange = e => { st.withDoc = e.target.checked; keep(); };
  $('#mx-free').onchange = e => { ai.settings().freeOnly = e.target.checked; ai.saveSettings(); refresh(); T.status(e.target.checked ? 'Free AI only: Matrix uses free models (OpenRouter, Groq, Gemini, Ollama) for every seat.' : 'Paid AI is allowed again where you have credit.', 6000); };
  root.querySelectorAll('.mx-tab').forEach(b => b.onclick = () => { st.cur = b.dataset.a; keep(); draw(); input.focus(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#mx-form').requestSubmit(); } });
  $('#mx-form').onsubmit = e => { e.preventDefault(); const q = input.value.trim(); if (!q || busy) return; input.value = ''; send(q); };
  $('#mx-stop').onclick = () => { stop?.abort(); };
  $('#mx-clear').onclick = () => { if (st.cur === 'all') st.rounds = []; else st.threads[st.cur] = []; keep(); draw(); };
  $('#mx-eng').onchange = e => { st.engine = e.target.value; keep(); refresh(); };

  async function refresh(){
    for (const id of IDS) { const e = await engineFor(id); const d = $('#mx-dot-' + id); d.className = 'mx-dot' + (e ? (e.stand ? ' free' : ' on') : '');
      d.title = !e ? 'Needs setting up' : e.stand ? `A free model answers here: ${ai.nameOf(e.e)}` : 'Ready: ' + ai.nameOf(e.e) + (e.model ? ' · ' + e.model : ''); }
    $('#mx-free').checked = !!ai.settings().freeOnly;
    const usable = await ai.usable(), sel = $('#mx-eng');
    sel.innerHTML = `<option value="">Best available</option>` + usable.map(u => `<option value="${u}"${u === st.engine ? ' selected' : ''}>${esc(ai.nameOf(u))}</option>`).join('');
    const box = $('#mx-setup');
    const freeReady = (await Promise.all(FREE_IDS().map(x => ai.ready(x)))).some(Boolean);
    if (!freeReady) { box.hidden = false; box.innerHTML = `<b>Connect a free AI so Matrix always has someone to answer.</b> Gemini, Groq and OpenRouter give free keys in a minute. <button class="kb" id="mx-go-ai">Open AI settings</button>`; box.querySelector('#mx-go-ai').onclick = () => K.go('ai'); return; }
    if (st.cur !== 'all' && !(await engineFor(st.cur))) { box.hidden = false; box.innerHTML = `<b>${ASSIST[st.cur].name} isn't connected yet.</b> ${esc(ASSIST[st.cur].setup)} <button class="kb" id="mx-go-ai">Open AI settings</button>`; box.querySelector('#mx-go-ai').onclick = () => K.go('ai'); }
    else if (st.cur === 'all') { const miss = []; for (const id of ALL) if (!(await engineFor(id))) miss.push(ASSIST[id].name); box.hidden = !miss.length; if (miss.length) { box.innerHTML = `<b>${miss.join(' and ')} ${miss.length > 1 ? 'aren\'t' : 'isn\'t'} connected</b>, so ${miss.length > 1 ? 'they' : 'it'} will sit this one out. <button class="kb" id="mx-go-ai">Open AI settings</button>`; box.querySelector('#mx-go-ai').onclick = () => K.go('ai'); } }
    else box.hidden = true;
  }

  function msgHtml(m, id, i){
    if (m.role === 'user') return `<div class="mx-msg me"><div class="mx-bubble">${esc(m.content).replace(/\n/g, '<br>')}${m.doc ? '<small class="mx-att">📎 with your document</small>' : ''}</div></div>`;
    return `<div class="mx-msg">${avatar(id)}<div class="mx-bubble ${m.error ? 'err' : ''}">${m.error ? esc(m.content) : md(m.content)}${m.by && !m.error ? `<small class="mx-by">${esc(m.by)}</small>` : ''}
      ${m.error ? '' : `<div class="mx-acts"><button class="kb" data-copy="${i}">Copy</button><button class="kb" data-word="${i}">Open in Word</button><button class="kb" data-say="${i}">Read aloud</button></div>`}</div></div>`;
  }
  function wireActs(scope, getText, title){
    scope.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(getText(b.dataset.copy)); b.textContent = '✓ Copied'; } catch (e) { T.status('Copying was blocked here. Select the text and copy it.'); } });
    scope.querySelectorAll('[data-word]').forEach(b => b.onclick = () => K.openInWord(md(getText(b.dataset.word)), title(b.dataset.word)));
    scope.querySelectorAll('[data-say]').forEach(b => b.onclick = () => { const ss = window.speechSynthesis; if (!ss) return T.status('Reading aloud isn\'t available on this device.');
      if (ss.speaking) { ss.cancel(); b.textContent = 'Read aloud'; return; } const u = new SpeechSynthesisUtterance(getText(b.dataset.say).replace(/[#*`>|_]/g, '')); u.onend = () => { b.textContent = 'Read aloud'; }; ss.speak(u); b.textContent = 'Stop reading'; });
  }

  function draw(){
    root.querySelectorAll('.mx-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.a === st.cur)));
    $('#mx-eng-l').hidden = st.cur !== 'davinci';
    const id = st.cur;
    input.placeholder = id === 'all' ? 'Ask all three the same question…' : `Ask ${ASSIST[id].name}…`;
    const starters = id === 'all' ? [['Which of you would plan this best? ', false], ['Give me three different takes on my document', true], ['Pros and cons of ', false]] : ASSIST[id].starters;
    $('#mx-starters').innerHTML = starters.map(([t, doc], i) => `<button type="button" class="k-chip" data-s="${i}">${esc(t.replace(/ $/, '…'))}</button>`).join('');
    $('#mx-starters').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const [t, doc] = starters[+b.dataset.s]; if (doc) { $('#mx-doc').checked = st.withDoc = true; }
      if (/ $/.test(t)) { input.value = t; input.focus(); input.setSelectionRange(t.length, t.length); } else send(t); });
    if (id === 'all') {
      stage.innerHTML = st.rounds.length ? st.rounds.map((r, ri) => `<div class="mx-round"><div class="mx-msg me"><div class="mx-bubble">${esc(r.q).replace(/\n/g, '<br>')}${r.doc ? '<small class="mx-att">📎 with your document</small>' : ''}</div></div>
        <div class="mx-cols">${ALL.map(a => { const x = r.ans[a]; return `<div class="mx-col"><div class="mx-colh">${avatar(a)}<b>${ASSIST[a].name}</b></div><div class="mx-bubble ${x?.error ? 'err' : ''}">${!x ? '<span class="mx-think">Thinking…</span>' : x.error ? esc(x.text) : md(x.text) + (x.by ? `<small class="mx-by">${esc(x.by)}</small>` : '')}</div>
          ${x && !x.error ? `<div class="mx-acts"><button class="kb" data-copy="${ri}:${a}">Copy</button><button class="kb" data-word="${ri}:${a}">Open in Word</button></div>` : ''}</div>`; }).join('')}</div>
        ${r.blend ? `<div class="mx-blend"><div class="mx-colh">${avatar('all')}<b>The best of all three</b>${r.blend.by ? `<small class="mx-by">${esc(r.blend.by)}</small>` : ''}</div><div class="mx-bubble">${md(r.blend.text)}</div><div class="mx-acts"><button class="kb" data-copy="${ri}:blend">Copy</button><button class="kb" data-word="${ri}:blend">Open in Word</button></div></div>`
          : Object.values(r.ans).filter(x => x && !x.error).length > 1 && !r.pending ? `<button class="kb mx-blendbtn" data-blend="${ri}">Blend the best into one answer</button>` : ''}</div>`).join('')
        : `<div class="mx-empty">${ALL.map(avatar).join('')}<p>Ask one question and get three answers: Claude's careful thinking, DeepSeek's step-by-step reasoning and DaVinci's creative eye. Then blend the best into one.</p></div>`;
      const pick = k => { const [ri, a] = k.split(':'); const r = st.rounds[+ri]; return a === 'blend' ? r.blend.text : r.ans[a].text; };
      wireActs(stage, pick, k => 'Matrix - ' + (k.split(':')[1] === 'blend' ? 'blended' : ASSIST[k.split(':')[1]].name));
      stage.querySelectorAll('[data-blend]').forEach(b => b.onclick = () => blend(+b.dataset.blend));
    } else {
      const th = st.threads[id];
      stage.innerHTML = th.length ? th.map((m, i) => msgHtml(m, id, i)).join('') + (busy ? `<div class="mx-msg">${avatar(id)}<div class="mx-bubble"><span class="mx-think">Thinking…</span></div></div>` : '')
        : `<div class="mx-empty">${avatar(id)}<p><b>${ASSIST[id].name}</b> · ${esc(ASSIST[id].tag)}.${id === 'davinci' ? ' DaVinci is Termite\'s own creative assistant and runs on whichever AI you choose.' : ''}</p></div>`;
      wireActs(stage, i => th[+i].content, () => `Matrix - ${ASSIST[id].name}`);
    }
    stage.scrollTop = stage.scrollHeight;
    refresh();
  }

  async function send(q){
    const withDoc = $('#mx-doc').checked; let ctx = null;
    if (withDoc) { ctx = await docContext(); if (!ctx) T.status('There\'s no open document with text to include, so I sent just your question.', 6000); }
    const full = ctx ? `${q}\n\n---\nMy open document (${ctx.name}):\n"""\n${ctx.text}\n"""` : q;
    busy++; stop = new AbortController(); $('#mx-stop').hidden = false; $('#mx-send').disabled = true;
    try {
      if (st.cur === 'all') {
        const r = { q, doc: !!ctx, ans: {}, pending: true }; st.rounds.push(r); draw();
        await Promise.all(ALL.map(async a => {
          const e = await engineFor(a);
          if (!e) { r.ans[a] = { error: true, text: `${ASSIST[a].name} isn't connected. ${ASSIST[a].setup}` }; draw(); return; }
          try { const x = await askSeat(a, [{ role: 'user', content: full }], stop.signal); r.ans[a] = { text: x.text, by: x.by }; }
          catch (err) { r.ans[a] = { error: true, text: err.name === 'AbortError' ? 'Stopped.' : (err.message || String(err)) }; }
          draw();
        }));
        r.pending = false;
      } else {
        const id = st.cur, th = st.threads[id], e = await engineFor(id);
        th.push({ role: 'user', content: q, full, doc: !!ctx }); draw();
        if (!e) { th.push({ role: 'assistant', error: true, content: `${ASSIST[id].name} isn't connected yet. ${ASSIST[id].setup}` }); }
        else {
          const msgs = th.filter(m => !m.error).slice(-12).map(m => ({ role: m.role, content: m.full || m.content }));
          try { const x = await askSeat(id, msgs, stop.signal); th.push({ role: 'assistant', content: x.text, by: x.by }); }
          catch (err) { th.push({ role: 'assistant', error: true, content: err.name === 'AbortError' ? 'Stopped.' : (err.message || String(err)) }); }
        }
      }
    } finally { busy--; $('#mx-stop').hidden = true; $('#mx-send').disabled = false; keep(); draw(); }
  }

  async function blend(ri){
    const r = st.rounds[ri], good = ALL.filter(a => r.ans[a] && !r.ans[a].error);
    const c = await engineFor('claude'), e = (c && !c.stand ? c.e : null) || (await ai.usable())[0]; if (!e) return;
    const b = stage.querySelector(`[data-blend="${ri}"]`); if (b) { b.disabled = true; b.textContent = 'Blending…'; }
    const prompt = `Question: ${r.q}\n\nThree AI assistants answered it:\n\n` + good.map(a => `### ${ASSIST[a].name}\n${r.ans[a].text}`).join('\n\n') +
      `\n\nWrite one answer that keeps the best and most accurate parts of each, fixes anything wrong, and drops repetition. Where they genuinely disagree, say so briefly. Don't mention the assistants by name unless it helps.`;
    try { const x = await ai.askOne(e, prompt, { maxTokens: 3000 }); r.blend = { text: x.text, by: 'Blended by ' + x.by }; keep(); }
    catch (err) { if (ai.isBilling(err)) { try { const f = (await ai.usable())[0]; const x = await ai.askOne(f, prompt, { maxTokens: 3000 }); r.blend = { text: x.text, by: 'Blended by ' + x.by }; keep(); draw(); return; } catch (e2) {} } T.status('Couldn\'t blend: ' + (err.message || err), 7000); }
    draw();
  }

  draw();
  return { refresh: () => { draw(); } };
}
