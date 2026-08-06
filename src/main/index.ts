import { join } from "node:path";
import { app, BrowserWindow, dialog, protocol } from "electron";
import { IPC } from "../shared/contracts";
import { registerIpc } from "./ipc/registerIpc";
import { SettingsStore } from "./services/SettingsStore";
import { TerminalManager } from "./services/TerminalManager";
import { LimitsService } from "./services/LimitsService";
import { augmentCliPath } from "./services/cliEnvironment";
import { PluginManager } from "./services/PluginManager";
import { PluginMediaService } from "./services/PluginMediaService";
import { BrowserService } from "./services/BrowserService";
import { startupPageUrl } from "./startupPage";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "canvastty-plugin",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: "canvastty-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let terminalManager: TerminalManager | null = null;
let limitsService: LimitsService | null = null;
let pluginManager: PluginManager | null = null;
let pluginMediaService: PluginMediaService | null = null;
let browserService: BrowserService | null = null;
const pluginWindows = new Map<BrowserWindow, string>();
let servicesReady = false;
let startupRunning = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 620,
    show: true,
    frame: false,
    backgroundColor: "#aaa7a2",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (currentUrl && url !== currentUrl) event.preventDefault();
  });

  await window.loadURL(startupPageUrl({ locale: app.getLocale() }));

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

async function initializeServices(): Promise<void> {
  augmentCliPath();
  const settings = new SettingsStore(app.getPath("userData"), app.getLocale());
  await settings.load();

  terminalManager = new TerminalManager((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  });
  limitsService = new LimitsService();
  pluginManager = new PluginManager(app.getPath("userData"));
  await pluginManager.load();
  pluginMediaService = new PluginMediaService(
    app.getPath("userData"),
    (pluginId, permission) => pluginManager!.assertPermission(pluginId, permission)
  );
  await pluginMediaService.load();
  browserService = new BrowserService(() => mainWindow);
  protocol.handle("canvastty-plugin", (request) => pluginManager!.protocolResponse(request.url));
  protocol.handle("canvastty-media", (request) => pluginMediaService!.protocolResponse(request));
  registerIpc({
    settings,
    terminals: terminalManager,
    limits: limitsService,
    plugins: pluginManager,
    pluginMedia: pluginMediaService,
    browser: browserService,
    openPluginWindow,
    closePluginWindows,
    requestPluginLauncher
  });
  servicesReady = true;
}

async function loadApplication(window: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (process.env.CANVASTTY_SMOKE_TEST === "1") {
    await window.webContents.executeJavaScript(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
    );
    console.log("CANVASTTY_SMOKE_READY");
    app.quit();
  }
}

async function startApplication(): Promise<void> {
  if (startupRunning) return;
  startupRunning = true;
  let window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;

  try {
    if (!window) window = await createWindow();
    if (!servicesReady) await initializeServices();
    await loadApplication(window);
  } catch (error) {
    if (window) await showStartupFailure(window, error);
    else {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error("CanvasTTY could not create its startup window.", error);
      dialog.showErrorBox("CanvasTTY startup failed", detail);
    }
  } finally {
    startupRunning = false;
  }
}

async function showStartupFailure(window: BrowserWindow, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("CanvasTTY startup failed.", error);
  if (window.isDestroyed()) {
    dialog.showErrorBox("CanvasTTY startup failed", detail);
    return;
  }

  try {
    await window.loadURL(startupPageUrl({ locale: app.getLocale(), error: detail }));
    window.show();
  } catch {
    dialog.showErrorBox("CanvasTTY startup failed", detail);
  }
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (hasSingleInstanceLock) {
  app.on("second-instance", focusMainWindow);
  void app.whenReady()
    .then(startApplication)
    .catch((error) => {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error("CanvasTTY could not create its startup window.", error);
      dialog.showErrorBox("CanvasTTY startup failed", detail);
      app.quit();
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void startApplication();
  });
}

app.on("before-quit", () => {
  void browserService?.close();
  limitsService?.dispose();
  terminalManager?.disposeAll();
  void pluginManager?.dispose();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Keep shared event names in the main bundle so accidental channel drift fails at build time.
void IPC.terminalData;

async function openPluginWindow(pluginId: string, contributionId: string): Promise<void> {
  if (!pluginManager) throw new Error("Plugin manager is not ready.");
  const contribution = pluginManager.contribution(pluginId, contributionId);
  if (contribution.kind !== "window") throw new Error("Plugin contribution is not a separate window.");

  const window = new BrowserWindow({
    width: contribution.defaultSize.width,
    height: contribution.defaultSize.height,
    minWidth: 320,
    minHeight: 220,
    title: contribution.title,
    backgroundColor: "#353442",
    webPreferences: {
      preload: join(__dirname, "../preload/plugin.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [
        `--canvastty-plugin-id=${encodeURIComponent(pluginId)}`,
        `--canvastty-contribution-id=${encodeURIComponent(contributionId)}`
      ]
    }
  });
  pluginWindows.set(window, pluginId);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`canvastty-plugin://${pluginId}/`)) event.preventDefault();
  });
  window.on("closed", () => pluginWindows.delete(window));
  await window.loadURL(pluginManager.entryUrl(pluginId, contributionId));
}

function closePluginWindows(pluginId: string): void {
  for (const [window, ownerPluginId] of pluginWindows) {
    if (ownerPluginId !== pluginId) continue;
    pluginWindows.delete(window);
    if (!window.isDestroyed()) window.close();
  }
}

function requestPluginLauncher(provider: import("../shared/contracts").ProviderId): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send(IPC.pluginsLauncherRequested, { provider });
}
