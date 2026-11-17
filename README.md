# Termite

Termite reads, marks up and fills PDFs, writes Word documents, and includes **Kiosk**, a studio of AI agents and creative tools. It runs on Windows, Linux and Android, and as a page inside Claude.

## What it does

### PDF
- Open any PDF, including password-protected ones.
- Search the text, view thumbnails and bookmarks, zoom and rotate.
- Highlight, draw and add text, fill in forms, then save a copy.
- **Edit as Word** turns a PDF's text into an editable document.
- **All tools:**
  - **Organise:** organise pages (drag to reorder, rotate, delete, duplicate, insert blank or from another PDF, extract), combine files, split, images to PDF, export as images.
  - **Edit:** cover and retype, add image, stamps (Approved, Paid, Confidential…), watermark, page numbers with headers and footers.
  - **Sign and protect:** fill and sign (draw, type or upload a signature), redact (true removal; pages are rebuilt), password protect (AES-256), remove password, reduce file size.
  - **Scan and review:** scan to text (on-device OCR, makes scans searchable or sends the text to Word mode), compare two PDFs, print.

### Word
- Open and edit .docx files with styles, fonts, colours, lists, tables, pictures, links and page breaks.
- Find and replace, and see a word count.
- Save as .docx or make a PDF.
- **Templates:** letter, memo, CV, invoice, report, meeting minutes and a two-column newsletter.
- **Layout:** page setup (A4, Letter, Legal, A5; portrait or landscape; margins), headers and footers with page numbers, one to three columns, line spacing and paragraph spacing.
- **Insert:** contents page (a real Word table of contents), footnotes, comments (saved as real Word comments), symbols, date and a signature line.
- **Table tools:** add or delete rows and columns, and shade the header row.
- **Text tools:** change case and a format painter.
- **Review:** comments panel, read aloud, and word count with reading time.
- **✨ AI:** improve, fix grammar, shorten, lengthen, change tone, summarise, translate, continue writing or ask anything. It uses Kiosk's AI coalition.
- **Print:** in the Windows and Linux apps.

### Kiosk
| Studio | What it does |
|---|---|
| **Harry the Accountant** | A spreadsheet with an agentic AI accountant. Give him Excel, CSV, PDF or Word files and an instruction. He plans the work, builds the workbook with real formulas, checks the results and fixes errors. There are 90+ functions, including PMT, NPV, IRR, RATE, FORECAST, XLOOKUP and SUMIFS. It opens and saves .xlsx and CSV, makes charts, forecasts (it tests several methods on your recent data and picks the most accurate) and flags unusual numbers. |
| **Financial Analysis** | Ready-made, formula-driven models: loans and mortgages, investment appraisal (NPV, IRR, payback), break-even, ratio analysis, budget vs actual, a 12-month cash flow and depreciation. |
| **Pitch Deck Agent** | An investor-ready deck you can edit, saved as PowerPoint with speaker notes, or as PDF. |
| **Brochure Agent** | A print-ready A4 tri-fold brochure with your photo and logo. |
| **Business Plan Writer** | Outlines the plan, writes each section, builds 3-year projections in Harry, and opens the plan in Word mode. |
| **Picture Editor** | Crop, rotate, flip, resize, adjust, apply looks, auto-enhance, add text and drawing, and get AI captions inside Claude. |
| **Jingle & Music Studio** | Lyrics, chords and melody played by a built-in band (synth, bass, drums, steel pan), saved as WAV. |
| **VoiceOver** | Write a script (or have AI write it), pick a voice style (deep and cinematic, warm, broadcast, promo, documentary, Caribbean), then voice it with Venice AI or ElevenLabs voices, record your own voice with a teleprompter, or have Termite write a brief for a voice actor on Fiverr or PeoplePerHour and import their recording. Background music is mixed underneath, and the result goes straight to the Video Maker. Termite doesn't copy or imitate real people's voices. |
| **Video & Movie Maker** | Clips, photos and title cards with trims, captions, fades and music, plus an AI storyboard. Exports MP4 or WebM in 16:9, 9:16 or square. |

**Ask Kiosk** sends a plain-English request to the right studio. The home screen learns which studios you use, and when, and suggests them. This is kept on your device.

### AI coalition
Kiosk can use several AI services. In **Fastest** mode it uses the first one in your list and falls back to the next if that fails. In **Council** mode it asks up to three at once and merges the best of their answers.

| Provider | Key |
|---|---|
| Claude | None needed inside Claude. Elsewhere, an Anthropic API key. |
| Venice AI | API key with credits. |
| OpenRouter free models (`openrouter/free`) | Free key. |
| Groq | Free key. |
| Google Gemini | Free key. |
| Ollama on your own computer | No key needed. |
| ElevenLabs (VoiceOver only) | API key. Voices added from its Voice Library to your account appear in Termite. |

Keys are stored only on your device. The desktop and Android apps send AI requests only to these services.

### Every day
A **hint of the day** pops up once a day. Click it to dismiss it.

### Share
- **WhatsApp:** on Android the file goes straight into WhatsApp (or WhatsApp Business), already attached. Elsewhere, save it and the WhatsApp button opens the chat.
- **Facebook group:** pick a saved group, then save the file and open the group to attach it (PDF, Word, Excel, PowerPoint, text). Facebook stopped letting apps post into groups in April 2024, so this last tap is yours.
- **Facebook Page:** Pages can't attach documents, so Termite posts pictures of the pages. On Android, Facebook opens with the pictures ready; on desktop, they're saved in a .zip to upload.
- **Email and Bluetooth**, plus **Send…** on Android for any other app.

## Downloads

Get the zips from the [Releases page](../../releases):

| File | What it is |
|---|---|
| Termite-Windows-Installer.zip | Installer. It adds Termite to the Start menu and opens PDF and .docx files. |
| Termite-Windows-Portable.zip | A single .exe that runs without installing. |
| Termite-Linux.zip | An AppImage (run `chmod +x` on it, then run it) and a .deb (`sudo apt install ./Termite-*.deb`). |
| Termite-Android.zip | Termite.apk for Android 7 and later. It installs over earlier versions. |

The Windows builds aren't code-signed, so SmartScreen may warn the first time. Choose **More info › Run anyway**.

## License

**Termite and Kiosk © 2026 Kammie Holder, Ai Innovation Studio.** Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The Picture Editor is Termite's own tool. It is not affiliated with NCH Software, Microsoft, Adobe or any AI provider named here.

## Layout

- `web/`: the app itself, the same files as the Claude page. Kiosk is in `web/kiosk/`.
- `main.js`, `preload.js` and `package.json`: the Electron wrapper for Windows and Linux.
- `android/`: the Android WebView wrapper. It adds file picking, saving to Downloads, the share menu and AI network access.
- `.github/workflows/build.yml`: builds everything and attaches the zips to a release.
