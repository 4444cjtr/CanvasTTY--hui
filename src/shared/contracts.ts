export type ProviderId = "terminal" | "codex" | "claude" | "kimi";
export type AgentProviderId = Exclude<ProviderId, "terminal">;
export type LaunchProfileId = "normal" | "yolo";
export type SessionStatus = "idle" | "working" | "needs_approval" | "done" | "failed";
export type PaletteId = "sage" | "lilac" | "night";
export type CanvasPatternId = "dots" | "grid" | "waves" | "none";
export type LocaleId = "ru" | "en";
export type MediaFit = "cover" | "contain";
export type EdgePanSpeed = "slow" | "normal" | "fast";
export type ZoomSensitivity = "slow" | "normal" | "fast";
export type FocusActivation = "off" | "single" | "double";
export type ShortcutAction = "home" | "renameWindow";

export const HOME_GRID_MIN_COLUMNS = 12;
export const HOME_GRID_MIN_ROWS = 8;
export const HOME_GRID_MAX_COLUMNS = 48;
export const HOME_GRID_MAX_ROWS = 36;
export const HOME_GRID_CELL_WIDTH = 82;
export const HOME_GRID_CELL_HEIGHT = 72;
export const HOME_GRID_GAP = 18;

export interface HomeGridSize {
  columns: number;
  rows: number;
}

export const DEFAULT_HOME_GRID_SIZE: HomeGridSize = {
  columns: 16,
  rows: 12
};

export type CoreHomeWidgetId =
  | "core.limits"
  | "core.sessions"
  | "core.clock"
  | "core.media"
  | "core.launcher"
  | "core.settings";

export interface HomeWidgetPlacement {
  widgetId: string;
  column: number;
  row: number;
  columnSpan: number;
  rowSpan: number;
}

export const DEFAULT_HOME_LAYOUT: HomeWidgetPlacement[] = [
  { widgetId: "core.limits", column: 0, row: 0, columnSpan: 7, rowSpan: 3 },
  { widgetId: "core.sessions", column: 7, row: 0, columnSpan: 5, rowSpan: 3 },
  { widgetId: "core.clock", column: 0, row: 3, columnSpan: 9, rowSpan: 3 },
  { widgetId: "core.media", column: 9, row: 3, columnSpan: 3, rowSpan: 3 },
  { widgetId: "core.launcher", column: 0, row: 6, columnSpan: 10, rowSpan: 2 },
  { widgetId: "core.settings", column: 10, row: 6, columnSpan: 2, rowSpan: 2 }
];

export interface ShortcutBindings {
  home: string;
  renameWindow: string;
}

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  home: "Home",
  renameWindow: "F2"
};

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SessionBounds {
  position: Point;
  size: Size;
}

export interface CameraState extends Point {
  zoom: number;
}

export interface AppSettings {
  locale: LocaleId;
  palette: PaletteId;
  pattern: CanvasPatternId;
  snapToGrid: boolean;
  edgePan: boolean;
  edgePanSpeed: EdgePanSpeed;
  zoomSensitivity: ZoomSensitivity;
  focusActivation: FocusActivation;
  showShortcutHints: boolean;
  shortcuts: ShortcutBindings;
  mediaPath: string | null;
  mediaFit: MediaFit;
  lastDirectory: string;
  acknowledgedDangerousProfiles: AgentProviderId[];
  homeGridSize: HomeGridSize;
  homeLayout: HomeWidgetPlacement[];
  pluginCanvas: PluginCanvasInstance[];
  browserCanvas: BrowserCanvasState | null;
}

export interface CreateSessionRequest {
  provider: ProviderId;
  cwd: string;
  profile: LaunchProfileId;
  position: Point;
  title?: string;
}

export interface SessionMetadata {
  id: string;
  provider: ProviderId;
  profile: LaunchProfileId;
  title: string;
  titleCustomized: boolean;
  cwd: string;
  position: Point;
  size: Size;
  status: SessionStatus;
  startedAt: number;
  exitCode: number | null;
}

export interface SessionSnapshot extends SessionMetadata {
  buffer: string;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface SessionEvent {
  session: SessionMetadata;
}

export interface SessionRemovedEvent {
  id: string;
}

export interface MediaSelection {
  path: string;
  dataUrl: string;
}

export interface WindowState {
  maximized: boolean;
}

export const PLUGIN_API_VERSION = 1;

export type PluginPermission =
  | "storage"
  | "sessions:read"
  | "limits:read"
  | "launcher:open"
  | "external:open"
  | "media:library"
  | "playlists:read"
  | "playlists:write"
  | "network";

export interface PluginGridSize extends HomeGridSize {}

export interface PluginContributionBase {
  id: string;
  title: string;
  description?: string;
  entry: string;
  icon?: string;
}

export interface PluginHomeWidgetContribution extends PluginContributionBase {
  kind: "home-widget";
  defaultSize: PluginGridSize;
}

export interface PluginCanvasAppContribution extends PluginContributionBase {
  kind: "canvas-app";
  defaultSize: Size;
}

export interface PluginWindowContribution extends PluginContributionBase {
  kind: "window";
  defaultSize: Size;
}

export type PluginContribution =
  | PluginHomeWidgetContribution
  | PluginCanvasAppContribution
  | PluginWindowContribution;

export interface PluginManifest {
  apiVersion: typeof PLUGIN_API_VERSION;
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  permissions: PluginPermission[];
  contributions: PluginContribution[];
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  sourceUrl: string;
  enabled: boolean;
  installedAt: number;
}

export interface PluginInstallPreview {
  token: string;
  sourceUrl: string;
  manifest: PluginManifest;
  expiresAt: number;
}

export interface PluginCanvasInstance {
  id: string;
  pluginId: string;
  contributionId: string;
  title: string;
  position: Point;
  size: Size;
}

export interface PluginSessionInfo {
  id: string;
  provider: ProviderId;
  title: string;
  status: SessionStatus;
  startedAt: number;
  exitCode: number | null;
}

export interface PluginLauncherRequest {
  provider: ProviderId;
}

export interface PluginMediaLibrary {
  id: string;
  name: string;
}

export interface PluginMediaTrack {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  streamUrl: string;
}

export interface PluginPlaylistFile {
  id: string;
  name: string;
  relativePath: string;
  size: number;
}

export interface BrowserCanvasState extends SessionBounds {}

export interface BrowserViewportBounds extends Size {
  x: number;
  y: number;
  visible: boolean;
}

export interface BrowserTabSnapshot {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserSnapshot {
  tabs: BrowserTabSnapshot[];
  activeTabId: string | null;
}

export interface BrowserStateEvent {
  snapshot: BrowserSnapshot;
}

export type LimitSource = "codex-app-server" | "claude-usage-api" | "kimi-usage-api";
export type LimitUnavailableReason =
  | "cli-not-found"
  | "not-authenticated"
  | "subscription-required"
  | "unsupported-protocol"
  | "timeout"
  | "protocol-error";

export interface LimitWindow {
  id: string;
  bucketId: string;
  slot: "primary" | "secondary";
  isDefaultBucket: boolean;
  label: string | null;
  usedPercent: number | null;
  used: number | null;
  limit: number | null;
  windowMinutes: number | null;
  resetsAt: number | null;
}

export type ProviderLimitsSnapshot =
  | {
    provider: AgentProviderId;
    state: "available";
    source: LimitSource;
    fetchedAt: number;
    windows: LimitWindow[];
  }
  | {
    provider: AgentProviderId;
    state: "stale";
    source: LimitSource;
    fetchedAt: number;
    failedAt: number;
    reason: LimitUnavailableReason;
    windows: LimitWindow[];
  }
  | {
    provider: AgentProviderId;
    state: "unavailable";
    source: LimitSource;
    checkedAt: number;
    reason: LimitUnavailableReason;
  };

export interface LimitsSnapshot {
  fetchedAt: number;
  providers: ProviderLimitsSnapshot[];
}

export interface CanvasTTYApi {
  clipboard: {
    writeText(text: string): void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
  };
  dialog: {
    pickDirectory(defaultPath?: string): Promise<string | null>;
    pickMedia(): Promise<MediaSelection | null>;
  };
  media: {
    read(path: string): Promise<string | null>;
  };
  limits: {
    get(): Promise<LimitsSnapshot>;
  };
  plugins: {
    list(): Promise<InstalledPlugin[]>;
    previewInstall(sourceUrl: string): Promise<PluginInstallPreview>;
    install(token: string): Promise<InstalledPlugin>;
    setEnabled(pluginId: string, enabled: boolean): Promise<InstalledPlugin>;
    uninstall(pluginId: string): Promise<void>;
    openWindow(pluginId: string, contributionId: string): Promise<void>;
    openExternal(pluginId: string, url: string): Promise<void>;
    storageGet(pluginId: string, key: string): Promise<unknown>;
    storageSet(pluginId: string, key: string, value: unknown): Promise<void>;
    mediaPickLibrary(pluginId: string): Promise<PluginMediaLibrary | null>;
    mediaListLibraries(pluginId: string): Promise<PluginMediaLibrary[]>;
    mediaScanLibrary(pluginId: string, libraryId: string): Promise<PluginMediaTrack[]>;
    mediaRevokeLibrary(pluginId: string, libraryId: string): Promise<void>;
    playlistsList(pluginId: string, libraryId: string): Promise<PluginPlaylistFile[]>;
    playlistsRead(pluginId: string, libraryId: string, playlistId: string): Promise<string>;
    playlistsWrite(pluginId: string, libraryId: string, name: string, content: string): Promise<PluginPlaylistFile>;
    onOpenLauncher(listener: (event: PluginLauncherRequest) => void): () => void;
  };
  browser: {
    getState(): Promise<BrowserSnapshot>;
    open(url?: string): Promise<BrowserSnapshot>;
    close(): Promise<void>;
    newTab(url?: string): Promise<BrowserSnapshot>;
    selectTab(id: string): Promise<BrowserSnapshot>;
    closeTab(id: string): Promise<BrowserSnapshot>;
    navigate(id: string, value: string): Promise<BrowserSnapshot>;
    back(id: string): Promise<BrowserSnapshot>;
    forward(id: string): Promise<BrowserSnapshot>;
    reload(id: string): Promise<BrowserSnapshot>;
    setViewport(bounds: BrowserViewportBounds): void;
    onState(listener: (event: BrowserStateEvent) => void): () => void;
  };
  terminal: {
    list(): Promise<SessionSnapshot[]>;
    create(request: CreateSessionRequest): Promise<SessionSnapshot>;
    input(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    setBounds(id: string, bounds: SessionBounds): void;
    rename(id: string, title: string): Promise<SessionMetadata>;
    dispose(id: string): Promise<void>;
    onData(listener: (event: TerminalDataEvent) => void): () => void;
    onSession(listener: (event: SessionEvent) => void): () => void;
    onRemoved(listener: (event: SessionRemovedEvent) => void): () => void;
  };
  window: {
    minimize(): void;
    toggleMaximize(): Promise<WindowState>;
    close(): void;
    getState(): Promise<WindowState>;
  };
}

export const IPC = {
  clipboardWrite: "clipboard:write",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  dialogPickDirectory: "dialog:pick-directory",
  dialogPickMedia: "dialog:pick-media",
  mediaRead: "media:read",
  limitsGet: "limits:get",
  pluginsList: "plugins:list",
  pluginsPreviewInstall: "plugins:preview-install",
  pluginsInstall: "plugins:install",
  pluginsSetEnabled: "plugins:set-enabled",
  pluginsUninstall: "plugins:uninstall",
  pluginsOpenWindow: "plugins:open-window",
  pluginsOpenExternal: "plugins:open-external",
  pluginsStorageGet: "plugins:storage-get",
  pluginsStorageSet: "plugins:storage-set",
  pluginsMediaPickLibrary: "plugins:media-pick-library",
  pluginsMediaListLibraries: "plugins:media-list-libraries",
  pluginsMediaScanLibrary: "plugins:media-scan-library",
  pluginsMediaRevokeLibrary: "plugins:media-revoke-library",
  pluginsPlaylistsList: "plugins:playlists-list",
  pluginsPlaylistsRead: "plugins:playlists-read",
  pluginsPlaylistsWrite: "plugins:playlists-write",
  pluginsHostInvoke: "plugins:host-invoke",
  pluginsLauncherRequested: "plugins:launcher-requested",
  browserGetState: "browser:get-state",
  browserOpen: "browser:open",
  browserClose: "browser:close",
  browserNewTab: "browser:new-tab",
  browserSelectTab: "browser:select-tab",
  browserCloseTab: "browser:close-tab",
  browserNavigate: "browser:navigate",
  browserBack: "browser:back",
  browserForward: "browser:forward",
  browserReload: "browser:reload",
  browserSetViewport: "browser:set-viewport",
  browserState: "browser:state",
  terminalList: "terminal:list",
  terminalCreate: "terminal:create",
  terminalInput: "terminal:input",
  terminalResize: "terminal:resize",
  terminalBounds: "terminal:bounds",
  terminalRename: "terminal:rename",
  terminalDispose: "terminal:dispose",
  terminalData: "terminal:data",
  terminalSession: "terminal:session",
  terminalRemoved: "terminal:removed",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowGetState: "window:get-state"
} as const;
