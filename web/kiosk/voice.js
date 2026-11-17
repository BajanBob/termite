// Kiosk VoiceOver studio: write a script, voice it with AI voices or your own, or brief a human voice actor.
import { http } from './ai.js';
import { encodeWav } from './media.js';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'termite.voice.v1';
const STYLES = {
  trailer:  { name: 'Deep and cinematic (trailer)', rate: .88, pitch: .75, brief: 'deep, resonant, cinematic baritone; slow, weighty delivery with dramatic pauses', tags: ['deep', 'male', 'narration', 'trailer', 'authoritative'] },
  warm:     { name: 'Warm and reassuring', rate: .95, pitch: .92, brief: 'warm, rich, reassuring and trustworthy; unhurried', tags: ['warm', 'calm', 'narration'] },
  announcer:{ name: 'Crisp broadcast announcer', rate: 1, pitch: 1, brief: 'clear, polished broadcast announcer; confident and articulate', tags: ['news', 'broadcast', 'professional'] },
  promo:    { name: 'Energetic promo', rate: 1.1, pitch: 1.05, brief: 'upbeat, energetic, smiling promotional read', tags: ['energetic', 'upbeat', 'advertisement'] },
  doc:      { name: 'Calm documentary', rate: .9, pitch: .95, brief: 'calm, thoughtful documentary narration; natural and measured', tags: ['calm', 'documentary', 'narration'] },
  friendly: { name: 'Friendly and conversational', rate: 1, pitch: 1, brief: 'friendly, natural, conversational, like talking to a neighbour', tags: ['conversational', 'friendly', 'casual'] },
  caribbean:{ name: 'Warm Caribbean', rate: .97, pitch: .95, brief: 'warm, natural Caribbean (Barbadian/West Indian) accent; friendly and proud', tags: ['caribbean', 'jamaican', 'west indian', 'accent'] },
};
const SOURCES = [['venice', 'Venice AI voices'], ['eleven', 'ElevenLabs voices'], ['record', 'Record my voice'], ['hire', 'Hire a voice actor'], ['claude', 'Claude voices (preview)'], ['device', 'This device\'s voices (preview)']];

export function voice(root, K){
  const $ = s => root.querySelector(s);
  let st = { script: '', style: 'trailer', src: 'venice', venice: { model: 'tts-kokoro', voice: '' }, eleven: { key: '', voice: '', model: 'eleven_multilingual_v2' }, speed: 1, bed: 0.18 };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch (e) {}
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) {} };
  let lastTake = null, bed = K.shared.music || null;

  root.innerHTML = `<div class="k-head"><div><h2>VoiceOver</h2><p>Write or paste a script, choose a voice style, then voice it with AI, record it yourself, or brief a professional voice actor. Send the result straight to the Video Maker.</p></div></div>
  <div class="k-split">
    <form class="k-form" id="vo-form">
      <label class="kf"><span>Script</span><textarea id="vo-script" rows="9" placeholder="Paste your script, or let AI write it below. Put [pause] where you want a breath.">${esc(st.script)}</textarea></label>
      <div class="kf-row"><span class="muted" id="vo-len"></span></div>
      <details class="k-card" style="padding:10px 12px"><summary><b>Write it with AI</b></summary>
        <label class="kf"><span>What's it for?</span><input id="vo-brief" placeholder="e.g. 30-second radio advert for Sunny Bay Bakery, fresh bread daily"></label>
        <div class="kf-row"><label class="kf"><span>Length</span><select id="vo-secs"><option value="15">15 s</option><option value="30" selected>30 s</option><option value="60">1 min</option><option value="120">2 min</option></select></label><button class="kb" type="button" id="vo-write">Write script</button></div>
      </details>
      <label class="kf"><span>Voice style</span><select id="vo-style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}"${k === st.style ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>
      <label class="kf"><span>Voice from</span><select id="vo-src">${SOURCES.map(([k, l]) => `<option value="${k}"${k === st.src ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <div id="vo-panel"></div>
      <p class="muted" style="font-size:12.5px">Termite doesn't copy or imitate real people's voices. Use voices you're licensed to use: AI voice-library voices come with the provider's licence, and a hired actor's recording comes with the usage rights you agree with them.</p>
    </form>
    <div class="k-out"><div class="k-card" id="vo-take"><div class="k-empty">Your voice-over appears here, ready to play, save or add to a video.</div></div>
      <div class="k-card"><h4>Background music (optional)</h4><div class="kf-row"><label class="kb">Choose music<input type="file" id="vo-bed" accept="audio/*" hidden></label><span class="muted" id="vo-bedname">${bed ? '♪ ' + esc(bed.name) : 'None'}</span>
        <label class="pe-sl" style="grid-template-columns:60px 1fr 40px;flex:1"><span>Level</span><input type="range" id="vo-bedvol" min="0" max="0.6" step="0.02" value="${st.bed}"><output id="vo-bedo">${Math.round(st.bed * 100)}%</output></label></div>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">The music plays under the voice and fades out at the end. Jingles from the Jingle Studio appear here automatically.</p></div>
    </div></div>`;

  /* ---------- script ---------- */
  const script = $('#vo-script');
  const words = () => (script.value.replace(/\[pause\]/gi, ' ').match(/\S+/g) || []).length;
  const est = () => Math.round(words() / 150 * 60 / (STYLES[st.style].rate || 1) + (script.value.match(/\[pause\]/gi) || []).length * .7);
  const upd = () => { $('#vo-len').textContent = `${words()} words · about ${est()} seconds`; st.script = script.value; keep(); };
  script.oninput = upd; upd();
  $('#vo-style').onchange = e => { st.style = e.target.value; keep(); upd(); panel(); };
  $('#vo-write').onclick = () => K.busy('Writing the script…', async () => {
    const brief = $('#vo-brief').value.trim(); if (!brief) { K.status('Say what the voice-over is for.'); return; }
    const secs = +$('#vo-secs').value, n = Math.round(secs * 2.4);
    const r = await K.ai.ask(`Write a voice-over script for: ${brief}. Delivery style: ${STYLES[st.style].brief}. About ${n} words so it lasts ${secs} seconds read aloud. Short, spoken sentences; spell out numbers and abbreviations the way they should be said; put [pause] where a breath or beat helps. Don't name or imitate any real person's voice. Reply with the script text only.`, { maxTokens: 1500 });
    script.value = r.text.replace(/^["']|["']$/g, '').trim(); upd(); K.status('Script written with ' + r.by + '.');
  });

  /* ---------- sources ---------- */
  $('#vo-src').onchange = e => { st.src = e.target.value; keep(); panel(); };
  function panel(){
    const P = $('#vo-panel'), S = STYLES[st.style];
    if (st.src === 'venice') {
      const key = K.ai.settings().p.venice.key;
      P.innerHTML = key ? `<div class="kf-row"><label class="kf"><span>Model</span><select id="vn-model"><option>${esc(st.venice.model)}</option></select></label><label class="kf"><span>Voice</span><select id="vn-voice"><option value="${esc(st.venice.voice)}">${esc(st.venice.voice || 'Load voices first')}</option></select></label></div>
        <div class="kf-row"><button class="kb" type="button" id="vn-load">Load voices</button>${speedCtl()}</div><div class="kf-row"><button class="kb primary" type="button" id="vo-go">Create voice-over</button></div>`
        : `<div class="k-note">Venice AI voices need your Venice key. Add it in Kiosk › AI settings (it's the same key as Venice text). Venice voices work in the Termite apps for Windows, Linux and Android.</div><button class="kb" type="button" id="vo-aiset">Open AI settings</button>`;
      $('#vo-aiset')?.addEventListener('click', () => K.go('ai'));
      if (key) { $('#vn-load').onclick = loadVenice; $('#vn-model').onchange = e => { st.venice.model = e.target.value; keep(); fillVeniceVoices(); }; $('#vn-voice').onchange = e => { st.venice.voice = e.target.value; keep(); }; if (veniceModels) fillVenice(); }
    } else if (st.src === 'eleven') {
      P.innerHTML = `<label class="kf"><span>ElevenLabs API key</span><input type="password" id="el-key" value="${esc(st.eleven.key)}" autocomplete="off" placeholder="Paste key"></label>
        <p class="muted" style="font-size:12.5px;margin:-4px 0 8px">Add voices you like from the ElevenLabs Voice Library to your account (on elevenlabs.io), then Load voices. <a href="https://elevenlabs.io/app/voice-library" target="_blank" rel="noopener">Open the Voice Library</a></p>
        <div class="kf-row"><label class="kf"><span>Voice</span><select id="el-voice"><option value="${esc(st.eleven.voice)}">${esc(st.eleven.voice ? 'Saved voice' : 'Load voices first')}</option></select></label></div>
        <div class="kf-row"><button class="kb" type="button" id="el-load">Load voices</button>${speedCtl()}</div><div class="kf-row"><button class="kb primary" type="button" id="vo-go">Create voice-over</button></div>`;
      $('#el-key').onchange = e => { st.eleven.key = e.target.value.trim(); keep(); };
      $('#el-load').onclick = loadEleven; $('#el-voice').onchange = e => { st.eleven.voice = e.target.value; keep(); }; if (elevenVoices) fillEleven();
    } else if (st.src === 'record') {
      P.innerHTML = `<p class="muted" style="font-size:13px;margin:0 0 8px">Record yourself reading the script. A teleprompter scrolls the words while you speak. Use a quiet room and keep the phone or microphone about a hand's width away.</p>
        <div class="kf-row"><button class="kb primary" type="button" id="rc-go">● Start recording</button><label class="kb">Or import a recording<input type="file" id="rc-imp" accept="audio/*" hidden></label></div><div class="prompter" id="rc-prompt" hidden></div>`;
      $('#rc-go').onclick = record; $('#rc-imp').onchange = e => importTake(e.target.files[0]);
    } else if (st.src === 'hire') {
      const q = encodeURIComponent((S.tags[0] === 'caribbean' ? 'caribbean ' : S.tags[0] === 'deep' ? 'deep ' : '') + 'voice over');
      P.innerHTML = `<p class="muted" style="font-size:13px;margin:0 0 8px">For a real professional voice, hire a voice actor. Termite writes the brief, you post it or send it to an actor, and when they deliver, import the recording here.</p>
        <div class="kf-row"><label class="kf"><span>Usage</span><select id="hr-use"><option>Online video and social media</option><option>Radio advert</option><option>TV advert</option><option>Corporate or internal</option><option>Audiobook or e-learning</option></select></label><label class="kf"><span>Deadline</span><input id="hr-due" placeholder="e.g. 3 days"></label></div>
        <div class="kf-row"><button class="kb" type="button" id="hr-brief">Make the brief</button><a class="kb" href="https://www.fiverr.com/search/gigs?query=${q}" target="_blank" rel="noopener">Find on Fiverr</a><a class="kb" href="https://www.peopleperhour.com/hire-freelancers/music-audio/voice-over" target="_blank" rel="noopener">Find on PeoplePerHour</a></div>
        <textarea id="hr-text" rows="9" class="hr-text" hidden></textarea><div class="kf-row" id="hr-acts" hidden><button class="kb" type="button" id="hr-copy">Copy brief</button><button class="kb" type="button" id="hr-save">Save brief</button></div>
        <div class="kf-row"><label class="kb primary">Import the actor's recording<input type="file" id="hr-imp" accept="audio/*" hidden></label></div>`;
      $('#hr-brief').onclick = brief; $('#hr-imp').onchange = e => importTake(e.target.files[0]);
      $('#hr-copy').onclick = async () => { try { await navigator.clipboard.writeText($('#hr-text').value); K.status('Brief copied. Paste it into your Fiverr or PeoplePerHour message.'); } catch (e) { $('#hr-text').select(); K.status('Select the brief and copy it.'); } };
      $('#hr-save').onclick = () => K.save(new Blob([$('#hr-text').value], { type: 'text/plain' }), 'Voice-over brief.txt');
    } else if (st.src === 'claude') {
      P.innerHTML = `<div class="kf-row"><label class="kf"><span>Claude voice</span><select id="cl-voice"><option value="buttery">Buttery</option><option value="rounded">Rounded</option><option value="glassy">Glassy</option><option value="airy">Airy</option></select></label>${speedCtl()}</div>
        <div class="kf-row"><button class="kb primary" type="button" id="cl-play">▶ Listen</button><button class="kb" type="button" id="cl-stop">■ Stop</button></div><p class="muted" style="font-size:12.5px">Preview only: available when Termite is open inside Claude on a computer, and it can't be saved as a file. Use it to rehearse timing, then create the final voice with Venice, ElevenLabs, your own recording or an actor.</p>`;
      $('#cl-play').onclick = playClaude; $('#cl-stop').onclick = async () => (await claudeTts())?.stop();
    } else {
      const vs = speechSynthesis?.getVoices?.() || [];
      P.innerHTML = `<div class="kf-row"><label class="kf"><span>Device voice</span><select id="dv-voice">${vs.map((v, i) => `<option value="${i}">${esc(v.name)} (${esc(v.lang)})</option>`).join('') || '<option>Default</option>'}</select></label>${speedCtl()}</div>
        <div class="kf-row"><button class="kb primary" type="button" id="dv-play">▶ Listen</button><button class="kb" type="button" id="dv-stop">■ Stop</button></div><p class="muted" style="font-size:12.5px">Preview only: free and offline, but browsers can't save these voices to a file.</p>`;
      if (!vs.length && window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; if (st.src === 'device') panel(); };
      $('#dv-play').onclick = () => { if (!window.speechSynthesis) { K.status('This device has no built-in voices.'); return; } speechSynthesis.cancel(); const v = speechSynthesis.getVoices()[+$('#dv-voice').value];
        for (const part of parts()) { if (part === '\u0000') continue; const u = new SpeechSynthesisUtterance(part); if (v) u.voice = v; u.rate = S.rate * st.speed; u.pitch = S.pitch; speechSynthesis.speak(u); } };
      $('#dv-stop').onclick = () => window.speechSynthesis?.cancel();
    }
    $('#vo-speed')?.addEventListener('input', e => { st.speed = +e.target.value; $('#vo-speedo').textContent = st.speed.toFixed(2) + '×'; keep(); });
    $('#vo-go')?.addEventListener('click', create);
  }
  const speedCtl = () => `<label class="pe-sl" style="grid-template-columns:48px 1fr 46px;flex:1;min-width:180px"><span>Speed</span><input type="range" id="vo-speed" min="0.7" max="1.3" step="0.05" value="${st.speed}"><output id="vo-speedo">${(+st.speed).toFixed(2)}×</output></label>`;
  // split on [pause] and into chunks the services accept
  function parts(max = 1200){
    const out = []; script.value.split(/\[pause\]/i).forEach((seg, i, arr) => { let s = seg.trim(); while (s.length > max) { let cut = s.lastIndexOf('. ', max); if (cut < max * .4) cut = s.lastIndexOf(' ', max); out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1).trim(); } if (s) out.push(s); if (i < arr.length - 1) out.push('\u0000'); });
    return out;
  }

  /* ---------- Venice ---------- */
  let veniceModels = null;
  async function loadVenice(){
    K.busy('Loading Venice voices…', async () => {
      const r = await http('https://api.venice.ai/api/v1/models?type=tts', { method: 'GET', headers: { authorization: 'Bearer ' + K.ai.settings().p.venice.key } });
      const j = JSON.parse(r.text); if (r.status >= 400) throw new Error(j.error?.message || j.error || 'Venice said no (' + r.status + ')');
      veniceModels = (j.data || []).map(m => ({ id: m.id, voices: (m.model_spec?.voices || []).map(v => typeof v === 'string' ? v : v.id || v.name).filter(Boolean) })).filter(m => m.voices.length);
      if (!veniceModels.length) throw new Error('No Venice voices came back.');
      if (!veniceModels.some(m => m.id === st.venice.model)) st.venice.model = veniceModels[0].id;
      fillVenice(); K.status(`${veniceModels.reduce((a, m) => a + m.voices.length, 0)} Venice voices loaded. Male voices often start with "am_" or "bm_" in Kokoro.`, 7000);
    });
  }
  function fillVenice(){ const ms = $('#vn-model'); if (!ms) return; ms.innerHTML = veniceModels.map(m => `<option${m.id === st.venice.model ? ' selected' : ''}>${esc(m.id)}</option>`).join(''); fillVeniceVoices(); }
  function fillVeniceVoices(){ const m = veniceModels?.find(x => x.id === st.venice.model), vs = $('#vn-voice'); if (!m || !vs) return; if (!m.voices.includes(st.venice.voice)) st.venice.voice = m.voices[0];
    vs.innerHTML = m.voices.map(v => `<option${v === st.venice.voice ? ' selected' : ''}>${esc(v)}</option>`).join(''); keep(); }
  async function veniceSpeak(text){
    const r = await http('https://api.venice.ai/api/v1/audio/speech', { binary: true, headers: { authorization: 'Bearer ' + K.ai.settings().p.venice.key, 'content-type': 'application/json' },
      body: JSON.stringify({ model: st.venice.model, voice: st.venice.voice, input: text, response_format: 'mp3', speed: +(STYLES[st.style].rate * st.speed).toFixed(2) }) });
    if (!r.b64) { let m = r.text; try { m = JSON.parse(r.text).error?.message || JSON.parse(r.text).error || m; } catch (e) {} throw new Error('Venice: ' + String(m).slice(0, 160)); }
    return r.b64;
  }

  /* ---------- ElevenLabs ---------- */
  let elevenVoices = null;
  async function loadEleven(){
    if (!st.eleven.key) { K.status('Paste your ElevenLabs key first.'); return; }
    K.busy('Loading your ElevenLabs voices…', async () => {
      const r = await http('https://api.elevenlabs.io/v1/voices', { method: 'GET', headers: { 'xi-api-key': st.eleven.key } });
      const j = JSON.parse(r.text); if (r.status >= 400) throw new Error('ElevenLabs: ' + (j.detail?.message || j.detail || r.status));
      const tags = STYLES[st.style].tags;
      elevenVoices = (j.voices || []).map(v => { const L = v.labels || {}; const desc = [L.gender, L.age, L.accent, L.description || L.descriptive, L.use_case || L.use_case_category].filter(Boolean).join(', ');
        const hay = (JSON.stringify(L) + ' ' + (v.name || '')).toLowerCase(); const score = tags.reduce((a, t) => a + (new RegExp('\\b' + t + '\\b').test(hay) ? 1 : 0), 0); return { id: v.voice_id, name: v.name, desc, score }; }).sort((a, b) => b.score - a.score);
      fillEleven(); K.status(`${elevenVoices.length} voices loaded; best matches for "${STYLES[st.style].name}" are at the top.`, 7000);
    });
  }
  function fillEleven(){ const s = $('#el-voice'); if (!s) return; if (!elevenVoices.some(v => v.id === st.eleven.voice)) st.eleven.voice = elevenVoices[0]?.id || '';
    s.innerHTML = elevenVoices.map(v => `<option value="${esc(v.id)}"${v.id === st.eleven.voice ? ' selected' : ''}>${esc(v.name)}${v.desc ? ' · ' + esc(v.desc) : ''}${v.score ? ' ★' : ''}</option>`).join(''); keep(); }
  async function elevenSpeak(text){
    const r = await http(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(st.eleven.voice)}?output_format=mp3_44100_128`, { binary: true, headers: { 'xi-api-key': st.eleven.key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: st.eleven.model, voice_settings: { stability: st.style === 'promo' ? .35 : .55, similarity_boost: .75, style: st.style === 'trailer' ? .45 : .2, speed: Math.min(1.2, Math.max(.7, +(STYLES[st.style].rate * st.speed).toFixed(2))) } }) });
    if (!r.b64) { let m = r.text; try { const j = JSON.parse(r.text); m = j.detail?.message || j.detail?.status || j.detail || m; } catch (e) {} throw new Error('ElevenLabs: ' + String(m).slice(0, 160)); }
    return r.b64;
  }

  /* ---------- build the take ---------- */
  const b64buf = b => Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer;
  async function create(){
    if (!words()) { K.status('Write or paste a script first.'); return; }
    if (st.src === 'venice' && !st.venice.voice) { K.status('Press Load voices and pick a voice first.'); return; }
    if (st.src === 'eleven' && (!st.eleven.key || !st.eleven.voice)) { K.status('Add your ElevenLabs key, press Load voices and pick a voice.'); return; }
    const list = parts(), speak = st.src === 'venice' ? veniceSpeak : elevenSpeak, ac = new AudioContext(), bufs = [];
    try { let n = 0; for (const p of list) { if (p === '\u0000') { bufs.push(null); continue; } K.status(`Voicing part ${++n} of ${list.filter(x => x !== '\u0000').length}…`, 0); bufs.push(await ac.decodeAudioData(b64buf(await speak(p)))); }
      K.status('Mixing…', 0); lastTake = await mix(bufs); showTake(st.src === 'venice' ? 'Venice · ' + st.venice.voice : 'ElevenLabs · ' + (elevenVoices?.find(v => v.id === st.eleven.voice)?.name || 'voice')); K.status('Voice-over ready.', 2500);
    } catch (e) { K.status(e.message || String(e), 9000); }
    finally { if (ac.state !== 'closed') ac.close().catch(() => {}); }
  }
  async function mix(bufs, gapS = .7){
    const sr = 44100, voiceLen = bufs.reduce((a, b) => a + (b ? b.duration + .08 : gapS), 0), tail = bed ? 1.5 : .3, len = .4 + voiceLen + tail;
    const off = new OfflineAudioContext(2, Math.ceil(sr * len), sr); let t = .4;
    for (const b of bufs) { if (!b) { t += gapS; continue; } const s = off.createBufferSource(); s.buffer = b; s.connect(off.destination); s.start(t); t += b.duration + .08; }
    if (bed && st.bed > 0) { try { const mb = await off.decodeAudioData(await bed.blob.arrayBuffer()); const s = off.createBufferSource(), g = off.createGain(); s.buffer = mb; s.loop = mb.duration < len; g.gain.setValueAtTime(st.bed, 0); g.gain.setValueAtTime(st.bed, Math.max(0, len - 2)); g.gain.linearRampToValueAtTime(0.0001, len); s.connect(g); g.connect(off.destination); s.start(0); } catch (e) { K.status('That music file couldn\'t be read; the voice is saved without it.'); } }
    return encodeWav(await off.startRendering());
  }
  async function importTake(f){ if (!f) return; K.busy('Reading the recording…', async () => { const ac = new AudioContext(); const b = await ac.decodeAudioData(await f.arrayBuffer()); await ac.close(); lastTake = await mix([b]); showTake('Recording · ' + f.name); }); }
  function showTake(label){
    const url = URL.createObjectURL(lastTake);
    $('#vo-take').innerHTML = `<h4>${esc(label)}</h4><audio controls src="${url}" style="width:100%"></audio><div class="kf-row" style="margin-top:8px"><button class="kb primary" id="tk-video">Use in a video</button><button class="kb" id="tk-save">Save WAV</button><button class="kb" id="tk-share">Share</button></div>`;
    const name = 'Voice-over ' + new Date().toISOString().slice(0, 10) + '.wav';
    $('#tk-save').onclick = () => K.save(lastTake, name);
    $('#tk-share').onclick = () => K.share({ name: name.replace('.wav', ''), text: script.value, make: { wav: { label: 'Audio (WAV)', build: async () => ({ blob: lastTake, filename: name }) } } });
    $('#tk-video').onclick = () => { K.shared.voice = { blob: lastTake, name }; K.go('video'); K.status('Voice-over added to the Video Maker.'); };
  }

  /* ---------- record ---------- */
  let rec = null;
  async function record(){
    if (rec) { rec.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { K.status('Recording isn\'t available here. Use the Termite app for Windows, Linux or Android, or import a recording.', 8000); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { K.status(window.claude ? 'Claude pages can\'t use the microphone. Record in the Termite app, or import a recording.' : 'The microphone wasn\'t allowed. Check your settings and try again.', 9000); return; }
    const chunks = []; const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const pr = $('#rc-prompt'); pr.hidden = false; pr.textContent = script.value.replace(/\[pause\]/gi, ' … ') || '(No script; speak freely.)'; pr.scrollTop = 0;
    const secs = Math.max(8, est()), t0 = performance.now(); (function roll(){ if (!rec) return; pr.scrollTop = (pr.scrollHeight - pr.clientHeight) * Math.min(1, (performance.now() - t0) / 1000 / secs); requestAnimationFrame(roll); })();
    rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); rec = null; $('#rc-go').textContent = '● Start recording'; pr.hidden = true;
      await importTake(new File([new Blob(chunks, { type: mime || 'audio/webm' })], 'my recording.webm')); };
    rec.start(250); $('#rc-go').textContent = '■ Stop recording';
  }

  /* ---------- Claude preview ---------- */
  let tts = undefined; const claudeTts = async () => tts !== undefined ? tts : (tts = window.claude?.use ? await window.claude.use('tts').catch(() => null) : null);
  async function playClaude(){ const t = await claudeTts(); if (!t) { K.status('Claude voices are only available inside Claude on a computer. Use another voice source here.', 8000); return; }
    const v = $('#cl-voice').value, lines = parts(1800).filter(p => p !== '\u0000').map(text => ({ text, voice: v, rate: Math.min(1.5, Math.max(.7, STYLES[st.style].rate * st.speed)) }));
    try { await t.speak(lines); } catch (e) { if (e?.code === 'not_granted') K.status('Claude voices are turned off for this page.'); else if (e?.code !== 'viewer_stopped') K.status('Couldn\'t play: ' + (e?.code || e?.message || e)); } }

  /* ---------- hire a voice actor ---------- */
  async function brief(){
    const S = STYLES[st.style], secs = est();
    let text = `VOICE-OVER BRIEF\n\nProject: ${$('#vo-brief')?.value.trim() || '[what it is for]'}\nUsage: ${$('#hr-use').value}\nLength: about ${secs} seconds (${words()} words)\nDeadline: ${$('#hr-due').value.trim() || '[deadline]'}\n\nVoice wanted: ${S.brief}.\nPlease don't imitate any specific celebrity or real person; I'm looking for your own natural voice in this style.\n\nDelivery: a clean, dry recording (no music), 44.1 kHz or 48 kHz WAV, with one retake allowed for pronunciation fixes.\nRights: please confirm you grant usage rights for the use above.\n\nPronunciation notes: [names, places, brand words]\n\nSCRIPT\n------\n${script.value.trim() || '[script]'}\n`;
    $('#hr-text').hidden = false; $('#hr-acts').hidden = false; $('#hr-text').value = text;
    if ((await K.ai.usable()).length) { try { const r = await K.ai.ask(`Improve this voice-over brief for a freelance voice actor: keep the structure and every fact, make the direction clearer and more specific, and add likely pronunciation notes for any names, places or brand words in the script (Caribbean place names included). Don't ask for imitation of any real person. Return the brief only.\n\n${text}`, { maxTokens: 1500 }); const t = r.text.trim(), first = (script.value.trim().split(/\s+/).slice(0, 3).join(' ') || 'SCRIPT'); if (t.length > text.length * .6 && t.includes(first)) $('#hr-text').value = t; } catch (e) {} }
  }

  $('#vo-bed').onchange = e => { const f = e.target.files[0]; if (f) { bed = { blob: f, name: f.name }; $('#vo-bedname').textContent = '♪ ' + f.name; } };
  $('#vo-bedvol').oninput = e => { st.bed = +e.target.value; $('#vo-bedo').textContent = Math.round(st.bed * 100) + '%'; keep(); };
  panel();
  return { refresh(){ if (K.shared.music && K.shared.music !== bed) { bed = K.shared.music; $('#vo-bedname').textContent = '♪ ' + bed.name; } } };
}
