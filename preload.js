// Lets Kiosk's AI calls (and desktop file sharing) reach Venice, Groq, Gemini, OpenRouter, Anthropic and Ollama from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('termiteNet', {
  fetch: (url, opts) => ipcRenderer.invoke('termite-net', url, opts),
  // Saves the file to Downloads/Termite, copies it to the clipboard as a file and opens WhatsApp.
  shareFile: (bytes, filename, target) => ipcRenderer.invoke('termite-share-file', bytes, filename, target)
});
