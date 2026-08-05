import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  CanvasTTYApi,
  CreateSessionRequest,
  SessionBounds,
  SessionEvent,
  SessionRemovedEvent,
  TerminalDataEvent
} from "../shared/contracts";
import { IPC } from "../shared/contracts";

function subscribe<T>(channel: string, listener: (event: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: CanvasTTYApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  dialog: {
    pickDirectory: (defaultPath?: string) => ipcRenderer.invoke(IPC.dialogPickDirectory, defaultPath),
    pickMedia: () => ipcRenderer.invoke(IPC.dialogPickMedia)
  },
  media: {
    read: (path: string) => ipcRenderer.invoke(IPC.mediaRead, path)
  },
  limits: {
    get: () => ipcRenderer.invoke(IPC.limitsGet)
  },
  terminal: {
    list: () => ipcRenderer.invoke(IPC.terminalList),
    create: (request: CreateSessionRequest) => ipcRenderer.invoke(IPC.terminalCreate, request),
    input: (id: string, data: string) => ipcRenderer.send(IPC.terminalInput, id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send(IPC.terminalResize, id, cols, rows),
    setBounds: (id: string, bounds: SessionBounds) => ipcRenderer.send(IPC.terminalBounds, id, bounds),
    dispose: (id: string) => ipcRenderer.invoke(IPC.terminalDispose, id),
    onData: (listener: (event: TerminalDataEvent) => void) => subscribe(IPC.terminalData, listener),
    onSession: (listener: (event: SessionEvent) => void) => subscribe(IPC.terminalSession, listener),
    onRemoved: (listener: (event: SessionRemovedEvent) => void) => subscribe(IPC.terminalRemoved, listener)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    getState: () => ipcRenderer.invoke(IPC.windowGetState)
  }
};

contextBridge.exposeInMainWorld("canvasTTY", api);
