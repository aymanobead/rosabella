'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Rozabella – روزابلا',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

// ── IPC: Save PNG ──────────────────────────────────────────────────────────
ipcMain.handle('save-png', async (event, dataUrl) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PNG',
    defaultPath: 'greeting-card.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (canceled || !filePath) return { success: false };
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return { success: true, filePath };
});

// ── IPC: Save PDF ──────────────────────────────────────────────────────────
ipcMain.handle('save-pdf', async (event, pdfBytes) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF',
    defaultPath: 'greeting-card.pdf',
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, Buffer.from(pdfBytes));
  return { success: true, filePath };
});

// ── IPC: Print ─────────────────────────────────────────────────────────────
ipcMain.handle('print-card', async (event, payload) => {
  if (!mainWindow) return { success: false };

  const printHtmlPath = path.join(__dirname, 'print', 'print.html');

  return new Promise((resolve) => {
    let resolved = false;

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // Clean up helper — idempotent
    function closePrint() {
      if (!printWin.isDestroyed()) printWin.close();
    }

    // Once the card layout is ready, trigger the system print dialog
    function onPrintReady() {
      printWin.webContents.print(
        { silent: false, printBackground: true },
        (success, errorType) => {
          closePrint();
          if (!resolved) { resolved = true; resolve({ success, errorType }); }
        }
      );
    }

    ipcMain.once('print-ready', onPrintReady);

    printWin.loadFile(printHtmlPath);

    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.send('print-data', payload || {});
    });

    // Fallback: if window is destroyed before printing, clean up and resolve
    printWin.on('closed', () => {
      ipcMain.removeListener('print-ready', onPrintReady);
      if (!resolved) { resolved = true; resolve({ success: false, errorType: 'window-closed' }); }
    });
  });
});

// ── IPC: Get templates path ────────────────────────────────────────────────
ipcMain.handle('get-templates-path', () => {
  // In dev mode, templates live in app/assets/templates
  // In packaged mode, they are in process.resourcesPath/templates
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'templates');
  }
  return path.join(__dirname, '../assets/templates');
});
