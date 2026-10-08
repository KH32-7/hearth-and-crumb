// Narrow, explicit bridge from the game page to the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hearth', {
  desktop: true,
  quit: () => ipcRenderer.send('app:quit'),
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', !!on),
  steam: {
    status: () => ipcRenderer.invoke('steam:status'),
    unlockAchievement: (id) => ipcRenderer.invoke('steam:achievement', String(id)),
  },
});
