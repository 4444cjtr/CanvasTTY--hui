interface TerminalKeyEvent {
  type: string;
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function shouldCopyTerminalSelection(event: TerminalKeyEvent, hasSelection: boolean): boolean {
  if (event.type !== "keydown" || !hasSelection || event.altKey) return false;

  if (!matchesPhysicalOrLayoutKey(event, "KeyC", "c")) return false;

  return (event.ctrlKey && !event.metaKey)
    || (event.metaKey && !event.ctrlKey && !event.shiftKey);
}

export function shouldPasteTerminalClipboard(event: TerminalKeyEvent): boolean {
  if (event.type !== "keydown" || event.altKey) return false;

  if (event.code === "Insert" || event.key === "Insert") {
    return event.shiftKey && !event.ctrlKey && !event.metaKey;
  }
  if (!matchesPhysicalOrLayoutKey(event, "KeyV", "v")) return false;

  return (event.ctrlKey && event.shiftKey && !event.metaKey)
    || (event.metaKey && !event.ctrlKey && !event.shiftKey);
}

function matchesPhysicalOrLayoutKey(event: TerminalKeyEvent, code: string, key: string): boolean {
  return event.code === code || event.key.toLowerCase() === key;
}
