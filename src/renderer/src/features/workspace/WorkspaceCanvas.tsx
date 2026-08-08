import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentProviderId,
  AppSettings,
  BrowserCanvasState,
  BrowserSnapshot,
  CameraState,
  HomeGridSize,
  HomeWidgetPlacement,
  InstalledPlugin,
  LimitsSnapshot,
  Point,
  SessionBounds,
  SessionSnapshot
} from "../../../../shared/contracts";
import { HomeZone } from "../home/HomeZone";
import { EDGE_PAN_SPEEDS, edgePanVelocity } from "./edgePan";
import {
  canvasWheelIntent,
  normalizeCanvasWheelDeltas,
  shouldCanvasOwnWheel,
  type CanvasWheelDeltas
} from "./canvasNavigation";
import { TerminalCard } from "../terminal/TerminalCard";
import { PluginCanvasCard } from "../plugins/PluginCanvasCard";
import { UiIcon } from "../../components/UiIcon";
import { t } from "../../lib/i18n";
import { displayCanvasNavigationBinding } from "../../lib/shortcuts";
import { shouldCaptureWidgetWheel } from "../../../../shared/canvasNavigation";
import type { LimitsLoadState } from "../home/homeModel";
import { homeGridPixelSize, homeLayoutFitsGrid } from "../home/homeLayout";
import { BrowserCard } from "../browser/BrowserCard";
import { HOVER_FOCUS_DELAYS } from "./focus";
import {
  browserCanvasWidgetId,
  canvasWidgetFocusAfterClick,
  canvasWidgetTarget,
  isFocusedCanvasWidgetTarget,
  pluginCanvasWidgetId,
  terminalCanvasWidgetId
} from "./canvasWidgetFocus";

interface WorkspaceCanvasProps {
  settings: AppSettings;
  mediaData: string | null;
  sessions: SessionSnapshot[];
  limits: LimitsSnapshot | null;
  limitsLoadState: LimitsLoadState;
  plugins: InstalledPlugin[];
  browser: BrowserSnapshot;
  browserViewVisible: boolean;
  homeEditing: boolean;
  camera: CameraState;
  onCameraChange(camera: CameraState): void;
  onGoHome(): void;
  onOpenSettings(): void;
  onOpenAgent(provider: AgentProviderId): void;
  onOpenTerminal(): void;
  onOpenBrowser(): void;
  onFocusSession(session: SessionSnapshot): void;
  activeSessionId: string | null;
  browserSelected: boolean;
  renamingSessionId: string | null;
  onSelectSession(id: string): void;
  onSelectBrowser(): void;
  onClearCanvasSelection(): void;
  onRenameSession(id: string, title: string): Promise<void>;
  onRenameEnd(): void;
  onRequestMedia(): Promise<void>;
  onRemoveMedia(): Promise<void>;
  onHomeLayoutChange(layout: HomeWidgetPlacement[]): void;
  onHomeGridSizeChange(gridSize: HomeGridSize): void;
  onFinishHomeEdit(): void;
  onResetHomeLayout(): void;
  onPluginError(message: string): void;
  onPluginCanvasBoundsChange(id: string, bounds: SessionBounds): void;
  onDisposePluginCanvas(id: string): void;
  onFocusPluginCanvas(id: string): void;
  onSessionBoundsChange(id: string, bounds: SessionBounds): void;
  onRestartSession(id: string): Promise<void>;
  onDisposeSession(id: string): void;
  onBrowserBoundsChange(bounds: BrowserCanvasState): void;
  onFocusBrowser(): void;
  onCloseBrowser(): void;
}

interface PanState {
  pointerId: number;
  startClient: Point;
  startCamera: CameraState;
  moved: boolean;
  suppressClick: boolean;
}

interface NativePanState {
  tabId: string;
  startClient: Point;
  startCamera: CameraState;
}

interface WidgetFocusState {
  id: string | null;
  source: "explicit" | "hover";
}

export function WorkspaceCanvas({
  settings,
  mediaData,
  sessions,
  limits,
  limitsLoadState,
  plugins,
  browser,
  browserViewVisible,
  homeEditing,
  camera,
  onCameraChange,
  onGoHome,
  onOpenSettings,
  onOpenAgent,
  onOpenTerminal,
  onOpenBrowser,
  onFocusSession,
  activeSessionId,
  browserSelected,
  renamingSessionId,
  onSelectSession,
  onSelectBrowser,
  onClearCanvasSelection,
  onRenameSession,
  onRenameEnd,
  onRequestMedia,
  onRemoveMedia,
  onHomeLayoutChange,
  onHomeGridSizeChange,
  onFinishHomeEdit,
  onResetHomeLayout,
  onPluginError,
  onPluginCanvasBoundsChange,
  onDisposePluginCanvas,
  onFocusPluginCanvas,
  onSessionBoundsChange,
  onRestartSession,
  onDisposeSession,
  onBrowserBoundsChange,
  onFocusBrowser,
  onCloseBrowser
}: WorkspaceCanvasProps): React.JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  const panState = useRef<PanState | null>(null);
  const suppressCanvasClick = useRef(false);
  const nativePanState = useRef<NativePanState | null>(null);
  const [panning, setPanning] = useState(false);
  const [wheelOverrideActive, setWheelOverrideActive] = useState(false);
  const wheelOverrideActiveRef = useRef(false);
  const [canvasOverrideActive, setCanvasOverrideActive] = useState(false);
  const canvasOverrideActiveRef = useRef(false);
  const [widgetFocus, setWidgetFocus] = useState<WidgetFocusState>({ id: null, source: "explicit" });
  const widgetFocusRef = useRef(widgetFocus);
  widgetFocusRef.current = widgetFocus;
  const hoverFocusTimer = useRef<{ id: string; timer: number } | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const captureCanvasWheelOverWidgets = settings.canvasWheelCaptureMode === "always";
  const routeWidgetWheelToCanvas = shouldCaptureWidgetWheel(
    settings.canvasWheelCaptureMode,
    wheelOverrideActive,
    canvasOverrideActive
  );
  const captureCanvasWheelOverWidgetsRef = useRef(captureCanvasWheelOverWidgets);
  captureCanvasWheelOverWidgetsRef.current = captureCanvasWheelOverWidgets;
  const edgePointer = useRef<Point | null>(null);
  const edgeFrame = useRef<number | null>(null);
  const edgeLastTime = useRef(0);
  const wheelPanFrame = useRef<number | null>(null);
  const pendingWheelPan = useRef<Point>({ x: 0, y: 0 });
  const commitCamera = useCallback((next: CameraState): void => {
    cameraRef.current = next;
    onCameraChange(next);
  }, [onCameraChange]);

  const focusWidget = useCallback((id: string | null, source: WidgetFocusState["source"]): void => {
    setWidgetFocus((current) => current.id === id && current.source === source
      ? current
      : { id, source });
  }, []);

  const cancelWidgetHoverFocus = useCallback((id?: string): void => {
    const pending = hoverFocusTimer.current;
    if (!pending || (id !== undefined && pending.id !== id)) return;
    window.clearTimeout(pending.timer);
    hoverFocusTimer.current = null;
  }, []);

  const scheduleWidgetHoverFocus = useCallback((id: string): void => {
    cancelWidgetHoverFocus();
    if (!settingsRef.current.hoverFocus || widgetFocusRef.current.id === id) return;
    hoverFocusTimer.current = {
      id,
      timer: window.setTimeout(() => {
        hoverFocusTimer.current = null;
        focusWidget(id, "hover");
      }, HOVER_FOCUS_DELAYS[settingsRef.current.hoverFocusSpeed])
    };
  }, [cancelWidgetHoverFocus, focusWidget]);

  const hoverBrowserWidget = useCallback((active: boolean): void => {
    if (active) scheduleWidgetHoverFocus(browserCanvasWidgetId);
    else cancelWidgetHoverFocus(browserCanvasWidgetId);
  }, [cancelWidgetHoverFocus, scheduleWidgetHoverFocus]);

  const focusBrowserWidget = useCallback((): void => {
    cancelWidgetHoverFocus();
    focusWidget(browserCanvasWidgetId, "explicit");
  }, [cancelWidgetHoverFocus, focusWidget]);

  useEffect(() => () => {
    if (edgeFrame.current !== null) cancelAnimationFrame(edgeFrame.current);
    if (wheelPanFrame.current !== null) cancelAnimationFrame(wheelPanFrame.current);
    if (panState.current) window.canvasTTY.canvasNavigation.setPointerGestureActive(false);
    cancelWidgetHoverFocus();
  }, [cancelWidgetHoverFocus]);

  useEffect(() => {
    if (!settings.hoverFocus) cancelWidgetHoverFocus();
  }, [cancelWidgetHoverFocus, settings.hoverFocus]);

  useEffect(() => {
    if (activeSessionId !== null) focusWidget(terminalCanvasWidgetId(activeSessionId), "explicit");
  }, [activeSessionId, focusWidget]);

  useEffect(() => {
    if (browserSelected) focusWidget(browserCanvasWidgetId, "explicit");
  }, [browserSelected, focusWidget]);

  useEffect(() => {
    if (widgetFocus.id === null) return;
    const widgets = viewport.current?.querySelectorAll<HTMLElement>("[data-canvas-widget-id]");
    const exists = widgets && Array.from(widgets).some((widget) => (
      widget.dataset.canvasWidgetId === widgetFocus.id
    ));
    if (!exists) focusWidget(null, "explicit");
  }, [browserViewVisible, focusWidget, plugins, sessions, settings.browserCanvas, settings.homeLayout, settings.pluginCanvas, widgetFocus.id]);

  useEffect(() => {
    const resetPan = (): void => {
      const pointerId = panState.current?.pointerId;
      const element = viewport.current;
      if (pointerId !== undefined && element?.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      if (panState.current) window.canvasTTY.canvasNavigation.setPointerGestureActive(false);
      panState.current = null;
      nativePanState.current = null;
      setPanning(false);
    };
    window.addEventListener("blur", resetPan);
    return () => window.removeEventListener("blur", resetPan);
  }, []);

  useEffect(() => window.canvasTTY.canvasNavigation.onOverrideState(({ wheelActive, navigationActive }) => {
    wheelOverrideActiveRef.current = wheelActive;
    canvasOverrideActiveRef.current = navigationActive;
    viewport.current?.classList.toggle("workspace--canvas-override", navigationActive);
    setWheelOverrideActive(wheelActive);
    setCanvasOverrideActive(navigationActive);
  }), []);

  const edgePanStep = (time: number): void => {
    edgeFrame.current = null;
    const pointer = edgePointer.current;
    if (!pointer || panState.current || nativePanState.current || !settingsRef.current.edgePan) return;
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const hovered = document.elementFromPoint(pointer.x, pointer.y);
    if (hovered?.closest('[data-interactive="true"]')) return;
    const velocity = edgePanVelocity(pointer, bounds, {
      maxSpeed: EDGE_PAN_SPEEDS[settingsRef.current.edgePanSpeed]
    });
    if (!velocity) return;
    const dt = edgeLastTime.current === 0 ? 0 : Math.min(0.05, (time - edgeLastTime.current) / 1000);
    edgeLastTime.current = time;
    commitCamera({
      ...cameraRef.current,
      x: cameraRef.current.x + velocity.x * dt,
      y: cameraRef.current.y + velocity.y * dt
    });
    edgeFrame.current = requestAnimationFrame(edgePanStep);
  };

  const trackEdgePointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!settings.edgePan) {
      edgePointer.current = null;
      return;
    }
    edgePointer.current = { x: event.clientX, y: event.clientY };
    if (edgeFrame.current === null) {
      edgeLastTime.current = 0;
      edgeFrame.current = requestAnimationFrame(edgePanStep);
    }
  };

  const startPan = (event: React.PointerEvent<HTMLDivElement>, override = false): void => {
    const blocked = event.button !== 0
      || (!override && (event.target as HTMLElement).closest('[data-interactive="true"]') !== null);
    if (blocked) return;
    if (override) {
      event.preventDefault();
      event.stopPropagation();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    panState.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startCamera: cameraRef.current,
      moved: false,
      suppressClick: override
    };
    window.canvasTTY.canvasNavigation.setPointerGestureActive(true);
    setPanning(true);
  };

  const panTo = (clientX: number, clientY: number): void => {
    const state = panState.current;
    if (!state) return;
    if (Math.abs(clientX - state.startClient.x) > 3
      || Math.abs(clientY - state.startClient.y) > 3) state.moved = true;
    const nextCamera = {
      ...state.startCamera,
      x: state.startCamera.x + clientX - state.startClient.x,
      y: state.startCamera.y + clientY - state.startClient.y
    };
    commitCamera(nextCamera);
  };

  const finishPan = (): void => {
    const state = panState.current;
    if (!state) return;
    if (state.moved || state.suppressClick) {
      suppressCanvasClick.current = true;
      window.setTimeout(() => { suppressCanvasClick.current = false; }, 0);
    }
    const element = viewport.current;
    if (element?.hasPointerCapture(state.pointerId)) element.releasePointerCapture(state.pointerId);
    panState.current = null;
    window.canvasTTY.canvasNavigation.setPointerGestureActive(false);
    setPanning(false);
  };

  const pan = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = panState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    panTo(event.clientX, event.clientY);
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (panState.current?.pointerId !== event.pointerId) return;
    finishPan();
  };

  const zoomAt = useCallback((clientX: number, clientY: number, nextZoom: number): void => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const currentCamera = cameraRef.current;
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const worldX = (localX - currentCamera.x) / currentCamera.zoom;
    const worldY = (localY - currentCamera.y) / currentCamera.zoom;
    commitCamera({
      zoom: nextZoom,
      x: localX - worldX * nextZoom,
      y: localY - worldY * nextZoom
    });
  }, [commitCamera]);

  const flushWheelPan = useCallback((): void => {
    if (wheelPanFrame.current !== null) {
      cancelAnimationFrame(wheelPanFrame.current);
      wheelPanFrame.current = null;
    }
    const delta = pendingWheelPan.current;
    if (delta.x === 0 && delta.y === 0) return;
    pendingWheelPan.current = { x: 0, y: 0 };
    const nextCamera = {
      ...cameraRef.current,
      x: cameraRef.current.x - delta.x,
      y: cameraRef.current.y - delta.y
    };
    commitCamera(nextCamera);
  }, [commitCamera]);

  const applyCanvasWheel = useCallback((
    clientX: number,
    clientY: number,
    deltas: CanvasWheelDeltas,
    modifiers: { ctrlKey: boolean; metaKey: boolean }
  ): void => {
    window.canvasTTY.canvasNavigation.armOwnerWheelSequence(clientX, clientY);
    const intent = canvasWheelIntent(deltas, modifiers, settingsRef.current);
    if (intent.kind === "pan") {
      pendingWheelPan.current.x += intent.deltaX;
      pendingWheelPan.current.y += intent.deltaY;
      if (wheelPanFrame.current === null) wheelPanFrame.current = requestAnimationFrame(flushWheelPan);
      return;
    }
    const nextZoom = clamp(cameraRef.current.zoom * intent.factor, 0.2, 1.35);
    flushWheelPan();
    zoomAt(clientX, clientY, nextZoom);
  }, [flushWheelPan, zoomAt]);

  const applyPluginCanvasWheel = useCallback((event: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
  }): void => {
    applyCanvasWheel(event.clientX, event.clientY, event, event);
  }, [applyCanvasWheel]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent): void => {
      const overFocusedWidget = isFocusedCanvasWidgetTarget(event.target, widgetFocusRef.current.id);
      const ownership = {
        overFocusedWidget,
        wheelOverrideActive: wheelOverrideActiveRef.current,
        canvasOverrideActive: canvasOverrideActiveRef.current,
        captureCanvasWheelOverWidgets: captureCanvasWheelOverWidgetsRef.current
      };
      const browserFreezeOwned = event.target instanceof Element
        && event.target.closest('[data-browser-canvas-wheel-owner="canvas"]') !== null;
      const ownedByCanvas = browserFreezeOwned || shouldCanvasOwnWheel(ownership);
      if (!ownedByCanvas) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = element.getBoundingClientRect();
      applyCanvasWheel(
        event.clientX,
        event.clientY,
        normalizeCanvasWheelDeltas(event.deltaX, event.deltaY, event.deltaMode, bounds),
        event
      );
    };
    element.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => element.removeEventListener("wheel", handleWheel, true);
  }, [applyCanvasWheel]);

  useEffect(() => window.canvasTTY.browser.onCanvasWheel((event) => {
    applyCanvasWheel(event.clientX, event.clientY, event, event);
  }), [applyCanvasWheel]);

  useEffect(() => window.canvasTTY.browser.onCanvasNavigationPointer((event) => {
    if (panState.current && event.type !== "down") {
      if (event.type === "move") panTo(event.clientX, event.clientY);
      else finishPan();
      return;
    }
    if (event.type === "down") {
      nativePanState.current = {
        tabId: event.tabId,
        startClient: { x: event.clientX, y: event.clientY },
        startCamera: cameraRef.current
      };
      setPanning(true);
      return;
    }
    const state = nativePanState.current;
    if (!state || state.tabId !== event.tabId) return;
    if (event.type === "move") {
      const nextCamera = {
        ...state.startCamera,
        x: state.startCamera.x + event.clientX - state.startClient.x,
        y: state.startCamera.y + event.clientY - state.startClient.y
      };
      commitCamera(nextCamera);
      return;
    }
    nativePanState.current = null;
    setPanning(false);
  }), [commitCamera]);

  const zoomBy = (factor: number): void => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const nextZoom = clamp(cameraRef.current.zoom * factor, 0.2, 1.35);
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, nextZoom);
  };

  const homeBounds: SessionBounds = {
    position: { x: 0, y: 0 },
    size: homeGridPixelSize(settings.homeGridSize)
  };
  const homeLayoutValid = homeLayoutFitsGrid(settings.homeLayout, settings.homeGridSize);

  return (
    <div
      ref={viewport}
      className={`workspace pattern-${settings.pattern} ${panning ? "workspace--panning" : ""} ${canvasOverrideActive ? "workspace--canvas-override" : ""}`}
      onPointerDownCapture={(event) => {
        if (canvasOverrideActiveRef.current && isCanvasWidgetTarget(event.target)) {
          startPan(event, true);
          return;
        }
        const target = canvasWidgetTarget(event.target);
        if (target.focusableWidgetId !== null) {
          cancelWidgetHoverFocus();
          focusWidget(target.focusableWidgetId, "explicit");
        }
        if (!(event.target as HTMLElement).closest(".terminal-card, .browser-card")) onClearCanvasSelection();
      }}
      onClickCapture={(event) => {
        if (suppressCanvasClick.current) {
          suppressCanvasClick.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const target = canvasWidgetTarget(event.target);
        setWidgetFocus((current) => {
          const nextId = canvasWidgetFocusAfterClick(current.id, target);
          return nextId === current.id ? current : { id: nextId, source: "explicit" };
        });
      }}
      onPointerOverCapture={(event) => {
        const target = canvasWidgetTarget(event.target).focusableWidgetId;
        const previous = canvasWidgetTarget(event.relatedTarget).focusableWidgetId;
        if (target !== null && target !== previous) scheduleWidgetHoverFocus(target);
      }}
      onPointerOutCapture={(event) => {
        const target = canvasWidgetTarget(event.target).focusableWidgetId;
        const next = canvasWidgetTarget(event.relatedTarget).focusableWidgetId;
        if (target !== null && target !== next) cancelWidgetHoverFocus(target);
      }}
      onPointerDown={startPan}
      onPointerMove={(event) => {
        pan(event);
        trackEdgePointer(event);
      }}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={() => {
        edgePointer.current = null;
      }}
    >
      <div className="workspace__scene" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        <HomeZone
          settings={settings}
          mediaData={mediaData}
          sessions={sessions}
          limits={limits}
          limitsLoadState={limitsLoadState}
          plugins={plugins}
          editing={homeEditing}
          onOpenSettings={onOpenSettings}
          onOpenAgent={onOpenAgent}
          onOpenTerminal={onOpenTerminal}
          onOpenBrowser={() => {
            if (settings.browserCanvas) focusBrowserWidget();
            onOpenBrowser();
          }}
          onFocusSession={(session) => {
            focusWidget(terminalCanvasWidgetId(session.id), "explicit");
            onFocusSession(session);
          }}
          onRequestMedia={onRequestMedia}
          onRemoveMedia={onRemoveMedia}
          onLayoutChange={onHomeLayoutChange}
          onGridSizeChange={onHomeGridSizeChange}
          onPluginError={onPluginError}
          captureCanvasWheelOverWidgets={routeWidgetWheelToCanvas}
          focusedWidgetId={widgetFocus.id}
          onWidgetFocus={(id) => {
            cancelWidgetHoverFocus();
            focusWidget(id, "explicit");
          }}
          onWidgetHoverChange={(id, active) => {
            if (active) scheduleWidgetHoverFocus(id);
            else cancelWidgetHoverFocus(id);
          }}
          onPluginCanvasWheel={applyPluginCanvasWheel}
        />
        <div
          className={`workspace__windows ${homeEditing ? "workspace__windows--hidden" : ""}`}
          aria-hidden={homeEditing}
        >
          {sessions.map((session) => (
            <TerminalCard
              key={session.id}
              session={session}
              locale={settings.locale}
              palette={settings.palette}
              zoom={camera.zoom}
              snapEnabled={settings.snapToGrid}
              focusActivation={settings.focusActivation}
              invertTerminalWheel={settings.invertTerminalWheel}
              captureCanvasWheelOverWidgets={routeWidgetWheelToCanvas || widgetFocus.id !== terminalCanvasWidgetId(session.id)}
              canvasOverrideActive={canvasOverrideActive}
              focused={widgetFocus.id === terminalCanvasWidgetId(session.id)}
              focusChangeSource={widgetFocus.source}
              selected={activeSessionId === session.id}
              renaming={renamingSessionId === session.id}
              snapTargets={[
                homeBounds,
                ...sessions
                  .filter((candidate) => candidate.id !== session.id)
                  .map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...settings.pluginCanvas.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...(settings.browserCanvas ? [settings.browserCanvas] : [])
              ]}
              onActivate={(selectedSession) => {
                focusWidget(terminalCanvasWidgetId(selectedSession.id), "explicit");
                onFocusSession(selectedSession);
              }}
              onSelect={onSelectSession}
              onRename={onRenameSession}
              onRenameEnd={onRenameEnd}
              onBoundsChange={onSessionBoundsChange}
              onRestart={onRestartSession}
              onDispose={onDisposeSession}
            />
          ))}
          {settings.pluginCanvas.map((instance) => {
            const plugin = plugins.find((candidate) => candidate.manifest.id === instance.pluginId && candidate.enabled);
            const contribution = plugin?.manifest.contributions.find((candidate) => candidate.id === instance.contributionId);
            if (!plugin || !contribution || contribution.kind !== "canvas-app") return null;
            return (
              <PluginCanvasCard
                key={instance.id}
                instance={instance}
                plugin={plugin}
                contribution={contribution}
                locale={settings.locale}
                palette={settings.palette}
                zoom={camera.zoom}
                snapEnabled={settings.snapToGrid}
                sessions={sessions}
                limits={limits}
                snapTargets={[
                  homeBounds,
                  ...sessions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                  ...settings.pluginCanvas
                    .filter((candidate) => candidate.id !== instance.id)
                    .map((candidate) => ({ position: candidate.position, size: candidate.size })),
                  ...(settings.browserCanvas ? [settings.browserCanvas] : [])
                ]}
                onActivate={() => {
                  focusWidget(pluginCanvasWidgetId(instance.id), "explicit");
                  onFocusPluginCanvas(instance.id);
                }}
                onBoundsChange={onPluginCanvasBoundsChange}
                onDispose={onDisposePluginCanvas}
                onOpenLauncher={(provider) => provider === "terminal" ? onOpenTerminal() : onOpenAgent(provider)}
                onError={onPluginError}
                captureCanvasWheelOverWidgets={routeWidgetWheelToCanvas || widgetFocus.id !== pluginCanvasWidgetId(instance.id)}
                onWidgetFocus={() => {
                  cancelWidgetHoverFocus();
                  focusWidget(pluginCanvasWidgetId(instance.id), "explicit");
                }}
                onWidgetHoverChange={(active) => {
                  if (active) scheduleWidgetHoverFocus(pluginCanvasWidgetId(instance.id));
                  else cancelWidgetHoverFocus(pluginCanvasWidgetId(instance.id));
                }}
                onCanvasWheel={applyPluginCanvasWheel}
              />
            );
          })}
          {settings.browserCanvas && (
            <BrowserCard
              browser={browser}
              bounds={settings.browserCanvas}
              locale={settings.locale}
              zoom={camera.zoom}
              camera={camera}
              visible={browserViewVisible && !homeEditing}
              snapEnabled={settings.snapToGrid}
              focusActivation={settings.focusActivation}
              focused={widgetFocus.id === browserCanvasWidgetId}
              selected={browserSelected}
              showAgentPresence={settings.browserShowAgentPresence}
              snapTargets={[
                homeBounds,
                ...sessions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...settings.pluginCanvas.map((candidate) => ({ position: candidate.position, size: candidate.size }))
              ]}
              onBoundsChange={onBrowserBoundsChange}
              onActivate={() => {
                focusBrowserWidget();
                onFocusBrowser();
              }}
              onSelect={onSelectBrowser}
              onWidgetFocus={focusBrowserWidget}
              onWidgetHoverChange={hoverBrowserWidget}
              onClose={onCloseBrowser}
              onError={onPluginError}
            />
          )}
        </div>
      </div>

      {homeEditing && (
        <div className="home-editor-toolbar" data-interactive="true">
          <strong>{t(settings.locale, "homeEditor")}</strong>
          <button type="button" onClick={onResetHomeLayout}>{t(settings.locale, "resetHome")}</button>
          <button
            className="home-editor-toolbar__done"
            type="button"
            disabled={!homeLayoutValid}
            title={homeLayoutValid ? undefined : t(settings.locale, "homeLayoutOutside")}
            onClick={onFinishHomeEdit}
          >{t(settings.locale, "doneEditing")}</button>
        </div>
      )}

      <div className="canvas-controls" data-interactive="true">
        <button type="button" onClick={onGoHome} title={t(settings.locale, "home")}><UiIcon name="home" size={17} /></button>
        <button type="button" onClick={() => zoomBy(0.82)} title={t(settings.locale, "zoomOut")}><UiIcon name="zoom-out" size={17} /></button>
        <button type="button" onClick={() => zoomBy(1.22)} title={t(settings.locale, "zoomIn")}><UiIcon name="zoom-in" size={17} /></button>
      </div>
      {settings.showShortcutHints && (
        <aside className="shortcut-hints" aria-label={t(settings.locale, "keyboardShortcuts")}>
          <div><kbd>{settings.shortcuts.home}</kbd><span>{t(settings.locale, "homeShortcut")}</span></div>
          <div><kbd>{settings.shortcuts.renameWindow}</kbd><span>{t(settings.locale, "renameWindow")}</span></div>
          {settings.canvasWheelCaptureMode === "key" && settings.canvasWheelOverride !== null && (
            <div>
              <kbd>{displayCanvasNavigationBinding(
                settings.canvasWheelOverride,
                window.canvasTTY.window.isMacOS
              )}</kbd>
              <span>{t(settings.locale, "canvasWheelOverrideHint")}</span>
            </div>
          )}
          {settings.canvasNavigationOverride !== null && (
            <div>
              <kbd>{displayCanvasNavigationBinding(
                settings.canvasNavigationOverride,
                window.canvasTTY.window.isMacOS
              )}</kbd>
              <span>{t(settings.locale, "canvasNavigationOverrideHint")}</span>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isCanvasWidgetTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    '[data-wheel-owner="local"], [data-interactive="true"], [data-canvas-zoom-surface="application"]'
  ));
}
