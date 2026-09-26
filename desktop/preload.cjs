const { contextBridge, ipcRenderer } = require('electron');

// Only these explicit operations are available to either local renderer.
contextBridge.exposeInMainWorld('companion', Object.freeze({
  getSettings: () => ipcRenderer.invoke('companion:get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('companion:set-settings', patch),
  show: (mode) => ipcRenderer.invoke('companion:show', mode),
  hide: () => ipcRenderer.invoke('companion:hide'),
  quit: () => ipcRenderer.invoke('companion:quit'),
  onScene: (callback) => {
    const listener = (_event, scene) => callback(scene);
    ipcRenderer.on('companion:scene', listener);
    return () => ipcRenderer.removeListener('companion:scene', listener);
  },
  onSettings: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('companion:settings', listener);
    return () => ipcRenderer.removeListener('companion:settings', listener);
  },
}));
