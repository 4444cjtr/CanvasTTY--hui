import type { SessionBounds, Size } from "../../../../shared/contracts";
import type { ResizeDirection } from "../workspace/snap";

export function constrainPluginResize(
  bounds: SessionBounds,
  direction: ResizeDirection,
  minSize: Size = { width: 320, height: 220 }
): SessionBounds {
  const right = bounds.position.x + bounds.size.width;
  const bottom = bounds.position.y + bounds.size.height;
  const width = clamp(bounds.size.width, minSize.width, 1_600);
  const height = clamp(bounds.size.height, minSize.height, 1_100);
  return {
    position: {
      x: direction.includes("w") ? right - width : bounds.position.x,
      y: direction.includes("n") ? bottom - height : bounds.position.y
    },
    size: { width, height }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
