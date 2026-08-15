import { useEffect, useRef, useState } from "react";
import type { BrowserCanvasNode, SessionSnapshot } from "../../../../shared/contracts";

interface AgentLinkGraphProps {
  sessions: SessionSnapshot[];
  browserNodes: BrowserCanvasNode[];
  onCreateLink(terminalId: string, windowId: string): void;
  onRemoveLink(terminalId: string): void;
}

interface DragState {
  kind: "link" | "break";
  /** Для link — сессия-источник; для break — нода браузера. */
  fromId: string;
  x: number;
  y: number;
}

type Side = "top" | "right" | "bottom" | "left";

/** Позиция порта на карточке (относительно карточки, в долях). */
const SIDE_OFFSETS: Record<Side, { x: number; y: number }> = {
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 }
};

const SIDES: Side[] = ["top", "right", "bottom", "left"];

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(48, Math.abs(to.x - from.x) * 0.4);
  return [
    `M ${from.x} ${from.y}`,
    `C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
  ].join(" ");
}

/**
 * Граф связей «агент ↔ браузер» (ноды DaVinci). У каждой карточки 4 порта
 * (по сторонам), видимые ТОЛЬКО при наведении курсора. Линия соединяет
 * ближайшие друг к другу стороны (умный выбор): drag с любого порта,
 * drop на любой порт другой карточки.
 *
 * Геометрия читается из реального DOM (data-canvas-node-id) и обновляется
 * напрямую в requestAnimationFrame (без React-состояния — нет лага).
 */
export function AgentLinkGraph({ sessions, browserNodes, onCreateLink, onRemoveLink }: AgentLinkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  // Нода, линия к которой скрыта до подтверждения IPC (relink/обрыв).
  const [pendingHide, setPendingHide] = useState<string | null>(null);

  // Прямые ссылки на SVG-элементы: ключ `${nodeId}:${side}`.
  const agentPorts = useRef(new Map<string, SVGCircleElement>());
  const browserPorts = useRef(new Map<string, SVGCircleElement>());
  const linkPaths = useRef(new Map<string, SVGPathElement>());
  const draftPath = useRef<SVGPathElement | null>(null);

  const boundAgents = sessions.filter((session) => session.browserWindowId);

  /** Читает DOM-позицию карточки и возвращает координаты порта в SVG-пространстве. */
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

  const cardRect = (nodeId: string): { left: number; top: number; width: number; height: number } | null => {
    const el = document.querySelector<HTMLElement>(`[data-canvas-node-id="${CSS.escape(nodeId)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  /**
   * Выбирает пару сторон для линии: сравнивает центры карточек —
   * горизонтально, если |dx| > |dy|, иначе вертикально.
   */
  const linkSides = (fromId: string, toId: string): { from: Side; to: Side } => {
    const a = cardRect(fromId);
    const b = cardRect(toId);
    if (!a || !b) return { from: "right", to: "left" };
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? { from: "right", to: "left" } : { from: "left", to: "right" };
    }
    return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
  };

  // Ховер: определяем карточку под курсором (порты видны только у неё).
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const card = el?.closest<HTMLElement>("[data-canvas-node-id]");
      setHoverNodeId(card?.dataset.canvasNodeId ?? null);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Сброс pendingHide после подтверждения IPC: если ни одна сессия больше
  // не указывает на скрытую ноду (обрыв) или указала на другую (перенос) —
  // линия к этой ноде больше не существует, скрывать нечего.
  useEffect(() => {
    if (!pendingHide) return;
    const stillBound = boundAgents.some((session) => session.browserWindowId === pendingHide);
    if (!stillBound) setPendingHide(null);
  }, [boundAgents, pendingHide]);

  // rAF: обновляет SVG-геометрию и видимость портов напрямую (без React).
  useEffect(() => {
    const lastPositions = new Map<string, { x: number; y: number }>();
    let raf = 0;
    const update = (): void => {
      const svg = svgRef.current;
      if (svg) {
        const applyPort = (key: string, circle: SVGCircleElement | undefined, pos: { x: number; y: number }): void => {
          if (!circle) return;
          const prev = lastPositions.get(key);
          if (!prev || prev.x !== pos.x || prev.y !== pos.y) {
            lastPositions.set(key, pos);
            circle.setAttribute("cx", String(Math.round(pos.x)));
            circle.setAttribute("cy", String(Math.round(pos.y)));
          }
        };

        // Порты агентов: 4 стороны каждой карточки.
        for (const session of sessions) {
          for (const side of SIDES) {
            applyPort(`a:${session.id}:${side}`, agentPorts.current.get(`${session.id}:${side}`), readPort(session.id, SIDE_OFFSETS[side]));
          }
        }
        // Порты браузеров: 4 стороны каждой карточки.
        for (const node of browserNodes) {
          for (const side of SIDES) {
            applyPort(`b:${node.id}:${side}`, browserPorts.current.get(`${node.id}:${side}`), readPort(node.id, SIDE_OFFSETS[side]));
          }
        }

        // Видимость портов: hover-карточка + источник при drag.
        const hoverId = hoverNodeRef.current;
        const dragging = dragRef.current !== null;
        const showFor = (nodeId: string): boolean => dragging || nodeId === hoverId;
        for (const session of sessions) {
          const show = showFor(session.id);
          for (const side of SIDES) {
            const circle = agentPorts.current.get(`${session.id}:${side}`);
            if (circle) circle.style.opacity = show ? "1" : "0";
          }
        }
        for (const node of browserNodes) {
          const show = showFor(node.id);
          for (const side of SIDES) {
            const circle = browserPorts.current.get(`${node.id}:${side}`);
            if (circle) circle.style.opacity = show ? "1" : "0";
          }
        }

        // Линии связей (умные стороны) + hit/stroke.
        // Скрытие relink-линии управляется React-классом (атомарно с коммитом),
        // здесь — только геометрия. Это исключает вспышку opacity при обрыве/
        // переносе: rAF никогда не показывает линию, которую React уже решил
        // удалить или перенаправить.
        for (const session of boundAgents) {
          const node = browserNodes.find((candidate) => candidate.id === session.browserWindowId);
          const pathHit = linkPaths.current.get(session.id);
          const pathStroke = linkPaths.current.get(`stroke-${session.id}`);
          if (!node || !pathHit || !pathStroke) continue;
          const sides = linkSides(session.id, node.id);
          const from = readPort(session.id, SIDE_OFFSETS[sides.from]);
          const to = readPort(node.id, SIDE_OFFSETS[sides.to]);
          const d = bezierPath(from, to);
          if (pathHit.getAttribute("d") !== d) pathHit.setAttribute("d", d);
          if (pathStroke.getAttribute("d") !== d) pathStroke.setAttribute("d", d);
        }

        // Черновая линия при drag: link — от порта агента; break — от порта браузера.
        if (dragRef.current && draftPath.current) {
          const dragState = dragRef.current;
          if (dragState.kind === "link") {
            const session = sessionsRef.current.find((s) => s.id === dragState.fromId);
            if (session) {
              const from = readPort(session.id, SIDE_OFFSETS[dragFromSideRef.current]);
              const d = bezierPath(from, dragState);
              if (draftPath.current.getAttribute("d") !== d) draftPath.current.setAttribute("d", d);
            }
          } else {
            // break (перетаскивание связи): конец у АГЕНТА остаётся, а конец
            // у браузера следует за курсором — линия тянется за курсором.
            const nodeId = dragState.fromId;
            const session = sessionsRef.current.find((s) => s.browserWindowId === nodeId);
            if (session) {
              const sides = linkSides(session.id, nodeId);
              const from = readPort(session.id, SIDE_OFFSETS[sides.from]);
              const d = bezierPath(from, dragState);
              if (draftPath.current.getAttribute("d") !== d) draftPath.current.setAttribute("d", d);
            }
          }
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [sessions, browserNodes, boundAgents]);

  // Ref-зеркала для rAF.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const hoverNodeRef = useRef<string | null>(hoverNodeId);
  hoverNodeRef.current = hoverNodeId;
  const dragFromSideRef = useRef<Side>("right");

  const clientToSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrag = (event: React.PointerEvent, sessionId: string, side: Side): void => {
    event.stopPropagation();
    event.preventDefault();
    dragFromSideRef.current = side;
    const point = clientToSvg(event.clientX, event.clientY);
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (session?.browserWindowId) {
      // У агента УЖЕ есть связь — переносим существующую линию
      // (браузерный конец следует за курсором), а не создаём новую.
      setDrag({ kind: "break", fromId: session.browserWindowId, x: point.x, y: point.y });
    } else {
      setDrag({ kind: "link", fromId: sessionId, x: point.x, y: point.y });
    }
  };

  /** Отрыв линковки: потянули за порт браузера, у которого есть входящая связь. */
  const startBreakDrag = (event: React.PointerEvent, nodeId: string, side: Side): void => {
    event.stopPropagation();
    event.preventDefault();
    dragFromSideRef.current = side;
    const point = clientToSvg(event.clientX, event.clientY);
    setDrag({ kind: "break", fromId: nodeId, x: point.x, y: point.y });
  };

  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const onMove = (event: PointerEvent): void => {
      const point = clientToSvg(event.clientX, event.clientY);
      setDrag((current) => (current ? { ...current, x: point.x, y: point.y } : current));
    };
    const onUp = (event: PointerEvent): void => {
      const current = dragRef.current;
      if (current?.kind === "link") {
        // link: drop над портом браузера — создаём связь.
        const target = event.target instanceof Element ? event.target.closest("[data-browser-port]") : null;
        const windowId = target?.getAttribute("data-browser-port") ?? null;
        if (windowId) {
          onCreateLink(current.fromId, windowId);
        }
      } else if (current?.kind === "break") {
        // Перетаскивание существующей связи: конец у агента остаётся.
        const session = sessionsRef.current.find((s) => s.browserWindowId === current.fromId);
        if (session) {
          // Над портом браузера → перенос (другая нода — перезаписываем
          // browserWindowId; та же нода — просто возврат, ничего не делаем).
          const target = event.target instanceof Element ? event.target.closest("[data-browser-port]") : null;
          const windowId = target?.getAttribute("data-browser-port") ?? null;
          if (windowId && windowId !== current.fromId) {
            // IPC асинхронный: держим линию скрытой, пока React не получит
            // обновлённые сессии (иначе на 1-2 кадра мелькнёт старая линия).
            setPendingHide(current.fromId);
            onCreateLink(session.id, windowId);
          } else if (!windowId) {
            setPendingHide(current.fromId);
            onRemoveLink(session.id);
          }
        }
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
  }, [dragActive, onCreateLink, onRemoveLink]);

  const draggingSession = drag?.kind === "link"
    ? sessions.find((session) => session.id === drag.fromId) ?? null
    : null;
  const draggingBreak = drag?.kind === "break";

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
      {/* Линии связей */}
      {boundAgents.map((session) => {
        const node = browserNodes.find((candidate) => candidate.id === session.browserWindowId);
        if (!node) return null;
        // Линию, которую сейчас перетаскивают (relink) или чей IPC ещё не
        // подтверждён, скрываем через React-класс — атомарно с коммитом,
        // без вспышки opacity.
        const relinking = (drag?.kind === "break" && drag.fromId === node.id) || pendingHide === node.id;
        return (
          <g
            key={session.id}
            className={`agent-link ${relinking ? "agent-link--hidden" : ""}`}
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
              data-canvas-node-id={session.id}
              className="agent-link__hit"
              d="M 0 0"
            />
            <path
              ref={(el) => {
                if (el) linkPaths.current.set(`stroke-${session.id}`, el);
                else linkPaths.current.delete(`stroke-${session.id}`);
              }}
              data-canvas-node-id={session.id}
              className="agent-link__stroke"
              d="M 0 0"
            />
          </g>
        );
      })}

      {/* Порты агентов: 4 стороны, видимы при hover/drag */}
      {sessions.map((session) =>
        SIDES.map((side) => (
          <circle
            key={`${session.id}:${side}`}
            ref={(el) => {
              if (el) agentPorts.current.set(`${session.id}:${side}`, el);
              else agentPorts.current.delete(`${session.id}:${side}`);
            }}
            data-canvas-node-id={session.id}
            className={`agent-link-port ${session.browserWindowId ? "agent-link-port--bound" : ""}`}
            cx={0}
            cy={0}
            r={7}
            style={{ pointerEvents: "all", cursor: "crosshair", opacity: 0 }}
            onPointerDown={(event) => startDrag(event, session.id, side)}
          />
        ))
      )}

      {/* Порты браузеров: 4 стороны, видимы при hover/drag.
          Если есть входящая связь — pointerdown запускает ОТРЫВ линковки. */}
      {browserNodes.map((node) =>
        SIDES.map((side) => {
          const hasIncoming = boundAgents.some((session) => session.browserWindowId === node.id);
          return (
            <circle
              key={`${node.id}:${side}`}
              ref={(el) => {
                if (el) browserPorts.current.set(`${node.id}:${side}`, el);
                else browserPorts.current.delete(`${node.id}:${side}`);
              }}
              data-browser-port={node.id}
              data-canvas-node-id={node.id}
              className={`agent-link-port agent-link-port--in ${hasIncoming ? "agent-link-port--bound" : ""}`}
              cx={0}
              cy={0}
              r={7}
              style={{ pointerEvents: "all", cursor: hasIncoming ? "alias" : "crosshair", opacity: 0 }}
              onPointerDown={(event) => {
                if (hasIncoming) startBreakDrag(event, node.id, side);
              }}
            />
          );
        })
      )}

      {/* Черновая линия при перетаскивании: link (синяя) или break (красная) */}
      {drag && (draggingSession || draggingBreak) && (
        <path
          ref={draftPath}
          className={`agent-link--draft ${draggingBreak ? "agent-link--draft-break" : ""}`}
          d="M 0 0"
        />
      )}
    </svg>
  );
}
