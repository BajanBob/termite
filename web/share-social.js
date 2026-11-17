// Share to WhatsApp and Facebook (groups and Pages).
// Facebook no longer lets apps post into groups (Groups API removed April 2024), and Page posts can't carry
// documents, so: groups get the file (you attach it in the group), Pages get pictures of the pages.
const T = window.termite;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const android = !!window.TermiteAndroid, inClaude = !!window.claude;
const toB64 = async blob => { const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const KEY = 'termite.fb.v1';
let fb = { groups: [], pages: [] }; try { fb = { groups: [], pages: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) {}
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(fb)); } catch (e) {} };
function fbUrl(input, kind){
  let s = String(input || '').trim(); if (!s) return null;
  if (/^\d{5,}$/.test(s)) return kind === 'group' ? `https://www.facebook.com/groups/${s}` : `https://www.facebook.com/profile.php?id=${s}`;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (!/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname)) return null;
  if (kind === 'group' && !/^\/groups\//i.test(u.pathname)) return null;
  u.hostname = 'www.facebook.com'; u.hash = ''; return u.toString();
}

/* ---------- add the two Facebook buttons and a panel to the Share window ---------- */
const grid = $('#dlg-share .shgrid');
grid.insertAdjacentHTML('beforeend', `
  <button class="sbtn" id="sh-fbg" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.8 0 5 2.2 5 5"/></svg>Facebook group</button>
  <button class="sbtn" id="sh-fbp" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>Facebook Page</button>`);
grid.classList.add('six');
const panel = document.createElement('div'); panel.className = 'sh-panel'; panel.hidden = true; $('#sh-help').before(panel);
const job = () => T.shareJob();
const fmtKey = () => (document.querySelector('input[name=shfmt]:checked') || {}).value || Object.keys(job().make)[0];
async function build(){ const k = fmtKey(); return job().make[k].build(); }
const help = t => { $('#sh-help').textContent = t; };

/* ---------- WhatsApp: straight into WhatsApp on Android ---------- */
const desktopApp = !!(window.termiteNet && window.termiteNet.shareFile);
$('#sh-wa').addEventListener('click', async e => {
  if (desktopApp) {                                            // Windows/Linux app: a wa.me link can't carry a file, so put the file on the clipboard
    e.preventDefault(); e.stopImmediatePropagation(); help('Preparing the file for WhatsApp…');
    try { const { blob, filename } = await build();
      const r = await window.termiteNet.shareFile(new Uint8Array(await blob.arrayBuffer()), filename, 'whatsapp');
      if (!r || !r.ok) { help('Couldn\'t prepare the file: ' + (r && r.error || 'unknown error')); return; }
      const open = r.opened === 'web' ? 'WhatsApp Web is opening in your browser' : r.opened ? 'WhatsApp is opening' : 'Open WhatsApp';
      help(r.copied
        ? `${open}. The file "${filename}" is copied: open the chat, click in the message box and press Ctrl+V, then Send. If it doesn't paste, drag the file in from the folder that just opened (Downloads › Termite).`
        : `${open}. Open the chat, then drag "${filename}" in from the folder that just opened (Downloads › Termite), or click the paperclip › Document and pick it from there.`);
      T.status(r.copied ? 'File copied. In WhatsApp, open the chat and press Ctrl+V.' : 'Saved to Downloads › Termite. Drag it into the WhatsApp chat.', 9000);
    } catch (err) { help('Couldn\'t prepare the file: ' + (err.message || err)); }
    return;
  }
  if (!android || !window.TermiteAndroid.shareTo) return;      // web version: save first, then the wa.me link opens WhatsApp
  e.preventDefault(); help('Opening WhatsApp…');
  try { const { blob, filename } = await build(); const b64 = await toB64(blob), mime = blob.type || 'application/octet-stream';
    let r = TermiteAndroid.shareTo(b64, filename, mime, 'com.whatsapp'); if (r === 'missing') r = TermiteAndroid.shareTo(b64, filename, mime, 'com.whatsapp.w4b');
    if (r === 'missing') { TermiteAndroid.share(b64, filename, mime); help('WhatsApp isn\'t installed, so your phone\'s share menu opened instead.'); return; }
    $('#dlg-share').close(); T.status('Pick the chat in WhatsApp; the file is already attached.', 6000);
  } catch (err) { help('Couldn\'t prepare the file: ' + (err.message || err)); }
}, true);

/* ---------- Facebook group: the file itself ---------- */
function picker(kind){
  const list = kind === 'group' ? fb.groups : fb.pages, label = kind === 'group' ? 'group' : 'Page';
  return `<div class="sh-row"><label class="kf"><span>Your ${label}</span><select id="fb-pick">${list.map((g, i) => `<option value="${i}">${esc(g.name)}</option>`).join('')}<option value="new">+ Add a ${label}…</option></select></label><button type="button" class="btn" id="fb-del" ${list.length ? '' : 'hidden'}>Remove</button></div>
    <div id="fb-new" ${list.length ? 'hidden' : ''}><div class="sh-row"><label class="kf"><span>${kind === 'group' ? 'Group' : 'Page'} name</span><input id="fb-name" placeholder="${kind === 'group' ? 'e.g. Bridgetown Business Network' : 'e.g. Sunny Bay Bakery'}"></label></div>
      <div class="sh-row"><label class="kf"><span>Link (copy it from the address bar or Share › Copy link)</span><input id="fb-link" placeholder="${kind === 'group' ? 'facebook.com/groups/…' : 'facebook.com/yourpage'}" inputmode="url"></label><button type="button" class="btn" id="fb-add">Save</button></div></div>`;
}
function wirePicker(kind, onChange){
  const list = kind === 'group' ? fb.groups : fb.pages;
  const sel = panel.querySelector('#fb-pick'); const cur = () => list[+sel.value];
  sel.onchange = () => { panel.querySelector('#fb-new').hidden = sel.value !== 'new'; panel.querySelector('#fb-del').hidden = sel.value === 'new'; onChange(cur()); };
  panel.querySelector('#fb-add').onclick = () => { const name = panel.querySelector('#fb-name').value.trim(), url = fbUrl(panel.querySelector('#fb-link').value, kind);
    if (!url) { help(kind === 'group' ? 'That doesn\'t look like a Facebook group link. It should contain facebook.com/groups/…' : 'That doesn\'t look like a Facebook link.'); return; }
    list.push({ name: name || url.replace(/^https:\/\/www\.facebook\.com\//, ''), url }); keep(); open(kind); };
  panel.querySelector('#fb-del').onclick = () => { if (sel.value === 'new') return; list.splice(+sel.value, 1); keep(); open(kind); };
  if (sel.value !== 'new') onChange(cur()); else onChange(null);
}
function open(kind){
  panel.hidden = false; grid.querySelectorAll('.sbtn').forEach(b => b.setAttribute('aria-pressed', String(b.id === (kind === 'group' ? 'sh-fbg' : 'sh-fbp'))));
  if (kind === 'group') {
    panel.innerHTML = `<h3>Post to a Facebook group</h3>${picker('group')}
      <div class="sh-row"><button type="button" class="btn primary" id="fb-save">${android ? '1. Save to Downloads' : '1. Save the file'}</button><a class="btn" id="fb-go" target="_blank" rel="noopener">2. Open the group</a></div>
      <p class="muted sh-small">Facebook doesn't let apps post into groups, so you attach the file yourself in one step. Groups accept PDF, Word, Excel, PowerPoint and text files. Some groups only let admins add files.</p>`;
    wirePicker('group', g => { const a = panel.querySelector('#fb-go'); a.href = g?.url || 'https://www.facebook.com/groups/feed/'; a.textContent = g ? `2. Open ${g.name}` : '2. Open Facebook groups'; });
    panel.querySelector('#fb-save').onclick = async () => { try { const { blob, filename } = await build(); if (await T.save(blob, filename)) { panel.querySelector('#fb-save').textContent = '✓ Saved'; const touch = android || /Android|iPhone|iPad/.test(navigator.userAgent); help(`Now open the group. ${touch ? 'Tap "Write something…", scroll the options and tap File' : 'Click "Write something…", then ⋯ (more) › File'}, and pick "${filename}" from Downloads. Add a line about it and Post.`); } } catch (e) { help('Couldn\'t save: ' + (e.message || e)); } };
  } else {
    const canPics = !!job().make.pdf || !!job().make.docx;
    panel.innerHTML = `<h3>Post to a Facebook Page</h3>${picker('page')}
      ${canPics ? `<div class="sh-row"><label class="kf"><span>Pages to post as pictures</span><select id="fb-n"><option value="1">First page only</option><option value="4" selected>Up to 4 pages</option><option value="10">Up to 10 pages</option><option value="30">Up to 30 pages</option></select></label></div>
      <div class="sh-row"><button type="button" class="btn primary" id="fb-pics">${android ? 'Post pictures with Facebook' : '1. Save the pictures (.zip)'}</button>${android ? '' : '<a class="btn" id="fb-go" target="_blank" rel="noopener">2. Open the Page</a>'}</div>` : '<p class="help">Spreadsheets and audio can\'t be shown as pictures. Post them in a Facebook group instead, or share a link from your cloud storage.</p>'}
      <p class="muted sh-small">Facebook Pages can't attach documents to a post, so Termite turns each page into a clear picture. People can swipe through them in the post.</p>`;
    wirePicker('page', g => { const a = panel.querySelector('#fb-go'); if (a) { a.href = g?.url || 'https://www.facebook.com/'; a.textContent = g ? `2. Open ${g.name}` : '2. Open Facebook'; } });
    panel.querySelector('#fb-pics')?.addEventListener('click', postPictures);
  }
}
$('#sh-fbg').onclick = () => open('group');
$('#sh-fbp').onclick = () => open('page');
// tidy the panel each time the Share window opens
new MutationObserver(() => { if ($('#dlg-share').open) { panel.hidden = true; panel.innerHTML = ''; grid.querySelectorAll('.sbtn').forEach(b => b.setAttribute('aria-pressed', 'false')); } }).observe($('#dlg-share'), { attributes: true, attributeFilter: ['open'] });

/* ---------- pictures of the pages ---------- */
async function pageImages(max){
  const mk = job().make, src = mk.pdf ? mk.pdf : null; let pdfBlob;
  if (src) pdfBlob = (await src.build()).blob; else if (T.writer) pdfBlob = await T.writer.pdfBlob();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()), isEvalSupported: false }).promise;
  const out = [], n = Math.min(pdf.numPages, max);
  for (let p = 1; p <= n; p++) { help(`Making picture ${p} of ${n}…`); const page = await pdf.getPage(p), vp0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1600 / Math.max(vp0.width, vp0.height)) });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp, annotationMode: window.pdfjsLib.AnnotationMode.ENABLE_FORMS }).promise; out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', .9))); }
  const more = pdf.numPages - n; pdf.destroy(); return { images: out, more };
}
async function postPictures(){
  const btn = panel.querySelector('#fb-pics'), max = +panel.querySelector('#fb-n').value, name = job().name.replace(/[\\/:*?"<>|]/g, '_');
  btn.disabled = true;
  try {
    const { images, more } = await pageImages(max);
    if (android && window.TermiteAndroid.shareImages) {
      const list = []; for (const b of images) list.push(await toB64(b));
      const r = TermiteAndroid.shareImages(JSON.stringify(list), name, 'com.facebook.katana');
      $('#dlg-share').close(); T.status(r === 'ok' ? `Facebook opened with ${images.length} picture${images.length > 1 ? 's' : ''}. Choose your Page as the poster ("Posting as"), add a caption and Post.` : 'Facebook isn\'t installed, so your share menu opened. Pick Facebook, Pages Manager or Meta Business Suite.', 9000);
      return;
    }
    const lib = s => new Promise((res, rej) => { if (window.JSZip) return res(); const e = document.createElement('script'); e.src = 'lib/' + s + '.js'; e.onload = res; e.onerror = rej; document.head.append(e); });
    await lib('jszip'); const z = new JSZip(); images.forEach((b, i) => z.file(`${name} ${String(i + 1).padStart(2, '0')}.jpg`, b));
    if (await T.save(await z.generateAsync({ type: 'blob' }), `${name} (pictures for Facebook).zip`)) {
      btn.textContent = '✓ Pictures saved';
      help(`Unzip "${name} (pictures for Facebook).zip" in Downloads. Then open your Page, choose Create post › Photo/video, select all ${images.length} pictures and Post.${more > 0 ? ` (${more} more page${more > 1 ? 's were' : ' was'} left out; choose a bigger number to include them.)` : ''}`);
    }
  } catch (e) { help('Couldn\'t make the pictures: ' + (e.message || e)); }
  btn.disabled = false;
}
