// Kiosk media studios: Picture Editor, Jingle & Music Studio, Video & Movie Maker.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;

/* =================== PICTURE EDITOR =================== */
export function picture(root, K){
  const $ = s => root.querySelector(s);
  root.innerHTML = `<div class="k-head"><div><h2>Picture Editor</h2><p>Crop, straighten, resize, adjust colour, add filters, text and drawing, then save or share.</p></div></div>
  <div class="k-tool"><label class="kb primary">Open picture<input type="file" id="pe-open" accept="image/*" hidden></label>
    <button class="kb ic" data-a="undo" title="Undo" aria-label="Undo">↶</button><button class="kb ic" data-a="redo" title="Redo" aria-label="Redo">↷</button><span class="k-sep"></span>
    <button class="kb" data-a="crop">Crop</button><button class="kb" data-a="rotl" aria-label="Rotate left">⟲</button><button class="kb" data-a="rotr" aria-label="Rotate right">⟳</button><button class="kb" data-a="fliph">Flip ↔</button><button class="kb" data-a="flipv">Flip ↕</button><button class="kb" data-a="resize">Resize</button><span class="k-sep"></span>
    <button class="kb" data-a="auto">Auto-enhance</button><button class="kb" data-a="draw" aria-pressed="false">Draw</button><button class="kb" data-a="text" aria-pressed="false">Text</button>
    <input type="color" id="pe-col" value="#ffffff" aria-label="Pen and text colour"><input type="range" id="pe-size" min="2" max="120" value="12" aria-label="Pen and text size" style="width:90px"><span class="k-sep"></span>
    <button class="kb" data-a="describe">AI caption</button><button class="kb primary" data-a="save">Save</button><button class="kb" data-a="share">Share</button></div>
  <div class="pe-body"><div class="pe-stage" id="pe-stage"><canvas id="pe-cv"></canvas><div class="pe-crop" id="pe-crop" hidden></div><div class="k-empty" id="pe-empty">Open a picture to start. JPG, PNG, WebP, GIF and HEIC (where your device supports it).</div></div>
  <aside class="pe-side"><h4>Adjust</h4>${[['bri', 'Brightness', -100, 100], ['con', 'Contrast', -100, 100], ['sat', 'Saturation', -100, 100], ['warm', 'Warmth', -100, 100], ['hue', 'Hue', -180, 180], ['vig', 'Vignette', 0, 100], ['sharp', 'Sharpen', 0, 100], ['blur', 'Blur', 0, 20]].map(([id, l, a, b]) => `<label class="pe-sl"><span>${l}</span><input type="range" id="pe-${id}" min="${a}" max="${b}" value="0"><output id="pe-${id}-o">0</output></label>`).join('')}
    <div class="kf-row"><button class="kb primary" data-a="apply">Apply</button><button class="kb" data-a="reset">Reset sliders</button></div>
    <h4>Looks</h4><div class="pe-looks">${['Original', 'Vivid', 'Warm', 'Cool', 'Black & white', 'Sepia', 'Vintage', 'Fade', 'Dramatic'].map(n => `<button class="kb" data-look="${n}">${n}</button>`).join('')}</div>
    <h4>Save as</h4><div class="kf-row"><select id="pe-type"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select><input type="range" id="pe-q" min="50" max="100" value="90" aria-label="Quality"></div>
    <p class="muted" id="pe-info"></p></aside></div>`;
  const cv = $('#pe-cv'), g = cv.getContext('2d', { willReadFrequently: true }); let base = null, name = 'picture', hist = [], fut = [], mode = null;
  const snap = () => { if (!base) return; hist.push(base); if (hist.length > 25) hist.shift(); fut = []; };
  const toCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function show(){ if (!base) return; cv.width = base.width; cv.height = base.height; g.drawImage(base, 0, 0); preview(); $('#pe-empty').hidden = true; $('#pe-info').textContent = `${base.width} × ${base.height} px`; }
  const sl = id => +$('#pe-' + id).value;
  function filtered(src){
    const c = toCanvas(src.width, src.height), x = c.getContext('2d', { willReadFrequently: true });
    if (sl('blur') && 'filter' in x) x.filter = `blur(${sl('blur') * Math.max(1, src.width / 1200)}px)`; x.drawImage(src, 0, 0); x.filter = 'none';
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data, b = sl('bri') * 1.28, ct = sl('con'), cf = (259 * (ct * 2.55 + 255)) / (255 * (259 - ct * 2.55)), s = 1 + sl('sat') / 100, w = sl('warm') * 0.6, h = sl('hue') * Math.PI / 180;
    const cosH = Math.cos(h), sinH = Math.sin(h), cx = c.width / 2, cy = c.height / 2, maxd = Math.hypot(cx, cy), vg = sl('vig') / 100;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], gg = d[i + 1], bl = d[i + 2];
      r += b; gg += b; bl += b; r = cf * (r - 128) + 128; gg = cf * (gg - 128) + 128; bl = cf * (bl - 128) + 128;
      const l = 0.299 * r + 0.587 * gg + 0.114 * bl; r = l + (r - l) * s; gg = l + (gg - l) * s; bl = l + (bl - l) * s;
      r += w; bl -= w;
      if (h) { const nr = (.299 + .701 * cosH + .168 * sinH) * r + (.587 - .587 * cosH + .330 * sinH) * gg + (.114 - .114 * cosH - .497 * sinH) * bl, ng = (.299 - .299 * cosH - .328 * sinH) * r + (.587 + .413 * cosH + .035 * sinH) * gg + (.114 - .114 * cosH + .292 * sinH) * bl, nb = (.299 - .3 * cosH + 1.25 * sinH) * r + (.587 - .588 * cosH - 1.05 * sinH) * gg + (.114 + .886 * cosH - .203 * sinH) * bl; r = nr; gg = ng; bl = nb; }
      if (vg) { const p = i / 4, px = p % c.width, py = (p / c.width) | 0, f = 1 - vg * Math.pow(Math.hypot(px - cx, py - cy) / maxd, 2) * 1.2; r *= f; gg *= f; bl *= f; }
      d[i] = clamp(r); d[i + 1] = clamp(gg); d[i + 2] = clamp(bl);
    }
    if (sl('sharp')) sharpen(im, sl('sharp') / 100); x.putImageData(im, 0, 0); return c;
  }
  function sharpen(im, amt){ const { width: W, height: H, data: d } = im, o = new Uint8ClampedArray(d);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) { const c = o[i + k], lap = 4 * c - o[i - 4 + k] - o[i + 4 + k] - o[i - W * 4 + k] - o[i + W * 4 + k]; d[i + k] = clamp(c + amt * lap); } } }
  let pv; function preview(){ if (!base) return; clearTimeout(pv); pv = setTimeout(() => { const small = base.width * base.height > 2.5e6; const src = small ? scaled(base, 1400) : base; const f = filtered(src); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(f, 0, 0, cv.width, cv.height); }, 60); }
  const scaled = (c, max) => { const k = Math.min(1, max / Math.max(c.width, c.height)); const o = toCanvas(Math.round(c.width * k), Math.round(c.height * k)); o.getContext('2d').drawImage(c, 0, 0, o.width, o.height); return o; };
  const sliders = ['bri', 'con', 'sat', 'warm', 'hue', 'vig', 'sharp', 'blur'];
  sliders.forEach(id => $('#pe-' + id).addEventListener('input', () => { $('#pe-' + id + '-o').textContent = sl(id); preview(); }));
  const setSl = (o) => sliders.forEach(id => { $('#pe-' + id).value = o[id] || 0; $('#pe-' + id + '-o').textContent = o[id] || 0; });
  const LOOKS = { Original: {}, Vivid: { sat: 40, con: 15 }, Warm: { warm: 35, sat: 10 }, Cool: { warm: -35 }, 'Black & white': { sat: -100, con: 15 }, Sepia: { sat: -100, warm: 45, con: 5 }, Vintage: { sat: -30, warm: 25, con: -15, vig: 45 }, Fade: { con: -30, bri: 12, sat: -20 }, Dramatic: { con: 45, sat: -15, vig: 55, sharp: 30 } };
  root.querySelectorAll('[data-look]').forEach(b => b.onclick = () => { setSl(LOOKS[b.dataset.look]); preview(); });
  function apply(){ if (!base) return; snap(); base = filtered(base); setSl({}); show(); }
  function load(file){ const url = URL.createObjectURL(file), im = new Image(); im.onload = () => { const c = toCanvas(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); hist = []; fut = []; base = c; name = file.name.replace(/\.[^.]+$/, ''); setSl({}); show(); URL.revokeObjectURL(url); }; im.onerror = () => K.status('That picture format can\'t be opened on this device.'); im.src = url; }
  $('#pe-open').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) load(f); };
  function transform(fn, w, h){ snap(); const c = toCanvas(w, h), x = c.getContext('2d'); fn(x); base = c; show(); }
  function autoEnhance(){ if (!base) return; snap(); const x = base.getContext('2d', { willReadFrequently: true }), im = x.getImageData(0, 0, base.width, base.height), d = im.data;
    for (let k = 0; k < 3; k++) { const hs = new Uint32Array(256); for (let i = k; i < d.length; i += 4) hs[d[i]]++; const n = d.length / 4, cut = n * 0.005; let lo = 0, hi = 255, a = 0; while (a < cut && lo < 255) a += hs[lo++]; a = 0; while (a < cut && hi > 0) a += hs[hi--]; if (hi - lo < 10) continue; const sc = 255 / (hi - lo); for (let i = k; i < d.length; i += 4) d[i] = clamp((d[i] - lo) * sc); }
    const c = toCanvas(base.width, base.height); c.getContext('2d').putImageData(im, 0, 0); base = c; show(); K.status('Auto-enhanced: levels stretched per colour channel.'); }
  // crop
  let cropR = null, drag = null; const crop = $('#pe-crop');
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height, r }; };
  cv.addEventListener('pointerdown', e => { if (!base) return; const p = pt(e);
    if (mode === 'crop') { drag = p; cropR = null; cv.setPointerCapture(e.pointerId); }
    else if (mode === 'draw') { snap(); drag = p; const x = base.getContext('2d'); x.lineCap = x.lineJoin = 'round'; x.strokeStyle = $('#pe-col').value; x.lineWidth = sl2(); x.beginPath(); x.moveTo(p.x, p.y); cv.setPointerCapture(e.pointerId); }
    else if (mode === 'text') { K.prompt('Text to add', '').then(t => { if (!t) return; snap(); const x = base.getContext('2d'), sz = sl2() * 3; x.font = `700 ${sz}px system-ui, sans-serif`; x.fillStyle = $('#pe-col').value; x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = sz / 8; x.fillText(t, p.x, p.y); x.shadowBlur = 0; show(); }); } });
  const sl2 = () => +$('#pe-size').value * Math.max(1, base.width / 1500);
  cv.addEventListener('pointermove', e => { if (!drag) return; const p = pt(e);
    if (mode === 'crop') { cropR = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }; const k = p.r.width / cv.width, st = $('#pe-stage').getBoundingClientRect();
      Object.assign(crop.style, { left: p.r.left - st.left + $('#pe-stage').scrollLeft + cropR.x * k + 'px', top: p.r.top - st.top + $('#pe-stage').scrollTop + cropR.y * k + 'px', width: cropR.w * k + 'px', height: cropR.h * k + 'px' }); crop.hidden = false; }
    else if (mode === 'draw') { const x = base.getContext('2d'); x.lineTo(p.x, p.y); x.stroke(); g.drawImage(base, 0, 0); } });
  cv.addEventListener('pointerup', () => { if (mode === 'draw' && drag) show(); drag = null; if (mode === 'crop' && cropR && cropR.w > 8) K.confirm('Crop to the selected area?', 'Crop').then(ok => { crop.hidden = true; if (ok) { const r = cropR; transform(x => x.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h), Math.round(r.w), Math.round(r.h)); } setMode(null); }); });
  function setMode(m){ mode = mode === m ? null : m; root.querySelectorAll('[data-a=draw],[data-a=text],[data-a=crop]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === mode))); cv.style.cursor = mode ? 'crosshair' : ''; if (mode === 'crop') K.status('Drag across the picture to choose the area to keep.'); }
  async function out(){ const type = $('#pe-type').value, ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type]; const f = filtered(base); return { blob: await new Promise(r => f.toBlob(r, type, +$('#pe-q').value / 100)), filename: `${name} edited.${ext}` }; }
  root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', async () => {
    const a = b.dataset.a; if (!base && a !== 'undo') { K.status('Open a picture first.'); return; }
    if (a === 'undo' && hist.length) { fut.push(base); base = hist.pop(); show(); } else if (a === 'redo' && fut.length) { hist.push(base); base = fut.pop(); show(); }
    else if (a === 'rotl' || a === 'rotr') { const w = base.width, h = base.height; transform(x => { x.translate(a === 'rotr' ? h : 0, a === 'rotr' ? 0 : w); x.rotate((a === 'rotr' ? 1 : -1) * Math.PI / 2); x.drawImage(base, 0, 0); }, h, w); }
    else if (a === 'fliph') transform(x => { x.translate(base.width, 0); x.scale(-1, 1); x.drawImage(base, 0, 0); }, base.width, base.height);
    else if (a === 'flipv') transform(x => { x.translate(0, base.height); x.scale(1, -1); x.drawImage(base, 0, 0); }, base.width, base.height);
    else if (a === 'resize') { const r = await K.form('Resize', [{ id: 'w', label: 'Width (px), height follows', type: 'number', value: base.width }]); if (r && +r.w > 10) { const w = Math.round(+r.w), h = Math.round(base.height * w / base.width); const src = base; transform(x => { x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); }, w, h); } }
    else if (a === 'crop' || a === 'draw' || a === 'text') setMode(a);
    else if (a === 'apply') apply(); else if (a === 'reset') { setSl({}); preview(); } else if (a === 'auto') autoEnhance();
    else if (a === 'save') { const o = await out(); K.save(o.blob, o.filename); }
    else if (a === 'share') K.share({ name, make: { img: { label: 'Picture', build: out } } });
    else if (a === 'describe') { const s = await K.ai.claudeHere(); if (!s || !(await s.limits?.())?.images) { K.status('AI captions need Termite inside Claude (it reads the picture there). Your other AI providers only get text.', 8000); return; }
      K.busy('Asking Claude about the picture…', async () => { const small = scaled(base, 1200); const blob = await new Promise(r => small.toBlob(r, 'image/jpeg', .85));
        const r = await s('Describe this photo in one sentence, then give 3 short social-media captions and 5 hashtags, then suggest 2 edits that would improve it. Plain text.', { images: [blob], modelTier: 'default', cache: false }); K.note('About this picture', r.text); }); }
  }));
}

/* =================== JINGLE & MUSIC STUDIO =================== */
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const midi = n => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return m ? 12 * (+m[2] + 1) + NOTE[m[1]] : null; };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
function chordNotes(sym, oct = 3){ const m = /^([A-G][#b]?)(m(?!aj)|min)?(maj7|7|sus4|sus2|dim|aug|6)?/.exec(sym || 'C'); if (!m) return [48, 52, 55]; const root = 12 * (oct + 1) + NOTE[m[1]]; const minor = !!m[2];
  let iv = minor ? [0, 3, 7] : [0, 4, 7]; if (m[3] === '7') iv.push(10); if (m[3] === 'maj7') iv.push(11); if (m[3] === 'sus4') iv = [0, 5, 7]; if (m[3] === 'sus2') iv = [0, 2, 7]; if (m[3] === 'dim') iv = [0, 3, 6]; if (m[3] === 'aug') iv = [0, 4, 8]; if (m[3] === '6') iv.push(9); return iv.map(i => root + i); }
const STYLES = {
  pop: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 6, 8, 14] },
  soca: { kick: [0, 4, 8, 12], snare: [6, 14], hat: [2, 6, 10, 14], bass: [0, 3, 6, 8, 11, 14] },
  reggae: { kick: [8], snare: [8], hat: [2, 6, 10, 14], bass: [0, 3, 8, 10] },
  ballad: { kick: [0, 10], snare: [8], hat: [0, 4, 8, 12], bass: [0, 8] },
  corporate: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 4, 8, 12] },
  march: { kick: [0, 8], snare: [4, 6, 12, 14], hat: [0, 4, 8, 12], bass: [0, 8] },
};
function compose(o){ // music theory fallback when no AI is available
  const prog = { upbeat: ['C', 'G', 'Am', 'F'], warm: ['C', 'Am', 'F', 'G'], corporate: ['C', 'F', 'Am', 'G'], calm: ['Cmaj7', 'Am7', 'Fmaj7', 'G'], caribbean: ['C', 'F', 'G', 'C'], bold: ['Am', 'F', 'C', 'G'] }[o.mood] || ['C', 'G', 'Am', 'F'];
  const bars = o.seconds <= 15 ? 8 : 16, chords = [...Array(bars)].map((_, i) => prog[i % 4]); chords[bars - 1] = 'C';
  const melody = []; const rhythms = [[1, 1, 1, 1], [1.5, .5, 1, 1], [.5, .5, 1, 2], [1, .5, .5, 2], [2, 1, 1]];
  chords.forEach((c, b) => { const tones = chordNotes(c, 4).map(m => m + 12 * (Math.random() < .2 ? 1 : 0)); const r = b === bars - 1 ? [4] : rhythms[(b * 3 + Math.floor(Math.random() * 2)) % rhythms.length];
    r.forEach((d, k) => { const m = k === 0 ? tones[0] : tones[Math.floor(Math.random() * tones.length)] + (Math.random() < .3 ? 2 : 0); melody.push({ m: b === bars - 1 ? 60 : m, d }); }); });
  return { chords, melody };
}
export function jingle(root, K){
  const $ = s => root.querySelector(s);
  root.innerHTML = `<div class="k-head"><div><h2>Jingle &amp; Music Studio</h2><p>Write a catchy jingle: lyrics, chords and a melody, played by a built-in band. Save it as a WAV to use in videos and adverts.</p></div></div>
  <div class="k-split"><form class="k-form" id="j-form">
    <label class="kf"><span>Brand or product</span><input id="j-brand" placeholder="e.g. Sunny Bay Bakery"></label>
    <label class="kf"><span>Message or slogan</span><input id="j-msg" placeholder="e.g. Fresh bread every morning"></label>
    <div class="kf-row"><label class="kf"><span>Mood</span><select id="j-mood"><option value="upbeat">Upbeat</option><option value="warm">Warm</option><option value="caribbean">Caribbean</option><option value="corporate">Corporate</option><option value="calm">Calm</option><option value="bold">Bold</option></select></label>
    <label class="kf"><span>Style</span><select id="j-style">${Object.keys(STYLES).map(s => `<option>${s}</option>`).join('')}</select></label>
    <label class="kf"><span>Length</span><select id="j-len"><option value="15">15 s</option><option value="30" selected>30 s</option></select></label></div>
    <div class="kf-row"><button class="kb primary" type="submit" id="j-go">Write with AI</button><button class="kb" type="button" id="j-auto">Compose without AI</button><span class="muted" id="j-st"></span></div>
  </form>
  <div class="k-out" id="j-out"><div class="k-empty">Your jingle appears here.</div></div></div>`;
  let song = null, ctx = null, playing = null;
  $('#j-style').value = 'pop'; $('#j-mood').onchange = e => { $('#j-style').value = { caribbean: 'soca', calm: 'ballad', corporate: 'corporate', bold: 'march' }[e.target.value] || 'pop'; };
  async function write(){
    const brand = $('#j-brand').value.trim(), msg = $('#j-msg').value.trim(); if (!brand) { K.status('Give the brand or product name.'); return; }
    const secs = +$('#j-len').value, bars = secs <= 15 ? 8 : 16; $('#j-go').disabled = true;
    try { const { data, by } = await K.ai.askJSON(`Write an original, catchy advertising jingle for "${brand}"${msg ? ` with the message "${msg}"` : ''}. Mood: ${$('#j-mood').value}; style: ${$('#j-style').value}; about ${secs} seconds = exactly ${bars} bars of 4/4.
Give singable lyrics (one line per 2 bars, brand name in the hook), a chord per bar (simple symbols like C, Am, F, G7, Dm), and a lead melody that fits the chords and the lyric syllables, in the key of C, range C4 to C6. Melody: list of notes with beats (whole bars must add up to ${bars * 4} beats in total; use "R" for rests).
JSON: {"title":"","tempo":100-132,"lyrics":["line"],"chords":["C", ... ${bars} items],"melody":[{"n":"E4","b":1}, ...]}`, { maxTokens: 3000, onStatus: s => $('#j-st').textContent = s });
      song = { title: data.title || brand, tempo: Math.min(150, Math.max(70, +data.tempo || 112)), lyrics: data.lyrics || [], chords: (data.chords || []).slice(0, bars), melody: (data.melody || []).map(x => ({ m: x.n === 'R' ? null : midi(x.n), d: +x.b || 1 })).filter(x => x.m !== undefined) };
      if (song.chords.length < bars || !song.melody.length) { const c = compose({ mood: $('#j-mood').value, seconds: secs }); song.chords = song.chords.length ? song.chords.concat(c.chords).slice(0, bars) : c.chords; if (!song.melody.length) song.melody = c.melody; }
      $('#j-st').textContent = 'Written with ' + by + '.'; render();
    } catch (e) { $('#j-st').textContent = ''; K.status(e.message + ' — try "Compose without AI".', 9000); }
    $('#j-go').disabled = false;
  }
  function auto(){ const c = compose({ mood: $('#j-mood').value, seconds: +$('#j-len').value }); const brand = $('#j-brand').value.trim() || 'Your brand';
    song = { title: brand + ' jingle', tempo: $('#j-mood').value === 'calm' ? 84 : 116, lyrics: [`${brand}`, ($('#j-msg').value.trim() || 'Made for you'), `${brand}, ${brand}`, 'Write your own words here'], ...c }; render(); }
  function render(){
    const bars = song.chords.length; $('#j-out').innerHTML = `<div class="j-card"><h3 contenteditable="true" id="j-title">${esc(song.title)}</h3>
      <div class="kf-row"><button class="kb primary" id="j-play">▶ Play</button><button class="kb" id="j-wav">Save WAV</button><button class="kb" id="j-share">Share</button><button class="kb" id="j-video">Use in a video</button></div>
      <div class="kf-row"><label class="pe-sl"><span>Tempo</span><input type="range" id="j-tempo" min="70" max="150" value="${song.tempo}"><output id="j-to">${song.tempo}</output></label>
      <label class="kf"><span>Key</span><select id="j-key">${['C', 'D', 'Eb', 'E', 'F', 'G', 'A', 'Bb'].map((k, i) => `<option value="${[0, 2, 3, 4, 5, 7, 9, 10][i]}">${k}</option>`).join('')}</select></label>
      <label class="kf"><span>Lead</span><select id="j-lead"><option value="square">Bright synth</option><option value="triangle">Soft flute</option><option value="sawtooth">Brass</option><option value="sine">Pure tone</option><option value="steel">Steel pan</option></select></label>
      <label class="kf"><span>Style</span><select id="j-sty">${Object.keys(STYLES).map(s => `<option${s === $('#j-style').value ? ' selected' : ''}>${s}</option>`).join('')}</select></label></div>
      <div class="j-chords">${song.chords.map((c, i) => `<span><small>${i + 1}</small><input value="${esc(c)}" data-i="${i}" aria-label="Chord bar ${i + 1}"></span>`).join('')}</div>
      <h4>Lyrics</h4><textarea id="j-lyr" rows="${Math.max(4, song.lyrics.length + 1)}">${esc(song.lyrics.join('\n'))}</textarea>
      <p class="muted">The built-in band plays the melody; sing the lyrics over it or record a voice-over separately. Change any chord and press Play again.</p></div>`;
    $('#j-tempo').oninput = e => { song.tempo = +e.target.value; $('#j-to').textContent = song.tempo; };
    root.querySelectorAll('.j-chords input').forEach(i => i.onchange = () => song.chords[+i.dataset.i] = i.value.trim() || 'C');
    $('#j-lyr').oninput = e => song.lyrics = e.target.value.split('\n'); $('#j-title').oninput = e => song.title = e.target.innerText.trim();
    $('#j-play').onclick = play; $('#j-wav').onclick = () => K.busy('Rendering audio…', async () => K.save(await wav(), song.title + '.wav'));
    $('#j-share').onclick = () => K.share({ name: song.title, text: song.lyrics.join('\n'), make: { wav: { label: 'Audio (WAV)', build: async () => ({ blob: await wav(), filename: song.title + '.wav' }) } } });
    $('#j-video').onclick = () => K.busy('Rendering audio…', async () => { K.shared.music = { blob: await wav(), name: song.title + '.wav' }; K.go('video'); K.status('Your jingle is set as the video\'s music.'); });
  }
  function schedule(ac, out, t0){
    const spb = 60 / song.tempo, tr = +$('#j-key').value, st = STYLES[$('#j-sty').value] || STYLES.pop, lead = $('#j-lead').value;
    const master = ac.createGain(); master.gain.value = 0.8; const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(out);
    const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const env = (gnode, t, a, peak, dec) => { gnode.gain.setValueAtTime(0.0001, t); gnode.gain.exponentialRampToValueAtTime(peak, t + a); gnode.gain.exponentialRampToValueAtTime(0.0001, t + dec); };
    const tone = (type, f, t, dur, vol, dest = master) => { const o = ac.createOscillator(), gg = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = type === 'sawtooth' ? 2400 : 5000;
      if (type === 'steel') { o.type = 'sine'; const o2 = ac.createOscillator(), g2 = ac.createGain(); o2.frequency.value = f * 2.76; g2.gain.value = f * 1.2; o2.connect(g2); g2.connect(o.frequency); o2.start(t); o2.stop(t + dur + .3); env(gg, t, .005, vol, t + Math.min(1.2, dur + .4)); }
      else { o.type = type; gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(vol, t + .02); gg.gain.setValueAtTime(vol, t + Math.max(.03, dur - .05)); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur + .08); }
      o.frequency.value = f; o.connect(lp); lp.connect(gg); gg.connect(dest); o.start(t); o.stop(t + dur + .5); };
    const drum = (kind, t) => { if (kind === 'kick') { const o = ac.createOscillator(), gg = ac.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + .15); env(gg, t, .002, .9, t + .3); o.connect(gg); gg.connect(master); o.start(t); o.stop(t + .35); }
      else { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), gg = ac.createGain(); s.buffer = noise; f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800; env(gg, t, .001, kind === 'hat' ? .12 : .4, t + (kind === 'hat' ? .05 : .18)); s.connect(f); f.connect(gg); gg.connect(master); s.start(t); s.stop(t + .25); } };
    const bars = song.chords.length;
    for (let b = 0; b < bars; b++) { const tb = t0 + b * 4 * spb, ch = chordNotes(song.chords[b]).map(m => m + tr);
      ch.forEach(m => tone('triangle', hz(m), tb, 4 * spb * .95, .05));
      for (let s = 0; s < 16; s++) { const t = tb + s * spb / 4; if (st.kick.includes(s)) drum('kick', t); if (st.snare.includes(s)) drum('snare', t); if (st.hat.includes(s)) drum('hat', t); if (st.bass.includes(s)) tone('sine', hz(ch[0] - 12), t, spb * .45, .22); } }
    let t = t0; for (const n of song.melody) { if (n.m != null) tone(lead === 'steel' ? 'steel' : lead, hz(n.m + tr), t, n.d * spb * .92, lead === 'square' ? .07 : .12); t += n.d * spb; }
    return bars * 4 * spb + 1.2;
  }
  function play(){ if (playing) { playing.close(); playing = null; $('#j-play').textContent = '▶ Play'; return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)(); playing = ctx; const len = schedule(ctx, ctx.destination, ctx.currentTime + .1); $('#j-play').textContent = '■ Stop';
    setTimeout(() => { if (playing === ctx) { ctx.close(); playing = null; $('#j-play').textContent = '▶ Play'; } }, len * 1000 + 300); }
  async function wav(){ const sr = 44100, len = song.chords.length * 4 * 60 / song.tempo + 1.5; const off = new OfflineAudioContext(2, Math.ceil(sr * len), sr); schedule(off, off.destination, 0.05); return encodeWav(await off.startRendering()); }
  $('#j-form').onsubmit = e => { e.preventDefault(); write(); }; $('#j-auto').onclick = auto;
}
export function encodeWav(buf){ const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bytes = n * ch * 2, v = new DataView(new ArrayBuffer(44 + bytes)); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c)); let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([v], { type: 'audio/wav' }); }

/* =================== VIDEO & MOVIE MAKER =================== */
export function video(root, K){
  const $ = s => root.querySelector(s);
  root.innerHTML = `<div class="k-head"><div><h2>Video &amp; Movie Maker</h2><p>Put clips, photos and title cards in order, trim them, add captions and music, then export a video ready for WhatsApp, YouTube or Facebook.</p></div>
    <div class="k-acts"><button class="kb" id="v-story">Storyboard with AI</button></div></div>
  <div class="k-tool"><label class="kb primary">Add clips or photos<input type="file" id="v-add" accept="video/*,image/*" multiple hidden></label><button class="kb" id="v-title">Add title card</button>
    <label class="kb">Music<input type="file" id="v-music" accept="audio/*" hidden></label><span class="muted" id="v-mname">No music</span>
    <label class="kb">Voice-over<input type="file" id="v-voice" accept="audio/*" hidden></label><span class="muted" id="v-vname">No voice-over</span><span class="k-sep"></span>
    <label class="kf inline"><span>Shape</span><select id="v-shape"><option value="1280x720">Landscape 16:9</option><option value="720x1280">Portrait 9:16 (Status, Reels)</option><option value="1080x1080">Square</option></select></label>
    <button class="kb" id="v-prev">▶ Preview</button><button class="kb primary" id="v-export">Export video</button></div>
  <div class="v-body"><div class="v-screen"><canvas id="v-cv" width="1280" height="720"></canvas><div class="v-time" id="v-time"></div></div>
    <ol class="v-list" id="v-list"><li class="k-empty">Add clips, photos or title cards. Drag to reorder.</li></ol></div>`;
  const cv = $('#v-cv'), g = cv.getContext('2d'); let items = [], music = null, stopFlag = false, running = false;
  const W = () => cv.width, H = () => cv.height;
  let vo = null;
  const pickShared = () => { if (K.shared.music && K.shared.music !== music) { music = K.shared.music; $('#v-mname').textContent = '♪ ' + music.name; } if (K.shared.voice && K.shared.voice !== vo) { vo = K.shared.voice; $('#v-vname').textContent = '🎙 ' + vo.name; } };
  pickShared();
  $('#v-voice').onchange = e => { const f = e.target.files[0]; if (f) { vo = { blob: f, name: f.name }; $('#v-vname').textContent = '🎙 ' + f.name; } };
  $('#v-shape').onchange = e => { const [w, h] = e.target.value.split('x').map(Number); cv.width = w; cv.height = h; drawAt(0); };
  $('#v-add').onchange = async e => { for (const f of e.target.files) { const url = URL.createObjectURL(f);
      if (f.type.startsWith('video')) { const v = document.createElement('video'); v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto'; await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; });
        if (!isFinite(v.duration)) { K.status(f.name + ' can\'t be played on this device.'); continue; } items.push({ kind: 'video', name: f.name, el: v, inP: 0, outP: +v.duration.toFixed(1), caption: '', fade: true, sound: true }); }
      else { const im = new Image(); im.src = url; await im.decode().catch(() => {}); items.push({ kind: 'image', name: f.name, el: im, dur: 4, caption: '', fade: true, zoom: true }); } }
    e.target.value = ''; list(); drawAt(0); };
  $('#v-title').onclick = async () => { const r = await K.form('Title card', [{ id: 't', label: 'Title', value: '' }, { id: 's', label: 'Subtitle (optional)', value: '' }, { id: 'bg', label: 'Background', type: 'color', value: '#1d232a' }]); if (!r || !r.t) return; items.push({ kind: 'title', name: r.t, title: r.t, sub: r.s, bg: r.bg, dur: 3, caption: '', fade: true }); list(); };
  $('#v-music').onchange = e => { const f = e.target.files[0]; if (f) { music = { blob: f, name: f.name }; $('#v-mname').textContent = '♪ ' + f.name; } };
  const durOf = it => it.kind === 'video' ? Math.max(.2, it.outP - it.inP) : it.dur;
  const total = () => items.reduce((s, i) => s + durOf(i), 0);
  function list(){
    const L = $('#v-list'); if (!items.length) { L.innerHTML = '<li class="k-empty">Add clips, photos or title cards. Drag to reorder.</li>'; return; }
    L.innerHTML = items.map((it, i) => `<li draggable="true" data-i="${i}"><b>${i + 1}. ${esc(it.kind === 'title' ? '“' + it.title + '”' : it.name)}</b>
      <div class="v-ctrl">${it.kind === 'video' ? `<label>From <input type="number" step=".1" min="0" max="${it.el.duration.toFixed(1)}" value="${it.inP}" data-f="inP"> s</label><label>to <input type="number" step=".1" min="0" max="${it.el.duration.toFixed(1)}" value="${it.outP}" data-f="outP"> s</label><label><input type="checkbox" data-f="sound" ${it.sound ? 'checked' : ''}> Sound</label>`
        : `<label>Show for <input type="number" step=".5" min="1" max="60" value="${it.dur}" data-f="dur"> s</label>${it.kind === 'image' ? `<label><input type="checkbox" data-f="zoom" ${it.zoom ? 'checked' : ''}> Slow zoom</label>` : ''}`}
        <label><input type="checkbox" data-f="fade" ${it.fade ? 'checked' : ''}> Fade</label><input class="v-cap" placeholder="Caption (optional)" value="${esc(it.caption)}" data-f="caption"><button class="kb ic" data-del="${i}" aria-label="Remove">✕</button></div></li>`).join('');
    L.querySelectorAll('[data-f]').forEach(inp => inp.onchange = inp.oninput = () => { const it = items[+inp.closest('li').dataset.i], f = inp.dataset.f; it[f] = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? +inp.value : inp.value; if (f === 'inP' || f === 'outP') it.outP = Math.max(it.inP + .2, it.outP); });
    L.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { items.splice(+b.dataset.del, 1); list(); });
    let from = null; L.querySelectorAll('li[draggable]').forEach(li => { li.ondragstart = () => from = +li.dataset.i; li.ondragover = e => e.preventDefault(); li.ondrop = e => { e.preventDefault(); const to = +li.dataset.i; if (from == null || from === to) return; const [m] = items.splice(from, 1); items.splice(to, 0, m); list(); }; });
    $('#v-time').textContent = 'Length ' + fmtT(total());
  }
  const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function cover(el, sw, sh, k = 1){ const s = Math.max(W() / sw, H() / sh) * k, w = sw * s, h = sh * s; g.drawImage(el, (W() - w) / 2, (H() - h) / 2, w, h); }
  function paint(it, local){
    g.fillStyle = '#000'; g.fillRect(0, 0, W(), H());
    if (it.kind === 'title') { g.fillStyle = it.bg || '#1d232a'; g.fillRect(0, 0, W(), H()); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; const big = Math.round(Math.min(W(), H()) / 9);
      g.font = `700 ${big}px system-ui, sans-serif`; wrap(it.title, W() / 2, H() / 2 - (it.sub ? big * .5 : 0), W() * .85, big * 1.15); if (it.sub) { g.font = `400 ${big * .45}px system-ui, sans-serif`; g.fillStyle = '#f2c89b'; g.fillText(it.sub, W() / 2, H() / 2 + big * .9); } }
    else if (it.kind === 'image') cover(it.el, it.el.naturalWidth, it.el.naturalHeight, it.zoom ? 1 + 0.08 * local / it.dur : 1);
    else cover(it.el, it.el.videoWidth || 16, it.el.videoHeight || 9);
    if (it.caption) { const fs = Math.round(Math.min(W(), H()) / 20); g.font = `600 ${fs}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; const tw = Math.min(W() * .9, g.measureText(it.caption).width + fs);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect((W() - tw) / 2, H() - fs * 2.6, tw, fs * 1.6); g.fillStyle = '#fff'; g.fillText(it.caption, W() / 2, H() - fs * 1.25); }
    const d = durOf(it); if (it.fade) { const a = Math.max(0, 1 - Math.min(local, d - local) / 0.5); if (a > 0) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, W(), H()); } }
  }
  function wrap(t, x, y, mw, lh){ const words = String(t).split(' '), lines = []; let l = ''; for (const w of words) { if (g.measureText(l + ' ' + w).width > mw && l) { lines.push(l); l = w; } else l = l ? l + ' ' + w : w; } lines.push(l); lines.forEach((ln, i) => g.fillText(ln, x, y + (i - (lines.length - 1) / 2) * lh)); }
  function drawAt(t){ let acc = 0; for (const it of items) { const d = durOf(it); if (t < acc + d) { if (it.kind === 'video') it.el.currentTime = it.inP + (t - acc); paint(it, t - acc); return; } acc += d; } g.fillStyle = '#111'; g.fillRect(0, 0, W(), H()); }
  async function run(record){
    if (!items.length) { K.status('Add at least one clip, photo or title card.'); return null; }
    if (running) { stopFlag = true; return null; } running = true; stopFlag = false;
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(), out = record ? dest : ac.destination; let musicSrc = null;
    if (music) { try { const buf = await ac.decodeAudioData(await music.blob.arrayBuffer()); musicSrc = ac.createBufferSource(); musicSrc.buffer = buf; musicSrc.loop = buf.duration < total(); const mg = ac.createGain(); mg.gain.value = vo ? 0.25 : 0.7; musicSrc.connect(mg); mg.connect(out); if (record) mg.connect(ac.destination); } catch (e) { K.status('That music file can\'t be decoded here.'); } }
    let voSrc = null;
    if (vo) { try { const buf = await ac.decodeAudioData(await vo.blob.arrayBuffer()); voSrc = ac.createBufferSource(); voSrc.buffer = buf; const vg = ac.createGain(); vg.gain.value = 1; voSrc.connect(vg); vg.connect(out); if (record) vg.connect(ac.destination); if (buf.duration > total() + 0.5) K.status(`The voice-over (${Math.round(buf.duration)} s) is longer than the video (${Math.round(total())} s); lengthen photos or clips so it isn't cut off.`, 8000); } catch (e) { K.status('That voice-over file can\'t be decoded here.'); } }
    let rec = null, chunks = [], mime = '';
    if (record) { const stream = cv.captureStream(30); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => window.MediaRecorder?.isTypeSupported?.(m));
      if (!mime) { K.status('This device can\'t record video from the browser.'); running = false; return null; }
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5e6 }); rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start(250); }
    musicSrc?.start(); voSrc?.start(ac.currentTime + 0.3);
    const btn = record ? $('#v-export') : $('#v-prev'), label = btn.textContent; btn.textContent = '■ Stop';
    for (const it of items) { if (stopFlag) break; const d = durOf(it), t0 = performance.now();
      let vsrc = null; if (it.kind === 'video') { it.el.currentTime = it.inP; await new Promise(r => { it.el.onseeked = r; setTimeout(r, 800); }); it.el.muted = !it.sound;
        if (it.sound) { try { if (!it.node) it.node = ac.createMediaElementSource(it.el); vsrc = it.node; vsrc.connect(out); if (record) vsrc.connect(ac.destination); } catch (e) {} } await it.el.play().catch(() => {}); }
      await new Promise(res => { (function frame(){ const local = (performance.now() - t0) / 1000; if (local >= d || stopFlag) { res(); return; } paint(it, local); $('#v-time').textContent = fmtT(items.slice(0, items.indexOf(it)).reduce((s, x) => s + durOf(x), 0) + local) + ' / ' + fmtT(total()); requestAnimationFrame(frame); })(); });
      if (it.kind === 'video') { it.el.pause(); try { vsrc?.disconnect(); } catch (e) {} } }
    try { musicSrc?.stop(); } catch (e) {} try { voSrc?.stop(); } catch (e) {} btn.textContent = label; running = false;
    if (record) { await new Promise(r => { rec.onstop = r; rec.stop(); }); await ac.close(); if (stopFlag) return null; return new Blob(chunks, { type: mime.split(';')[0] }); }
    await ac.close(); return null;
  }
  $('#v-prev').onclick = () => run(false);
  $('#v-export').onclick = async () => { if (running) { stopFlag = true; return; } K.status(`Recording in real time (${fmtT(total())})… keep this window open.`, 0); const blob = await run(true); if (!blob) { K.status('Export stopped.'); return; }
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm', nm = (items.find(i => i.kind === 'title')?.title || 'My video') + '.' + ext;
    K.status(`Video ready (${(blob.size / 1048576).toFixed(1)} MB, ${ext.toUpperCase()}).`, 6000); const ok = await K.choose('Your video is ready', [['save', 'Save it'], ['share', 'Share it']]);
    if (ok === 'save') K.save(blob, nm); else if (ok === 'share') K.share({ name: nm.replace(/\.\w+$/, ''), make: { v: { label: ext.toUpperCase(), build: async () => ({ blob, filename: nm }) } } }); };
  $('#v-story').onclick = async () => {
    const brief = await K.prompt('What is the video about? (purpose, audience, key message, length)', ''); if (!brief) return;
    K.busy('Planning the storyboard…', async () => {
      const { data } = await K.ai.askJSON(`Plan a short video. Brief: ${brief}\nExisting media in order: ${items.map((it, i) => `${i + 1}. ${it.kind} "${it.name}"`).join('; ') || 'none yet'}.
Return an opening and closing title card, a caption (max 8 words) for each existing item in order, and a 60-90 second voice-over script. JSON: {"open":{"title":"","sub":""},"captions":["..."],"close":{"title":"","sub":""},"voiceover":"","shots_to_film":["ideas for extra footage"]}`, { maxTokens: 2500 });
      (data.captions || []).forEach((c, i) => { if (items[i]) items[i].caption = c; });
      if (data.open?.title) items.unshift({ kind: 'title', name: data.open.title, title: data.open.title, sub: data.open.sub, bg: '#1d232a', dur: 3, caption: '', fade: true });
      if (data.close?.title) items.push({ kind: 'title', name: data.close.title, title: data.close.title, sub: data.close.sub, bg: '#2a1a0c', dur: 4, caption: '', fade: true });
      list(); drawAt(0); K.note('Storyboard', `Voice-over script:\n\n${data.voiceover || ''}\n\nExtra shots to film:\n• ${(data.shots_to_film || []).join('\n• ')}`);
    });
  };
  list(); drawAt(0);
  return { refresh: pickShared };
}
