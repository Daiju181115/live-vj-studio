import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface ProgressPayload {
  step: string;
  percent: number;
  text?: string;
}

export interface TranscribeResult {
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{ word: string; start: number; end: number }>;
  }>;
  totalText: string;
  durationSec: number;
}

export interface RhymeData {
  pairs: Array<{
    word1: string; time1: number;
    word2: string; time2: number;
    vowelMatch: boolean;
  }>;
}

export interface ChatMessage {
  platform: 'youtube' | 'tiktok';
  author: string;
  text: string;
  isSuperChat: boolean;
  amount: string | null;
  color: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

/** DJコントロールペイロード（メイン→ライブウィンドウへのブリッジ） */
export interface VJControlPayload {
  type: 'fxSlider' | 'triggerPad' | 'themeChange';
  key: string;
  value?: number;
}

export interface ElectronAPI {
  // 解析
  startAnalysis: (req: { audioPath: string }) => Promise<{ success: boolean; error?: string }>;
  startSeparation: (req: { audioPath: string; outputDir: string; model?: string }) => Promise<{ success: boolean; error?: string }>;
  detectRhymes: (req: { segments: any[] }) => Promise<{ success: boolean; error?: string }>;
  downloadUrl: (req: { url: string; outputDir: string }) => Promise<{ success: boolean; error?: string }>;
  cancelAnalysis: () => Promise<boolean>;

  // ファイル
  openFileDialog: () => Promise<string | null>;
  saveFile: (data: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>;
  readFile: (path: string) => Promise<Uint8Array>;
  checkTempFolder: (folderPath: string) => Promise<{ hasFiles: boolean }>;
  clearTempFolder: (folderPath: string) => Promise<{ success: boolean }>;

  // ライブチャット
  startChat: (req: { platform: 'youtube' | 'tiktok'; videoId?: string; apiKey?: string; username?: string }) => Promise<{ success: boolean; error?: string }>;
  stopChat: () => Promise<{ success: boolean }>;

  // ライブ投影
  getDisplays: () => Promise<DisplayInfo[]>;
  openLiveWindow: (displayId?: number) => Promise<{ success: boolean }>;
  closeLiveWindow: () => Promise<{ success: boolean }>;
  sendVJControl: (payload: VJControlPayload) => Promise<{ success: boolean }>;

  // アプリ情報
  getAppInfo: () => Promise<{ version: string; platform: string }>;

  // イベント購読
  onPythonReady: (cb: () => void) => () => void;
  onProgress: (cb: (data: ProgressPayload) => void) => () => void;
  onResult: (cb: (data: TranscribeResult) => void) => () => void;
  onSeparateResult: (cb: (data: { output_files: string[]; output_dir: string }) => void) => () => void;
  onDownloadResult: (cb: (data: { audioPath: string; title: string }) => void) => () => void;
  onRhymesResult: (cb: (data: RhymeData) => void) => () => void;
  onError: (cb: (err: { message: string }) => void) => () => void;
  onChatMessage: (cb: (data: ChatMessage) => void) => () => void;
  onChatReady: (cb: (data: { platform: string; title: string }) => void) => () => void;
  onChatError: (cb: (data: { message: string }) => void) => () => void;

  // ライブウィンドウ向けコントロール受信
  onLiveControl: (cb: (payload: VJControlPayload) => void) => () => void;
}

const api: ElectronAPI = {
  startAnalysis: (req) => ipcRenderer.invoke('analysis:start', req),
  startSeparation: (req) => ipcRenderer.invoke('analysis:separate', req),
  detectRhymes: (req) => ipcRenderer.invoke('analysis:detectRhymes', req),
  downloadUrl: (req) => ipcRenderer.invoke('analysis:downloadUrl', req),
  cancelAnalysis: () => ipcRenderer.invoke('analysis:cancel'),

  startChat: (req) => ipcRenderer.invoke('chat:start', req),
  stopChat: () => ipcRenderer.invoke('chat:stop'),

  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  checkTempFolder: (p) => ipcRenderer.invoke('file:checkTempFolder', p),
  clearTempFolder: (p) => ipcRenderer.invoke('file:clearTempFolder', p),

  getDisplays: () => ipcRenderer.invoke('live:getDisplays'),
  openLiveWindow: (id) => ipcRenderer.invoke('live:openWindow', id),
  closeLiveWindow: () => ipcRenderer.invoke('live:closeWindow'),
  sendVJControl: (payload) => ipcRenderer.invoke('live:sendControl', payload),

  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),

  onPythonReady: (cb) => {
    const h = () => cb();
    ipcRenderer.on('python:ready', h);
    return () => ipcRenderer.removeListener('python:ready', h);
  },
  onProgress: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('analysis:progress', h);
    return () => ipcRenderer.removeListener('analysis:progress', h);
  },
  onResult: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('analysis:result', h);
    return () => ipcRenderer.removeListener('analysis:result', h);
  },
  onSeparateResult: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('analysis:result_separate', h);
    return () => ipcRenderer.removeListener('analysis:result_separate', h);
  },
  onDownloadResult: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('analysis:result_download', h);
    return () => ipcRenderer.removeListener('analysis:result_download', h);
  },
  onRhymesResult: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('analysis:result_rhymes', h);
    return () => ipcRenderer.removeListener('analysis:result_rhymes', h);
  },
  onError: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('analysis:error', h);
    return () => ipcRenderer.removeListener('analysis:error', h);
  },
  onChatMessage: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('chat:message', h);
    return () => ipcRenderer.removeListener('chat:message', h);
  },
  onChatReady: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('chat:ready', h);
    return () => ipcRenderer.removeListener('chat:ready', h);
  },
  onChatError: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('chat:error', h);
    return () => ipcRenderer.removeListener('chat:error', h);
  },
  onLiveControl: (cb) => {
    const h = (_: IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('live:control', h);
    return () => ipcRenderer.removeListener('live:control', h);
  },
};

contextBridge.exposeInMainWorld('api', api);
