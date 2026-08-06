import type { BrowserViewportBounds } from "../../../shared/contracts.ts";

export function normalizeBrowserViewportBounds(value: unknown): BrowserViewportBounds | null {
  if (!value || typeof value !== "object") return null;
  const bounds = value as BrowserViewportBounds;
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return null;

  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  const left = Math.floor(bounds.x);
  const top = Math.floor(bounds.y);
  const right = width === 0 ? left : Math.ceil(bounds.x + width);
  const bottom = height === 0 ? top : Math.ceil(bounds.y + height);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    visible: bounds.visible === true,
    ...(Number.isFinite(bounds.canvasScale) ? { canvasScale: bounds.canvasScale } : {}),
    captureCanvasWheel: bounds.captureCanvasWheel === true
  };
}
