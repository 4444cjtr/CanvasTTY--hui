import { extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import type {
  AppSettings,
  CreateSessionRequest,
  SessionBounds
} from "../../shared/contracts";
import { IPC } from "../../shared/contracts";
import type { SettingsStore } from "../services/SettingsStore";
import type { TerminalManager } from "../services/TerminalManager";
import type { LimitsService } from "../services/LimitsService";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MEDIA_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

interface Dependencies {
  settings: SettingsStore;
  terminals: TerminalManager;
  limits: LimitsService;
}

export function registerIpc({ settings, terminals, limits }: Dependencies): void {
  ipcMain.on(IPC.clipboardWrite, (_event, text: string) => {
    if (typeof text === "string" && text.length > 0) clipboard.writeText(text);
  });

  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsUpdate, (_event, patch: Partial<AppSettings>) => settings.update(patch));

  ipcMain.handle(IPC.dialogPickDirectory, async (event, defaultPath?: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: "Choose a project folder",
      defaultPath: typeof defaultPath === "string" ? defaultPath : settings.get().lastDirectory,
      properties: ["openDirectory", "createDirectory"]
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC.dialogPickMedia, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: "Choose Home media",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    return { path, dataUrl: await readMedia(path) };
  });

  ipcMain.handle(IPC.mediaRead, async (_event, path: string) => {
    if (typeof path !== "string" || settings.get().mediaPath !== path) return null;
    try {
      return await readMedia(path);
    } catch (error) {
      console.warn("CanvasTTY media could not be read.", error);
      return null;
    }
  });

  ipcMain.handle(IPC.limitsGet, () => limits.get());

  ipcMain.handle(IPC.terminalList, () => terminals.list());
  ipcMain.handle(IPC.terminalCreate, (_event, request: CreateSessionRequest) => terminals.create(request));
  ipcMain.on(IPC.terminalInput, (_event, id: string, data: string) => terminals.input(id, data));
  ipcMain.on(IPC.terminalResize, (_event, id: string, cols: number, rows: number) => {
    terminals.resize(id, cols, rows);
  });
  ipcMain.on(IPC.terminalBounds, (_event, id: string, bounds: SessionBounds) => terminals.setBounds(id, bounds));
  ipcMain.handle(IPC.terminalRename, (_event, id: string, title: string) => terminals.rename(id, title));
  ipcMain.handle(IPC.terminalDispose, (_event, id: string) => terminals.dispose(id));

  ipcMain.on(IPC.windowMinimize, (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle(IPC.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return { maximized: false };
    window.isMaximized() ? window.unmaximize() : window.maximize();
    return { maximized: window.isMaximized() };
  });
  ipcMain.on(IPC.windowClose, (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle(IPC.windowGetState, (event) => ({
    maximized: BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  }));
}

async function readMedia(path: string): Promise<string> {
  const mime = MEDIA_MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error("Unsupported media type.");

  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > MAX_MEDIA_BYTES) {
    throw new Error("Media must be a file smaller than 25 MB.");
  }

  const content = await readFile(path);
  return `data:${mime};base64,${content.toString("base64")}`;
}
