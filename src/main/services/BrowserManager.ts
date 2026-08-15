import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type {
  BrowserCanvasNode,
  BrowserSnapshot,
  SessionBounds
} from "../../shared/contracts.ts";
import { BrowserService, type BrowserServiceOptions } from "./BrowserService.ts";

export const MAX_BROWSER_NODES = 8;

const DEFAULT_NODE_BOUNDS: SessionBounds = {
  position: { x: 0, y: 0 },
  size: { width: 920, height: 620 }
};

export interface BrowserNode {
  id: string;
  bounds: SessionBounds;
  service: BrowserService;
}

export interface BrowserManagerOptions {
  getOwner: () => BrowserWindow | null;
  userDataPath: string;
  restoreTabs: boolean;
}

/**
 * Владеет несколькими «нодами» браузера. Каждая нода — самостоятельный
 * экземпляр BrowserService со своими вкладками, viewport'ом и хранилищем.
 */
export class BrowserManager {
  private readonly nodes = new Map<string, BrowserNode>();
  private readonly getOwner: () => BrowserWindow | null;
  private readonly userDataPath: string;
  private readonly restoreTabs: boolean;

  constructor(options: BrowserManagerOptions) {
    this.getOwner = options.getOwner;
    this.userDataPath = options.userDataPath;
    this.restoreTabs = options.restoreTabs;
  }

  get size(): number {
    return this.nodes.size;
  }

  list(): BrowserCanvasNode[] {
    return [...this.nodes.values()].map((node) => ({
      id: node.id,
      bounds: { ...node.bounds }
    }));
  }

  get(id: string): BrowserService | null {
    return this.nodes.get(id)?.service ?? null;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  async create(
    bounds: SessionBounds,
    options: { windowId?: string; url?: string } = {}
  ): Promise<BrowserNode> {
    if (this.nodes.size >= MAX_BROWSER_NODES) {
      throw new Error(`CanvasTTY supports at most ${MAX_BROWSER_NODES} browser nodes.`);
    }
    const id = options.windowId ?? randomUUID();
    if (this.nodes.has(id)) throw new Error(`Browser node already exists: ${id}`);
    const nodeDir = join(this.userDataPath, "browser-nodes", id);
    const serviceOptions: BrowserServiceOptions = {
      windowId: id,
      userDataPath: nodeDir,
      restoreTabs: this.restoreTabs
    };
    const service = new BrowserService(this.getOwner, serviceOptions);
    const node: BrowserNode = { id, bounds: { ...bounds }, service };
    this.nodes.set(id, node);
    await service.ready();
    if (options.url) await service.open(options.url);
    return node;
  }

  async dispose(id: string): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;
    await node.service.dispose();
    this.nodes.delete(id);
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled(
      [...this.nodes.values()].map((node) => node.service.dispose())
    );
    this.nodes.clear();
  }

  /** Первая (или единственная) нода — для обратной совместимости. */
  first(): BrowserService | null {
    return this.nodes.values().next().value?.service ?? null;
  }

  /** Core ноды по windowId (null = default); null, если ноды нет. */
  resolveCore(windowId: string | null): import("./browser/BrowserCore.ts").BrowserCore | null {
    if (windowId) return this.get(windowId)?.core ?? null;
    const service = this.get("default") ?? this.first();
    return service?.core ?? null;
  }

  async open(windowId: string | null, url?: string): Promise<BrowserSnapshot> {
    let service = this.resolve(windowId);
    if (!service && windowId) {
      // Запрошенная нода не найдена — попытка создать её лениво.
      service = (await this.tryCreate(windowId)).service;
    }
    if (!service) {
      // Нод нет вовсе — создаём дефолтную (как при первом открытии браузера).
      const node = await this.create(DEFAULT_NODE_BOUNDS, { windowId: "default" });
      service = node.service;
    }
    return service.open(url);
  }

  private async tryCreate(id: string): Promise<BrowserNode> {
    return this.create(DEFAULT_NODE_BOUNDS, { windowId: id });
  }

  async getState(windowId: string | null): Promise<BrowserSnapshot> {
    const service = this.resolve(windowId);
    if (!service) return EMPTY_NODE_SNAPSHOT;
    return service.getState();
  }

  private resolve(windowId: string | null): BrowserService | null {
    if (windowId) return this.get(windowId);
    return this.first();
  }
}

const EMPTY_NODE_SNAPSHOT: BrowserSnapshot = {
  tabs: [],
  activeTabId: null,
  visible: false,
  agents: [],
  downloads: [],
  pendingDialog: null
};
