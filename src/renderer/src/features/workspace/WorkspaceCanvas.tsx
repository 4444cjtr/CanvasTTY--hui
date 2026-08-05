import { useRef, useState } from "react";
import type {
  AgentProviderId,
  AppSettings,
  CameraState,
  LimitsSnapshot,
  Point,
  SessionBounds,
  SessionSnapshot
} from "../../../../shared/contracts";
import { HomeZone } from "../home/HomeZone";
import { TerminalCard } from "../terminal/TerminalCard";
import { UiIcon } from "../../components/UiIcon";
import { t } from "../../lib/i18n";
import type { LimitsLoadState } from "../home/homeModel";

interface WorkspaceCanvasProps {
  settings: AppSettings;
  mediaData: string | null;
  sessions: SessionSnapshot[];
  limits: LimitsSnapshot | null;
  limitsLoadState: LimitsLoadState;
  camera: CameraState;
  onCameraChange(camera: CameraState): void;
  onGoHome(): void;
  onOpenSettings(): void;
  onOpenAgent(provider: AgentProviderId): void;
  onOpenTerminal(): void;
  onFocusSession(session: SessionSnapshot): void;
  onRequestMedia(): Promise<void>;
  onRemoveMedia(): Promise<void>;
  onSessionBoundsChange(id: string, bounds: SessionBounds): void;
  onDisposeSession(id: string): void;
}

interface PanState {
  pointerId: number;
  startClient: Point;
  startCamera: CameraState;
}

export function WorkspaceCanvas({
  settings,
  mediaData,
  sessions,
  limits,
  limitsLoadState,
  camera,
  onCameraChange,
  onGoHome,
  onOpenSettings,
  onOpenAgent,
  onOpenTerminal,
  onFocusSession,
  onRequestMedia,
  onRemoveMedia,
  onSessionBoundsChange,
  onDisposeSession
}: WorkspaceCanvasProps): React.JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  const panState = useRef<PanState | null>(null);
  const [panning, setPanning] = useState(false);

  const startPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-interactive="true"]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panState.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startCamera: camera
    };
    setPanning(true);
  };

  const pan = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = panState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    onCameraChange({
      ...camera,
      x: state.startCamera.x + event.clientX - state.startClient.x,
      y: state.startCamera.y + event.clientY - state.startClient.y
    });
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (panState.current?.pointerId !== event.pointerId) return;
    panState.current = null;
    setPanning(false);
  };

  const zoomAt = (clientX: number, clientY: number, nextZoom: number): void => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const worldX = (localX - camera.x) / camera.zoom;
    const worldY = (localY - camera.y) / camera.zoom;
    onCameraChange({
      zoom: nextZoom,
      x: localX - worldX * nextZoom,
      y: localY - worldY * nextZoom
    });
  };

  const zoomBy = (factor: number): void => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return;
    const nextZoom = clamp(camera.zoom * factor, 0.28, 1.35);
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, nextZoom);
  };

  return (
    <div
      ref={viewport}
      className={`workspace pattern-${settings.pattern} ${panning ? "workspace--panning" : ""}`}
      onPointerDown={startPan}
      onPointerMove={pan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={(event) => {
        if ((event.target as HTMLElement).closest('[data-wheel-owner="local"]')) return;
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, clamp(camera.zoom * Math.exp(-event.deltaY * 0.0012), 0.28, 1.35));
      }}
    >
      <div className="workspace__scene" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        <HomeZone
          settings={settings}
          mediaData={mediaData}
          sessions={sessions}
          limits={limits}
          limitsLoadState={limitsLoadState}
          onOpenSettings={onOpenSettings}
          onOpenAgent={onOpenAgent}
          onOpenTerminal={onOpenTerminal}
          onFocusSession={onFocusSession}
          onRequestMedia={onRequestMedia}
          onRemoveMedia={onRemoveMedia}
        />
        {sessions.map((session) => (
          <TerminalCard
            key={session.id}
            session={session}
            locale={settings.locale}
            palette={settings.palette}
            zoom={camera.zoom}
            snapEnabled={settings.snapToGrid}
            snapTargets={[
              HOME_BOUNDS,
              ...sessions
                .filter((candidate) => candidate.id !== session.id)
                .map((candidate) => ({ position: candidate.position, size: candidate.size }))
            ]}
            onActivate={onFocusSession}
            onBoundsChange={onSessionBoundsChange}
            onDispose={onDisposeSession}
          />
        ))}
      </div>

      <div className="canvas-controls" data-interactive="true">
        <button type="button" onClick={onGoHome} title={t(settings.locale, "home")}><UiIcon name="home" size={17} /></button>
        <button type="button" onClick={() => zoomBy(0.82)} title={t(settings.locale, "zoomOut")}><UiIcon name="zoom-out" size={17} /></button>
        <button type="button" onClick={() => zoomBy(1.22)} title={t(settings.locale, "zoomIn")}><UiIcon name="zoom-in" size={17} /></button>
      </div>
    </div>
  );
}

const HOME_BOUNDS: SessionBounds = {
  position: { x: 0, y: 0 },
  size: { width: 1180, height: 700 }
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
