import type { ZoomSensitivity } from "../../../../shared/contracts";
import { wheelZoomFactor } from "./zoom.ts";

const LINE_DELTA_PIXELS = 16;
const MIN_MODIFIER_ZOOM_FACTOR = 0.75;
const MAX_MODIFIER_ZOOM_FACTOR = 1.25;

export interface CanvasWheelDeltas {
  deltaX: number;
  deltaY: number;
}

export type CanvasWheelIntent =
  | { kind: "pan"; deltaX: number; deltaY: number }
  | { kind: "zoom"; factor: number; source: "modifier" | "wheel" };

export interface CanvasWheelIntentSettings {
  invertCanvasWheel: boolean;
  useScrollWheelToZoom: boolean;
  zoomSensitivity: ZoomSensitivity;
}

export function normalizeCanvasWheelDeltas(
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  viewport: { width: number; height: number }
): CanvasWheelDeltas {
  const safeX = Number.isFinite(deltaX) ? deltaX : 0;
  const safeY = Number.isFinite(deltaY) ? deltaY : 0;
  if (deltaMode === 1) {
    return { deltaX: safeX * LINE_DELTA_PIXELS, deltaY: safeY * LINE_DELTA_PIXELS };
  }
  if (deltaMode === 2) {
    return {
      deltaX: safeX * Math.max(0, viewport.width),
      deltaY: safeY * Math.max(0, viewport.height)
    };
  }
  return { deltaX: safeX, deltaY: safeY };
}

export function canvasWheelIntent(
  deltas: CanvasWheelDeltas,
  modifiers: { ctrlKey: boolean; metaKey: boolean },
  settings: CanvasWheelIntentSettings
): CanvasWheelIntent {
  if (modifiers.ctrlKey || modifiers.metaKey) {
    return {
      kind: "zoom",
      factor: clamp(Math.exp(-deltas.deltaY / 100), MIN_MODIFIER_ZOOM_FACTOR, MAX_MODIFIER_ZOOM_FACTOR),
      source: "modifier"
    };
  }
  if (settings.useScrollWheelToZoom) {
    const deltaY = settings.invertCanvasWheel ? -deltas.deltaY : deltas.deltaY;
    return {
      kind: "zoom",
      factor: wheelZoomFactor(deltaY, settings.zoomSensitivity),
      source: "wheel"
    };
  }
  const multiplier = settings.invertCanvasWheel ? -1 : 1;
  return {
    kind: "pan",
    deltaX: deltas.deltaX * multiplier,
    deltaY: deltas.deltaY * multiplier
  };
}

export function shouldCanvasOwnWheel(input: {
  overFocusedWidget: boolean;
  wheelOverrideActive: boolean;
  canvasOverrideActive: boolean;
  captureCanvasWheelOverWidgets: boolean;
}): boolean {
  return !input.overFocusedWidget
    || input.wheelOverrideActive
    || input.canvasOverrideActive
    || input.captureCanvasWheelOverWidgets;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
