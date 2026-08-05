import type { EdgePanSpeed, Point } from "../../../../shared/contracts";

export interface EdgePanViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EdgePanOptions {
  /** Distance from a viewport edge where panning engages, in px. */
  zone?: number;
  /** Camera speed at the very edge, in px per second. */
  maxSpeed?: number;
}

export const EDGE_PAN_ZONE = 56;
export const EDGE_PAN_MAX_SPEED = 900;

export const EDGE_PAN_SPEEDS: Record<EdgePanSpeed, number> = {
  slow: 450,
  normal: EDGE_PAN_MAX_SPEED,
  fast: 1400
};

/**
 * RTS-style edge panning: the camera drifts while the pointer rests near a
 * viewport edge. Velocity ramps linearly from zero at the zone boundary to
 * `maxSpeed` at the edge itself. Returns null when the pointer is outside the
 * viewport or too far from every edge.
 */
export function edgePanVelocity(
  pointer: Point,
  viewport: EdgePanViewport,
  options: EdgePanOptions = {}
): Point | null {
  const zone = options.zone ?? EDGE_PAN_ZONE;
  const maxSpeed = options.maxSpeed ?? EDGE_PAN_MAX_SPEED;
  const localX = pointer.x - viewport.left;
  const localY = pointer.y - viewport.top;

  if (localX < 0 || localY < 0 || localX > viewport.width || localY > viewport.height) {
    return null;
  }

  const x = axisVelocity(localX, viewport.width, zone, maxSpeed);
  const y = axisVelocity(localY, viewport.height, zone, maxSpeed);
  return x === 0 && y === 0 ? null : { x, y };
}

function axisVelocity(position: number, length: number, zone: number, maxSpeed: number): number {
  const effectiveZone = Math.min(zone, length / 2);
  if (position < effectiveZone) {
    return maxSpeed * (1 - position / effectiveZone);
  }
  if (position > length - effectiveZone) {
    return -maxSpeed * (1 - (length - position) / effectiveZone);
  }
  return 0;
}
