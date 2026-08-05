import { BrowserWindow, WebContentsView, session } from "electron";
import { randomUUID } from "node:crypto";
import type {
  BrowserSnapshot,
  BrowserTabSnapshot,
  BrowserViewportBounds
} from "../../shared/contracts";
import { IPC } from "../../shared/contracts";
import { isAllowedBrowserUrl, normalizeBrowserInput } from "./browserUrl";

const BROWSER_PARTITION = "persist:canvastty-browser";
const DEFAULT_URL = "https://duckduckgo.com/";

interface BrowserTab {
  id: string;
  view: WebContentsView;
  loading: boolean;
}

export class BrowserService {
  private readonly getOwner: () => BrowserWindow | null;
  private readonly tabs = new Map<string, BrowserTab>();
  private activeTabId: string | null = null;
  private viewport: BrowserViewportBounds = { x: 0, y: 0, width: 0, height: 0, visible: false };
  private configuredSession = false;

  constructor(getOwner: () => BrowserWindow | null) {
    this.getOwner = getOwner;
  }

  getState(): BrowserSnapshot {
    return {
      tabs: [...this.tabs.values()].map((tab) => this.tabSnapshot(tab)),
      activeTabId: this.activeTabId
    };
  }

  async open(url?: string): Promise<BrowserSnapshot> {
    for (const [id, tab] of this.tabs) {
      if (tab.view.webContents.isDestroyed()) this.tabs.delete(id);
    }
    if (this.activeTabId && !this.tabs.has(this.activeTabId)) this.activeTabId = null;
    if (!this.activeTabId && this.tabs.size > 0) this.activeTabId = this.tabs.keys().next().value ?? null;
    if (this.tabs.size === 0) await this.newTab(url);
    else if (url && this.activeTabId) await this.navigate(this.activeTabId, url);
    this.syncViews();
    return this.getState();
  }

  async close(): Promise<void> {
    const owner = this.getOwner();
    for (const tab of this.tabs.values()) {
      if (owner && !owner.isDestroyed()) owner.contentView.removeChildView(tab.view);
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false });
    }
    this.tabs.clear();
    this.activeTabId = null;
    this.emit();
  }

  async newTab(url = DEFAULT_URL): Promise<BrowserSnapshot> {
    this.requireOwner();
    this.configureSession();
    const id = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });
    const tab: BrowserTab = { id, view, loading: true };
    this.tabs.set(id, tab);
    this.activeTabId = id;
    this.bindTab(tab);
    this.syncViews();
    this.emit();
    void view.webContents.loadURL(normalizeBrowserInput(url)).catch(() => {
      tab.loading = false;
      this.emit();
    });
    return this.getState();
  }

  selectTab(id: string): BrowserSnapshot {
    this.requireTab(id);
    this.activeTabId = id;
    this.syncViews();
    this.emit();
    return this.getState();
  }

  async closeTab(id: string): Promise<BrowserSnapshot> {
    const tab = this.requireTab(id);
    const owner = this.getOwner();
    if (owner && !owner.isDestroyed()) owner.contentView.removeChildView(tab.view);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false });
    this.tabs.delete(id);
    if (this.activeTabId === id) this.activeTabId = this.tabs.keys().next().value ?? null;
    this.syncViews();
    this.emit();
    return this.getState();
  }

  async navigate(id: string, value: string): Promise<BrowserSnapshot> {
    const tab = this.requireTab(id);
    void tab.view.webContents.loadURL(normalizeBrowserInput(value)).catch(() => {
      tab.loading = false;
      this.emit();
    });
    return this.getState();
  }

  back(id: string): BrowserSnapshot {
    const tab = this.requireTab(id);
    if (tab.view.webContents.navigationHistory.canGoBack()) tab.view.webContents.navigationHistory.goBack();
    return this.getState();
  }

  forward(id: string): BrowserSnapshot {
    const tab = this.requireTab(id);
    if (tab.view.webContents.navigationHistory.canGoForward()) tab.view.webContents.navigationHistory.goForward();
    return this.getState();
  }

  reload(id: string): BrowserSnapshot {
    this.requireTab(id).view.webContents.reload();
    return this.getState();
  }

  setViewport(bounds: BrowserViewportBounds): void {
    if (!bounds || typeof bounds !== "object") return;
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
    this.viewport = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
      visible: Boolean(bounds.visible)
    };
    this.syncViews();
  }

  private bindTab(tab: BrowserTab): void {
    const contents = tab.view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedBrowserUrl(url)) void this.newTab(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (!isAllowedBrowserUrl(url)) event.preventDefault();
    });
    contents.on("did-start-loading", () => {
      tab.loading = true;
      this.emit();
    });
    contents.on("did-stop-loading", () => {
      tab.loading = false;
      this.emit();
    });
    contents.on("page-title-updated", () => this.emit());
    contents.on("did-navigate", () => this.emit());
    contents.on("did-navigate-in-page", () => this.emit());
    contents.on("render-process-gone", () => {
      tab.loading = false;
      this.emit();
    });
  }

  private configureSession(): void {
    if (this.configuredSession) return;
    this.configuredSession = true;
    const browserSession = session.fromPartition(BROWSER_PARTITION);
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.on("will-download", (event) => event.preventDefault());
  }

  private syncViews(): void {
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return;
    const content = owner.getContentBounds();
    const left = Math.max(0, this.viewport.x);
    const top = Math.max(0, this.viewport.y);
    const right = Math.min(content.width, this.viewport.x + this.viewport.width);
    const bottom = Math.min(content.height, this.viewport.y + this.viewport.height);
    const visible = this.viewport.visible && right > left && bottom > top;
    for (const tab of this.tabs.values()) {
      const active = visible && tab.id === this.activeTabId;
      tab.view.setVisible(active);
      if (active) {
        tab.view.setBounds({ x: left, y: top, width: right - left, height: bottom - top });
        owner.contentView.addChildView(tab.view);
      }
    }
  }

  private tabSnapshot(tab: BrowserTab): BrowserTabSnapshot {
    const contents = tab.view.webContents;
    const url = contents.isDestroyed() ? "" : contents.getURL();
    const title = contents.isDestroyed() ? "" : contents.getTitle();
    return {
      id: tab.id,
      url,
      title: title || displayUrl(url),
      loading: tab.loading,
      canGoBack: !contents.isDestroyed() && contents.navigationHistory.canGoBack(),
      canGoForward: !contents.isDestroyed() && contents.navigationHistory.canGoForward()
    };
  }

  private requireOwner(): BrowserWindow {
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) throw new Error("Browser host window is unavailable.");
    return owner;
  }

  private requireTab(id: string): BrowserTab {
    const tab = this.tabs.get(id);
    if (!tab) throw new Error("Browser tab is unavailable.");
    return tab;
  }

  private emit(): void {
    const owner = this.getOwner();
    if (owner && !owner.isDestroyed()) owner.webContents.send(IPC.browserState, { snapshot: this.getState() });
  }
}

function displayUrl(value: string): string {
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}
