const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanDirectory: (dirPath) => ipcRenderer.invoke('scan-directory', dirPath),
  scanDirectoryTree: (dirPath) => ipcRenderer.invoke('scan-directory-tree', dirPath),
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  openFileExternal: (filePath) => ipcRenderer.invoke('open-file-external', filePath),
  readOfficeFile: (filePath) => ipcRenderer.invoke('read-office-file', filePath)
});
