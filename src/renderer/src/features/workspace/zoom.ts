import type { ZoomSensitivity } from "../../../../shared/contracts";

const WHEEL_ZOOM_BASE = 0.0012;

export const ZOOM_SENSITIVITY_FACTORS: Record<ZoomSensitivity, number> = {
  slow: 0.5,
  normal: 1,
  fast: 2
};

/** Wheel/pinch zoom step scaled by the user's sensitivity preference. */
export function wheelZoomFactor(deltaY: number, sensitivity: ZoomSensitivity): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_BASE * ZOOM_SENSITIVITY_FACTORS[sensitivity]);
}
