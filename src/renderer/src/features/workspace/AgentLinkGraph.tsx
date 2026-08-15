import { useEffect, useRef, useState } from "react";
import type { BrowserCanvasNode, SessionSnapshot } from "../../../../shared/contracts";

interface AgentLinkGraphProps {
  sessions: SessionSnapshot[];
  browserNodes: BrowserCanvasNode[];
  onCreateLink(terminalId: string, windowId: string): void;
  onRemoveLink(terminalId: string): void;
}

interface DragState {
  fromSessionId: string;
  x: number;
  y: number;
}

/** Позиция порта на карточке (относительно карточки, в долях). */
function agentPortOffset(): { x: number; y: number } {
  // Выходной порт агента: справа по центру.
  return { x: 1, y: 0.5 };
}

function browserPortOffset(): { x: number; y: number } {
  // Входной порт браузера: слева по центру.
  return { x: 0, y: 0.5 };
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(48, Math.abs(to.x - from.x) * 0.4);
  return [
    `M ${from.x} ${from.y}`,
    `C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  ].join(" ");
}

interface NodeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Граф связей «агент ↔ браузер» (ноды DaVinci). Порты и линии привязаны к
 * РЕАЛЬНОМУ DOM карточек: позиции читаются через getBoundingClientRect и
 * конвертируются в SVG-координаты (SVG покрывает workspace, inset:0).
 * Поэтому при перетаскивании/ресайзе окна (когда session.position в React
 * ещё не обновился — liveBounds живёт в local state карточки) порты и линии
 * следуют за окном: rAF-цикл читает актуальные rect'ы каждый кадр.
 */
export function AgentLinkGraph({ sessions, browserNodes, onCreateLink, onRemoveLink }: AgentLinkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Актуальные DOM-позиции карточек в SVG-координатах (пересчитываются в rAF).
  const [, setTick] = useState(0);

  const boundAgents = sessions.filter((session) => session.browserWindowId);

  // Читает DOM-позиции всех карточек и принудительно ре-рендерит, если они
  // изменились (drag/resize двигают DOM, но не React-пропсы до конца жеста).
  useEffect(() => {
    let raf = 0;
    let last = "";
    const sample = (): void => {
      const parts: string[] = [];
      for (const session of sessions) {
        const el = document.querySelector<HTMLElement>(`[data-canvas-node-id="${CSS.escape(session.id)}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          parts.push(`${session.id}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`);
        }
      }
      for (const node of browserNodes) {
        const el = document.querySelector<HTMLElement>(`[data-canvas-node-id="${CSS.escape(node.id)}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          parts.push(`${node.id}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`);
        }
      }
      const signature = parts.join("|");
      if (signature !== last) {
        last = signature;
        setTick((value) => value + 1);
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [sessions, browserNodes]);

  // Экранная точка → SVG-координаты (SVG покрывает workspace, offset один).
  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /** DOM-позиция карточки → координаты порта в SVG-пространстве. */
  const nodePort = (nodeId: string, offset: { x: number; y: number }): { x: number; y: number } => {
    const el = document.querySelector<HTMLElement>(`[data-canvas-node-id="${CSS.escape(nodeId)}"]`);
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const sr = svg.getBoundingClientRect();
    return {
      x: r.left - sr.left + r.width * offset.x,
      y: r.top - sr.top + r.height * offset.y
    };
  };

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
        const from = nodePort(session.id, agentPortOffset());
        const to = nodePort(node.id, browserPortOffset());
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
        const port = nodePort(session.id, agentPortOffset());
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
        const port = nodePort(node.id, browserPortOffset());
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

      {/* Черновая линия при перетаскивании */}
      {drag && draggingSession && (
        <path
          d={bezierPath(nodePort(draggingSession.id, agentPortOffset()), { x: drag.x, y: drag.y })}
          className="agent-link--draft"
        />
      )}
    </svg>
  );
}
