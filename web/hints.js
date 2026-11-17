// Termite's hint of the day: pops up once a day and goes away with a click.
const HINTS = [
  ['PDF', 'Press Ctrl + F to search a PDF. Enter jumps to the next match, Shift + Enter to the one before.'],
  ['PDF', 'Fill in a PDF form, then press Save copy. Your answers are saved inside the PDF.'],
  ['PDF', 'Press H to highlight, P to draw and T to type on a PDF. Esc goes back to selecting.'],
  ['PDF', 'Edit as Word turns a PDF\'s text into a document you can change and save as .docx.'],
  ['PDF', 'More › Night reading darkens the pages for reading late at night.'],
  ['PDF', 'Drop a PDF or Word file anywhere on Termite to open it.'],
  ['PDF', 'The Pages button shows thumbnails. Click Bookmarks to jump between chapters.'],
  ['PDF', 'All tools › Organise pages lets you drag pages into order, rotate, delete, insert or extract them.'],
  ['PDF', 'All tools › Fill and sign: draw, type or upload your signature once, and Termite remembers it.'],
  ['PDF', 'Redact really removes what you black out: the page is rebuilt so the hidden text can\'t be copied back.'],
  ['PDF', 'Got a scanned PDF? All tools › Scan to text makes it searchable, right on your device.'],
  ['PDF', 'All tools › Password protect locks a copy with AES-256 encryption.'],
  ['PDF', 'Compare two PDFs shows every line that changed between two versions of a contract or letter.'],
  ['Word', 'Templates gives you a ready letter, memo, CV, invoice, report, minutes or newsletter.'],
  ['Word', 'Layout › Header and footer adds titles and Page 1 of 10 numbering to the Word file and PDF.'],
  ['Word', 'Select text, then ✨ AI › Improve writing, Fix grammar, Shorten, Translate and more.'],
  ['Word', 'Insert › Contents page builds a table of contents from your headings.'],
  ['Word', 'Insert › Comment saves real Word comments that colleagues see in Microsoft Word.'],
  ['Word', 'The paint-roller button is a format painter: click in styled text, then select the text to copy the style onto.'],
  ['Word', 'In Word mode, Ctrl + S saves a .docx and Ctrl + H opens find and replace.'],
  ['Word', 'Make PDF turns your document into a PDF that looks the same on every phone.'],
  ['Word', 'Your Word draft is kept on this device, so it is still there next time.'],
  ['Share', 'Share sends files by WhatsApp, email or Bluetooth. On Android it opens the share menu with the file attached.'],
  ['Share', 'Smart Send: in Share, just type "WhatsApp it to Mum" or "email it to sam@acme.com". Termite opens the right chat with the file and a message ready.'],
  ['Share', 'Smart Send remembers who you send to and puts them at the top of Share next time. Manage them under Share › People.'],
  ['Share', 'Type "open my Facebook" or "open WhatsApp" in Share\'s Smart Send box to jump straight there.'],
  ['Kiosk', 'Type what you need into Ask Kiosk, like "a jingle for my bakery", and it opens the right studio.'],
  ['Kiosk', 'Kiosk learns which studios you use and suggests them on its home screen.'],
  ['Kiosk', 'Groq, Gemini and OpenRouter give free AI keys. Add one in Kiosk › AI settings.'],
  ['Kiosk', 'Council mode asks up to three AI models at once and merges the best of their answers.'],
  ['Harry', 'Give Harry the Accountant your bank or sales files and ask for a P&L. He builds it with formulas you can check.'],
  ['Harry', 'Select a column of monthly figures and press Forecast. Harry tests several methods and picks the most accurate.'],
  ['Harry', 'Find anomalies marks unusual numbers in red, which helps catch typing mistakes and odd payments.'],
  ['Harry', 'Financial analysis has ready models: loans, NPV and IRR, break-even, ratios, budgets, cash flow and depreciation.'],
  ['Harry', 'In Harry, Ctrl + D copies a formula down the selection and adjusts its references.'],
  ['Harry', 'While typing a formula in Harry, click a cell to put its reference in.'],
  ['Harry', 'The bar under Harry\'s grid shows the sum, average and count of whatever you select.'],
  ['Pitch', 'The Pitch Deck Agent saves real PowerPoint files with speaker notes, ready to present.'],
  ['Brochure', 'Add your own photo and logo to the Brochure Agent, then print double-sided and fold in three.'],
  ['Plan', 'The Business Plan Writer also builds 3-year projections in Harry, linked by formulas.'],
  ['Music', 'In the Jingle Studio, change any chord and press Play to hear the difference at once.'],
  ['Music', 'Jingle Studio › Use in a video sends your jingle straight to the Video Maker as music.'],
  ['Video', 'Choose Portrait 9:16 in the Video Maker for WhatsApp Status, Reels and TikTok.'],
  ['Video', 'Storyboard with AI writes titles, captions and a voice-over script for your clips.'],
  ['Voice', 'VoiceOver writes your script, voices it with Venice or ElevenLabs voices, and sends it to the Video Maker with the music turned down underneath.'],
  ['Voice', 'Want a real voice actor? VoiceOver › Hire a voice actor writes the brief for Fiverr or PeoplePerHour, then imports their recording.'],
  ['Pictures', 'Auto-enhance in the Picture Editor fixes dull or dark photos in one click.'],
  ['Pictures', 'Try the Looks in the Picture Editor (Vintage, Dramatic, Black & white), then press Apply.'],
];
const KEY = 'termite.hint.day';
const today = new Date().toISOString().slice(0, 10);
let seen = null; try { seen = localStorage.getItem(KEY); } catch (e) {}
if (seen !== today) {
  const day = Math.floor(Date.now() / 864e5), [tag, text] = HINTS[day % HINTS.length];
  const box = document.createElement('div');
  box.className = 'daily-hint'; box.setAttribute('role', 'status'); box.tabIndex = 0;
  box.innerHTML = `<div class="dh-top"><span class="dh-badge">Hint of the day · ${tag}</span><span class="dh-x" aria-hidden="true">✕</span></div><p></p><small>Click to dismiss</small>`;
  box.querySelector('p').textContent = text;
  const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 250); try { localStorage.setItem(KEY, today); } catch (e) {} };
  box.addEventListener('click', close); box.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') close(); });
  setTimeout(() => document.body.append(box), 1200);
}
