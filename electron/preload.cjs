'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Narrow command API: no general filesystem access for page script.
contextBridge.exposeInMainWorld('krestetsNative', {
  platform: 'desktop',
  storageRead: (key) => ipcRenderer.invoke('storage:read', key),
  storageCas: (key, expected, next) => ipcRenderer.invoke('storage:cas', key, expected, next),
  storageReset: (key, expected) => ipcRenderer.invoke('storage:reset', key, expected),
  saveFile: (name, text) => ipcRenderer.invoke('file:save', name, text),
  openFile: () => ipcRenderer.invoke('file:open'),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
  quit: () => ipcRenderer.send('app:quit'),
});
