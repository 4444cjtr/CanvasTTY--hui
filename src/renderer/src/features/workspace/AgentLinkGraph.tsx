import { useRef, useState } from "react";
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

/** Точка подключения агента (выход): справа по центру карточки терминала. */
function agentPort(session: SessionSnapshot): { x: number; y: number } {
  return {
    x: session.position.x + session.size.width,
    y: session.position.y + Math.round(session.size.height / 2)
  };
}

/** Точка подключения браузера (вход): слева по центру карточки. */
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
 * SVG лежит внутри workspace__scene (канвас-пространство), поэтому все
 * координаты — канвасные: карточки позиционируются translate(position),
 * а камеру (translate+scale) scene применяет ко всему сразу.
 */
export function AgentLinkGraph({ sessions, browserNodes, camera, onCreateLink, onRemoveLink }: AgentLinkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const boundAgents = sessions.filter((session) => session.browserWindowId);

  const clientToCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / camera.zoom,
      y: (clientY - rect.top) / camera.zoom
    };
  };

  const startDrag = (event: React.PointerEvent, sessionId: string): void => {
    event.stopPropagation();
    const point = clientToCanvas(event.clientX, event.clientY);
    setDrag({ fromSessionId: sessionId, x: point.x, y: point.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent): void => {
    if (!drag) return;
    const point = clientToCanvas(event.clientX, event.clientY);
    setDrag((current) => (current ? { ...current, x: point.x, y: point.y } : current));
  };

  const endDrag = (): void => {
    setDrag(null);
  };

  const dropOnNode = (event: React.PointerEvent, windowId: string): void => {
    if (!drag) return;
    event.stopPropagation();
    onCreateLink(drag.fromSessionId, windowId);
    setDrag(null);
  };

  const draggingSession = drag ? sessions.find((session) => session.id === drag.fromSessionId) ?? null : null;

  return (
    <svg
      ref={svgRef}
      className="agent-link-graph"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 1,
        height: 1,
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
        const from = agentPort(session);
        const to = browserPort(node);
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
        const port = agentPort(session);
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
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        );
      })}

      {/* Порты браузеров (вход) */}
      {browserNodes.map((node) => {
        const port = browserPort(node);
        const hasIncoming = boundAgents.some((session) => session.browserWindowId === node.id);
        return (
          <circle
            key={node.id}
            className={`agent-link-port agent-link-port--in ${hasIncoming ? "agent-link-port--bound" : ""}`}
            cx={port.x}
            cy={port.y}
            r={7}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
            onPointerDown={(event) => dropOnNode(event, node.id)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />
        );
      })}

      {/* Черновая линия при перетаскивании */}
      {drag && draggingSession && (
        <path
          d={bezierPath(agentPort(draggingSession), { x: drag.x, y: drag.y })}
          className="agent-link--draft"
        />
      )}
    </svg>
  );
}
