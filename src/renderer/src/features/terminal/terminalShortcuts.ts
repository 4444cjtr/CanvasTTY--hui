interface TerminalKeyEvent {
  type: string;
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export function shouldCopyTerminalSelection(event: TerminalKeyEvent, hasSelection: boolean): boolean {
  if (event.type !== "keydown" || !hasSelection || event.altKey) return false;

  if (event.key.toLowerCase() !== "c") return false;

  return (event.ctrlKey && event.shiftKey && !event.metaKey)
    || (event.metaKey && !event.ctrlKey && !event.shiftKey);
}
