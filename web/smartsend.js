// Smart Send: say who should get the document and how, in your own words.
// "WhatsApp it to Mum", "email to sam@acme.com", "post in Bridgetown Business", "open my Facebook".
// Termite works out the app and the person, writes the message, attaches the file and opens the right chat.
// It learns who you send to and suggests them next time. Everything it learns stays on this device.
const T = window.termite;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const android = !!window.TermiteAndroid, desk = !!(window.termiteNet && window.termiteNet.shareFile), inClaude = !!window.claude;
const touch = android || /Android|iPhone|iPad/.test(navigator.userAgent);
const toB64 = async blob => { const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

/* ---------- what Termite remembers (this device only) ---------- */
const KEY = 'termite.people.v1';
let db = { people: [], log: [], service: '', cc: '' };
try { db = { ...db, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) {}
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
const TZ_CC = { 'America/Barbados': '1246', 'America/Port_of_Spain': '1868', 'America/Jamaica': '1876', 'America/Guyana': '592', 'America/St_Lucia': '1758',
  'America/St_Vincent': '1784', 'America/Grenada': '1473', 'America/Antigua': '1268', 'America/Dominica': '1767', 'America/St_Kitts': '1869', 'America/Nassau': '1242',
  'America/Cayman': '1345', 'Atlantic/Bermuda': '1441', 'America/Tortola': '1284', 'America/Anguilla': '1264', 'America/Belize': '501', 'Europe/London': '44',
  'America/Toronto': '1', 'America/New_York': '1', 'America/Chicago': '1', 'America/Denver': '1', 'America/Los_Angeles': '1', 'America/Phoenix': '1' };
if (!db.cc) { try { db.cc = TZ_CC[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch (e) {} }

const EMAIL_RE = /[^\s@<>,;"'()]+@[^\s@<>,;"'()]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{5,}\d)/;
/** A phone number in international form, digits only (e.g. 12465551234), or '' if Termite can't be sure. */
function normPhone(raw){
  let s = String(raw || '').trim(); if (!s) return '';
  if (s.startsWith('+')) return s.replace(/\D/g, '');
  let d = s.replace(/\D/g, ''); if (d.startsWith('00')) return d.slice(2);
  const cc = db.cc;
  if (/^1\d{3}$/.test(cc)) { if (d.length === 7) return cc + d; if (d.length === 10) return '1' + d; if (d.length === 11 && d[0] === '1') return d; return d.length > 10 ? d : ''; }
  if (cc === '1') { if (d.length === 10) return '1' + d; if (d.length === 11 && d[0] === '1') return d; return ''; }
  if (cc && d.startsWith('0')) return cc + d.slice(1);
  if (d.length >= 10) return d;
  return cc ? cc + d : '';
}
function prettyPhone(d){ if (!d) return ''; if (/^1\d{10}$/.test(d)) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`; return '+' + d; }
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const uid = () => Math.random().toString(36).slice(2, 10);

const CH = {
  whatsapp: { label: 'WhatsApp', icon: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c.3 2 2.5 4.6 5 5l1-1.4-1.8-.9-.8.8c-.9-.4-1.8-1.3-2.2-2.2l.8-.8-.9-1.8z"/>' },
  email: { label: 'Email', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>' },
  facebook: { label: 'Facebook', icon: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>' }
};
const icon = (ch, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CH[ch].icon}</svg>`;
const SERVICES = { app: 'Mail app on this computer', gmail: 'Gmail', outlook: 'Outlook.com / Hotmail', office: 'Outlook (work or school)', yahoo: 'Yahoo Mail' };

/* ---------- the document being sent ---------- */
const job = () => T.shareJob();
const fmtKey = () => (document.querySelector('input[name=shfmt]:checked') || {}).value || Object.keys(job().make)[0];
async function build(){ return job().make[fmtKey()].build(); }
function docInfo(){ const j = job(); let pages = 0; try { if (j.make.pdf && T.pdf()) pages = T.pdf().numPages; } catch (e) {} return { name: j.name, pages, ext: fmtKey() }; }
async function docText(){
  const j = job(); if (j.text) return j.text.slice(0, 2500);
  try { const pdf = T.pdf(); if (!pdf) return ''; let out = ''; for (let p = 1; p <= Math.min(2, pdf.numPages); p++) { const tc = await (await pdf.getPage(p)).getTextContent(); out += tc.items.map(i => i.str).join(' ') + '\n'; } return out.slice(0, 2500); } catch (e) { return ''; }
}

/* ---------- understanding what you typed ---------- */
const fbData = () => (T.social ? T.social.fb() : { groups: [], pages: [] });
function findPerson(low){
  let best = null;
  for (const p of db.people) for (const n of [p.name, ...(p.aka || [])]) {
    const nl = String(n || '').toLowerCase().trim(); if (nl.length < 2) continue;
    const re = new RegExp('(^|[^a-z])' + nl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])');
    if (re.test(low) && (!best || nl.length > best.len)) best = { p, len: nl.length };
  }
  return best && best.p;
}
function findFb(low){
  const f = fbData(); let best = null;
  const test = (list, kind) => list.forEach((g, i) => { const n = g.name.toLowerCase(); const words = n.split(/\s+/).filter(w => w.length > 3);
    const score = low.includes(n) ? 100 + n.length : words.filter(w => low.includes(w)).length * 10;
    if (score >= 10 && (!best || score > best.score)) best = { kind, index: i, score }; });
  test(f.groups, 'group'); test(f.pages, 'page');
  return best;
}
function parse(text){
  const t = text.trim(), low = t.toLowerCase();
  const out = { raw: t, action: 'send', ch: null, person: null, name: '', phone: '', email: '', fb: null, msg: '' };
  if (/\bwhats\s?app\b|\bwa\b|\bwhatsapp\b|\btext (it|this|him|her|them)\b|\bchat\b/.test(low)) out.ch = 'whatsapp';
  else if (/\be-?mail\b|\bmail\b|\bgmail\b|\boutlook\b|\bhotmail\b|\byahoo\b|\binbox\b/.test(low)) out.ch = 'email';
  else if (/\bfacebook\b|\bfb\b|\bgroup\b|\bpage\b|\bpost\b|\btimeline\b|\bwall\b|\bprofile\b/.test(low)) out.ch = 'facebook';
  if (/^(please\s+)?(open|launch|start|go to|show( me)?)\b/.test(low) && !/\b(send|share|attach|post (it|this))\b/.test(low)) out.action = 'open';
  const em = t.match(EMAIL_RE); if (em) { out.email = em[0]; out.ch = out.ch || 'email'; }
  const ph = !em && t.match(PHONE_RE); if (ph) { out.phone = normPhone(ph[1]); out.ch = out.ch || 'whatsapp'; }
  const q = t.match(/["“]([^"”]{2,})["”]/) || t.match(/\b(?:saying|say|with the message|message:)\s+(.{2,})$/i); if (q) out.msg = q[1].trim();
  out.person = findPerson(low.replace(q ? q[0].toLowerCase() : '\u0000', ''));
  if (out.ch === 'facebook' || !out.ch) { const f = findFb(low); if (f) { out.fb = f; out.ch = 'facebook'; } else if (out.ch === 'facebook' && /\bmy (own )?(facebook|profile|timeline|wall|account)\b/.test(low)) out.fb = { kind: 'profile' }; }
  if (!out.ch && out.person) out.ch = out.person.wa ? 'whatsapp' : out.person.email ? 'email' : null;
  if (!out.person && out.ch !== 'facebook') {
    const m = t.match(/\bto\s+(?:my\s+)?([A-Za-z][\w'’ .-]{0,40}?)(?=\s+(?:on|via|by|with|using|at|in)\b|[,.!?]|$)/i);
    if (m && !/^(whats\s?app|e-?mail|facebook|gmail|outlook)$/i.test(m[1].trim())) out.name = m[1].trim().replace(/\b\w/g, c => c.toUpperCase());
  }
  return out;
}
let aiMod = null;
const ai = async () => { if (!aiMod) aiMod = await import('./kiosk/ai.js'); return aiMod; };
async function aiReady(){ try { return (await (await ai()).usable()).length > 0; } catch (e) { return false; } }
// Only used when the rules above can't tell. Sends just your instruction plus the names (not numbers or addresses) Termite knows.
async function aiParse(text, base){
  const f = fbData();
  const prompt = `A person wants to send a document. Work out what they want from their instruction.
Instruction: ${JSON.stringify(text)}
People they have sent to before: ${JSON.stringify(db.people.map(p => p.name))}
Their Facebook groups: ${JSON.stringify(f.groups.map(g => g.name))}. Their Facebook Pages: ${JSON.stringify(f.pages.map(g => g.name))}.
Return JSON: {"action":"send" or "open", "channel":"whatsapp"|"email"|"facebook"|null, "person": exact name from the people list or null, "new_name": a name not in the list or null, "phone": digits or null, "email": address or null, "facebook_group": exact group name or null, "facebook_page": exact Page name or null, "message": the message they want included, or null}`;
  const { data } = await (await ai()).askJSON(prompt, { maxTokens: 300, mode: 'fallback' });
  const o = { ...base };
  if (data.action === 'open') o.action = 'open';
  if (CH[data.channel]) o.ch = data.channel;
  if (data.person) o.person = db.people.find(p => p.name.toLowerCase() === String(data.person).toLowerCase()) || o.person;
  if (!o.person && data.new_name) o.name = String(data.new_name).slice(0, 40);
  if (data.phone && !o.phone) o.phone = normPhone(data.phone);
  if (data.email && EMAIL_RE.test(data.email) && !o.email) o.email = data.email.match(EMAIL_RE)[0];
  const gi = f.groups.findIndex(g => g.name === data.facebook_group), pi = f.pages.findIndex(g => g.name === data.facebook_page);
  if (gi >= 0) o.fb = { kind: 'group', index: gi }; else if (pi >= 0) o.fb = { kind: 'page', index: pi };
  if (data.message && !o.msg) o.msg = String(data.message).slice(0, 500);
  return o;
}

/* ---------- writing the message ---------- */
function draft(ch, name){
  const d = docInfo(), f = first(name), h = new Date().getHours();
  const what = `"${d.name}"` + (d.pages ? ` (${d.pages} page${d.pages > 1 ? 's' : ''})` : '');
  if (ch === 'whatsapp') return `${f ? `Hi ${f}! ` : ''}Here's ${what}. Let me know what you think.`;
  if (ch === 'email') return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${f ? ' ' + f : ''},\n\nPlease find attached ${what}.\n\nKind regards`;
  return `Sharing ${what}. Have a look and let me know your thoughts.`;
}
async function aiDraft(ch, name){
  const d = docInfo(), body = await docText();
  const kind = ch === 'email' ? 'a short, warm email' : ch === 'whatsapp' ? 'a short, friendly WhatsApp message (under 50 words)' : 'a short Facebook post caption (under 60 words)';
  const prompt = `Write ${kind} to go with a document I'm sending${name ? ' to ' + name : ''}. The document is called "${d.name}".${body ? `\nThe start of the document, so you know what it is about:\n"""${body}"""` : ''}
Say briefly what it is and why they'd want it. Use only facts from the document; don't make anything up. Plain text, no placeholders like [Name].
Return JSON: {"subject": "an email subject line"${ch === 'email' ? '' : ' (or null)'}, "message": "the message"}`;
  const { data } = await (await ai()).askJSON(prompt, { maxTokens: 500 });
  return { subject: data.subject || '', message: String(data.message || '').trim() };
}

/* ---------- learning who you send to ---------- */
function remember(plan){
  let p = plan.person;
  if (!p && plan.keep && plan.name) { p = { id: uid(), name: plan.name }; db.people.push(p); }
  if (p) { if (plan.ch === 'whatsapp' && plan.phone) p.wa = plan.phone; if (plan.ch === 'email' && plan.email) p.email = plan.email; }
  if (plan.ch === 'email' && plan.service) db.service = plan.service;
  const key = plan.ch === 'facebook' ? `fb:${plan.fb?.kind}:${plan.fb?.index ?? ''}` : p ? `${plan.ch}:${p.id}` : null;
  if (key) db.log.push({ k: key, ch: plan.ch, pid: p?.id, fb: plan.fb || null, t: Date.now(), ext: docInfo().ext });
  db.log = db.log.slice(-300); keep();
}
/** The likeliest next sends: often, recently, and with this kind of file. */
function suggestions(){
  const now = Date.now(), ext = docInfo().ext, score = {}, last = {};
  for (const e of db.log) { score[e.k] = (score[e.k] || 0) + Math.exp(-(now - e.t) / (14 * 864e5)) * (e.ext === ext ? 1.5 : 1); last[e.k] = e; }
  const f = fbData();
  return Object.keys(score).sort((a, b) => score[b] - score[a]).map(k => {
    const e = last[k];
    if (e.ch === 'facebook') { const list = e.fb?.kind === 'group' ? f.groups : e.fb?.kind === 'page' ? f.pages : null; const g = list && list[e.fb.index];
      if (e.fb?.kind !== 'profile' && !g) return null; return { e, label: g ? g.name : 'My Facebook' }; }
    const p = db.people.find(x => x.id === e.pid); if (!p || (e.ch === 'whatsapp' && !p.wa) || (e.ch === 'email' && !p.email)) return null;
    return { e, p, label: p.name };
  }).filter(Boolean).slice(0, 3);
}

/* ---------- the Smart Send box in the Share window ---------- */
const box = document.createElement('div'); box.className = 'ss';
box.innerHTML = `
  <form class="ss-bar" id="ss-form" autocomplete="off">
    <svg class="ss-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>
    <input id="ss-in" aria-label="Who should get it, and how?" placeholder="Who gets it? e.g. “WhatsApp it to Mum” or “email sam@acme.com”" enterkeyhint="send">
    <button class="btn primary" id="ss-go">Go</button>
  </form>
  <div class="ss-chips" id="ss-chips"></div>
  <div class="ss-plan" id="ss-plan" hidden></div>
  <div class="ss-open"><span class="muted">Open:</span>
    <button type="button" class="ss-link" data-open="whatsapp">${icon('whatsapp')}WhatsApp</button>
    <button type="button" class="ss-link" data-open="email">${icon('email')}Email</button>
    <button type="button" class="ss-link" data-open="facebook">${icon('facebook')}Facebook</button>
    <button type="button" class="ss-link ss-people" id="ss-people">People</button>
  </div>
  <p class="muted ss-or">Or do it step by step:</p>`;
$('#sh-fmt').after(box);
const plan$ = box.querySelector('#ss-plan'), in$ = box.querySelector('#ss-in');
const help = t => { $('#sh-help').textContent = t; };

function renderChips(){
  const c = box.querySelector('#ss-chips'), list = suggestions();
  c.innerHTML = list.length ? `<span class="muted">Suggested:</span>` + list.map((s, i) => `<button type="button" class="ss-chip" data-i="${i}">${icon(s.e.ch)}<span>${esc(s.label)}</span></button>`).join('') : '';
  c.querySelectorAll('.ss-chip').forEach(b => b.onclick = () => { const s = list[+b.dataset.i];
    showPlan({ action: 'send', ch: s.e.ch, person: s.p || null, fb: s.e.fb, name: '', phone: '', email: '', msg: '' }); });
}

function showPlan(o){
  const ch = o.ch, f = fbData();
  if (o.action === 'open') return openApp(o);
  if (!ch) { plan$.hidden = false; plan$.innerHTML = `<p class="help">Which app? ${Object.keys(CH).map(k => `<button type="button" class="ss-chip" data-ch="${k}">${icon(k)}<span>${CH[k].label}</span></button>`).join(' ')}</p>`;
    plan$.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => showPlan({ ...o, ch: b.dataset.ch })); return; }
  const p = o.person, d = docInfo();
  const field = ch === 'whatsapp' ? 'wa' : 'email';
  const known = db.people.filter(x => ch === 'facebook' || x[field]);
  let whoHtml = '';
  if (ch === 'facebook') {
    const opts = [...f.groups.map((g, i) => `<option value="group:${i}">Group: ${esc(g.name)}</option>`), ...f.pages.map((g, i) => `<option value="page:${i}">Page: ${esc(g.name)}</option>`), `<option value="profile:">My own profile</option>`, `<option value="new:">+ Add a group or Page…</option>`];
    whoHtml = `<label class="kf"><span>Post to</span><select id="ss-fb">${opts.join('')}</select></label>`;
  } else {
    const pre = p ? p.id : (o.name || o.phone || o.email) ? 'new' : known[0]?.id || 'new';
    whoHtml = `<label class="kf"><span>To</span><select id="ss-who">${known.map(x => `<option value="${x.id}"${x.id === pre ? ' selected' : ''}>${esc(x.name)} · ${esc(ch === 'whatsapp' ? prettyPhone(x.wa) : x.email)}</option>`).join('')}<option value="new"${pre === 'new' ? ' selected' : ''}>${p && !p[field] ? esc(p.name) + ' (add ' + (ch === 'whatsapp' ? 'number' : 'address') + ')' : '+ Someone new'}</option></select></label>
      <div class="ss-new" id="ss-new">
        <label class="kf"><span>Name</span><input id="ss-name" value="${esc(p && !p[field] ? p.name : o.name || (o.email ? o.email.split('@')[0].split(/[._-]/)[0].replace(/^\w/, c => c.toUpperCase()) : ''))}" placeholder="e.g. Mum"></label>
        <label class="kf"><span>${ch === 'whatsapp' ? 'WhatsApp number' : 'Email address'}</span><input id="ss-addr" value="${esc(ch === 'whatsapp' ? (o.phone ? '+' + o.phone : '') : o.email)}" placeholder="${ch === 'whatsapp' ? (db.cc ? `e.g. +${db.cc}… or just the local number` : 'e.g. +1 246 555 1234') : 'name@example.com'}" ${ch === 'whatsapp' ? 'inputmode="tel"' : 'inputmode="email"'}></label>
        <label class="ss-keep"><input type="checkbox" id="ss-keep" checked> Remember them</label>
      </div>`;
  }
  const svc = ch === 'email' && !android ? `<label class="kf"><span>Send from</span><select id="ss-svc">${Object.entries(SERVICES).filter(([k]) => desk || k !== 'app').map(([k, v]) => `<option value="${k}"${(db.service || (desk ? 'app' : 'gmail')) === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : '';
  const subj = ch === 'email' ? `<label class="kf"><span>Subject</span><input id="ss-subj" value="${esc(d.name)}"></label>` : '';
  plan$.hidden = false;
  plan$.innerHTML = `<div class="ss-head">${icon(ch, 'ss-ic ss-' + ch)}<b>${CH[ch].label}</b><span class="muted">📎 ${esc(d.name)} · ${esc(fmtKey().toUpperCase())}</span></div>
    <div class="ss-grid">${whoHtml}${svc}${subj}</div>
    <label class="kf"><span>Message</span><textarea id="ss-msg" rows="${ch === 'email' ? 5 : 3}"></textarea></label>
    <div class="ss-acts"><button type="button" class="btn" id="ss-ai" hidden>✨ Write it with AI</button><span class="spacer"></span><button type="button" class="btn" id="ss-cancel">Cancel</button><button type="button" class="btn primary" id="ss-send">Send</button></div>
    <p class="muted sh-small" id="ss-note"></p>`;
  const msg$ = plan$.querySelector('#ss-msg'), who$ = plan$.querySelector('#ss-who'), fb$ = plan$.querySelector('#ss-fb');
  let edited = false; msg$.oninput = () => { edited = true; };
  const curName = () => { if (who$) { const x = db.people.find(y => y.id === who$.value); return x ? x.name : plan$.querySelector('#ss-name')?.value || ''; } return ''; };
  const redraft = () => { if (!edited) msg$.value = o.msg || draft(ch, curName()); };
  if (who$) { const sync = () => { plan$.querySelector('#ss-new').hidden = who$.value !== 'new'; redraft(); }; who$.onchange = sync; plan$.querySelector('#ss-name').oninput = redraft; sync(); }
  if (fb$) {
    if (o.fb) fb$.value = `${o.fb.kind}:${o.fb.kind === 'profile' ? '' : o.fb.index}`;
    fb$.onchange = () => { if (fb$.value === 'new:') { T.social?.open('group'); plan$.hidden = true; help('Add your group or Page below, then try Smart Send again.'); } };
    redraft();
  }
  aiReady().then(ok => { const b = plan$.querySelector('#ss-ai'); if (!b) return; b.hidden = !ok;
    b.onclick = async () => { b.disabled = true; b.textContent = 'Writing…';
      try { const r = await aiDraft(ch, curName()); if (r.message) { msg$.value = r.message; edited = true; } if (r.subject && plan$.querySelector('#ss-subj')) plan$.querySelector('#ss-subj').value = r.subject; plan$.querySelector('#ss-note').textContent = 'Written by your AI from the start of the document. Check it before sending.'; }
      catch (e) { plan$.querySelector('#ss-note').textContent = 'The AI couldn\'t write it: ' + (e.message || e); }
      b.disabled = false; b.textContent = '✨ Write it with AI'; }; });
  plan$.querySelector('#ss-cancel').onclick = () => { plan$.hidden = true; in$.focus(); };
  plan$.querySelector('#ss-send').onclick = async () => {
    const send = { ch, msg: msg$.value.trim(), person: null, name: '', phone: '', email: '', keep: false };
    if (ch === 'facebook') { const [kind, idx] = fb$.value.split(':'); if (kind === 'new') return; send.fb = { kind, index: idx === '' ? null : +idx }; }
    else if (who$.value !== 'new') { send.person = db.people.find(y => y.id === who$.value); send.name = send.person.name; if (ch === 'whatsapp') send.phone = send.person.wa; else send.email = send.person.email; }
    else {
      send.name = plan$.querySelector('#ss-name').value.trim(); const addr = plan$.querySelector('#ss-addr').value.trim(); send.keep = plan$.querySelector('#ss-keep').checked && !!send.name;
      send.person = p && !p[field] ? p : db.people.find(y => y.name.toLowerCase() === send.name.toLowerCase()) || null;
      if (ch === 'whatsapp') { send.phone = normPhone(addr); if (addr && !send.phone) { plan$.querySelector('#ss-note').textContent = 'Please type the number with its country code, like +1 246 555 1234.'; return; } }
      else { const m = addr.match(EMAIL_RE); send.email = m ? m[0] : ''; if (addr && !send.email) { plan$.querySelector('#ss-note').textContent = 'That email address doesn\'t look right.'; return; } }
    }
    if (ch === 'email') { send.subject = plan$.querySelector('#ss-subj').value.trim() || d.name; send.service = plan$.querySelector('#ss-svc')?.value || 'app'; }
    const b = plan$.querySelector('#ss-send'); b.disabled = true; b.textContent = 'Sending…';
    try { await execute(send); } catch (e) { help('Couldn\'t send: ' + (e.message || e)); }
    b.disabled = false; b.textContent = 'Send';
  };
  setTimeout(() => (who$ && who$.value === 'new' && !plan$.querySelector('#ss-addr').value ? plan$.querySelector('#ss-addr') : plan$.querySelector('#ss-send')).focus(), 30);
}

/* ---------- doing it ---------- */
function openUrl(url){ const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }
const waLink = (phone, text) => `https://wa.me/${phone || ''}${text ? '?text=' + encodeURIComponent(text) : ''}`;
function composeUrl(service, to, subject, body){
  const e = encodeURIComponent;
  return { gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}&su=${e(subject)}&body=${e(body)}`, outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`,
    office: `https://outlook.office.com/mail/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`, yahoo: `https://compose.mail.yahoo.com/?to=${e(to)}&subject=${e(subject)}&body=${e(body)}` }[service]
    || `mailto:${e(to)}?subject=${e(subject)}&body=${e(body)}`;
}
const done = t => { $('#dlg-share').close(); T.status(t, 10000); };
const who = s => s.name ? first(s.name) : s.phone ? prettyPhone(s.phone) : s.email || '';

async function execute(s){
  const { blob, filename } = await build(), mime = blob.type || 'application/octet-stream';
  if (s.ch === 'facebook' && (s.fb.kind !== 'group' || !desk)) {     // Pages and profiles take pictures; groups on phones use the guided steps
    remember(s); plan$.hidden = true;
    T.social?.open(s.fb.kind === 'profile' ? 'page' : s.fb.kind, s.fb.kind === 'profile' ? null : s.fb.index);
    help(s.fb.kind === 'profile' ? 'Facebook profiles, like Pages, only take pictures in a post, so Termite will turn the pages into pictures. Choose how many below and post them from your profile.' : s.fb.kind === 'group' ? 'Follow the two steps below: save the file, then open the group and attach it.' : 'Choose how many pages to post, then follow the steps below.');
    try { navigator.clipboard?.writeText(s.msg); } catch (e) {}
    return;
  }
  remember(s);
  if (s.ch === 'whatsapp') {
    if (android && window.TermiteAndroid.shareToChat) {
      const b64 = await toB64(blob);
      let r = TermiteAndroid.shareToChat(b64, filename, mime, 'com.whatsapp', s.phone || '', s.msg); if (r === 'missing') r = TermiteAndroid.shareToChat(b64, filename, mime, 'com.whatsapp.w4b', s.phone || '', s.msg);
      if (r === 'missing') { TermiteAndroid.share(b64, filename, mime); return done('WhatsApp isn\'t installed, so your share menu opened instead.'); }
      return done(s.phone ? `WhatsApp is opening ${who(s)}'s chat with the file and your message. Just tap Send.` : 'WhatsApp is open with the file attached. Pick the chat and tap Send.');
    }
    if (desk) {
      const r = await window.termiteNet.shareFile(new Uint8Array(await blob.arrayBuffer()), filename, 'whatsapp', { phone: s.phone, text: s.msg });
      if (!r?.ok) throw new Error(r?.error || 'unknown error');
      return done(`${r.opened === 'web' ? 'WhatsApp Web is opening' : 'WhatsApp is opening'} ${s.phone ? who(s) + '\'s chat with your message typed' : 'with your message'}. ${r.copied ? 'Press Ctrl+V in the chat to attach the file, then Send.' : 'Drag the file in from the folder that opened, then Send.'}`);
    }
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: s.msg }); return done('Pick WhatsApp in the share menu.'); } catch (e) { if (e.name === 'AbortError') return; } }
    if (await T.save(blob, filename)) { openUrl(waLink(s.phone, s.msg)); help(`WhatsApp is opening ${s.phone ? who(s) + '\'s chat ' : ''}with your message. Attach "${filename}" from Downloads with the paperclip, then Send.`); }
    return;
  }
  if (s.ch === 'email') {
    if (android && window.TermiteAndroid.email) { TermiteAndroid.email(await toB64(blob), filename, mime, s.email || '', s.subject, s.msg); return done('Pick your email app. The address, subject, message and file are already filled in.'); }
    if (desk) {
      const r = await window.termiteNet.shareFile(new Uint8Array(await blob.arrayBuffer()), filename, 'email', { to: s.email, subject: s.subject, body: s.msg, service: s.service, mime });
      if (!r?.ok) throw new Error(r?.error || 'unknown error');
      if (r.opened === 'outlook' || r.opened === 'app') return done('Your email is open with the file attached. Check it and press Send.');
      if (r.opened === 'eml') return done('A new email with the file attached is opening in your mail app. Check it and press Send. (If it opens read-only, choose Gmail or Outlook.com under "Send from" next time.)');
      return done(`${SERVICES[r.opened] || 'Your email'} is opening with the email written. ${r.copied ? 'Press Ctrl+V in the message to attach the file, or drag it in from the folder that opened' : 'Drag the file in from the folder that opened'}, then Send.`);
    }
    if (await T.save(blob, filename)) { openUrl(composeUrl(s.service, s.email || '', s.subject, s.msg)); help(`Your email is opening with everything filled in. Attach "${filename}" from Downloads, then Send.`); }
    return;
  }
  // a Facebook group, from the desktop app
  const g = fbData().groups[s.fb.index];
  const r = await window.termiteNet.shareFile(new Uint8Array(await blob.arrayBuffer()), filename, 'facebook', { url: g?.url });
  if (!r?.ok) throw new Error(r?.error || 'unknown error');
  plan$.hidden = true;
  help(`Facebook is opening ${g ? g.name : 'your groups'}. Click "Write something…", then ${r.copied ? 'press Ctrl+V to attach the file (or drag it in from the folder that opened)' : 'drag the file in from the folder that opened'}. Your message is ready to paste: use the Copy message button.`);
  $('#ss-copy')?.remove();
  const c = document.createElement('button'); c.type = 'button'; c.className = 'btn'; c.id = 'ss-copy'; c.textContent = 'Copy message';
  c.onclick = async () => { try { await navigator.clipboard.writeText(s.msg); c.textContent = '✓ Copied: paste it in the post'; } catch (e) {} };
  $('#sh-help').after(c);
}

async function openApp(o){
  const ch = o.ch || 'whatsapp', p = o.person;
  const phone = o.phone || (ch === 'whatsapp' && p?.wa) || '', email = o.email || (ch === 'email' && p?.email) || '';
  const f = fbData(), g = o.fb && o.fb.kind !== 'profile' ? (o.fb.kind === 'group' ? f.groups : f.pages)[o.fb.index] : null;
  const service = db.service || (desk ? 'app' : 'gmail');
  if (desk && window.termiteNet.openApp) { await window.termiteNet.openApp(ch, { phone, to: email, url: g?.url, service: ch === 'email' ? service : undefined }); }
  else if (ch === 'whatsapp') openUrl(phone ? waLink(phone) : android ? 'https://wa.me/' : 'https://web.whatsapp.com/');
  else if (ch === 'email') openUrl(email || android || service === 'app' ? `mailto:${email}` : { gmail: 'https://mail.google.com/', outlook: 'https://outlook.live.com/mail/', office: 'https://outlook.office.com/mail/', yahoo: 'https://mail.yahoo.com/' }[service]);
  else openUrl(g?.url || 'https://www.facebook.com/');
  help(`Opening ${ch === 'facebook' ? (g ? g.name : 'Facebook') : CH[ch].label}${p ? ' for ' + p.name : ''}…`);
}

async function go(text){
  if (!text.trim()) { in$.focus(); return; }
  let o = parse(text);
  const unsure = !o.ch || (o.action === 'send' && o.ch !== 'facebook' && !o.person && !o.phone && !o.email && !o.name);
  if (unsure && await aiReady()) { help('Thinking…'); try { o = await aiParse(text, o); help(''); } catch (e) { help(''); } }
  showPlan(o);
}
box.querySelector('#ss-form').onsubmit = e => { e.preventDefault(); go(in$.value); };
box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openApp({ ch: b.dataset.open }));

/* ---------- people and settings ---------- */
box.querySelector('#ss-people').onclick = () => {
  plan$.hidden = false;
  const row = p => `<div class="ss-prow" data-id="${p.id}"><input class="ss-pn" value="${esc(p.name)}" aria-label="Name"><input class="ss-pw" value="${esc(p.wa ? '+' + p.wa : '')}" placeholder="WhatsApp number" aria-label="WhatsApp number" inputmode="tel"><input class="ss-pe" value="${esc(p.email || '')}" placeholder="Email" aria-label="Email" inputmode="email"><button type="button" class="btn ss-pdel" aria-label="Remove ${esc(p.name)}">✕</button></div>`;
  plan$.innerHTML = `<div class="ss-head"><b>People and accounts</b><span class="muted">Kept only on this device</span></div>
    <div id="ss-plist">${db.people.map(row).join('') || '<p class="muted">Nobody yet. Smart Send adds people as you send to them.</p>'}</div>
    <div class="ss-grid"><label class="kf"><span>Your country code (for local numbers)</span><input id="ss-cc" value="${esc(db.cc ? '+' + db.cc : '')}" placeholder="+1246" inputmode="tel"></label>
    ${!android ? `<label class="kf"><span>Email from</span><select id="ss-svc2">${Object.entries(SERVICES).filter(([k]) => desk || k !== 'app').map(([k, v]) => `<option value="${k}"${(db.service || (desk ? 'app' : 'gmail')) === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}</div>
    <div class="ss-acts"><button type="button" class="btn" id="ss-add">+ Add someone</button><button type="button" class="btn" id="ss-forget">Forget suggestions</button><span class="spacer"></span><button type="button" class="btn primary" id="ss-psave">Save</button></div>`;
  plan$.querySelector('#ss-add').onclick = () => { const l = plan$.querySelector('#ss-plist'); if (!db.people.length) l.innerHTML = ''; l.insertAdjacentHTML('beforeend', row({ id: uid(), name: '' })); l.lastElementChild.querySelector('input').focus(); };
  plan$.querySelector('#ss-plist').onclick = e => { const b = e.target.closest('.ss-pdel'); if (b) b.parentElement.remove(); };
  plan$.querySelector('#ss-forget').onclick = () => { db.log = []; keep(); renderChips(); help('Suggestions cleared.'); };
  plan$.querySelector('#ss-psave').onclick = () => {
    const cc = plan$.querySelector('#ss-cc').value.replace(/\D/g, ''); db.cc = cc;
    const svc = plan$.querySelector('#ss-svc2'); if (svc) db.service = svc.value;
    const bad = [];
    db.people = [...plan$.querySelectorAll('.ss-prow')].map(r => { const name = r.querySelector('.ss-pn').value.trim(); if (!name) return null;
      const wraw = r.querySelector('.ss-pw').value.trim(), wa = normPhone(wraw), em = (r.querySelector('.ss-pe').value.match(EMAIL_RE) || [''])[0];
      if (wraw && !wa) bad.push(name);
      const old = db.people.find(p => p.id === r.dataset.id) || {}; return { ...old, id: r.dataset.id, name, wa: wa || undefined, email: em || undefined }; }).filter(Boolean);
    keep(); renderChips(); plan$.hidden = true;
    help(bad.length ? `Saved. Add the country code to ${bad.join(', ')}'s number (like +1 246…) so WhatsApp can find them.` : 'Saved.');
  };
};

// fresh each time the Share window opens
new MutationObserver(() => { if ($('#dlg-share').open) { plan$.hidden = true; plan$.innerHTML = ''; in$.value = ''; $('#ss-copy')?.remove(); renderChips(); setTimeout(() => in$.focus(), 50); } }).observe($('#dlg-share'), { attributes: true, attributeFilter: ['open'] });

T.smartSend = { parse, normPhone, people: () => db.people };
