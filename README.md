# Termite

Termite reads, marks up and fills PDFs, and writes Word documents. It runs on Windows, Linux and Android, and as a page in Claude.

## What it does

- **PDF:** open any PDF, including password-protected ones. Search the text, view thumbnails and bookmarks, zoom and rotate. Highlight, draw and add text, fill in forms, then save a copy.
- **Word:** open and edit .docx files with styles, fonts, colours, lists, tables, pictures, links and page breaks. Find and replace, and see a word count. Save as .docx or make a PDF. **Edit as Word** turns a PDF's text into an editable document.
- **Share:**
  - On Android, Share opens the phone's share menu (WhatsApp, Gmail, Bluetooth and so on) with the file attached.
  - On Windows and Linux, save the file, then use the WhatsApp or email buttons, or send it by Bluetooth with the steps shown.

## Downloads

Get the zips from the [Releases page](../../releases):

| File | What it is |
|---|---|
| Termite-Windows-Installer.zip | Installer. It adds Termite to the Start menu and opens PDF and .docx files. |
| Termite-Windows-Portable.zip | A single .exe that runs without installing. |
| Termite-Linux.zip | An AppImage (run `chmod +x` on it, then run it) and a .deb (`sudo apt install ./Termite-*.deb`). |
| Termite-Android.zip | Termite.apk. Allow "install unknown apps" for your file manager when asked. |

The Windows builds aren't code-signed, so SmartScreen may warn the first time. Choose **More info › Run anyway**.

## Layout

- `web/`: the app itself, the same files as the Claude page.
- `main.js` and `package.json`: the Electron wrapper for Windows and Linux.
- `android/`: the Android WebView wrapper. It adds a file picker, saving to Downloads and the share menu.
- `.github/workflows/build.yml`: builds everything and attaches the zips to a release.

pdf.js, mammoth, JSZip, jsPDF and html2canvas are used under their own licences.
