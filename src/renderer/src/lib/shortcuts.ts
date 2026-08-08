const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

interface ShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function shortcutFromKeyboardEvent(event: ShortcutEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key = normalizeKey(event.key);
  if (!key) return null;

  return [
    event.ctrlKey ? "Ctrl" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    event.metaKey ? "Meta" : null,
    key
  ].filter(Boolean).join("+");
}

export function matchesShortcut(event: ShortcutEvent, shortcut: string): boolean {
  return shortcutFromKeyboardEvent(event)?.toLowerCase() === shortcut.toLowerCase();
}

export function isShortcutCaptureTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-shortcut-capture="true"]'));
}

export function isRenameInputTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-terminal-rename="true"]'));
}

export function displayCanvasNavigationBinding(binding: string, isMacOS: boolean): string {
  if (!isMacOS) return binding;
  return binding.split("+").map((part) => {
    if (part === "Alt") return "Option";
    if (part === "Meta") return "Command";
    return part;
  }).join("+");
}

function normalizeKey(key: string): string | null {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) return key;
  if (new Set([
    "Home", "End", "PageUp", "PageDown", "Enter", "Escape", "Tab",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Insert", "Backspace"
  ]).has(key)) return key;
  return null;
}
