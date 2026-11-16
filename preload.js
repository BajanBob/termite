// Lets Kiosk's AI calls reach Venice, Groq, Gemini, OpenRouter, Anthropic and Ollama from the desktop app.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('termiteNet', {
  fetch: (url, opts) => ipcRenderer.invoke('termite-net', url, opts)
});
