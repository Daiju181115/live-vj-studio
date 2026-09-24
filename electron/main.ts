import { app, BrowserWindow, ipcMain, dialog, protocol, net, screen } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

// 開発中のGPUキャッシュロック回避
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('temp'), 'vjs-dev-' + Date.now()));
}

// カスタムプロトコル登録（ローカルファイルアクセス）
protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true, standard: true, secure: true } }
]);

let mainWindow: BrowserWindow | null = null;
let liveWindow: BrowserWindow | null = null; // ライブ投影用ウィンドウ
let pythonProc: ChildProcess | null = null;
let pythonReady = false;
let pythonReadyResolve: (() => void) | null = null;

// ── ウィンドウ生成 ─────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#050510',
    title: 'VJ Studio - DJ Control Panel',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

/** 外部ディスプレイにライブ映像専用ウィンドウを作成 */
function createLiveWindow(displayId?: number): BrowserWindow {
  const displays = screen.getAllDisplays();
  const targetDisplay = displayId
    ? displays.find(d => d.id === displayId)
    : displays.find(d => d.id !== screen.getPrimaryDisplay().id) ?? displays[0];

  const { x, y, width, height } = targetDisplay!.bounds;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    title: 'VJ Studio - Live Output',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const liveUrl = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}#live`
    : `file://${path.join(__dirname, '../dist/index.html')}#live`;

  win.loadURL(liveUrl);

  return win;
}

// ── Python IPC Server Management ──────────────────────────

function getPythonCommand(): string {
  const venvPythonPath = path.join(__dirname, '../audio_backend_env/Scripts/python.exe');
  if (fs.existsSync(venvPythonPath)) return venvPythonPath;
  return 'python';
}

function startPythonServer(): void {
  if (pythonProc) return;
  const pythonExe = getPythonCommand();
  const serverScript = path.join(__dirname, '../python/server.py');
  const env = Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' });

  pythonProc = spawn(pythonExe, [serverScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    cwd: path.join(__dirname, '..'),
    windowsHide: true,
  });

  let buffer = '';
  pythonProc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handlePythonMessage(msg);
      } catch {
        console.log(`[Python stdout] ${line}`);
      }
    }
  });

  pythonProc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8').trim();
    if (text) console.error(`[Python stderr] ${text}`);
  });

  pythonProc.on('exit', (code) => {
    console.log(`[Python] exited with code ${code}`);
    pythonProc = null;
    pythonReady = false;
  });

  pythonProc.on('error', (err) => {
    console.error(`[Python] spawn error:`, err);
    pythonProc = null;
  });
}

function handlePythonMessage(msg: any): void {
  switch (msg.type) {
    case 'ready':
      pythonReady = true;
      if (pythonReadyResolve) { pythonReadyResolve(); pythonReadyResolve = null; }
      mainWindow?.webContents.send('python:ready');
      break;
    case 'progress':
      mainWindow?.webContents.send('analysis:progress', msg.data);
      break;
    case 'result':
      mainWindow?.webContents.send('analysis:result', msg.data);
      // ライブウィンドウにも歌詞データを転送
      liveWindow?.webContents.send('analysis:result', msg.data);
      break;
    case 'result_separate':
      mainWindow?.webContents.send('analysis:result_separate', msg.data);
      liveWindow?.webContents.send('analysis:result_separate', msg.data);
      break;
    case 'result_download':
      mainWindow?.webContents.send('analysis:result_download', msg.data);
      break;
    case 'result_rhymes':
      mainWindow?.webContents.send('analysis:result_rhymes', msg.data);
      liveWindow?.webContents.send('analysis:result_rhymes', msg.data);
      break;
    case 'chat_message':
      // チャットメッセージはメイン + ライブ両方に送信
      mainWindow?.webContents.send('chat:message', msg.data);
      liveWindow?.webContents.send('chat:message', msg.data);
      break;
    case 'chat_ready':
      mainWindow?.webContents.send('chat:ready', msg.data);
      break;
    case 'chat_error':
      mainWindow?.webContents.send('chat:error', msg.data);
      break;
    case 'error':
      mainWindow?.webContents.send('analysis:error', msg.data);
      break;
    default:
      console.log('[Python msg]', msg);
  }
}

function sendToPython(command: any): void {
  if (pythonProc?.stdin) {
    pythonProc.stdin.write(JSON.stringify(command) + '\n');
  }
}

async function waitForPython(): Promise<void> {
  if (pythonReady) return;
  if (!pythonProc) startPythonServer();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pythonReadyResolve = null;
      reject(new Error('Python server startup timeout (15s)'));
    }, 15000);
    pythonReadyResolve = () => { clearTimeout(timeout); resolve(); };
  });
}

// ── IPC Handlers ──────────────────────────────────────────

ipcMain.handle('analysis:start', async (_event, req: { audioPath: string }) => {
  try {
    await waitForPython();
    sendToPython({ command: 'transcribe', audioPath: req.audioPath });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('analysis:separate', async (_event, req: { audioPath: string, outputDir: string, model?: string }) => {
  try {
    await waitForPython();
    sendToPython({ command: 'separate', audioPath: req.audioPath, outputDir: req.outputDir, model: req.model });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('analysis:detectRhymes', async (_event, req: { segments: any[] }) => {
  try {
    await waitForPython();
    sendToPython({ command: 'detectRhymes', segments: req.segments });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('analysis:cancel', async () => {
  sendToPython({ command: 'cancel' });
  return true;
});

ipcMain.handle('analysis:downloadUrl', async (_event, req: { url: string, outputDir: string }) => {
  try {
    await waitForPython();
    sendToPython({ command: 'downloadUrl', url: req.url, outputDir: req.outputDir });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'm4a'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
});

ipcMain.handle('file:read', async (_event, filePath: string) => {
  return await fs.promises.readFile(filePath);
});

ipcMain.handle('dialog:saveFile', async (_event, data: string) => {
  if (!mainWindow) return { success: false };
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'プロジェクトを保存',
    defaultPath: 'vj-project.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  await fs.promises.writeFile(res.filePath, data, 'utf-8');
  return { success: true, filePath: res.filePath };
});

ipcMain.handle('file:checkTempFolder', async (_event, folderPath: string) => {
  try {
    if (!fs.existsSync(folderPath)) return { hasFiles: false };
    const files = await fs.promises.readdir(folderPath);
    return { hasFiles: files.length > 0 };
  } catch { return { hasFiles: false }; }
});

ipcMain.handle('file:clearTempFolder', async (_event, folderPath: string) => {
  try {
    if (fs.existsSync(folderPath)) {
      const files = await fs.promises.readdir(folderPath);
      for (const f of files) await fs.promises.unlink(path.join(folderPath, f));
    }
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
});

// ── ライブ投影 IPC ─────────────────────────────────────────

ipcMain.handle('live:getDisplays', async () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: `Display ${d.id} (${d.bounds.width}x${d.bounds.height})`,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
    bounds: d.bounds,
  }));
});

ipcMain.handle('live:openWindow', async (_event, displayId?: number) => {
  if (liveWindow && !liveWindow.isDestroyed()) {
    liveWindow.focus();
    return { success: true };
  }
  liveWindow = createLiveWindow(displayId);
  liveWindow.on('closed', () => { liveWindow = null; });
  return { success: true };
});

ipcMain.handle('live:closeWindow', async () => {
  liveWindow?.close();
  liveWindow = null;
  return { success: true };
});

/** メインウィンドウ → ライブウィンドウへのVJコントロールブリッジ */
ipcMain.handle('live:sendControl', async (_event, payload: any) => {
  liveWindow?.webContents.send('live:control', payload);
  return { success: true };
});

// ── チャットリスナー IPC ──────────────────────────────────

ipcMain.handle('chat:start', async (_event, req: {
  platform: 'youtube' | 'tiktok';
  videoId?: string;
  apiKey?: string;
  username?: string;
}) => {
  try {
    await waitForPython();
    sendToPython({ command: 'startChatListener', ...req });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('chat:stop', async () => {
  sendToPython({ command: 'stopChatListener' });
  return { success: true };
});

ipcMain.handle('app:getInfo', async () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
}));

// ── App Lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  protocol.handle('local', (request) => {
    const filePath = request.url.slice('local://'.length);
    return net.fetch('file:///' + decodeURIComponent(filePath));
  });

  mainWindow = createMainWindow();
  mainWindow.on('closed', () => { mainWindow = null; });

  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (pythonProc) {
    sendToPython({ command: 'quit' });
    setTimeout(() => { pythonProc?.kill(); pythonProc = null; }, 2000);
  }
});
