import type { CanvasWheelCaptureMode } from "./contracts.ts";

export type CanvasNavigationPlatform = "darwin" | "other";

export interface CanvasNavigationKeyState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  pressedKeys?: ReadonlySet<string>;
}

export interface ParsedCanvasNavigationBinding {
  modifiers: readonly CanvasNavigationModifier[];
  key: string | null;
}

export type CanvasNavigationModifier = "Ctrl" | "Alt" | "Shift" | "Meta";

const MODIFIER_ORDER: readonly CanvasNavigationModifier[] = ["Ctrl", "Alt", "Shift", "Meta"];
const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);
const NAMED_KEYS = new Set([
  "Home", "End", "PageUp", "PageDown", "Space", "Enter", "Escape", "Tab",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Insert", "Backspace"
]);

export function canvasNavigationPlatform(platform: string): CanvasNavigationPlatform {
  return platform === "darwin" ? "darwin" : "other";
}

export function defaultCanvasWheelBinding(platform: CanvasNavigationPlatform): "Meta" | "Ctrl" {
  return platform === "darwin" ? "Meta" : "Ctrl";
}

export function activeCanvasWheelBinding(
  mode: CanvasWheelCaptureMode,
  binding: string | null
): string | null {
  return mode === "key" ? binding : null;
}

export function shouldCaptureWidgetWheel(
  mode: CanvasWheelCaptureMode,
  wheelOverrideActive: boolean,
  navigationOverrideActive: boolean
): boolean {
  return mode === "always"
    || (mode === "key" && wheelOverrideActive)
    || navigationOverrideActive;
}

export function parseCanvasNavigationBinding(value: unknown): ParsedCanvasNavigationBinding | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 40) return null;
  const parts = value.split("+");
  if (parts.some((part) => part.length === 0) || new Set(parts).size !== parts.length) return null;

  const modifiers: CanvasNavigationModifier[] = [];
  let key: string | null = null;
  for (const [index, part] of parts.entries()) {
    if (isCanvasNavigationModifier(part)) {
      if (key !== null) return null;
      modifiers.push(part);
      continue;
    }
    if (index !== parts.length - 1 || key !== null) return null;
    key = normalizeCanvasNavigationKey(part);
    if (!key) return null;
  }
  if (modifiers.length === 0) return null;

  return {
    modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier)),
    key
  };
}

export function normalizeCanvasNavigationBinding(
  value: unknown,
  _platform: CanvasNavigationPlatform,
  actionShortcuts: readonly string[] = []
): string | null {
  const parsed = parseCanvasNavigationBinding(value);
  if (!parsed) return null;
  const canonical = formatCanvasNavigationBinding(parsed);
  return actionShortcuts.some((shortcut) => canvasNavigationBindingConflicts(canonical, shortcut))
    ? null
    : canonical;
}

export function normalizeCanvasWheelBinding(
  value: unknown,
  _platform: CanvasNavigationPlatform,
  actionShortcuts: readonly string[] = []
): string | null {
  const parsed = parseCanvasNavigationBinding(value);
  if (!parsed) return null;
  const canonical = formatCanvasNavigationBinding(parsed);
  return actionShortcuts.some((shortcut) => canvasWheelBindingConflicts(canonical, shortcut))
    ? null
    : canonical;
}

export function formatCanvasNavigationBinding(binding: ParsedCanvasNavigationBinding): string {
  return [...binding.modifiers, binding.key].filter((part): part is string => part !== null).join("+");
}

export function isCanvasNavigationBindingActive(
  state: CanvasNavigationKeyState,
  binding: string | null
): boolean {
  if (binding === null) return false;
  const parsed = parseCanvasNavigationBinding(binding);
  if (!parsed) return false;
  if (parsed.modifiers.some((modifier) => !modifierIsActive(state, modifier))) return false;
  return parsed.key === null || state.pressedKeys?.has(parsed.key) === true;
}

export function isCanvasNavigationBindingKey(key: string, binding: string | null): boolean {
  if (binding === null) return false;
  const parsed = parseCanvasNavigationBinding(binding);
  if (!parsed) return false;
  const modifier = canvasNavigationModifierFromKey(key);
  if (modifier) return parsed.modifiers.includes(modifier);
  return parsed.key === normalizeCanvasNavigationKey(key);
}

export function normalizeCanvasNavigationInputKey(key: string, code?: string): string | null {
  if (typeof code === "string") {
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1];
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    if (digit) return digit[1];
    const codedKey = normalizeCanvasNavigationKey(code);
    if (codedKey) return codedKey;
  }
  return normalizeCanvasNavigationKey(key);
}

export function canvasNavigationBindingConflicts(binding: string, shortcut: string): boolean {
  const parsedBinding = parseCanvasNavigationBinding(binding);
  const parsedShortcut = parseShortcut(shortcut);
  if (!parsedBinding || !parsedShortcut) return false;
  if (parsedBinding.key === null) return false;
  if (parsedBinding.modifiers.some((modifier) => !parsedShortcut.modifiers.includes(modifier))) return false;
  return parsedBinding.key === parsedShortcut.key;
}

export function canvasWheelBindingConflicts(binding: string, shortcut: string): boolean {
  const parsedBinding = parseCanvasNavigationBinding(binding);
  if (!parsedBinding || parsedBinding.key === null) return false;
  return canvasNavigationBindingConflicts(binding, shortcut);
}

export function canvasNavigationModifierFromKey(key: string): CanvasNavigationModifier | null {
  if (key === "Control" || key === "Ctrl") return "Ctrl";
  if (key === "Alt") return "Alt";
  if (key === "Shift") return "Shift";
  if (key === "Meta") return "Meta";
  return null;
}

export function normalizeCanvasNavigationKey(key: string): string | null {
  if (key === " ") return "Space";
  if (key.length === 1 && /[A-Za-z0-9]/.test(key)) return key.toUpperCase();
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) return key;
  return NAMED_KEYS.has(key) ? key : null;
}

function modifierIsActive(state: CanvasNavigationKeyState, modifier: CanvasNavigationModifier): boolean {
  if (modifier === "Ctrl") return state.ctrlKey;
  if (modifier === "Alt") return state.altKey;
  if (modifier === "Shift") return state.shiftKey;
  return state.metaKey;
}

function parseShortcut(shortcut: string): { modifiers: readonly CanvasNavigationModifier[]; key: string } | null {
  const parts = shortcut.split("+");
  const key = normalizeCanvasNavigationKey(parts.at(-1) ?? "");
  if (!key) return null;
  const modifiers: CanvasNavigationModifier[] = [];
  for (const modifier of parts.slice(0, -1)) {
    if (!isCanvasNavigationModifier(modifier)) return null;
    modifiers.push(modifier);
  }
  return { modifiers, key };
}

function isCanvasNavigationModifier(value: string): value is CanvasNavigationModifier {
  return MODIFIER_SET.has(value);
}
