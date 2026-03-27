const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.ogv', '.avi', '.mkv', '.mov',
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'
]);

function getMediaType(ext) {
  if (['.mp4', '.webm', '.ogg', '.ogv', '.avi', '.mkv', '.mov'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) return 'image';
  return null;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove standard menu bar
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// Select directory
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Scan directory for media files (flat, top-level only)
ipcMain.handle('scan-directory', async (_event, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && MEDIA_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map(e => {
        const ext = path.extname(e.name).toLowerCase();
        const fullPath = path.join(dirPath, e.name);
        const stat = fs.statSync(fullPath);
        return {
          name: e.name,
          path: fullPath,
          type: getMediaType(ext),
          size: stat.size,
          ext
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return files;
  } catch {
    return [];
  }
});

// Scan directory tree recursively
function scanTree(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const dirs = [];
    const files = [];

    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, e.name);
      if (e.isDirectory()) {
        const subtree = scanTree(fullPath);
        // Only include directories that contain media files (directly or nested)
        if (subtree.children.length > 0) {
          dirs.push(subtree);
        }
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (MEDIA_EXTENSIONS.has(ext)) {
          const stat = fs.statSync(fullPath);
          files.push({
            name: e.name,
            path: fullPath,
            type: getMediaType(ext),
            size: stat.size,
            ext,
            isDir: false
          });
        }
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return {
      name: path.basename(dirPath),
      path: dirPath,
      isDir: true,
      children: [...dirs, ...files]
    };
  } catch {
    return { name: path.basename(dirPath), path: dirPath, isDir: true, children: [] };
  }
}

ipcMain.handle('scan-directory-tree', async (_event, dirPath) => {
  return scanTree(dirPath);
});
