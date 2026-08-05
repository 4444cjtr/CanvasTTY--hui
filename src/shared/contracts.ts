export type ProviderId = "terminal" | "codex" | "claude" | "kimi";
export type AgentProviderId = Exclude<ProviderId, "terminal">;
export type LaunchProfileId = "normal" | "yolo";
export type SessionStatus = "idle" | "working" | "needs_approval" | "done" | "failed";
export type PaletteId = "sage" | "lilac" | "night";
export type CanvasPatternId = "dots" | "grid" | "waves" | "none";
export type LocaleId = "ru" | "en";
export type MediaFit = "cover" | "contain";

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
  mediaPath: string | null;
  mediaFit: MediaFit;
  lastDirectory: string;
  acknowledgedDangerousProfiles: AgentProviderId[];
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
  terminal: {
    list(): Promise<SessionSnapshot[]>;
    create(request: CreateSessionRequest): Promise<SessionSnapshot>;
    input(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    setBounds(id: string, bounds: SessionBounds): void;
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
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  dialogPickDirectory: "dialog:pick-directory",
  dialogPickMedia: "dialog:pick-media",
  mediaRead: "media:read",
  limitsGet: "limits:get",
  terminalList: "terminal:list",
  terminalCreate: "terminal:create",
  terminalInput: "terminal:input",
  terminalResize: "terminal:resize",
  terminalBounds: "terminal:bounds",
  terminalDispose: "terminal:dispose",
  terminalData: "terminal:data",
  terminalSession: "terminal:session",
  terminalRemoved: "terminal:removed",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowGetState: "window:get-state"
} as const;
