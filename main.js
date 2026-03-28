const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.ogv', '.avi', '.mkv', '.mov',
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
  '.txt', '.md', '.log', '.csv', '.json', '.xml', '.ini', '.cfg', '.conf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.pdf'
]);

function getMediaType(ext) {
  if (['.mp4', '.webm', '.ogg', '.ogv', '.avi', '.mkv', '.mov'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(ext)) return 'image';
  if (['.txt', '.md', '.log', '.csv', '.json', '.xml', '.ini', '.cfg', '.conf'].includes(ext)) return 'text';
  if (['.doc', '.docx', '.xls', '.xlsx'].includes(ext)) return 'office';
  if (ext === '.pdf') return 'pdf';
  return null;
}

let mainWindow;
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath, 'utf-8'));
  } catch {
    return { width: 1100, height: 750 };
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  const isMaximized = mainWindow.isMaximized();
  const bounds = isMaximized ? (mainWindow._lastBounds || mainWindow.getBounds()) : mainWindow.getBounds();
  fs.writeFileSync(windowStatePath, JSON.stringify({ ...bounds, isMaximized }));
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  // Track bounds before maximize so we can save the normal size
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      mainWindow._lastBounds = mainWindow.getBounds();
    }
  });
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      mainWindow._lastBounds = mainWindow.getBounds();
    }
  });
  mainWindow.on('close', () => {
    saveWindowState();
  });

  // Remove standard menu bar
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
});

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

// Read text file content
ipcMain.handle('read-text-file', async (_event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '无法读取文件内容';
  }
});

// Open file with system default application
ipcMain.handle('open-file-external', async (_event, filePath) => {
  return shell.openPath(filePath);
});
