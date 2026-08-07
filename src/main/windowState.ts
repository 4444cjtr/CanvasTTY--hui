import type { WindowState } from "../shared/contracts";

export interface WindowStateSource {
  isMaximized(): boolean;
  isFullScreen(): boolean;
}

export type WindowStateEvent = "maximize" | "unmaximize" | "enter-full-screen" | "leave-full-screen";

export interface WindowStateObservable extends WindowStateSource {
  on(event: WindowStateEvent, listener: () => void): void;
}

export function readWindowState(
  window: Pick<WindowStateSource, "isMaximized" | "isFullScreen"> | null,
  platform: NodeJS.Platform = process.platform
): WindowState {
  return {
    isMacOS: platform === "darwin",
    maximized: window?.isMaximized() ?? false,
    fullscreen: window?.isFullScreen() ?? false
  };
}

export function observeWindowState(
  window: WindowStateObservable,
  publish: (state: WindowState) => void,
  platform: NodeJS.Platform = process.platform
): void {
  const notify = (): void => publish(readWindowState(window, platform));
  window.on("maximize", notify);
  window.on("unmaximize", notify);
  window.on("enter-full-screen", notify);
  window.on("leave-full-screen", notify);
}
