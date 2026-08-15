import { useEffect, useRef, useState } from "react";
import type { BrowserCanvasNode, CameraState, SessionSnapshot } from "../../../../shared/contracts";

interface AgentLinkGraphProps {
  sessions: SessionSnapshot[];
  browserNodes: BrowserCanvasNode[];
  camera: CameraState;
  onCreateLink(terminalId: string, windowId: string): void;
  onRemoveLink(terminalId: string): void;
}

interface DragState {
  fromSessionId: string;
  x: number;
  y: number;
}

/**
 * Точка подключения агента (выход): справа по центру карточки терминала,
 * в канвас-координатах.
 */
function agentPort(session: SessionSnapshot): { x: number; y: number } {
  return {
    x: session.position.x + session.size.width,
    y: session.position.y + Math.round(session.size.height / 2)
  };
}

/** Точка подключения браузера (вход): слева по центру карточки, канвас-координаты. */
function browserPort(node: BrowserCanvasNode): { x: number; y: number } {
  return {
    x: node.bounds.position.x,
    y: node.bounds.position.y + Math.round(node.bounds.size.height / 2)
  };
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(48, Math.abs(to.x - from.x) * 0.4);
  return [
    `M ${from.x} ${from.y}`,
    `C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  ].join(" ");
}

/**
 * Граф связей «агент ↔ браузер» в стиле нодов DaVinci Resolve: порты на
 * карточках, bezier-линии между ними. Drag с порта агента на порт браузера
 * создаёт связь; клик по линии — разрывает.
 *
 * SVG покрывает workspace (после TitleBar, offset 44px). Преобразование
 * client → SVG-координаты через getBoundingClientRect (точный offset),
 * канвас → SVG через camera (scene transform translate+scale).
 */
export function AgentLinkGraph({ sessions, browserNodes, camera, onCreateLink, onRemoveLink }: AgentLinkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const boundAgents = sessions.filter((session) => session.browserWindowId);

  // Канвас → SVG-координаты (обратная матрица transform сцены).
  const canvasToSvg = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y
  });

  // client (viewport) → SVG-координаты: вычитаем offset SVG (titlebar и т.п.).
  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // SVG-координаты → канвас.
  const svgToCanvas = (x: number, y: number): { x: number; y: number } => ({
    x: (x - camera.x) / camera.zoom,
    y: (y - camera.y) / camera.zoom
  });

  const startDrag = (event: React.PointerEvent, sessionId: string): void => {
    event.stopPropagation();
    event.preventDefault();
    const point = clientToSvg(event.clientX, event.clientY);
    setDrag({ fromSessionId: sessionId, x: point.x, y: point.y });
  };

  // Drag продолжается за пределами порта: слушаем window, пока перетаскиваем.
  const dragActive = drag !== null;
  const dragStateRef = useRef(drag);
  dragStateRef.current = drag;
  useEffect(() => {
    if (!dragActive) return;
    const onMove = (event: PointerEvent): void => {
      const point = clientToSvg(event.clientX, event.clientY);
      setDrag((current) => (current ? { ...current, x: point.x, y: point.y } : current));
    };
    const onUp = (event: PointerEvent): void => {
      // Drop: если над портом браузера — создаём связь.
      const target = event.target instanceof Element ? event.target.closest("[data-browser-port]") : null;
      const windowId = target?.getAttribute("data-browser-port") ?? null;
      if (windowId && dragStateRef.current) {
        onCreateLink(dragStateRef.current.fromSessionId, windowId);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", () => setDrag(null));
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", () => setDrag(null));
    };
  }, [dragActive, onCreateLink]);

  const draggingSession = drag ? sessions.find((session) => session.id === drag.fromSessionId) ?? null : null;

  return (
    <svg
      ref={svgRef}
      className="agent-link-graph"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 40
      }}
      aria-hidden="true"
    >
      {/* Установленные связи: линия + кликабельная область для разрыва */}
      {boundAgents.map((session) => {
        const node = browserNodes.find((candidate) => candidate.id === session.browserWindowId);
        if (!node) return null;
        const from = canvasToSvg(agentPort(session));
        const to = canvasToSvg(browserPort(node));
        return (
          <g
            key={session.id}
            className="agent-link"
            style={{ pointerEvents: "stroke", cursor: "pointer" }}
            onClick={(event) => {
              event.stopPropagation();
              onRemoveLink(session.id);
            }}
          >
            <path d={bezierPath(from, to)} className="agent-link__hit" />
            <path d={bezierPath(from, to)} className="agent-link__stroke" />
          </g>
        );
      })}

      {/* Порты агентов (выход): у всех сессий — агент может запуститься внутри */}
      {sessions.map((session) => {
        const port = canvasToSvg(agentPort(session));
        const bound = Boolean(session.browserWindowId);
        return (
          <circle
            key={session.id}
            className={`agent-link-port ${bound ? "agent-link-port--bound" : ""}`}
            cx={port.x}
            cy={port.y}
            r={7}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
            onPointerDown={(event) => startDrag(event, session.id)}
          />
        );
      })}

      {/* Порты браузеров (вход): data-browser-port для drop через window listener */}
      {browserNodes.map((node) => {
        const port = canvasToSvg(browserPort(node));
        const hasIncoming = boundAgents.some((session) => session.browserWindowId === node.id);
        return (
          <circle
            key={node.id}
            data-browser-port={node.id}
            className={`agent-link-port agent-link-port--in ${hasIncoming ? "agent-link-port--bound" : ""}`}
            cx={port.x}
            cy={port.y}
            r={7}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
          />
        );
      })}

      {/* Черновая линия при перетаскивании: координаты уже в SVG-пространстве */}
      {drag && draggingSession && (
        <path
          d={bezierPath(canvasToSvg(agentPort(draggingSession)), { x: drag.x, y: drag.y })}
          className="agent-link--draft"
        />
      )}
    </svg>
  );
}
