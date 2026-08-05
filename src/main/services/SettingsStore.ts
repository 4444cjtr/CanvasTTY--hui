import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type {
  AgentProviderId,
  AppSettings,
  CanvasPatternId,
  EdgePanSpeed,
  FocusActivation,
  LocaleId,
  MediaFit,
  PaletteId,
  ShortcutBindings,
  ZoomSensitivity
} from "../../shared/contracts";

const LOCALES = new Set<LocaleId>(["ru", "en"]);
const PALETTES = new Set<PaletteId>(["sage", "lilac", "night"]);
const PATTERNS = new Set<CanvasPatternId>(["dots", "grid", "waves", "none"]);
const MEDIA_FITS = new Set<MediaFit>(["cover", "contain"]);
const AGENT_PROVIDERS = new Set<AgentProviderId>(["codex", "claude", "kimi"]);
const EDGE_PAN_SPEEDS = new Set<EdgePanSpeed>(["slow", "normal", "fast"]);
const ZOOM_SENSITIVITIES = new Set<ZoomSensitivity>(["slow", "normal", "fast"]);
const FOCUS_ACTIVATIONS = new Set<FocusActivation>(["off", "single", "double"]);
const SHORTCUT_MODIFIERS = new Set(["Ctrl", "Alt", "Shift", "Meta"]);
const DEFAULT_SHORTCUTS: ShortcutBindings = { home: "Home", renameWindow: "F2" };

export class SettingsStore {
  private readonly filePath: string;
  private value: AppSettings;
  private writeQueue = Promise.resolve();

  constructor(userDataPath: string, systemLocale: string) {
    this.filePath = join(userDataPath, "settings.json");
    this.value = createDefaults(systemLocale);
  }

  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.value = normalizeSettings(JSON.parse(raw), this.value);
    } catch (error) {
      if (isMissingFile(error)) {
        await this.persist();
      } else {
        console.warn("CanvasTTY settings could not be loaded; defaults are used.", error);
      }
    }

    return this.get();
  }

  get(): AppSettings {
    return structuredClone(this.value);
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.value = normalizeSettings({ ...this.value, ...patch }, this.value);
    await this.persist();
    return this.get();
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.value, null, 2);
    const temporaryPath = `${this.filePath}.tmp`;

    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(temporaryPath, snapshot, "utf8");
      await rename(temporaryPath, this.filePath);
    });

    return this.writeQueue;
  }
}

function createDefaults(systemLocale: string): AppSettings {
  return {
    locale: systemLocale.toLowerCase().startsWith("ru") ? "ru" : "en",
    palette: "sage",
    pattern: "dots",
    snapToGrid: true,
    edgePan: false,
    edgePanSpeed: "normal",
    zoomSensitivity: "normal",
    focusActivation: "off",
    showShortcutHints: true,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    mediaPath: null,
    mediaFit: "cover",
    lastDirectory: homedir(),
    acknowledgedDangerousProfiles: []
  };
}

export function normalizeSettings(candidate: unknown, fallback: AppSettings): AppSettings {
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  const source = candidate as Partial<AppSettings>;
  const mediaPath = source.mediaPath === null || typeof source.mediaPath === "string"
    ? source.mediaPath
    : fallback.mediaPath;
  const acknowledged = Array.isArray(source.acknowledgedDangerousProfiles)
    ? source.acknowledgedDangerousProfiles.filter(
      (provider): provider is AgentProviderId => AGENT_PROVIDERS.has(provider as AgentProviderId)
    )
    : fallback.acknowledgedDangerousProfiles;
  const shortcuts = normalizeShortcuts(source.shortcuts, fallback.shortcuts);

  return {
    locale: LOCALES.has(source.locale as LocaleId) ? source.locale as LocaleId : fallback.locale,
    palette: PALETTES.has(source.palette as PaletteId) ? source.palette as PaletteId : fallback.palette,
    pattern: PATTERNS.has(source.pattern as CanvasPatternId)
      ? source.pattern as CanvasPatternId
      : fallback.pattern,
    snapToGrid: typeof source.snapToGrid === "boolean" ? source.snapToGrid : fallback.snapToGrid,
    edgePan: typeof source.edgePan === "boolean" ? source.edgePan : fallback.edgePan,
    edgePanSpeed: EDGE_PAN_SPEEDS.has(source.edgePanSpeed as EdgePanSpeed)
      ? source.edgePanSpeed as EdgePanSpeed
      : fallback.edgePanSpeed,
    zoomSensitivity: ZOOM_SENSITIVITIES.has(source.zoomSensitivity as ZoomSensitivity)
      ? source.zoomSensitivity as ZoomSensitivity
      : fallback.zoomSensitivity,
    focusActivation: FOCUS_ACTIVATIONS.has(source.focusActivation as FocusActivation)
      ? source.focusActivation as FocusActivation
      : fallback.focusActivation,
    showShortcutHints: typeof source.showShortcutHints === "boolean"
      ? source.showShortcutHints
      : fallback.showShortcutHints,
    shortcuts,
    mediaPath,
    mediaFit: MEDIA_FITS.has(source.mediaFit as MediaFit) ? source.mediaFit as MediaFit : fallback.mediaFit,
    lastDirectory: typeof source.lastDirectory === "string" && source.lastDirectory.length > 0
      ? source.lastDirectory
      : fallback.lastDirectory,
    acknowledgedDangerousProfiles: [...new Set(acknowledged)]
  };
}

function normalizeShortcuts(candidate: unknown, fallback: ShortcutBindings): ShortcutBindings {
  const source = candidate && typeof candidate === "object"
    ? candidate as Partial<ShortcutBindings>
    : {};
  const shortcuts = {
    home: isValidShortcut(source.home) ? source.home : fallback.home,
    renameWindow: isValidShortcut(source.renameWindow) ? source.renameWindow : fallback.renameWindow
  };

  if (shortcuts.home.toLowerCase() === shortcuts.renameWindow.toLowerCase()) {
    return { ...fallback };
  }
  return shortcuts;
}

function isValidShortcut(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) return false;
  const parts = value.split("+");
  if (parts.some((part) => part.length === 0) || new Set(parts).size !== parts.length) return false;
  const key = parts.at(-1);
  if (!key || parts.slice(0, -1).some((part) => !SHORTCUT_MODIFIERS.has(part))) return false;
  return /^[A-Z0-9]$/i.test(key)
    || /^F(?:[1-9]|1\d|2[0-4])$/.test(key)
    || new Set([
      "Home", "End", "PageUp", "PageDown", "Space", "Enter", "Escape", "Tab",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Insert", "Backspace"
    ]).has(key);
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
