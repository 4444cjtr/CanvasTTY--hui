import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { basename } from "node:path";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import type {
  CreateSessionRequest,
  Point,
  ProviderId,
  SessionBounds,
  SessionEvent,
  SessionMetadata,
  SessionRemovedEvent,
  SessionSnapshot,
  TerminalDataEvent
} from "../../shared/contracts";
import { IPC } from "../../shared/contracts";

const MAX_SCROLLBACK_BYTES = 240_000;
const DEFAULT_TERMINAL_SIZE = { width: 700, height: 430 };
const MIN_TERMINAL_SIZE = { width: 420, height: 260 };
const MAX_TERMINAL_SIZE = { width: 1_600, height: 1_100 };

interface ManagedSession {
  metadata: SessionMetadata;
  process: IPty;
  buffer: string;
}

export interface ProviderLifecycleSignal {
  kind: "lifecycle";
  state: "idle" | "working" | "needs_approval";
  requestId?: string;
}

type Emit = (
  channel: typeof IPC.terminalData | typeof IPC.terminalSession | typeof IPC.terminalRemoved,
  payload: TerminalDataEvent | SessionEvent | SessionRemovedEvent
) => void;

export class TerminalManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly emit: Emit) {}

  list(): SessionSnapshot[] {
    return [...this.sessions.values()].map((session) => snapshot(session));
  }

  create(request: CreateSessionRequest): SessionSnapshot {
    assertCreateRequest(request);
    assertDirectory(request.cwd);

    const launch = resolveLaunch(request.provider, request.profile);
    const id = randomUUID();
    const metadata: SessionMetadata = {
      id,
      provider: request.provider,
      profile: request.profile,
      title: request.title?.trim() || defaultTitle(request.provider, request.cwd),
      titleCustomized: Boolean(request.title?.trim()),
      cwd: request.cwd,
      position: request.position,
      size: DEFAULT_TERMINAL_SIZE,
      status: "idle",
      startedAt: Date.now(),
      exitCode: null
    };

    const process = pty.spawn(launch.command, launch.args, {
      name: "xterm-256color",
      cols: 100,
      rows: 30,
      cwd: request.cwd,
      env: terminalEnvironment()
    });

    const session: ManagedSession = { metadata, process, buffer: "" };
    this.sessions.set(id, session);
    process.onData((data) => {
      const current = this.sessions.get(id);
      if (!current) return;

      current.buffer = `${current.buffer}${data}`.slice(-MAX_SCROLLBACK_BYTES);
      this.emit(IPC.terminalData, { id, data });
    });

    process.onExit(({ exitCode }) => {
      const current = this.sessions.get(id);
      if (!current) return;

      current.metadata.exitCode = exitCode;
      current.metadata.status = exitCode === 0 ? "done" : "failed";
      this.emitSession(current.metadata);
    });

    this.emitSession(metadata);
    return snapshot(session);
  }

  input(id: string, data: string): void {
    if (typeof data !== "string" || data.length === 0) return;
    this.sessions.get(id)?.process.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    const safeCols = Math.max(20, Math.min(400, Math.floor(cols)));
    const safeRows = Math.max(5, Math.min(200, Math.floor(rows)));
    this.sessions.get(id)?.process.resize(safeCols, safeRows);
  }

  setBounds(id: string, bounds: SessionBounds): void {
    if (!isSessionBounds(bounds)) return;
    const session = this.sessions.get(id);
    if (!session) return;

    session.metadata.position = bounds.position;
    session.metadata.size = {
      width: clamp(bounds.size.width, MIN_TERMINAL_SIZE.width, MAX_TERMINAL_SIZE.width),
      height: clamp(bounds.size.height, MIN_TERMINAL_SIZE.height, MAX_TERMINAL_SIZE.height)
    };
    this.emitSession(session.metadata);
  }

  rename(id: string, title: string): SessionMetadata {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Terminal session does not exist.");
    if (typeof title !== "string") throw new Error("Window title is invalid.");

    const nextTitle = title.trim();
    if (nextTitle.length === 0) throw new Error("Window title cannot be empty.");
    session.metadata.title = nextTitle.slice(0, 80);
    session.metadata.titleCustomized = true;
    this.emitSession(session.metadata);
    return structuredClone(session.metadata);
  }

  applyProviderSignal(id: string, signal: ProviderLifecycleSignal): void {
    const session = this.sessions.get(id);
    if (!session || session.metadata.status === "done" || session.metadata.status === "failed") return;

    const nextStatus = signal.state;
    if (session.metadata.status === nextStatus) return;
    session.metadata.status = nextStatus;
    this.emitSession(session.metadata);
  }

  dispose(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;

    this.sessions.delete(id);
    try {
      session.process.kill();
    } catch (error) {
      console.warn(`PTY ${id} could not be killed cleanly.`, error);
    }
    this.emit(IPC.terminalRemoved, { id });
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.dispose(id);
    }
  }

  private emitSession(metadata: SessionMetadata): void {
    this.emit(IPC.terminalSession, { session: structuredClone(metadata) });
  }
}

function resolveLaunch(provider: ProviderId, profile: CreateSessionRequest["profile"]): {
  command: string;
  args: string[];
} {
  if (provider === "terminal") {
    return { command: process.env.SHELL || "/bin/bash", args: ["-l"] };
  }

  const command: Record<Exclude<ProviderId, "terminal">, string> = {
    codex: "codex",
    claude: "claude",
    kimi: "kimi"
  };
  const dangerousArgs: Record<Exclude<ProviderId, "terminal">, string[]> = {
    codex: ["--dangerously-bypass-approvals-and-sandbox"],
    claude: ["--dangerously-skip-permissions"],
    kimi: ["--yolo"]
  };

  return {
    command: command[provider],
    args: profile === "yolo" ? dangerousArgs[provider] : []
  };
}

function terminalEnvironment(): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  return { ...environment, TERM: "xterm-256color", COLORTERM: "truecolor" };
}

function defaultTitle(provider: ProviderId, cwd: string): string {
  const project = basename(cwd) || cwd;
  if (provider === "terminal") return `Terminal · ${project}`;
  return `${project} · ${provider[0].toUpperCase()}${provider.slice(1)}`;
}

function assertDirectory(cwd: string): void {
  try {
    if (!statSync(cwd).isDirectory()) throw new Error("Not a directory");
  } catch {
    throw new Error(`Project folder does not exist: ${cwd}`);
  }
}

function assertCreateRequest(request: CreateSessionRequest): void {
  const providers = new Set<ProviderId>(["terminal", "codex", "claude", "kimi"]);
  if (!request || !providers.has(request.provider)) throw new Error("Unknown terminal provider.");
  if (request.profile !== "normal" && request.profile !== "yolo") throw new Error("Unknown launch profile.");
  if (typeof request.cwd !== "string" || request.cwd.length === 0) throw new Error("Project folder is required.");
  if (!isPoint(request.position)) throw new Error("Session position is invalid.");
}

function isPoint(value: unknown): value is Point {
  return Boolean(
    value
    && typeof value === "object"
    && "x" in value
    && "y" in value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
  );
}

function isSessionBounds(value: unknown): value is SessionBounds {
  if (!value || typeof value !== "object" || !("position" in value) || !("size" in value)) return false;
  const size = value.size;
  return isPoint(value.position)
    && Boolean(
      size
      && typeof size === "object"
      && "width" in size
      && "height" in size
      && Number.isFinite(size.width)
      && Number.isFinite(size.height)
    );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapshot(session: ManagedSession): SessionSnapshot {
  return { ...structuredClone(session.metadata), buffer: session.buffer };
}
