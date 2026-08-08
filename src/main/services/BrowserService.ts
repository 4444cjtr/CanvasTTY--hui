import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  app,
  BrowserWindow,
  nativeImage,
  screen,
  session,
  View,
  WebContentsView
} from "electron";
import type { DownloadItem, Session, WebContents, WebPreferences } from "electron";
import type {
  AgentPresenceSnapshot,
  BrowserActivityEvent,
  BrowserActor,
  BrowserCanvasFreezeFrameEvent,
  BrowserCanvasNavigationPointerEvent,
  BrowserCanvasPointerEvent,
  BrowserCanvasWheelEvent,
  BrowserCommand,
  BrowserDialogSnapshot,
  BrowserDownloadSnapshot,
  BrowserDownloadStatus,
  BrowserResult,
  BrowserSnapshot,
  BrowserTabSnapshot,
  BrowserTabStatus,
  BrowserViewportBounds,
  CanvasWheelCaptureMode
} from "../../shared/contracts.ts";
import { IPC } from "../../shared/contracts.ts";
import { AgentRegistry } from "./browser/AgentRegistry.ts";
import type { CanvasNavigationInputController } from "./CanvasNavigationOverride.ts";
import { BrowserAutomationService, type BrowserPointerResult } from "./browser/BrowserAutomationService.ts";
import {
  BROWSER_CANVAS_WHEEL_IDLE_MS,
  BrowserCanvasFreezeFrameStore,
  BrowserCanvasWheelSequence,
  browserCanvasNativeWheelSinkLayout,
  browserVisibleRectangle,
  createBrowserCanvasNativeWheelSink,
  encodeBrowserCanvasFreezeFrame
} from "./browser/BrowserCanvasFreeze.ts";
import type { BrowserCanvasNativeWheelSink } from "./browser/BrowserCanvasFreeze.ts";
import {
  BrowserCanvasCursorController,
  browserCanvasNavigationCursor
} from "./browser/BrowserCanvasCursor.ts";
import { BrowserCanvasSinkViewportController } from "./browser/BrowserCanvasSinkViewport.ts";
import { BrowserAuditStore } from "./browser/BrowserAuditStore.ts";
import {
  BrowserPageWheelSequence,
  browserPageWheelClientPoint,
  browserWheelOwner,
  browserCanvasNavigationPointerType,
  toCanvasPageWheelInput
} from "./browser/BrowserCanvasWheel.ts";
import type { BrowserWheelDecision } from "./browser/BrowserCanvasWheel.ts";
import { normalizeBrowserViewportBounds } from "./browser/BrowserViewport.ts";
import { BrowserCore, type BrowserCoreHost, type BrowserCoreTab } from "./browser/BrowserCore.ts";
import { BrowserKernelError } from "./browser/BrowserErrors.ts";
import {
  BrowserPolicyService,
  DEFAULT_BROWSER_URL,
  isSafeBrowserUrl,
  MAX_BROWSER_TABS
} from "./browser/BrowserPolicyService.ts";
import {
  BrowserStore,
  type PersistedBrowserState,
  type PersistedBrowserTab
} from "./browser/BrowserStore.ts";

const BROWSER_PARTITION = "persist:canvastty-browser";
const MAX_DOWNLOAD_HISTORY = 100;
const MAX_FAVICON_BYTES = 256 * 1024;
const HUMAN_ACTOR: BrowserActor = { kind: "human", connectionId: "canvastty-renderer" };

interface BrowserTab {
  id: string;
  view: WebContentsView;
  loading: boolean;
  status: BrowserTabStatus;
  documentRevision: number;
  crashState: string | null;
  favicon: string | null;
  lastSafeUrl: string;
  canvasCursor: BrowserCanvasCursorController;
  canvasSinkViewport: BrowserCanvasSinkViewportController;
}

interface DownloadWaiter {
  tabId: string | null;
  startedAt: number;
  resolve(value: BrowserDownloadSnapshot): void;
  reject(error: unknown): void;
  timeout: NodeJS.Timeout;
  signal?: AbortSignal;
  abort?: () => void;
}

interface BrowserFreezePointerRelay {
  tabId: string;
  button: NonNullable<Electron.MouseInputEvent["button"]>;
  clickCount: number;
  lastClient: { x: number; y: number };
}

interface BrowserNativeWheelSinkPointerRelay {
  tabId: string;
  target: "browser" | "owner";
  button: NonNullable<Electron.MouseInputEvent["button"]>;
  clickCount: number;
  lastClient: { x: number; y: number };
}

export interface BrowserServiceOptions {
  userDataPath?: string;
  downloadRoot?: string;
  uploadRoots?: readonly string[];
  restoreTabs?: boolean;
  canvasWheelCaptureMode?: CanvasWheelCaptureMode;
  now?: () => number;
  canvasNavigationInput?: CanvasNavigationInputController;
}

export class BrowserService {
  readonly core: BrowserCore;
  private readonly getOwner: () => BrowserWindow | null;
  private readonly now: () => number;
  private readonly canvasNavigationInput: CanvasNavigationInputController | null;
  private readonly tabs = new Map<string, BrowserTab>();
  private readonly store: BrowserStore;
  private readonly policy: BrowserPolicyService;
  private readonly audit: BrowserAuditStore;
  private readonly automation = new BrowserAutomationService();
  private readonly agents: AgentRegistry;
  private readonly clipView = new View();
  private readonly readyPromise: Promise<void>;
  private readonly downloadWaiters = new Set<DownloadWaiter>();
  private readonly observedOwners = new WeakSet<BrowserWindow>();
  private readonly presenceTimer: NodeJS.Timeout;
  private browserSession: Session | null = null;
  private browserPagePreloadId: string | null = null;
  private activeTabId: string | null = null;
  private viewport: BrowserViewportBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    surface: "hidden",
    showAgentPresence: false
  };
  private persisted: PersistedBrowserState = { version: 1, tabs: [], activeTabId: null };
  private downloads: BrowserDownloadSnapshot[] = [];
  private readonly pendingDialogs = new Map<string, BrowserDialogSnapshot>();
  private visible = false;
  private disposed = false;
  private restoreTabsEnabled: boolean;
  private clipOwnerId: number | null = null;
  private clipTabId: string | null = null;
  private pointerTabId: string | null = null;
  private canvasDragTabId: string | null = null;
  private rendererCanvasGestureActive = false;
  private canvasNavigationActive = false;
  private inputFocused = false;
  private canvasWheelCaptureMode: CanvasWheelCaptureMode;
  private browserWheelPoint: { tabId: string; point: { x: number; y: number }; observedAt: number } | null = null;
  private readonly pageWheelSequence = new BrowserPageWheelSequence();
  private readonly ownerWheelSequence = new BrowserCanvasWheelSequence();
  private readonly freezeFrameStore = new BrowserCanvasFreezeFrameStore();
  private ownerWheelSequenceTimer: NodeJS.Timeout | null = null;
  private freezeCapturePromise: Promise<void> | null = null;
  private freezeCaptureQueued = false;
  private freezeCaptureAfterSequence = false;
  private freezeFrameActive = false;
  private freezeFrameTabId: string | null = null;
  private freezeFrameEventGeneration = 0;
  private freezePointerRelay: BrowserFreezePointerRelay | null = null;
  private nativeWheelSink: BrowserCanvasNativeWheelSink | null = null;
  private restoringNativeWheelSinkTabId: string | null = null;
  private nativeWheelSinkPointerRelay: BrowserNativeWheelSinkPointerRelay | null = null;
  private presenceWindow: BrowserWindow | null = null;
  private presenceWindowReady: Promise<void> | null = null;

  constructor(getOwner: () => BrowserWindow | null, options: BrowserServiceOptions = {}) {
    this.getOwner = getOwner;
    this.now = options.now ?? Date.now;
    this.canvasNavigationInput = options.canvasNavigationInput ?? null;
    this.canvasWheelCaptureMode = options.canvasWheelCaptureMode ?? "key";
    const userDataPath = options.userDataPath ?? app.getPath("userData");
    const downloadRoot = join(options.downloadRoot ?? join(app.getPath("downloads"), "CanvasTTY"), randomUUID());
    this.restoreTabsEnabled = options.restoreTabs ?? true;
    this.store = new BrowserStore(userDataPath);
    this.policy = new BrowserPolicyService({
      downloadRoot,
      uploadRoots: [downloadRoot, ...(options.uploadRoots ?? [])],
      uploadStagingRoot: join(userDataPath, "browser", "upload-staging", randomUUID())
    });
    this.audit = new BrowserAuditStore(userDataPath, { now: this.now });
    this.agents = new AgentRegistry(this.now);

    const host: BrowserCoreHost = {
      getSnapshot: () => this.getState(),
      getTab: (tabId) => this.coreTab(tabId),
      ensureRuntime: () => this.ensureRuntime(),
      newTab: (url) => this.hostNewTab(url),
      closeTab: (tabId) => this.hostCloseTab(tabId),
      activateTab: (tabId) => this.hostActivateTab(tabId),
      navigateTab: (tabId, url) => this.hostNavigate(tabId, url),
      back: (tabId) => this.hostBack(tabId),
      forward: (tabId) => this.hostForward(tabId),
      reload: (tabId) => this.hostReload(tabId),
      pendingDialog: (tabId) => this.pendingDialog(tabId),
      waitForDownload: (tabId, timeoutMs, signal) => this.waitForDownload(tabId, timeoutMs, signal),
      touchActor: (actor, tabId, cursor) => this.touchActor(actor, tabId, cursor),
      heartbeatActor: (actor, timestamp) => this.heartbeatActor(actor, timestamp),
      disconnectActor: (actor) => this.disconnectActor(actor)
    };
    this.core = new BrowserCore({
      host,
      automation: this.automation,
      policy: this.policy,
      audit: this.audit,
      onActivity: (event) => this.emitActivity(event)
    });
    this.readyPromise = this.initialize();
    this.presenceTimer = setInterval(() => {
      if (!this.agents.prune()) return;
      this.presenceChanged();
    }, 1_000);
    this.presenceTimer.unref();
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  getState(): BrowserSnapshot {
    const agentValues = this.agents.snapshot();
    const runtimeTabs = [...this.tabs.values()];
    const tabs = runtimeTabs.length > 0
      ? runtimeTabs.map((tab) => this.tabSnapshot(tab, agentValues))
      : this.persisted.tabs.map((tab) => this.persistedTabSnapshot(tab, agentValues));
    return {
      tabs,
      activeTabId: runtimeTabs.length > 0 ? this.activeTabId : this.persisted.activeTabId,
      visible: this.visible,
      agents: agentValues,
      downloads: this.downloads.map((download) => structuredClone(download)),
      pendingDialog: this.visibleDialog()
    };
  }

  async open(url?: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    this.visible = true;
    if (this.tabs.size === 0) return this.newTab(url);
    if (url && this.activeTabId) return this.navigate(this.activeTabId, url);
    this.syncViews();
    this.emit();
    return this.getState();
  }

  async close(): Promise<void> {
    await this.readyPromise;
    if (this.disposed) return;
    await this.persistRuntime();
    if (this.canvasDragTabId !== null) this.cancelCanvasDrag(this.canvasDragTabId);
    this.endOwnerWheelSequence("browser-closed", false);
    this.freezeFrameStore.invalidateCapture();
    this.inputFocused = false;
    this.visible = false;
    this.hideClipView();
    this.destroyPresenceWindow();
    this.emit();
  }

  focus(): void {
    if (!this.visible || this.viewport.surface !== "native" || !this.activeTabId) return;
    const active = this.tabs.get(this.activeTabId);
    if (!active || active.view.webContents.isDestroyed()) return;
    active.view.webContents.focus();
  }

  setInputFocused(focused: boolean): void {
    if (this.inputFocused === focused) return;
    this.inputFocused = focused;
  }

  setCanvasWheelCaptureMode(mode: CanvasWheelCaptureMode): void {
    this.canvasWheelCaptureMode = mode;
  }

  decidePageWheel(sender: WebContents, input: unknown): BrowserWheelDecision {
    const failClosed = {
      generation: 0,
      owner: "canvas"
    } satisfies BrowserWheelDecision;
    const wheel = toCanvasPageWheelInput(input);
    if (
      !wheel
      || !this.visible
      || this.viewport.surface !== "native"
      || this.activeTabId === null
    ) return failClosed;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || tab.view.webContents !== sender || sender.isDestroyed()) return failClosed;
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return failClosed;

    const decision = this.pageWheelSequence.decide(browserWheelOwner({
      surface: this.viewport.surface,
      focused: this.inputFocused,
      captureMode: this.canvasWheelCaptureMode,
      wheelOverrideActive: this.canvasNavigationInput?.wheelActive ?? false,
      canvasOverrideActive: this.canvasNavigationInput?.active ?? false,
      ctrlKey: wheel.ctrlKey,
      metaKey: wheel.metaKey
    }), this.now());
    const clientPoint = this.browserWheelClientPoint(tab.id, owner, input);
    if (decision.owner === "canvas") {
      this.beginOwnerWheelSequence(clientPoint, "browser-frame-sync-ipc");
    }
    return decision;
  }

  handlePageWheel(sender: WebContents, input: unknown): void {
    if (!this.visible || this.viewport.surface === "hidden" || this.activeTabId === null) return;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || tab.view.webContents !== sender || sender.isDestroyed()) return;
    const wheel = toCanvasPageWheelInput(input);
    if (!wheel) return;
    const generation = pageWheelGeneration(input);
    const sequenceOwner = generation === null
      ? null
      : this.pageWheelSequence.touch(generation, this.now());
    if (sequenceOwner === null || sequenceOwner === "page") return;
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return;
    const clientPoint = this.browserWheelClientPoint(tab.id, owner, input);
    this.beginOwnerWheelSequence(clientPoint, "browser-frame-async-ipc");
    const payload: BrowserCanvasWheelEvent = {
      tabId: tab.id,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
      ...wheel,
      wheelOverrideActive: this.canvasNavigationInput?.wheelActive ?? false,
      canvasOverrideActive: this.canvasNavigationInput?.active ?? false
    };
    owner.webContents.send(IPC.browserCanvasWheel, payload);
  }

  beginRendererWheelSequence(input: unknown): void {
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const values = input as Record<string, unknown>;
    if (!Number.isFinite(values.clientX) || !Number.isFinite(values.clientY)) return;
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return;
    const content = owner.getContentBounds();
    const clientX = values.clientX as number;
    const clientY = values.clientY as number;
    if (clientX < 0 || clientY < 0 || clientX >= content.width || clientY >= content.height) return;
    this.beginOwnerWheelSequence({
      x: clientX,
      y: clientY
    }, "renderer-sync-ipc");
  }

  async setRestoreTabs(enabled: boolean): Promise<void> {
    await this.readyPromise;
    this.restoreTabsEnabled = enabled;
    if (enabled) await this.persistRuntime();
    else {
      await this.store.clear();
      this.persisted = this.store.get();
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.readyPromise.catch(() => undefined);
    this.disposed = true;
    const draining = this.core.shutdown();
    await this.persistRuntime().catch(() => undefined);
    this.visible = false;
    this.inputFocused = false;
    this.endOwnerWheelSequence("service-disposed", false);
    this.freezeFrameStore.clear();
    clearInterval(this.presenceTimer);
    this.destroyRuntimeTabs();
    if (this.browserSession && this.browserPagePreloadId) {
      this.browserSession.unregisterPreloadScript(this.browserPagePreloadId);
      this.browserPagePreloadId = null;
    }
    this.hideClipView();
    this.destroyPresenceWindow();
    for (const waiter of this.downloadWaiters) {
      this.cleanupDownloadWaiter(waiter);
      waiter.reject(new BrowserKernelError("BRIDGE_UNAVAILABLE", "Browser service is shutting down."));
    }
    await Promise.allSettled([draining, this.policy.clearStagedUploads()]);
  }

  async closeAllTabs(): Promise<BrowserSnapshot> {
    await this.readyPromise;
    for (const id of [...this.getState().tabs.map((tab) => tab.id)]) await this.closeTab(id);
    return this.getState();
  }

  async newTab(url = DEFAULT_BROWSER_URL): Promise<BrowserSnapshot> {
    const normalized = this.policy.normalizeHumanInput(url);
    return this.snapshotResult(await this.executeHuman({
      type: "browser_new_tab",
      requestId: randomUUID(),
      url: normalized
    }));
  }

  async selectTab(id: string): Promise<BrowserSnapshot> {
    return this.snapshotResult(await this.executeHuman({
      type: "browser_activate_tab",
      requestId: randomUUID(),
      tabId: id
    }));
  }

  async closeTab(id: string): Promise<BrowserSnapshot> {
    return this.snapshotResult(await this.executeHuman({
      type: "browser_close_tab",
      requestId: randomUUID(),
      tabId: id
    }));
  }

  async navigate(id: string, value: string): Promise<BrowserSnapshot> {
    return this.snapshotResult(await this.executeHuman({
      type: "browser_navigate",
      requestId: randomUUID(),
      tabId: id,
      url: this.policy.normalizeHumanInput(value)
    }));
  }

  async back(id: string): Promise<BrowserSnapshot> {
    return this.snapshotResult(await this.executeHuman({
      type: "browser_back",
      requestId: randomUUID(),
      tabId: id
    }));
  }

  async forward(id: string): Promise<BrowserSnapshot> {
    return this.snapshotResult(await this.executeHuman({
      type: "browser_forward",
      requestId: randomUUID(),
      tabId: id
    }));
  }

  async reload(id: string): Promise<BrowserSnapshot> {
    return this.snapshotResult(await this.executeHuman({
      type: "browser_reload",
      requestId: randomUUID(),
      tabId: id
    }));
  }

  executeHuman(command: BrowserCommand, signal?: AbortSignal): Promise<BrowserResult> {
    return this.core.execute(HUMAN_ACTOR, command, signal);
  }

  getActivity(sinceSequence = 0): BrowserActivityEvent[] {
    return this.core.getActivity(sinceSequence);
  }

  async clearData(): Promise<BrowserSnapshot> {
    await this.readyPromise;
    await this.closeAllTabs();
    const browserSession = this.requireSession();
    await Promise.all([
      browserSession.clearStorageData(),
      browserSession.clearCache(),
      browserSession.clearAuthCache(),
      this.policy.clearStagedUploads()
    ]);
    this.downloads = [];
    this.pendingDialogs.clear();
    await this.store.clear();
    this.persisted = this.store.get();
    if (this.visible) return this.newTab();
    this.emit();
    return this.getState();
  }

  setViewport(bounds: BrowserViewportBounds): void {
    const normalized = normalizeBrowserViewportBounds(bounds);
    if (!normalized) return;
    const previous = this.viewport;
    this.viewport = normalized;
    if (normalized.surface === "hidden") {
      this.inputFocused = false;
      this.cancelCanvasNavigationGesture();
      this.endOwnerWheelSequence("viewport-removed", false);
      this.freezeFrameStore.invalidateCapture();
    }
    this.syncViews();
    if (normalized.surface === "native" && (
      previous.width !== normalized.width
      || previous.height !== normalized.height
      || previous.canvasScale !== normalized.canvasScale
    )) {
      if (this.freezeFrameActive) this.freezeCaptureAfterSequence = true;
      else this.refreshFreezeFrame();
    }
  }

  setCanvasNavigationActive(active: boolean): void {
    if (this.canvasNavigationActive === active) return;
    this.canvasNavigationActive = active;
    this.syncCanvasCursors();
  }

  setRendererCanvasGestureActive(active: boolean): void {
    if (this.rendererCanvasGestureActive === active) return;
    this.rendererCanvasGestureActive = active;
    this.syncCanvasCursors();
  }

  cancelCanvasNavigationGesture(): void {
    const hadRendererGesture = this.rendererCanvasGestureActive;
    this.rendererCanvasGestureActive = false;
    if (this.canvasDragTabId !== null) this.cancelCanvasDrag(this.canvasDragTabId);
    else if (hadRendererGesture) this.syncCanvasCursors();
  }

  setAgentPresences(values: readonly AgentPresenceSnapshot[]): void {
    this.agents.replace(values);
    this.presenceChanged();
  }

  private async initialize(): Promise<void> {
    this.persisted = await this.store.load();
    if (!this.restoreTabsEnabled) {
      await this.store.clear();
      this.persisted = this.store.get();
    }
    this.activeTabId = this.persisted.activeTabId;
    await mkdir(this.policy.downloadRoot, { recursive: true });
    this.configureSession();
  }

  private async ensureRuntime(): Promise<void> {
    await this.readyPromise;
    if (this.disposed) throw new BrowserKernelError("BRIDGE_UNAVAILABLE", "Browser service is disposed.");
    this.requireOwner();
    this.visible = true;
    for (const [id, tab] of this.tabs) {
      if (!tab.view.webContents.isDestroyed()) continue;
      this.automation.unregister(id);
      this.tabs.delete(id);
    }
    if (this.tabs.size === 0 && this.persisted.tabs.length > 0) {
      for (const saved of this.persisted.tabs.slice(0, MAX_BROWSER_TABS)) {
        const tab = this.createRuntimeTab(saved.id, saved.url);
        void this.loadTab(tab, saved.url);
      }
      this.activeTabId = this.persisted.tabs.some((tab) => tab.id === this.persisted.activeTabId)
        ? this.persisted.activeTabId
        : this.tabs.keys().next().value ?? null;
    }
    this.syncViews();
  }

  private coreTab(tabId: string): BrowserCoreTab | null {
    const tab = this.tabs.get(tabId);
    if (tab) {
      return { id: tab.id, url: this.tabUrl(tab), documentRevision: tab.documentRevision, status: tab.status };
    }
    const saved = this.persisted.tabs.find((candidate) => candidate.id === tabId);
    return saved ? { id: saved.id, url: saved.url, documentRevision: 0, status: "ready" } : null;
  }

  private async hostNewTab(url: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    if (this.tabs.size >= MAX_BROWSER_TABS) {
      throw new BrowserKernelError("RATE_LIMITED", `Browser tab limit is ${MAX_BROWSER_TABS}.`);
    }
    const normalized = this.policy.assertNavigationUrl(url);
    const tab = this.createRuntimeTab(randomUUID(), normalized);
    this.endOwnerWheelSequence("new-active-tab", false);
    this.freezeFrameStore.invalidateCapture();
    this.activeTabId = tab.id;
    await this.persistRuntime();
    this.syncViews();
    this.emit();
    void this.loadTab(tab, normalized);
    return this.getState();
  }

  private async hostActivateTab(tabId: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    const tab = this.requireTab(tabId);
    if (this.canvasDragTabId !== null && this.canvasDragTabId !== tab.id) {
      this.cancelCanvasDrag(this.canvasDragTabId);
    }
    this.endOwnerWheelSequence("active-tab-changed", false);
    this.freezeFrameStore.invalidateCapture();
    this.activeTabId = tab.id;
    await this.persistRuntime();
    this.syncViews();
    this.refreshFreezeFrame();
    if (this.viewport.surface === "native" && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus();
    this.emit();
    return this.getState();
  }

  private async hostCloseTab(tabId: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    const tab = this.requireTab(tabId);
    if (this.activeTabId === tabId) {
      this.endOwnerWheelSequence("active-tab-closed", false);
      this.freezeFrameStore.invalidateCapture();
    }
    this.tabs.delete(tabId);
    this.destroyTab(tab);
    this.pendingDialogs.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = this.tabs.keys().next().value ?? null;
    await this.persistRuntime();
    this.syncViews();
    this.emit();
    return this.getState();
  }

  private async hostNavigate(tabId: string, url: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    const tab = this.requireTab(tabId);
    const normalized = this.policy.assertNavigationUrl(url);
    tab.lastSafeUrl = normalized;
    tab.loading = true;
    tab.status = "loading";
    tab.crashState = null;
    // Invalidate observed refs before dispatching Chromium navigation. The
    // did-start-navigation event advances it again, covering reads that race the
    // short interval between dispatch and the actual document transition.
    this.incrementRevision(tab);
    await this.persistRuntime();
    this.emit();
    void this.loadTab(tab, normalized);
    return this.getState();
  }

  private async hostBack(tabId: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    const tab = this.requireTab(tabId);
    if (tab.view.webContents.navigationHistory.canGoBack()) {
      tab.loading = true;
      tab.status = "loading";
      tab.crashState = null;
      this.incrementRevision(tab);
      tab.view.webContents.navigationHistory.goBack();
      this.emit();
    }
    return this.getState();
  }

  private async hostForward(tabId: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    const tab = this.requireTab(tabId);
    if (tab.view.webContents.navigationHistory.canGoForward()) {
      tab.loading = true;
      tab.status = "loading";
      tab.crashState = null;
      this.incrementRevision(tab);
      tab.view.webContents.navigationHistory.goForward();
      this.emit();
    }
    return this.getState();
  }

  private async hostReload(tabId: string): Promise<BrowserSnapshot> {
    await this.ensureRuntime();
    let tab = this.requireTab(tabId);
    if (tab.view.webContents.isDestroyed()) {
      const url = tab.lastSafeUrl;
      const nextRevision = tab.documentRevision + 1;
      this.destroyTab(tab);
      tab = this.createRuntimeTab(tabId, url, nextRevision);
      void this.loadTab(tab, url);
    } else {
      tab.status = "loading";
      tab.loading = true;
      tab.crashState = null;
      this.incrementRevision(tab);
      tab.view.webContents.reload();
    }
    this.emit();
    return this.getState();
  }

  private createRuntimeTab(
    id: string,
    url: string,
    initialRevision = 0,
    existingContents?: WebContents
  ): BrowserTab {
    const view = existingContents
      ? new WebContentsView({ webContents: existingContents })
      : new WebContentsView({ webPreferences: remoteBrowserWebPreferences() });
    const tab: BrowserTab = {
      id,
      view,
      loading: true,
      status: "loading",
      documentRevision: initialRevision,
      crashState: null,
      favicon: null,
      lastSafeUrl: url,
      canvasCursor: new BrowserCanvasCursorController(view.webContents),
      canvasSinkViewport: new BrowserCanvasSinkViewportController(view.webContents)
    };
    this.tabs.set(id, tab);
    tab.canvasCursor.set(browserCanvasNavigationCursor(this.canvasNavigationActive, false));
    this.bindTab(tab);
    void this.automation.register(id, view.webContents, tab.documentRevision, (dialog) => {
      if (dialog && this.tabs.has(id)) this.pendingDialogs.set(id, dialog);
      else if (!dialog) this.pendingDialogs.delete(id);
      this.emit();
    }).catch(() => undefined);
    return tab;
  }

  private bindTab(tab: BrowserTab): void {
    const contents = tab.view.webContents;
    this.canvasNavigationInput?.attach(contents);
    contents.setWindowOpenHandler((details) => {
      const decision = this.policy.popup(details.url, details.disposition, this.tabs.size);
      if (decision.action === "deny" || !decision.url) return { action: "deny" };
      return {
        action: "allow",
        outlivesOpener: true,
        overrideBrowserWindowOptions: {
          show: false,
          webPreferences: remoteBrowserWebPreferences()
        },
        createWindow: (options) => {
          // window.open already owns a guest WebContents. Electron requires this
          // callback to return that exact instance, so adopt it into our view.
          const popupContents = (options as typeof options & { webContents?: WebContents }).webContents;
          const child = this.createRuntimeTab(randomUUID(), decision.url!, 0, popupContents);
          if (decision.activate) this.activeTabId = child.id;
          void this.persistRuntime().then(() => {
            this.syncViews();
            this.emit();
          });
          if (!popupContents) void this.loadTab(child, decision.url!);
          return child.view.webContents;
        }
      };
    });
    contents.on("will-navigate", (event, url) => {
      if (!isSafeBrowserUrl(url)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url) => {
      if (!isSafeBrowserUrl(url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("before-mouse-event", (event, mouse) => {
      const nativeSink = this.nativeWheelSink?.tabId === tab.id ? this.nativeWheelSink : null;
      if ((this.viewport.surface !== "native" && !nativeSink) || this.activeTabId !== tab.id) return;
      const owner = this.getOwner();
      if (!owner || owner.isDestroyed()) return;
      if (mouse.type === "mouseWheel") {
        this.browserWheelPoint = {
          tabId: tab.id,
          point: nativeSink
            ? { ...nativeSink.pointer }
            : { x: this.viewport.x + mouse.x, y: this.viewport.y + mouse.y },
          observedAt: this.now()
        };
      }
      const canvasOverrideActive = this.canvasNavigationInput?.active ?? false;
      const mouseClientPoint = this.nativeWheelSink?.tabId === tab.id
        ? this.ownerPointerClientPoint(owner, this.nativeWheelSink.pointer, mouse)
        : { x: this.viewport.x + mouse.x, y: this.viewport.y + mouse.y };

      const navigationPointerType = browserCanvasNavigationPointerType(
        mouse,
        canvasOverrideActive,
        this.canvasDragTabId === tab.id || this.rendererCanvasGestureActive
      );
      if (navigationPointerType) {
        if (navigationPointerType === "down") {
          this.canvasDragTabId = tab.id;
          this.syncCanvasCursors();
        }
        if (navigationPointerType === "up" || navigationPointerType === "cancel") {
          this.canvasDragTabId = null;
          this.rendererCanvasGestureActive = false;
          this.syncCanvasCursors();
        }
        const payload: BrowserCanvasNavigationPointerEvent = {
          tabId: tab.id,
          type: navigationPointerType,
          clientX: mouseClientPoint.x,
          clientY: mouseClientPoint.y
        };
        event.preventDefault();
        owner.webContents.send(IPC.browserCanvasNavigationPointer, payload);
        return;
      }
      if ((this.canvasDragTabId === tab.id || this.rendererCanvasGestureActive)
        && mouse.type === "mouseLeave") {
        event.preventDefault();
        return;
      }

      if (this.relayNativeWheelSinkPointerFromBrowser(event, mouse, owner, tab)) return;

      const pointerType = mouse.type === "mouseDown" && mouse.button === "left"
        ? "down"
        : mouse.type === "mouseUp" && mouse.button === "left"
          ? "up"
          : mouse.type === "mouseEnter" || (mouse.type === "mouseMove" && this.pointerTabId !== tab.id)
            ? "enter"
            : mouse.type === "mouseLeave"
              ? "leave"
              : null;
      if (pointerType) {
        if (pointerType === "down") {
          contents.focus();
          this.setInputFocused(true);
        }
        this.pointerTabId = pointerType === "leave" ? null : tab.id;
        const payload: BrowserCanvasPointerEvent = {
          tabId: tab.id,
          type: pointerType,
          clientX: this.viewport.x + mouse.x,
          clientY: this.viewport.y + mouse.y,
          clickCount: pointerType === "down" || pointerType === "up" ? Math.max(1, mouse.clickCount ?? 1) : 0
        };
        owner.webContents.send(IPC.browserCanvasPointer, payload);
      }

    });
    contents.on("login", (event, _details, _authInfo, callback) => {
      event.preventDefault();
      callback();
    });
    contents.on("select-client-certificate", (event, _url, _certificateList, callback) => {
      event.preventDefault();
      (callback as unknown as (certificate?: never) => void)();
    });
    contents.on("did-start-navigation", (_details, _url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      if (!isInPlace && this.activeTabId === tab.id) {
        this.endOwnerWheelSequence("active-tab-navigation");
        this.freezeFrameStore.invalidateCapture();
      }
      tab.loading = true;
      tab.status = "loading";
      tab.crashState = null;
      if (!isInPlace) this.incrementRevision(tab);
      this.emit();
    });
    contents.on("did-start-loading", () => {
      tab.loading = true;
      if (tab.status !== "crashed") tab.status = "loading";
      this.emit();
    });
    contents.on("did-stop-loading", () => {
      tab.loading = false;
      if (tab.status !== "crashed" && tab.status !== "error") tab.status = "ready";
      if (this.activeTabId === tab.id) this.refreshFreezeFrame();
      this.emit();
    });
    contents.on("did-finish-load", () => tab.canvasCursor.refresh());
    contents.on("did-fail-load", (_event, errorCode, _errorDescription, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      tab.loading = false;
      tab.status = "error";
      tab.crashState = "load-failed";
      this.emit();
    });
    contents.on("page-title-updated", () => this.emit());
    contents.on("page-favicon-updated", (_event, favicons) => {
      void this.loadFavicon(tab, favicons);
    });
    contents.on("did-navigate", (_event, url) => {
      if (isSafeBrowserUrl(url)) tab.lastSafeUrl = url;
      tab.status = "ready";
      tab.crashState = null;
      this.applyPageScale(tab);
      void this.persistRuntime();
      this.emit();
    });
    contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      if (isSafeBrowserUrl(url)) tab.lastSafeUrl = url;
      this.incrementRevision(tab);
      void this.persistRuntime();
      this.emit();
    });
    contents.on("unresponsive", () => {
      tab.status = "error";
      tab.crashState = "unresponsive";
      this.emit();
    });
    contents.on("responsive", () => {
      if (tab.crashState !== "unresponsive") return;
      tab.status = "ready";
      tab.crashState = null;
      this.emit();
    });
    contents.on("render-process-gone", (_event, details) => {
      this.cancelCanvasDrag(tab.id);
      if (this.activeTabId === tab.id) {
        this.endOwnerWheelSequence("active-tab-crashed", false);
        this.freezeFrameStore.invalidateCapture();
      }
      tab.loading = false;
      tab.status = "crashed";
      tab.crashState = details.reason;
      this.emit();
    });
    contents.on("destroyed", () => {
      tab.canvasCursor.dispose();
      tab.canvasSinkViewport.dispose();
      this.cancelCanvasDrag(tab.id);
      if (this.activeTabId === tab.id) {
        this.endOwnerWheelSequence("active-tab-destroyed", false);
        this.freezeFrameStore.invalidateCapture();
      }
      if (!this.tabs.has(tab.id)) return;
      tab.loading = false;
      tab.status = "crashed";
      tab.crashState = "destroyed";
      this.emit();
    });
  }

  private configureSession(): void {
    if (this.browserSession) return;
    const browserSession = session.fromPartition(BROWSER_PARTITION);
    this.browserSession = browserSession;
    this.browserPagePreloadId = browserSession.registerPreloadScript({
      type: "frame",
      filePath: join(__dirname, "../preload/browser.cjs")
    });
    browserSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => (
      this.policy.permission(permission, requestingOrigin)
    ));
    browserSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(this.policy.permission(permission, contents.getURL()));
    });
    browserSession.setDevicePermissionHandler(() => false);
    browserSession.on("will-download", (event, item, contents) => this.onDownload(event, item, contents));
  }

  private onDownload(
    event: Electron.Event,
    item: DownloadItem,
    contents: WebContents
  ): void {
    const id = randomUUID();
    let savePath: string;
    try {
      savePath = this.policy.resolveDownloadPath(id, item.getFilename());
      item.setSavePath(savePath);
    } catch {
      event.preventDefault();
      return;
    }
    const tabId = [...this.tabs.values()].find((tab) => tab.view.webContents.id === contents.id)?.id ?? null;
    const download: BrowserDownloadSnapshot = {
      id,
      tabId,
      fileName: basename(item.getFilename()).slice(0, 240),
      savePath,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      status: "pending",
      startedAt: this.now(),
      completedAt: null
    };
    this.downloads.push(download);
    if (this.downloads.length > MAX_DOWNLOAD_HISTORY) this.downloads.shift();
    item.on("updated", (_updatedEvent, state) => {
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.status = state === "interrupted" ? "interrupted" : "progressing";
      this.emit();
    });
    item.once("done", (_doneEvent, state) => {
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.status = downloadStatus(state);
      download.completedAt = this.now();
      this.resolveDownloadWaiters(download);
      this.emit();
    });
    this.emit();
  }

  private waitForDownload(
    tabId: string | null,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<BrowserDownloadSnapshot> {
    const startedAt = this.now();
    const recent = [...this.downloads].reverse().find((download) => (
      download.completedAt !== null
      && download.completedAt >= startedAt - 5_000
      && (tabId === null || download.tabId === tabId)
    ));
    if (recent) return Promise.resolve(structuredClone(recent));
    const active = [...this.downloads].reverse().find((download) => (
      download.completedAt === null && (tabId === null || download.tabId === tabId)
    ));
    return new Promise((resolve, reject) => {
      const waiter: DownloadWaiter = {
        tabId,
        startedAt: active?.startedAt ?? startedAt,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.cleanupDownloadWaiter(waiter);
          reject(new BrowserKernelError("TIMEOUT", "Browser download wait timed out.", { retryable: true }));
        }, timeoutMs),
        signal
      };
      waiter.timeout.unref();
      if (signal) {
        waiter.abort = () => {
          this.cleanupDownloadWaiter(waiter);
          reject(new DOMException("Browser download wait was canceled.", "AbortError"));
        };
        if (signal.aborted) return waiter.abort();
        signal.addEventListener("abort", waiter.abort, { once: true });
      }
      this.downloadWaiters.add(waiter);
    });
  }

  private resolveDownloadWaiters(download: BrowserDownloadSnapshot): void {
    for (const waiter of [...this.downloadWaiters]) {
      if (download.startedAt < waiter.startedAt) continue;
      if (waiter.tabId !== null && download.tabId !== waiter.tabId) continue;
      this.cleanupDownloadWaiter(waiter);
      waiter.resolve(structuredClone(download));
    }
  }

  private cleanupDownloadWaiter(waiter: DownloadWaiter): void {
    clearTimeout(waiter.timeout);
    if (waiter.signal && waiter.abort) waiter.signal.removeEventListener("abort", waiter.abort);
    this.downloadWaiters.delete(waiter);
  }

  private async loadFavicon(tab: BrowserTab, values: readonly string[]): Promise<void> {
    for (const value of values.slice(0, 4)) {
      try {
        let image;
        if (value.startsWith("data:image/") && value.length <= MAX_FAVICON_BYTES * 2) {
          image = nativeImage.createFromDataURL(value);
        } else if (isSafeBrowserUrl(value) && !tab.view.webContents.isDestroyed()) {
          const response = await tab.view.webContents.session.fetch(value, { credentials: "omit" });
          if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/")) continue;
          const contentLength = Number(response.headers.get("content-length") ?? 0);
          if (contentLength > MAX_FAVICON_BYTES) continue;
          const buffer = await readBoundedResponse(response, MAX_FAVICON_BYTES);
          image = nativeImage.createFromBuffer(buffer);
        } else {
          continue;
        }
        if (!image || image.isEmpty()) continue;
        const size = image.getSize();
        if (size.width > 64 || size.height > 64) image = image.resize({ width: 64, height: 64, quality: "good" });
        const png = image.toPNG();
        if (png.byteLength > MAX_FAVICON_BYTES) continue;
        tab.favicon = `data:image/png;base64,${png.toString("base64")}`;
        this.emit();
        return;
      } catch {
        // Try the next favicon candidate.
      }
    }
  }

  private incrementRevision(tab: BrowserTab): void {
    tab.documentRevision += 1;
    this.automation.updateRevision(tab.id, tab.documentRevision);
  }

  private async loadTab(tab: BrowserTab, url: string): Promise<void> {
    try {
      await tab.view.webContents.loadURL(url);
    } catch {
      if (!this.tabs.has(tab.id)) return;
      tab.loading = false;
      tab.status = "error";
      tab.crashState = "load-failed";
      this.emit();
    }
  }

  private async persistRuntime(): Promise<void> {
    if (!this.restoreTabsEnabled) return;
    const tabs = [...this.tabs.values()]
      .map((tab) => ({ id: tab.id, url: this.tabUrl(tab) }))
      .filter((tab) => isSafeBrowserUrl(tab.url));
    this.persisted = await this.store.replace(tabs, this.activeTabId);
  }

  private destroyRuntimeTabs(): void {
    for (const tab of this.tabs.values()) this.destroyTab(tab);
    this.tabs.clear();
    this.activeTabId = this.persisted.activeTabId;
    this.pendingDialogs.clear();
  }

  private destroyTab(tab: BrowserTab): void {
    this.cancelCanvasDrag(tab.id);
    if (this.activeTabId === tab.id) {
      this.endOwnerWheelSequence("active-tab-destroyed", false);
      this.freezeFrameStore.invalidateCapture();
    }
    tab.canvasCursor.dispose();
    tab.canvasSinkViewport.dispose();
    this.automation.unregister(tab.id);
    this.clipView.removeChildView(tab.view);
    if (this.clipTabId === tab.id) this.clipTabId = null;
    if (this.pointerTabId === tab.id) this.pointerTabId = null;
    tab.view.setVisible(false);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false });
  }

  private cancelCanvasDrag(tabId: string): void {
    if (this.canvasDragTabId !== tabId) return;
    this.canvasDragTabId = null;
    this.syncCanvasCursors();
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return;
    owner.webContents.send(IPC.browserCanvasNavigationPointer, {
      tabId,
      type: "cancel",
      clientX: 0,
      clientY: 0
    } satisfies BrowserCanvasNavigationPointerEvent);
  }

  private syncCanvasCursors(): void {
    for (const tab of this.tabs.values()) {
      tab.canvasCursor.set(browserCanvasNavigationCursor(
        this.canvasNavigationActive,
        this.canvasDragTabId === tab.id || this.rendererCanvasGestureActive
      ));
    }
  }

  private beginOwnerWheelSequence(
    point: { x: number; y: number },
    source: "native-before-mouse" | "renderer-sync-ipc" | "browser-frame-sync-ipc" | "browser-frame-async-ipc"
  ): boolean {
    if (!this.visible || this.viewport.surface === "hidden" || this.activeTabId === null) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const transition = this.ownerWheelSequence.begin(point, this.now());
    this.scheduleOwnerWheelSequenceEnd();
    if (transition.started) {
      const proposedNativeWheelSink = source === "browser-frame-sync-ipc"
        ? createBrowserCanvasNativeWheelSink(this.activeTabId, this.viewport, point)
        : null;
      const sinkTab = proposedNativeWheelSink
        ? this.tabs.get(proposedNativeWheelSink.tabId)
        : undefined;
      this.nativeWheelSink = proposedNativeWheelSink && sinkTab?.canvasSinkViewport.preserve(
        proposedNativeWheelSink.viewport
      )
        ? proposedNativeWheelSink
        : null;
      this.refreshFreezeFrame();
      if (this.nativeWheelSink) this.restoringNativeWheelSinkTabId = null;
    }
    this.syncViews();
    return this.nativeWheelSink?.tabId === this.activeTabId;
  }

  private scheduleOwnerWheelSequenceEnd(): void {
    if (this.ownerWheelSequenceTimer) clearTimeout(this.ownerWheelSequenceTimer);
    this.ownerWheelSequenceTimer = setTimeout(() => {
      this.ownerWheelSequenceTimer = null;
      if (!this.ownerWheelSequence.expired(this.now())) {
        this.scheduleOwnerWheelSequenceEnd();
        return;
      }
      this.endOwnerWheelSequence("wheel-idle");
    }, BROWSER_CANVAS_WHEEL_IDLE_MS);
  }

  private endOwnerWheelSequence(reason: string, sync = true): void {
    if (reason === "wheel-idle" && this.freezePointerRelay !== null) {
      this.scheduleOwnerWheelSequenceEnd();
      return;
    }
    if (this.ownerWheelSequenceTimer) {
      clearTimeout(this.ownerWheelSequenceTimer);
      this.ownerWheelSequenceTimer = null;
    }
    if (this.freezePointerRelay !== null) this.cancelFreezePointerRelay();
    if (this.nativeWheelSinkPointerRelay !== null) this.cancelNativeWheelSinkPointerRelay();
    const frozenTabId = this.freezeFrameTabId;
    const wasFrozen = this.freezeFrameActive;
    const nativeSinkTabId = this.nativeWheelSink?.tabId ?? this.restoringNativeWheelSinkTabId;
    if (this.nativeWheelSink) this.restoringNativeWheelSinkTabId = this.nativeWheelSink.tabId;
    this.ownerWheelSequence.end();
    this.pageWheelSequence.reset();
    this.nativeWheelSink = null;
    if (sync && !this.disposed) this.syncViews();
    const completeVisualRestore = (): void => {
      if (this.ownerWheelSequence.snapshot().active) return;
      if (nativeSinkTabId && this.restoringNativeWheelSinkTabId === nativeSinkTabId) {
        this.restoringNativeWheelSinkTabId = null;
      }
      if (wasFrozen && frozenTabId && this.freezeFrameTabId === frozenTabId) {
        this.freezeFrameActive = false;
        this.freezeFrameTabId = null;
        this.sendFreezeFrame(frozenTabId, false, this.freezeFrameStore.frameFor(frozenTabId));
      }
      if (this.freezeCaptureAfterSequence) {
        this.freezeCaptureAfterSequence = false;
        if (sync && !this.disposed && this.viewport.surface === "native") {
          this.refreshFreezeFrame();
        }
      }
    };

    if (nativeSinkTabId) this.tabs.get(nativeSinkTabId)?.canvasSinkViewport.restore();
    completeVisualRestore();
  }

  private activateFreezeFrame(tabId: string): void {
    if (this.freezeFrameActive && this.freezeFrameTabId === tabId) return;
    this.freezeFrameActive = true;
    this.freezeFrameTabId = tabId;
    this.sendFreezeFrame(tabId, true, this.freezeFrameStore.frameFor(tabId));
  }

  private refreshFreezeFrame(): void {
    if (this.disposed || !this.visible || this.viewport.surface !== "native" || this.activeTabId === null) return;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab || tab.view.webContents.isDestroyed()) return;
    if (this.freezeCapturePromise) {
      this.freezeCaptureQueued = true;
      return;
    }
    const token = this.freezeFrameStore.beginCapture(tab.id);
    const contents = tab.view.webContents;
    const capture = (async (): Promise<void> => {
      try {
        const image = await contents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        const dataUrl = encodeBrowserCanvasFreezeFrame(image);
        if (!dataUrl) {
          this.freezeFrameStore.failCapture(token);
          return;
        }
        const frame = this.freezeFrameStore.commitCapture(token, dataUrl);
        if (!frame) return;
        const active = this.freezeFrameActive && this.freezeFrameTabId === frame.tabId;
        this.sendFreezeFrame(frame.tabId, active, frame.dataUrl);
      } catch {
        this.freezeFrameStore.failCapture(token);
      }
    })();
    this.freezeCapturePromise = capture;
    void capture.finally(() => {
      if (this.freezeCapturePromise === capture) this.freezeCapturePromise = null;
      if (!this.freezeCaptureQueued) return;
      this.freezeCaptureQueued = false;
      this.refreshFreezeFrame();
    });
  }

  private sendFreezeFrame(tabId: string, active: boolean, dataUrl: string | null): void {
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return;
    const payload = {
      tabId,
      generation: ++this.freezeFrameEventGeneration,
      active,
      dataUrl
    } satisfies BrowserCanvasFreezeFrameEvent;
    owner.webContents.send(IPC.browserCanvasFreezeFrame, payload);
  }

  private relayFreezePointerFromOwner(
    event: Electron.Event,
    mouse: Electron.MouseInputEvent
  ): boolean {
    const relay = this.freezePointerRelay;
    if (relay) {
      if (
        mouse.type !== "mouseMove"
        && mouse.type !== "mouseUp"
        && mouse.type !== "mouseLeave"
        && mouse.type !== "contextMenu"
      ) {
        return false;
      }
      event.preventDefault();
      relay.lastClient = { x: mouse.x, y: mouse.y };
      if (mouse.type === "mouseLeave") {
        this.cancelFreezePointerRelay();
        this.endOwnerWheelSequence("freeze-pointer-left");
        return true;
      }
      this.sendFreezePointerInput(relay.tabId, mouse, relay.button, relay.clickCount);
      if (mouse.type === "mouseUp" && mouse.button === relay.button) {
        this.freezePointerRelay = null;
        this.endOwnerWheelSequence("freeze-pointer-ended");
      }
      return true;
    }
    if (
      this.canvasNavigationActive
      || (this.canvasNavigationInput?.active ?? false)
      || this.rendererCanvasGestureActive
      || this.canvasDragTabId !== null
    ) {
      return false;
    }
    if (!this.freezeFrameActive || this.freezeFrameTabId === null || !this.pointInsideViewport(mouse)) {
      return false;
    }
    if (mouse.type === "contextMenu") {
      event.preventDefault();
      this.sendFreezePointerInput(this.freezeFrameTabId, mouse, mouse.button ?? "right", mouse.clickCount ?? 1);
      return true;
    }
    if (mouse.type !== "mouseDown" || mouse.button === undefined) return false;
    const tab = this.tabs.get(this.freezeFrameTabId);
    if (!tab || tab.view.webContents.isDestroyed()) return false;
    event.preventDefault();
    const clickCount = Math.max(1, mouse.clickCount ?? 1);
    tab.view.webContents.focus();
    this.freezePointerRelay = {
      tabId: tab.id,
      button: mouse.button,
      clickCount,
      lastClient: { x: mouse.x, y: mouse.y }
    };
    this.sendFreezePointerInput(tab.id, mouse, mouse.button, clickCount);
    return true;
  }

  private sendFreezePointerInput(
    tabId: string,
    mouse: Electron.MouseInputEvent,
    button: NonNullable<Electron.MouseInputEvent["button"]>,
    clickCount: number
  ): void {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) return;
    tab.view.webContents.sendInputEvent({
      type: mouse.type,
      x: Math.round(mouse.x - this.viewport.x),
      y: Math.round(mouse.y - this.viewport.y),
      button,
      clickCount,
      modifiers: mouse.modifiers
    });
  }

  private cancelFreezePointerRelay(): void {
    const relay = this.freezePointerRelay;
    if (!relay) return;
    this.freezePointerRelay = null;
    const tab = this.tabs.get(relay.tabId);
    if (tab && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.sendInputEvent({
        type: "mouseUp",
        x: Math.round(relay.lastClient.x - this.viewport.x),
        y: Math.round(relay.lastClient.y - this.viewport.y),
        button: relay.button,
        clickCount: relay.clickCount
      });
    }
  }

  private relayNativeWheelSinkPointerFromBrowser(
    event: Electron.Event,
    mouse: Electron.MouseInputEvent,
    owner: BrowserWindow,
    tab: BrowserTab
  ): boolean {
    const relay = this.nativeWheelSinkPointerRelay;
    if (relay?.tabId === tab.id) {
      if (relay.target === "browser") {
        if (mouse.type === "mouseUp" && mouse.button === relay.button) {
          this.nativeWheelSinkPointerRelay = null;
        }
        return false;
      }
      if (!nativeWheelSinkPointerEvent(mouse)) return false;
      event.preventDefault();
      const point = this.ownerPointerClientPoint(owner, relay.lastClient, mouse);
      relay.lastClient = point;
      this.sendNativeWheelSinkPointerToOwner(owner, mouse, relay, point);
      if (mouse.type === "mouseUp" && mouse.button === relay.button) {
        this.nativeWheelSinkPointerRelay = null;
      }
      return true;
    }

    const sink = this.nativeWheelSink;
    if (
      !sink
      || sink.tabId !== tab.id
      || (mouse.type !== "mouseDown" && mouse.type !== "contextMenu")
      || mouse.button === undefined
    ) return false;

    event.preventDefault();
    const point = this.ownerPointerClientPoint(owner, sink.pointer, mouse);
    this.endOwnerWheelSequence("native-wheel-sink-pointer");
    const target = this.viewport.surface === "native" && this.pointInsideViewport(point)
      ? "browser"
      : "owner";
    const nextRelay: BrowserNativeWheelSinkPointerRelay = {
      tabId: tab.id,
      target,
      button: mouse.button,
      clickCount: Math.max(1, mouse.clickCount ?? 1),
      lastClient: point
    };
    if (mouse.type === "mouseDown") this.nativeWheelSinkPointerRelay = nextRelay;
    if (target === "browser") {
      this.sendNativeWheelSinkPointerToBrowser(tab, mouse, nextRelay, point);
    } else {
      this.sendNativeWheelSinkPointerToOwner(owner, mouse, nextRelay, point);
    }
    return true;
  }

  private relayNativeWheelSinkPointerFromOwner(
    event: Electron.Event,
    mouse: Electron.MouseInputEvent,
    owner: BrowserWindow
  ): boolean {
    const relay = this.nativeWheelSinkPointerRelay;
    if (!relay || !nativeWheelSinkPointerEvent(mouse)) return false;
    const point = this.ownerPointerClientPoint(owner, relay.lastClient, mouse);
    relay.lastClient = point;
    if (relay.target === "owner") {
      if (mouse.type === "mouseUp" && mouse.button === relay.button) {
        this.nativeWheelSinkPointerRelay = null;
      }
      return false;
    }
    event.preventDefault();
    const tab = this.tabs.get(relay.tabId);
    if (tab && !tab.view.webContents.isDestroyed()) {
      this.sendNativeWheelSinkPointerToBrowser(tab, mouse, relay, point);
    }
    if (mouse.type === "mouseUp" && mouse.button === relay.button) {
      this.nativeWheelSinkPointerRelay = null;
    }
    return true;
  }

  private sendNativeWheelSinkPointerToBrowser(
    tab: BrowserTab,
    mouse: Electron.MouseInputEvent,
    relay: BrowserNativeWheelSinkPointerRelay,
    point: { x: number; y: number }
  ): void {
    tab.view.webContents.sendInputEvent({
      type: mouse.type,
      x: Math.round(point.x - this.viewport.x),
      y: Math.round(point.y - this.viewport.y),
      button: relay.button,
      clickCount: relay.clickCount,
      modifiers: mouse.modifiers
    });
  }

  private sendNativeWheelSinkPointerToOwner(
    owner: BrowserWindow,
    mouse: Electron.MouseInputEvent,
    relay: BrowserNativeWheelSinkPointerRelay,
    point: { x: number; y: number }
  ): void {
    owner.webContents.sendInputEvent({
      type: mouse.type,
      x: Math.round(point.x),
      y: Math.round(point.y),
      button: relay.button,
      clickCount: relay.clickCount,
      modifiers: mouse.modifiers
    });
  }

  private cancelNativeWheelSinkPointerRelay(): void {
    const relay = this.nativeWheelSinkPointerRelay;
    if (!relay) return;
    this.nativeWheelSinkPointerRelay = null;
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) return;
    const mouseUp: Electron.MouseInputEvent = {
      type: "mouseUp",
      x: relay.lastClient.x,
      y: relay.lastClient.y,
      button: relay.button,
      clickCount: relay.clickCount,
      modifiers: []
    };
    if (relay.target === "browser") {
      const tab = this.tabs.get(relay.tabId);
      if (tab && !tab.view.webContents.isDestroyed()) {
        this.sendNativeWheelSinkPointerToBrowser(tab, mouseUp, relay, relay.lastClient);
      }
    } else {
      this.sendNativeWheelSinkPointerToOwner(owner, mouseUp, relay, relay.lastClient);
    }
  }

  private ownerPointerClientPoint(
    owner: BrowserWindow,
    fallback: { x: number; y: number },
    mouse?: Electron.MouseInputEvent
  ): { x: number; y: number } {
    const globalX = mouse?.globalX;
    const globalY = mouse?.globalY;
    const pointer = typeof globalX === "number" && Number.isFinite(globalX)
      && typeof globalY === "number" && Number.isFinite(globalY)
      ? { x: globalX, y: globalY }
      : screen.getCursorScreenPoint();
    const content = owner.getContentBounds();
    const point = { x: pointer.x - content.x, y: pointer.y - content.y };
    return point.x >= 0 && point.y >= 0 && point.x < content.width && point.y < content.height
      ? point
      : { ...fallback };
  }

  private pointInsideViewport(point: { x: number; y: number }): boolean {
    return point.x >= this.viewport.x
      && point.y >= this.viewport.y
      && point.x < this.viewport.x + this.viewport.width
      && point.y < this.viewport.y + this.viewport.height;
  }

  private syncViews(): void {
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) {
      this.clipView.setVisible(false);
      return;
    }
    this.observeOwner(owner);
    const content = owner.getContentBounds();
    const visibleRectangle = browserVisibleRectangle(this.viewport, content);
    const left = visibleRectangle?.x ?? 0;
    const top = visibleRectangle?.y ?? 0;
    const right = left + (visibleRectangle?.width ?? 0);
    const bottom = top + (visibleRectangle?.height ?? 0);
    const active = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (!active || active.view.webContents.isDestroyed()) {
      this.hideClipView();
      this.syncPresenceOverlay(null);
      return;
    }

    if (this.ownerWheelSequence.shouldFreeze(visibleRectangle)) {
      this.activateFreezeFrame(active.id);
      if (this.presenceWindow && !this.presenceWindow.isDestroyed()) this.presenceWindow.hide();
      const sinkLayout = this.nativeWheelSink?.tabId === active.id
        ? browserCanvasNativeWheelSinkLayout(this.nativeWheelSink, content)
        : null;
      if (sinkLayout) {
        this.mountClipTab(owner, active);
        this.clipView.setBounds(sinkLayout.clip);
        active.view.setBounds(sinkLayout.view);
        active.view.setVisible(true);
        this.clipView.setVisible(true);
      } else {
        this.clipView.setVisible(false);
      }
      return;
    }

    const show = this.visible && this.viewport.surface === "native" && visibleRectangle !== null;
    if (!show) {
      this.hideClipView();
      this.syncPresenceOverlay(null);
      return;
    }

    this.mountClipTab(owner, active);
    this.clipView.setBounds({ x: left, y: top, width: right - left, height: bottom - top });
    this.applyPageScale(active);
    active.view.setBounds({
      x: this.viewport.x - left,
      y: this.viewport.y - top,
      width: this.viewport.width,
      height: this.viewport.height
    });
    active.view.setVisible(true);
    this.clipView.setVisible(true);
    this.syncPresenceOverlay({ owner, tabId: active.id, left, top, right, bottom });
  }

  private mountClipTab(owner: BrowserWindow, active: BrowserTab): void {
    for (const tab of this.tabs.values()) {
      if (tab.id !== active.id) tab.view.setVisible(false);
    }
    if (this.clipTabId !== active.id) {
      if (this.clipTabId) {
        const previous = this.tabs.get(this.clipTabId);
        if (previous) this.clipView.removeChildView(previous.view);
      }
      this.clipView.addChildView(active.view);
      this.clipTabId = active.id;
    }
    if (this.clipOwnerId !== owner.id) {
      owner.contentView.addChildView(this.clipView);
      this.clipOwnerId = owner.id;
    }
  }

  private applyPageScale(tab: BrowserTab): void {
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) return;
    const pageScale = this.viewport.canvasScale ?? 1;
    if (Math.abs(contents.getZoomFactor() - pageScale) > 0.001) contents.setZoomFactor(pageScale);
  }

  private browserWheelClientPoint(
    tabId: string,
    owner: BrowserWindow,
    input: unknown
  ): { x: number; y: number } {
    const contentBounds = owner.getContentBounds();
    const eventPoint = browserPageWheelClientPoint(input, {
      ownerScreenBounds: contentBounds,
      viewport: this.viewport
    });
    if (eventPoint) return eventPoint;
    const nativePoint = this.browserWheelPoint;
    if (
      nativePoint?.tabId === tabId
      && this.now() - nativePoint.observedAt < BROWSER_CANVAS_WHEEL_IDLE_MS
    ) return { ...nativePoint.point };
    const pointer = screen.getCursorScreenPoint();
    return {
      x: pointer.x - contentBounds.x,
      y: pointer.y - contentBounds.y
    };
  }

  private hideClipView(): void {
    this.pointerTabId = null;
    for (const tab of this.tabs.values()) {
      tab.view.setVisible(false);
    }
    this.clipView.setVisible(false);
  }

  private observeOwner(owner: BrowserWindow): void {
    if (this.observedOwners.has(owner)) return;
    this.observedOwners.add(owner);
    const sync = () => this.syncViews();
    owner.on("move", sync);
    owner.on("resize", sync);
    owner.on("maximize", sync);
    owner.on("unmaximize", sync);
    owner.on("show", sync);
    owner.on("hide", () => {
      this.endOwnerWheelSequence("owner-hidden", false);
      sync();
    });
    owner.on("blur", () => this.endOwnerWheelSequence("owner-blurred"));
    owner.webContents.on("before-mouse-event", (event, mouse) => {
      if (mouse.type === "mouseWheel") {
        this.beginOwnerWheelSequence({ x: mouse.x, y: mouse.y }, "native-before-mouse");
      }
      if (this.relayNativeWheelSinkPointerFromOwner(event, mouse, owner)) return;
      if (this.relayFreezePointerFromOwner(event, mouse)) return;
      this.relayNativeCanvasDragFromOwner(owner, event, mouse);
    });
    owner.once("closed", () => {
      this.endOwnerWheelSequence("owner-closed", false);
      this.destroyPresenceWindow();
    });
  }

  private relayNativeCanvasDragFromOwner(
    owner: BrowserWindow,
    event: Electron.Event,
    mouse: Electron.MouseInputEvent
  ): void {
    const tabId = this.canvasDragTabId;
    if (tabId === null) return;
    const type = mouse.type === "mouseMove"
      ? "move"
      : mouse.type === "mouseUp" && mouse.button === "left"
        ? "up"
        : mouse.type === "mouseLeave"
          ? "cancel"
          : null;
    if (type === null) return;
    if (type === "up" || type === "cancel") {
      this.canvasDragTabId = null;
      this.syncCanvasCursors();
    }
    event.preventDefault();
    const payload = {
      tabId,
      type,
      clientX: mouse.x,
      clientY: mouse.y
    } satisfies BrowserCanvasNavigationPointerEvent;
    owner.webContents.send(IPC.browserCanvasNavigationPointer, payload);
  }

  private syncPresenceOverlay(
    geometry: { owner: BrowserWindow; tabId: string; left: number; top: number; right: number; bottom: number } | null
  ): void {
    if (!geometry || !this.viewport.showAgentPresence) {
      if (geometry) void this.automation.setAgentPresences(geometry.tabId, []);
      if (this.presenceWindow && !this.presenceWindow.isDestroyed()) this.presenceWindow.hide();
      return;
    }
    const values = this.agents.forTab(geometry.tabId).filter((presence) => presence.cursor.updatedAt > 0);
    const useTrustedWindow = !(process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland");
    void this.automation.setAgentPresences(geometry.tabId, useTrustedWindow ? [] : values);
    if (!useTrustedWindow) return;
    if (values.length === 0) {
      if (this.presenceWindow && !this.presenceWindow.isDestroyed()) this.presenceWindow.hide();
      return;
    }
    const content = geometry.owner.getContentBounds();
    const overlay = this.ensurePresenceWindow(geometry.owner);
    overlay.setBounds({
      x: content.x + geometry.left,
      y: content.y + geometry.top,
      width: geometry.right - geometry.left,
      height: geometry.bottom - geometry.top
    }, false);
    const offsetX = geometry.left - this.viewport.x;
    const offsetY = geometry.top - this.viewport.y;
    const payload = values.map((presence) => ({
      id: presence.connectionId,
      color: presence.brandColor,
      x: presence.cursor.x - offsetX,
      y: presence.cursor.y - offsetY,
      stale: presence.connectionState === "stale"
    }));
    void this.presenceWindowReady?.then(async () => {
      if (overlay.isDestroyed()) return;
      await overlay.webContents.executeJavaScript(`globalThis.renderPresence(${JSON.stringify(payload).replace(/</g, "\\u003c")})`);
      overlay.showInactive();
    }).catch(() => undefined);
  }

  private ensurePresenceWindow(owner: BrowserWindow): BrowserWindow {
    if (this.presenceWindow && !this.presenceWindow.isDestroyed()) return this.presenceWindow;
    const overlay = new BrowserWindow({
      parent: owner,
      show: false,
      frame: false,
      transparent: true,
      focusable: false,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      backgroundColor: "#00000000",
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false
      }
    });
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    overlay.webContents.on("will-navigate", (event) => event.preventDefault());
    this.presenceWindow = overlay;
    this.presenceWindowReady = overlay.loadURL(presenceOverlayUrl());
    overlay.on("closed", () => {
      if (this.presenceWindow === overlay) {
        this.presenceWindow = null;
        this.presenceWindowReady = null;
      }
    });
    return overlay;
  }

  private destroyPresenceWindow(): void {
    const overlay = this.presenceWindow;
    this.presenceWindow = null;
    this.presenceWindowReady = null;
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
  }

  private touchActor(actor: BrowserActor, tabId: string | null, cursor?: BrowserPointerResult): void {
    if (!this.agents.touch(actor, tabId ?? this.activeTabId, cursor)) return;
    this.presenceChanged();
  }

  private heartbeatActor(actor: BrowserActor, timestamp: number): void {
    if (!this.agents.heartbeat(actor, timestamp)) return;
    this.presenceChanged();
  }

  private disconnectActor(actor: BrowserActor): void {
    if (!this.agents.disconnect(actor)) return;
    this.presenceChanged();
  }

  private presenceChanged(): void {
    this.syncViews();
    this.emit();
  }

  private pendingDialog(tabId: string): BrowserDialogSnapshot | null {
    const dialog = this.pendingDialogs.get(tabId);
    return dialog ? structuredClone(dialog) : null;
  }

  private visibleDialog(): BrowserDialogSnapshot | null {
    const dialog = this.activeTabId
      ? this.pendingDialogs.get(this.activeTabId) ?? this.pendingDialogs.values().next().value
      : this.pendingDialogs.values().next().value;
    return dialog ? structuredClone(dialog) : null;
  }

  private tabSnapshot(tab: BrowserTab, agents: readonly AgentPresenceSnapshot[]): BrowserTabSnapshot {
    const contents = tab.view.webContents;
    const url = this.tabUrl(tab);
    const title = contents.isDestroyed() ? "" : contents.getTitle();
    return {
      id: tab.id,
      url,
      title: title || displayUrl(url),
      loading: tab.loading,
      canGoBack: !contents.isDestroyed() && contents.navigationHistory.canGoBack(),
      canGoForward: !contents.isDestroyed() && contents.navigationHistory.canGoForward(),
      documentRevision: tab.documentRevision,
      status: tab.status,
      favicon: tab.favicon,
      agents: agents.filter((presence) => presence.currentTabId === tab.id).map((presence) => structuredClone(presence)),
      crashState: tab.crashState
    };
  }

  private persistedTabSnapshot(
    tab: PersistedBrowserTab,
    agents: readonly AgentPresenceSnapshot[]
  ): BrowserTabSnapshot {
    return {
      id: tab.id,
      url: tab.url,
      title: displayUrl(tab.url),
      loading: false,
      canGoBack: false,
      canGoForward: false,
      documentRevision: 0,
      status: "ready",
      favicon: null,
      agents: agents.filter((presence) => presence.currentTabId === tab.id).map((presence) => structuredClone(presence)),
      crashState: null
    };
  }

  private tabUrl(tab: BrowserTab): string {
    if (tab.view.webContents.isDestroyed()) return tab.lastSafeUrl;
    const current = tab.view.webContents.getURL();
    return isSafeBrowserUrl(current) ? current : tab.lastSafeUrl;
  }

  private snapshotResult(result: BrowserResult): BrowserSnapshot {
    if (!result.ok) throw new BrowserKernelError(
      result.error?.code ?? "BRIDGE_UNAVAILABLE",
      result.error?.message ?? "Browser command failed.",
      { retryable: result.error?.retryable, details: result.error?.details }
    );
    return this.getState();
  }

  private requireSession(): Session {
    if (!this.browserSession) throw new BrowserKernelError("BRIDGE_UNAVAILABLE", "Browser session is unavailable.");
    return this.browserSession;
  }

  private requireOwner(): BrowserWindow {
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed()) throw new BrowserKernelError("BRIDGE_UNAVAILABLE", "Browser host window is unavailable.");
    return owner;
  }

  private requireTab(id: string): BrowserTab {
    const tab = this.tabs.get(id);
    if (!tab) throw new BrowserKernelError("TAB_NOT_FOUND", "Browser tab is unavailable.");
    return tab;
  }

  private emit(): void {
    const owner = this.getOwner();
    if (owner && !owner.isDestroyed()) owner.webContents.send(IPC.browserState, { snapshot: this.getState() });
  }

  private emitActivity(event: BrowserActivityEvent): void {
    const owner = this.getOwner();
    if (owner && !owner.isDestroyed()) owner.webContents.send(IPC.browserActivity, { event });
  }
}

function pageWheelGeneration(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const generation = Reflect.get(value, "generation");
  return typeof generation === "number" && Number.isInteger(generation) && generation > 0
    ? generation
    : null;
}

function nativeWheelSinkPointerEvent(mouse: Electron.MouseInputEvent): boolean {
  return mouse.type === "mouseDown"
    || mouse.type === "mouseMove"
    || mouse.type === "mouseUp"
    || mouse.type === "contextMenu";
}

function downloadStatus(state: string): BrowserDownloadStatus {
  if (state === "completed") return "completed";
  if (state === "cancelled") return "canceled";
  return "interrupted";
}

function remoteBrowserWebPreferences(): WebPreferences {
  return {
    partition: BROWSER_PARTITION,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    plugins: false,
    devTools: false,
    navigateOnDragDrop: false,
    backgroundThrottling: false,
    spellcheck: true
  };
}

function displayUrl(value: string): string {
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

function presenceOverlayUrl(): string {
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>html,body,#root{position:fixed;inset:0;margin:0;overflow:hidden;background:transparent;pointer-events:none}.marker{position:absolute;transform:translate(-3px,-3px);pointer-events:none}.dot{display:block;width:10px;height:10px;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 5px #0008}</style><div id="root"></div><script>globalThis.renderPresence=(values)=>{const root=document.getElementById('root');root.replaceChildren(...values.map(v=>{const marker=document.createElement('div');marker.className='marker';marker.style.left=v.x+'px';marker.style.top=v.y+'px';marker.style.opacity=v.stale?'.45':'1';const dot=document.createElement('span');dot.className='dot';dot.style.background=v.color;marker.append(dot);return marker;}));};</script>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error("Favicon response is too large.");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Favicon response is too large.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks, size);
}
