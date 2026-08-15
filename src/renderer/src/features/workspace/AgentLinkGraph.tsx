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

function agentPortOffset(): { x: number; y: number } {
  return { x: 1, y: 0.5 };
}

function browserPortOffset(): { x: number; y: number } {
  return { x: 0, y: 0.5 };
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(48, Math.abs(to.x - from.x) * 0.4);
  return [
    `M ${from.x} ${from.y}`,
    `C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  ].join(" ");
}

/**
 * Граф связей «агент ↔ браузер». Порты/линии привязаны к РЕАЛЬНОМУ DOM
 * карточек (data-canvas-node-id): requestAnimationFrame-цикл читает
 * getBoundingClientRect и обновляет SVG-атрибуты НАПРЯМУЮ (setAttribute),
 * без React-состояния — поэтому линии следуют за окнами и камерой вживую,
 * без лага на re-render. React рендерит только структуру (при изменении
 * сессий/нод), геометрию ведёт rAF.
 */
export function AgentLinkGraph({ sessions, browserNodes, onCreateLink, onRemoveLink }: AgentLinkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Прямые ссылки на SVG-элементы для live-обновления в rAF.
  const linkPaths = useRef(new Map<string, SVGPathElement>());
  const agentPorts = useRef(new Map<string, SVGCircleElement>());
  const browserPorts = useRef(new Map<string, SVGCircleElement>());
  const draftPath = useRef<SVGPathElement | null>(null);

  const boundAgents = sessions.filter((session) => session.browserWindowId);

  // Геометрия карточки → координата порта в SVG-пространстве (client coords).
  const readPort = (nodeId: string, offset: { x: number; y: number }): { x: number; y: number } => {
    const el = document.querySelector<HTMLElement>(`[data-canvas-node-id="${CSS.escape(nodeId)}"]`);
    const svg = svgRef.current;
    if (!el || !svg) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    return {
      x: r.left - sr.left + r.width * offset.x,
      y: r.top - sr.top + r.height * offset.y
    };
  };

  // rAF: обновляет SVG-геометрию напрямую, минуя React (нет лага).
  // Кэш последних координат: setAttribute выполняется только при изменении —
  // неподвижные окна не вызывают перерисовку (layout-read дёшев, DOM-write нет).
  useEffect(() => {
    const lastPositions = new Map<string, { x: number; y: number }>();
    let raf = 0;
    const update = (): void => {
      const svg = svgRef.current;
      if (svg) {
        const applyPort = (key: string, circle: SVGCircleElement | undefined, pos: { x: number; y: number }): void => {
          if (!circle) return;
          const prev = lastPositions.get(key);
          if (prev && prev.x === pos.x && prev.y === pos.y) return;
          lastPositions.set(key, pos);
          circle.setAttribute("cx", String(Math.round(pos.x)));
          circle.setAttribute("cy", String(Math.round(pos.y)));
        };
        // Линии связей.
        for (const session of boundAgents) {
          const node = browserNodes.find((candidate) => candidate.id === session.browserWindowId);
          const path = linkPaths.current.get(session.id);
          if (!node || !path) continue;
          const from = readPort(session.id, agentPortOffset());
          const to = readPort(node.id, browserPortOffset());
          const d = bezierPath(from, to);
          if (path.getAttribute("d") !== d) path.setAttribute("d", d);
        }
        // Порты агентов.
        for (const session of sessions) {
          applyPort(`a:${session.id}`, agentPorts.current.get(session.id), readPort(session.id, agentPortOffset()));
        }
        // Порты браузеров.
        for (const node of browserNodes) {
          applyPort(`b:${node.id}`, browserPorts.current.get(node.id), readPort(node.id, browserPortOffset()));
        }
        // Черновая линия при drag.
        if (dragRef.current && draftPath.current) {
          const session = sessionsRef.current.find((s) => s.id === dragRef.current!.fromSessionId);
          if (session) {
            const from = readPort(session.id, agentPortOffset());
            const d = bezierPath(from, dragRef.current!);
            if (draftPath.current.getAttribute("d") !== d) draftPath.current.setAttribute("d", d);
          }
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [sessions, browserNodes, boundAgents]);

  // Ref-зеркала для rAF (замыкания).
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrag = (event: React.PointerEvent, sessionId: string): void => {
    event.stopPropagation();
    event.preventDefault();
    const point = clientToSvg(event.clientX, event.clientY);
    setDrag({ fromSessionId: sessionId, x: point.x, y: point.y });
  };

  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onMove = (event: PointerEvent): void => {
      const point = clientToSvg(event.clientX, event.clientY);
      setDrag((current) => (current ? { ...current, x: point.x, y: point.y } : current));
    };
    const onUp = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target.closest("[data-browser-port]") : null;
      const windowId = target?.getAttribute("data-browser-port") ?? null;
      if (windowId && dragRef.current) {
        onCreateLink(dragRef.current.fromSessionId, windowId);
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
      {/* Линии связей: rAF обновляет d напрямую (см. linkPaths ref). */}
      {boundAgents.map((session) => {
        const node = browserNodes.find((candidate) => candidate.id === session.browserWindowId);
        if (!node) return null;
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
            <path
              ref={(el) => {
                if (el) linkPaths.current.set(session.id, el);
                else linkPaths.current.delete(session.id);
              }}
              className="agent-link__hit"
              d="M 0 0"
            />
            <path
              ref={(el) => {
                if (el) linkPaths.current.set(`stroke-${session.id}`, el);
                else linkPaths.current.delete(`stroke-${session.id}`);
              }}
              className="agent-link__stroke"
              d="M 0 0"
            />
          </g>
        );
      })}

      {/* Порты агентов */}
      {sessions.map((session) => {
        const bound = Boolean(session.browserWindowId);
        return (
          <circle
            key={session.id}
            ref={(el) => {
              if (el) agentPorts.current.set(session.id, el);
              else agentPorts.current.delete(session.id);
            }}
            className={`agent-link-port ${bound ? "agent-link-port--bound" : ""}`}
            cx={0}
            cy={0}
            r={7}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
            onPointerDown={(event) => startDrag(event, session.id)}
          />
        );
      })}

      {/* Порты браузеров */}
      {browserNodes.map((node) => {
        const hasIncoming = boundAgents.some((session) => session.browserWindowId === node.id);
        return (
          <circle
            key={node.id}
            ref={(el) => {
              if (el) browserPorts.current.set(node.id, el);
              else browserPorts.current.delete(node.id);
            }}
            data-browser-port={node.id}
            className={`agent-link-port agent-link-port--in ${hasIncoming ? "agent-link-port--bound" : ""}`}
            cx={0}
            cy={0}
            r={7}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
          />
        );
      })}

      {/* Черновая линия при перетаскивании */}
      {drag && draggingSession && (
        <path ref={draftPath} className="agent-link--draft" d="M 0 0" />
      )}
    </svg>
  );
}
