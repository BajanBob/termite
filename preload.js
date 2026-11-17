// Lets Kiosk's AI calls (and desktop file sharing) reach Venice, Groq, Gemini, OpenRouter, Anthropic and Ollama from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('termiteNet', {
  fetch: (url, opts) => ipcRenderer.invoke('termite-net', url, opts),
  // Saves the file to Downloads/Termite, then attaches it (email) or copies it to paste (WhatsApp, Facebook).
  shareFile: (bytes, filename, target, opts) => ipcRenderer.invoke('termite-share-file', bytes, filename, target, opts),
  // Opens WhatsApp (optionally a person's chat), an email service or Facebook.
  openApp: (target, opts) => ipcRenderer.invoke('termite-open-app', target, opts)
});
