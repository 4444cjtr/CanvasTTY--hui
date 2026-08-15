import { extname } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import type {
  AppSettings,
  BrowserCommand,
  CreateSessionRequest,
  PluginCanvasRequest,
  ProviderId,
  SessionBounds
} from "../../shared/contracts";
import { IPC } from "../../shared/contracts";
import { observeWindowState, readWindowState } from "../windowState";
import type { SettingsStore } from "../services/SettingsStore";
import type { TerminalManager } from "../services/TerminalManager";
import type { LimitsService } from "../services/LimitsService";
import type { PluginManager } from "../services/PluginManager";
import type { PluginMediaService } from "../services/PluginMediaService";
import type { PluginSecretsService } from "../services/PluginSecretsService";
import type { BrowserService } from "../services/BrowserService";
import type { BrowserManager } from "../services/BrowserManager";

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
  plugins: PluginManager;
  pluginMedia: PluginMediaService;
  pluginSecrets: PluginSecretsService;
  browser: BrowserManager;
  getMainWindow(): BrowserWindow | null;
  applyBrowserSettings(settings: AppSettings): void;
  openPluginWindow(pluginId: string, contributionId: string): Promise<void>;
  closePluginWindows(pluginId: string): void;
  requestPluginLauncher(provider: ProviderId): void;
  requestPluginCanvas(request: PluginCanvasRequest): void;
  broadcastPluginStorageChange(pluginId: string, key: string, value: unknown): void;
}

export function registerIpc({
  settings,
  terminals,
  limits,
  plugins,
  pluginMedia,
  pluginSecrets,
  browser,
  getMainWindow,
  applyBrowserSettings,
  openPluginWindow,
  closePluginWindows,
  requestPluginLauncher,
  requestPluginCanvas,
  broadcastPluginStorageChange
}: Dependencies): void {
  ipcMain.handle(IPC.clipboardRead, () => clipboard.readText());
  ipcMain.on(IPC.clipboardWrite, (_event, text: string) => {
    if (typeof text === "string" && text.length > 0) clipboard.writeText(text);
  });

  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: Partial<AppSettings>) => {
    const next = await settings.update(patch);
    applyBrowserSettings(next);
    return next;
  });

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

  ipcMain.handle(IPC.pluginsList, () => plugins.list());
  ipcMain.handle(IPC.pluginsPreviewInstall, (_event, sourceUrl: string) => {
    if (typeof sourceUrl !== "string") throw new Error("GitHub URL is required.");
    return plugins.previewInstall(sourceUrl);
  });
  ipcMain.handle(IPC.pluginsInstall, (_event, token: string, selectedModules?: string[]) => {
    if (typeof token !== "string") throw new Error("Plugin preview token is invalid.");
    if (selectedModules !== undefined && (
      !Array.isArray(selectedModules) || selectedModules.some((item) => typeof item !== "string")
    )) throw new Error("Plugin module selection is invalid.");
    return plugins.install(token, selectedModules);
  });
  ipcMain.handle(IPC.pluginsSetModules, async (_event, pluginId: string, selectedModules: string[]) => {
    if (!Array.isArray(selectedModules) || selectedModules.some((item) => typeof item !== "string")) {
      throw new Error("Plugin module selection is invalid.");
    }
    closePluginWindows(pluginId);
    return plugins.setModules(pluginId, selectedModules);
  });
  ipcMain.handle(IPC.pluginsSetEnabled, async (_event, pluginId: string, enabled: boolean) => {
    if (typeof enabled !== "boolean") throw new Error("Plugin enabled state is invalid.");
    const plugin = await plugins.setEnabled(pluginId, enabled);
    if (!enabled) closePluginWindows(pluginId);
    return plugin;
  });
  ipcMain.handle(IPC.pluginsUninstall, async (_event, pluginId: string) => {
    closePluginWindows(pluginId);
    await pluginSecrets.revokeAll(pluginId);
    await pluginMedia.revokeAll(pluginId);
    await plugins.uninstall(pluginId);
  });
  ipcMain.handle(IPC.pluginsOpenCanvas, (
    _event,
    pluginId: string,
    contributionId: string,
    sourceCanvasInstanceId?: string
  ) => {
    const target = plugins.contribution(pluginId, contributionId);
    if (target.kind !== "canvas-app") throw new Error("Plugin contribution is not a canvas app.");
    requestPluginCanvas({
      pluginId,
      contributionId,
      ...(typeof sourceCanvasInstanceId === "string" && sourceCanvasInstanceId.length <= 80
        ? { sourceCanvasInstanceId }
        : {})
    });
  });
  ipcMain.handle(IPC.pluginsOpenWindow, (_event, pluginId: string, contributionId: string) => (
    openPluginWindow(pluginId, contributionId)
  ));
  ipcMain.handle(IPC.pluginsOpenExternal, async (_event, pluginId: string, value: string) => {
    plugins.assertPermission(pluginId, "external:open");
    const url = safeExternalUrl(value);
    await shell.openExternal(url);
  });
  ipcMain.handle(IPC.pluginsStorageGet, (_event, pluginId: string, key: string) => (
    plugins.storageGet(pluginId, key)
  ));
  ipcMain.handle(IPC.pluginsStorageSet, async (_event, pluginId: string, key: string, value: unknown) => {
    await plugins.storageSet(pluginId, key, value);
    broadcastPluginStorageChange(pluginId, key, value);
  });
  ipcMain.handle(IPC.pluginsSecretsGet, (_event, pluginId: string, key: string) => (
    pluginSecrets.get(pluginId, key)
  ));
  ipcMain.handle(IPC.pluginsSecretsSet, (_event, pluginId: string, key: string, value: string) => (
    pluginSecrets.set(pluginId, key, value)
  ));
  ipcMain.handle(IPC.pluginsSecretsDelete, (_event, pluginId: string, key: string) => (
    pluginSecrets.delete(pluginId, key)
  ));
  ipcMain.handle(IPC.pluginsMediaPickLibrary, (event, pluginId: string) => (
    pickPluginMediaLibrary(event, pluginId, plugins, pluginMedia)
  ));
  ipcMain.handle(IPC.pluginsMediaListLibraries, (_event, pluginId: string) => (
    pluginMedia.listLibraries(pluginId)
  ));
  ipcMain.handle(IPC.pluginsMediaScanLibrary, (_event, pluginId: string, libraryId: string) => (
    pluginMedia.scanLibrary(pluginId, libraryId)
  ));
  ipcMain.handle(IPC.pluginsMediaRevokeLibrary, (_event, pluginId: string, libraryId: string) => (
    pluginMedia.revokeLibrary(pluginId, libraryId)
  ));
  ipcMain.handle(IPC.pluginsPlaylistsList, (_event, pluginId: string, libraryId: string) => (
    pluginMedia.listPlaylists(pluginId, libraryId)
  ));
  ipcMain.handle(IPC.pluginsPlaylistsRead, (_event, pluginId: string, libraryId: string, playlistId: string) => (
    pluginMedia.readPlaylist(pluginId, libraryId, playlistId)
  ));
  ipcMain.handle(IPC.pluginsPlaylistsWrite, (
    _event,
    pluginId: string,
    libraryId: string,
    name: string,
    content: string
  ) => pluginMedia.writePlaylist(
    pluginId,
    stringValue(libraryId, "libraryId"),
    stringValue(name, "name"),
    playlistContent(content)
  ));
  ipcMain.handle(IPC.pluginsHostInvoke, async (
    event,
    pluginId: string,
    contributionId: string,
    method: string,
    params: unknown
  ) => {
    const senderUrl = event.senderFrame?.url;
    if (!senderUrl) throw new Error("Plugin window sender is unavailable.");
    const contribution = assertPluginWindowSender(senderUrl, plugins, pluginId, contributionId);
    const values = params && typeof params === "object" && !Array.isArray(params)
      ? params as Record<string, unknown>
      : {};
    if (method === "host.getContext") {
      const plugin = plugins.list().find((candidate) => candidate.manifest.id === pluginId)!;
      return {
        apiVersion: 1,
        plugin: {
          id: plugin.manifest.id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          permissions: plugin.manifest.permissions,
          modules: plugin.selectedModules
        },
        contribution: { id: contribution.id, kind: contribution.kind, title: contribution.title },
        appearance: { locale: settings.get().locale, palette: settings.get().palette }
      };
    }
    if (method === "storage.get") return plugins.storageGet(pluginId, stringValue(values.key, "key"));
    if (method === "storage.set") {
      const key = stringValue(values.key, "key");
      await plugins.storageSet(pluginId, key, values.value);
      broadcastPluginStorageChange(pluginId, key, values.value);
      return null;
    }
    if (method === "secrets.get") return pluginSecrets.get(pluginId, stringValue(values.key, "key"));
    if (method === "secrets.set") {
      await pluginSecrets.set(
        pluginId,
        stringValue(values.key, "key"),
        secretValue(values.value)
      );
      return null;
    }
    if (method === "secrets.delete") {
      await pluginSecrets.delete(pluginId, stringValue(values.key, "key"));
      return null;
    }
    if (method === "sessions.list") {
      plugins.assertPermission(pluginId, "sessions:read");
      return terminals.list().map((session) => ({
        id: session.id,
        provider: session.provider,
        title: session.title,
        status: session.status,
        startedAt: session.startedAt,
        exitCode: session.exitCode
      }));
    }
    if (method === "limits.get") {
      plugins.assertPermission(pluginId, "limits:read");
      return { state: "ready", snapshot: await limits.get() };
    }
    if (method === "launcher.open") {
      plugins.assertPermission(pluginId, "launcher:open");
      const provider = providerValue(values.provider);
      requestPluginLauncher(provider);
      return null;
    }
    if (method === "external.open") {
      plugins.assertPermission(pluginId, "external:open");
      await shell.openExternal(safeExternalUrl(values.url));
      return null;
    }
    if (method === "browser.open") {
      // Open a URL in CanvasTTY's own embedded browser (canvas card).
      plugins.assertPermission(pluginId, "external:open");
      return browser.open(stringValue(values.url, "url"));
    }
    if (method === "media.pickLibrary") {
      return pickPluginMediaLibrary(event, pluginId, plugins, pluginMedia);
    }
    if (method === "media.listLibraries") return pluginMedia.listLibraries(pluginId);
    if (method === "media.scanLibrary") {
      return pluginMedia.scanLibrary(pluginId, stringValue(values.libraryId, "libraryId"));
    }
    if (method === "media.revokeLibrary") {
      await pluginMedia.revokeLibrary(pluginId, stringValue(values.libraryId, "libraryId"));
      return null;
    }
    if (method === "playlists.list") {
      return pluginMedia.listPlaylists(pluginId, stringValue(values.libraryId, "libraryId"));
    }
    if (method === "playlists.read") {
      return pluginMedia.readPlaylist(
        pluginId,
        stringValue(values.libraryId, "libraryId"),
        stringValue(values.playlistId, "playlistId")
      );
    }
    if (method === "playlists.write") {
      return pluginMedia.writePlaylist(
        pluginId,
        stringValue(values.libraryId, "libraryId"),
        stringValue(values.name, "name"),
        playlistContent(values.content)
      );
    }
    if (method === "window.open") {
      const targetId = stringValue(values.contributionId, "contributionId");
      const target = plugins.contribution(pluginId, targetId);
      if (target.kind !== "window") throw new Error("Plugin requested an unknown window contribution.");
      await openPluginWindow(pluginId, targetId);
      return null;
    }
    if (method === "canvas.open") {
      const targetId = stringValue(values.contributionId, "contributionId");
      const target = plugins.contribution(pluginId, targetId);
      if (target.kind !== "canvas-app") throw new Error("Plugin requested an unknown canvas contribution.");
      requestPluginCanvas({ pluginId, contributionId: targetId });
      return null;
    }
    throw new Error(`Unsupported plugin method: ${String(method).slice(0, 80)}.`);
  });

  ipcMain.handle(IPC.browserNodes, (event) => {
    assertMainRenderer(event, getMainWindow);
    return browser.list();
  });
  ipcMain.handle(IPC.browserCreateNode, (event, bounds: SessionBounds) => {
    assertMainRenderer(event, getMainWindow);
    const node = awaitBrowserCreate(browser, bounds);
    return node;
  });
  ipcMain.handle(IPC.browserCloseNode, (event, windowId: string) => {
    assertMainRenderer(event, getMainWindow);
    return browser.dispose(windowId);
  });
  ipcMain.handle(IPC.browserGetState, (event, windowId?: string | null) => {
    assertMainRenderer(event, getMainWindow);
    return browser.getState(windowId ?? null);
  });
  ipcMain.handle(IPC.browserOpen, (event, windowId?: string | null, url?: string) => {
    assertMainRenderer(event, getMainWindow);
    return browser.open(windowId ?? null, url);
  });
  ipcMain.handle(IPC.browserClose, (event, windowId?: string | null) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.close() ?? null;
  });
  ipcMain.handle(IPC.browserCloseAllTabs, (event, windowId?: string | null) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.closeAllTabs() ?? null;
  });
  ipcMain.handle(IPC.browserNewTab, (event, windowId?: string | null, url?: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.newTab(url) ?? null;
  });
  ipcMain.handle(IPC.browserSelectTab, (event, windowId: string | null, id: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.selectTab(id) ?? null;
  });
  ipcMain.handle(IPC.browserCloseTab, (event, windowId: string | null, id: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.closeTab(id) ?? null;
  });
  ipcMain.handle(IPC.browserNavigate, (event, windowId: string | null, id: string, value: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.navigate(id, value) ?? null;
  });
  ipcMain.handle(IPC.browserBack, (event, windowId: string | null, id: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.back(id) ?? null;
  });
  ipcMain.handle(IPC.browserForward, (event, windowId: string | null, id: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.forward(id) ?? null;
  });
  ipcMain.handle(IPC.browserReload, (event, windowId: string | null, id: string) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.reload(id) ?? null;
  });
  ipcMain.handle(IPC.browserExecute, (event, windowId: string | null, command: BrowserCommand) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.executeHuman(command) ?? null;
  });
  ipcMain.handle(IPC.browserGetActivity, (event, windowId: string | null, sinceSequence?: number) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.getActivity(sinceSequence) ?? [];
  });
  ipcMain.handle(IPC.browserClearData, (event, windowId?: string | null) => {
    assertMainRenderer(event, getMainWindow);
    return nodeFor(browser, windowId)?.clearData() ?? null;
  });
  ipcMain.on(IPC.browserFocus, (event, windowId?: string | null) => {
    assertMainRenderer(event, getMainWindow);
    nodeFor(browser, windowId)?.focus();
  });
  ipcMain.on(IPC.browserSetViewport, (event, windowId: string, bounds) => {
    assertMainRenderer(event, getMainWindow);
    browser.get(windowId)?.setViewport(bounds);
  });

  ipcMain.handle(IPC.terminalList, () => terminals.list());
  ipcMain.handle(IPC.terminalCreate, (_event, request: CreateSessionRequest) => terminals.create(request));
  ipcMain.handle(IPC.terminalRestart, (_event, id: string) => terminals.restart(id));
  ipcMain.on(IPC.terminalInput, (_event, id: string, data: string) => terminals.input(id, data));
  ipcMain.on(IPC.terminalResize, (_event, id: string, cols: number, rows: number) => {
    terminals.resize(id, cols, rows);
  });
  ipcMain.on(IPC.terminalBounds, (_event, id: string, bounds: SessionBounds) => terminals.setBounds(id, bounds));
  ipcMain.handle(IPC.terminalRename, (_event, id: string, title: string) => terminals.rename(id, title));
  ipcMain.handle(IPC.terminalDispose, (_event, id: string) => terminals.dispose(id));

  const publishWindowState = (window: BrowserWindow): void => {
    if (!window.isDestroyed()) window.webContents.send(IPC.windowState, readWindowState(window));
  };

  const mainWindow = getMainWindow();
  if (mainWindow) observeWindowState(mainWindow, () => publishWindowState(mainWindow));

  ipcMain.on(IPC.windowMinimize, (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle(IPC.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return readWindowState(null);
    window.isMaximized() ? window.unmaximize() : window.maximize();
    return readWindowState(window);
  });
  ipcMain.on(IPC.windowClose, (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle(IPC.windowGetState, (event) => readWindowState(BrowserWindow.fromWebContents(event.sender)));
}

function assertMainRenderer(
  event: IpcMainEvent | IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null
): void {
  const expected = getMainWindow();
  if (
    !expected
    || expected.isDestroyed()
    || event.sender !== expected.webContents
    || event.senderFrame !== expected.webContents.mainFrame
  ) {
    throw new Error("Browser IPC is available only to the trusted CanvasTTY renderer.");
  }
}

function safeExternalUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) throw new Error("External URL is invalid.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Plugins may open only HTTP(S) URLs.");
  }
  return url.toString();
}

function assertPluginWindowSender(
  senderUrl: string,
  plugins: PluginManager,
  pluginId: string,
  contributionId: string
) {
  const contribution = plugins.contribution(pluginId, contributionId);
  if (contribution.kind !== "window") throw new Error("Plugin host request is not from a window contribution.");
  const actual = new URL(senderUrl);
  const expected = new URL(plugins.entryUrl(pluginId, contributionId));
  if (
    actual.protocol !== expected.protocol
    || actual.hostname !== expected.hostname
    || actual.pathname !== expected.pathname
  ) throw new Error("Plugin window identity does not match its loaded entry.");
  return contribution;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
    throw new Error(`Plugin ${label} parameter is invalid.`);
  }
  return value;
}

function playlistContent(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 4 * 1024 * 1024) {
    throw new Error("Plugin playlist content is invalid or exceeds 4 MB.");
  }
  return value;
}

function secretValue(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 16 * 1024) {
    throw new Error("Plugin secret value is invalid or exceeds 16 KB.");
  }
  return value;
}

async function pickPluginMediaLibrary(
  event: IpcMainInvokeEvent,
  pluginId: string,
  plugins: PluginManager,
  pluginMedia: PluginMediaService
) {
  plugins.assertPermission(pluginId, "media:library");
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: "Choose a music library",
    properties: ["openDirectory"]
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  const selected = result.filePaths[0];
  return result.canceled || !selected ? null : pluginMedia.addLibrary(pluginId, selected);
}

function providerValue(value: unknown): ProviderId {
  if (value === "terminal" || value === "codex" || value === "claude" || value === "kimi") return value;
  throw new Error("Plugin requested an unknown launcher provider.");
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

function nodeFor(browser: BrowserManager, windowId: string | null | undefined): BrowserService | null {
  return browser.get(windowId ?? "") ?? browser.first();
}

async function awaitBrowserCreate(browser: BrowserManager, bounds: SessionBounds) {
  const node = await browser.create(bounds);
  return { id: node.id, bounds: node.bounds };
}
