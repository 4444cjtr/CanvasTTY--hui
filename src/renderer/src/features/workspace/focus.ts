import type { EdgePanSpeed, FocusActivation } from "../../../../shared/contracts";

export const HOVER_FOCUS_DELAYS: Record<EdgePanSpeed, number> = {
  slow: 500,
  normal: 250,
  fast: 80
};

export function shouldActivateCanvasFromClick(mode: FocusActivation, clickCount: number): boolean {
  return (mode === "single" && clickCount === 1) || (mode === "double" && clickCount === 2);
}
