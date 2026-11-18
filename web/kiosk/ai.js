// Kiosk AI coalition: Claude, Venice AI and free LLMs behind one call, with fallback and a "council" mode.
const STORE = 'termite.ai.v1';

export const PROVIDERS = {
  claude:     { label: 'Claude (Anthropic API)', kind: 'anthropic', base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Paid API key.' },
  venice:     { label: 'Venice AI', kind: 'openai', base: 'https://api.venice.ai/api/v1', model: 'zai-org-glm-5-1', keyUrl: 'https://venice.ai/settings/api', note: 'API key with credits. Use "Load models" to pick any Venice text model.' },
  deepseek:   { label: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com', model: 'deepseek-flash', keyUrl: 'https://platform.deepseek.com/api_keys', note: 'Low-cost API key with credits. "deepseek-flash" is fast; "deepseek-v4-pro" thinks harder.' },
  openrouter: { label: 'OpenRouter free models', kind: 'openai', base: 'https://openrouter.ai/api/v1', model: 'openrouter/free', keyUrl: 'https://openrouter.ai/keys', note: 'Free key. "openrouter/free" picks a free model for you.', free: true },
  groq:       { label: 'Groq (free tier)', kind: 'openai', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', note: 'Free key, very fast.', free: true },
  gemini:     { label: 'Google Gemini (free tier)', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', note: 'Free key from Google AI Studio.', free: true },
  ollama:     { label: 'Ollama on this computer', kind: 'openai', base: 'http://localhost:11434/v1', model: 'llama3.2', keyUrl: 'https://ollama.com/download', note: 'Free and private: runs models on your own computer. No key.', nokey: true, free: true },
};

const defaults = () => ({ mode: 'fallback', order: ['here', 'claude', 'venice', 'deepseek', 'openrouter', 'groq', 'gemini', 'ollama'],
  p: Object.fromEntries(Object.keys(PROVIDERS).map(k => [k, { on: false, key: '', model: PROVIDERS[k].model }])) });
let S = defaults();
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) { S = { ...defaults(), ...s, p: { ...defaults().p, ...s.p } }; for (const k in S.p) S.p[k] = { ...defaults().p[k], ...S.p[k] }; } } catch (e) {}
for (const k of ['here', ...Object.keys(PROVIDERS)]) if (!S.order.includes(k)) S.order.push(k);   // providers added in later versions
export const settings = () => S;
export function saveSettings(){ try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }

/* ---------- Claude inside the Claude app (no key needed) ---------- */
let here = null, hereChecked = false;
export async function claudeHere(){
  if (hereChecked) return here; hereChecked = true;
  try { if (window.claude?.use) here = await window.claude.use('sample'); } catch (e) { here = null; }
  return here;
}

/* ---------- HTTP that works in the browser, the desktop app and the Android app ---------- */
let seq = 0; const waiting = {};
window.termiteNetDone = (id, status, text) => { const w = waiting[id]; if (w) { delete waiting[id]; w({ status, text }); } };
window.termiteNetDoneBinary = (id, status, b64) => { const w = waiting[id]; if (w) { delete waiting[id]; w({ status, b64 }); } };
/** HTTP that works everywhere. With binary:true the reply carries b64 (base64 body) instead of text. */
export async function http(url, { method = 'POST', headers = {}, body, binary = false } = {}){
  if (window.termiteNet?.fetch) return window.termiteNet.fetch(url, { method, headers, body, binary });
  if (window.TermiteAndroid?.http) { const id = ++seq; return new Promise(res => { waiting[id] = res;
    if (binary && window.TermiteAndroid.httpBinary) window.TermiteAndroid.httpBinary(id, url, method, JSON.stringify(headers), body || '');
    else window.TermiteAndroid.http(id, url, method, JSON.stringify(headers), body || ''); }); }
  const r = await fetch(url, { method, headers, body });
  if (binary && r.ok) { const u = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return { status: r.status, b64: btoa(s) }; }
  return { status: r.status, text: await r.text() };
}

export async function usable(){
  const out = [];
  for (const id of S.order) {
    if (id === 'here') { if (await claudeHere()) out.push('here'); continue; }
    const c = S.p[id]; if (c?.on && (c.key || PROVIDERS[id].nokey)) out.push(id);
  }
  return out;
}
export const nameOf = id => id === 'here' ? 'Claude (in Claude)' : PROVIDERS[id].label;

async function callOne(id, messages, system, maxTokens, signal){
  if (id === 'here') {
    const s = await claudeHere(); if (!s) throw new Error('Claude is not available here');
    const msgs = messages.map((m, i) => ({ role: m.role, content: (i === 0 && system ? system + '\n\n' : '') + m.content }));
    const r = await s(msgs, { modelTier: maxTokens > 3000 ? 'complex' : 'default', cache: false, signal });
    return r.text;
  }
  const P = PROVIDERS[id], c = S.p[id], model = c.model || P.model;
  if (P.kind === 'anthropic') {
    const r = await http(P.base + '/messages', { headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: system || undefined, messages }) });
    const j = parse(r); return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  const headers = { 'content-type': 'application/json' }; if (c.key) headers.authorization = 'Bearer ' + c.key;
  if (id === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/BajanBob/Termite'; headers['X-Title'] = 'Termite Kiosk'; }
  const body = { model, max_tokens: maxTokens, temperature: 0.5, messages: (system ? [{ role: 'system', content: system }] : []).concat(messages) };
  if (id === 'venice') body.venice_parameters = { include_venice_system_prompt: false };
  const r = await http(P.base.replace(/\/$/, '') + '/chat/completions', { headers, body: JSON.stringify(body) });
  const j = parse(r); const t = j.choices?.[0]?.message?.content; if (t == null) throw new Error('Empty answer'); return String(t).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
function parse(r){
  let j; try { j = JSON.parse(r.text); } catch (e) { throw new Error(`HTTP ${r.status}: ${String(r.text).slice(0, 160)}`); }
  if (r.status >= 400 || j.error) throw new Error(`HTTP ${r.status}: ${j.error?.message || j.error || 'request failed'}`);
  return j;
}

/** Ask one named model directly (Matrix's assistants). id: 'here' or a provider id. */
export async function askOne(id, prompt, { system = '', maxTokens = 3000, signal } = {}){
  const messages = typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : prompt;
  return { text: await callOne(id, messages, system, maxTokens, signal), by: nameOf(id) };
}
export async function ready(id){ if (id === 'here') return !!(await claudeHere()); const c = S.p[id]; return !!(c?.on && (c.key || PROVIDERS[id]?.nokey)); }

/** Ask the coalition. prompt: string or [{role,content}]. Returns {text, by}. */
export async function ask(prompt, { system = '', maxTokens = 4000, onStatus = () => {}, signal, mode } = {}){
  const messages = typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : prompt;
  const ids = await usable();
  if (!ids.length) throw new Error('No AI is set up yet. Open Kiosk › AI settings and add a key (Groq, Gemini and OpenRouter have free keys), or use Termite inside Claude.');
  if ((mode || S.mode) === 'council' && ids.length > 1) {
    const team = ids.slice(0, 3); onStatus(`Asking ${team.map(nameOf).join(', ')}…`);
    const drafts = (await Promise.allSettled(team.map(id => callOne(id, messages, system, maxTokens, signal)))).map((r, i) => r.status === 'fulfilled' ? { by: team[i], text: r.value } : null).filter(Boolean);
    if (!drafts.length) throw new Error('None of the AI models answered.');
    if (drafts.length === 1) return drafts[0];
    onStatus('Combining the best of each answer…');
    const merge = `${messages.at(-1).content}\n\n---\nSeveral AI models answered the request above. Combine their best ideas into one answer that keeps exactly the format the request asks for (if JSON was requested, reply with JSON only).\n\n` + drafts.map((d, i) => `### Answer ${i + 1}\n${d.text}`).join('\n\n');
    for (const id of ids) { try { return { text: await callOne(id, [{ role: 'user', content: merge }], system, maxTokens, signal), by: drafts.map(d => nameOf(d.by)).join(' + ') }; } catch (e) {} }
    return drafts[0];
  }
  const errs = [];
  for (const id of ids) {
    onStatus(`Working with ${nameOf(id)}…`);
    try { return { text: await callOne(id, messages, system, maxTokens, signal), by: nameOf(id) }; }
    catch (e) { if (e.name === 'AbortError') throw e; errs.push(`${nameOf(id)}: ${e.message || e}`); }
  }
  throw new Error('Every AI failed. ' + errs.join(' · '));
}

/** Pull the first JSON object or array out of a reply. */
export function extractJSON(t){
  t = String(t).replace(/```(?:json)?/gi, '');
  const s = t.search(/[[{]/); if (s < 0) throw new Error('No JSON in the answer');
  const open = t[s], close = open === '{' ? '}' : ']'; let d = 0, q = false, esc = false;
  for (let i = s; i < t.length; i++) { const c = t[i];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue; }
    if (c === '"') q = true; else if (c === open) d++; else if (c === close && --d === 0) return JSON.parse(t.slice(s, i + 1)); }
  throw new Error('The JSON in the answer was cut off');
}
export async function askJSON(prompt, opts = {}){
  const r = await ask(prompt + '\n\nReply with valid JSON only — no commentary, no code fences.', opts);
  try { return { data: extractJSON(r.text), by: r.by }; }
  catch (e) {
    opts.onStatus?.('Tidying the answer…');
    const r2 = await ask([{ role: 'user', content: prompt }, { role: 'assistant', content: r.text }, { role: 'user', content: 'That was not valid JSON (' + e.message + '). Send the same content again as valid JSON only.' }], { ...opts, mode: 'fallback' });
    return { data: extractJSON(r2.text), by: r2.by };
  }
}

export async function listModels(id){
  const P = PROVIDERS[id], c = S.p[id];
  const headers = P.kind === 'anthropic' ? { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : (c.key ? { authorization: 'Bearer ' + c.key } : {});
  const r = await http(P.base.replace(/\/$/, '') + '/models', { method: 'GET', headers });
  const j = parse(r); return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
}
export async function test(id){ return callOne(id, [{ role: 'user', content: 'Reply with the single word: ready' }], '', 20); }
