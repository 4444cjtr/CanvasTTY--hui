import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  BrowserCanvasState,
  BrowserSnapshot,
  CameraState,
  LocaleId,
  Point,
  SessionBounds
} from "../../../../shared/contracts";
import { UiIcon } from "../../components/UiIcon";
import { t } from "../../lib/i18n";
import { snapMove, snapResize, type ResizeDirection } from "../workspace/snap";

interface BrowserCardProps {
  browser: BrowserSnapshot;
  bounds: BrowserCanvasState;
  locale: LocaleId;
  zoom: number;
  camera: CameraState;
  visible: boolean;
  snapEnabled: boolean;
  snapTargets: readonly SessionBounds[];
  onBoundsChange(bounds: BrowserCanvasState): void;
  onActivate(): void;
  onClose(): void;
  onError(message: string): void;
}

interface DragState {
  pointerId: number;
  startClient: Point;
  startBounds: SessionBounds;
}

interface ResizeState extends DragState {
  direction: ResizeDirection;
}

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export function BrowserCard({
  browser,
  bounds,
  locale,
  zoom,
  camera,
  visible,
  snapEnabled,
  snapTargets,
  onBoundsChange,
  onActivate,
  onClose,
  onError
}: BrowserCardProps): React.JSX.Element {
  const dragState = useRef<DragState | null>(null);
  const resizeState = useRef<ResizeState | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const addressFocused = useRef(false);
  const [position, setPosition] = useState(bounds.position);
  const [size, setSize] = useState(bounds.size);
  const liveBounds = useRef<SessionBounds>(bounds);
  const activeTab = browser.tabs.find((tab) => tab.id === browser.activeTabId) ?? null;
  const [address, setAddress] = useState(activeTab?.url ?? "");
  const summaryMode = zoom < 0.5;
  const summaryScale = summaryMode ? Math.min(2.5, Math.max(1, 0.5 / zoom)) : 1;

  useEffect(() => {
    liveBounds.current = bounds;
    setPosition(bounds.position);
    setSize(bounds.size);
  }, [bounds]);

  useEffect(() => {
    if (!addressFocused.current) setAddress(activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.url]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame = 0;
    const report = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        window.canvasTTY.browser.setViewport({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          visible: visible && !summaryMode
        });
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    window.addEventListener("resize", report);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [camera.x, camera.y, position, size, summaryMode, visible, zoom]);

  useEffect(() => () => {
    window.canvasTTY.browser.setViewport({ x: 0, y: 0, width: 0, height: 0, visible: false });
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest("button, input")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startBounds: liveBounds.current
    };
  };

  const drag = (event: React.PointerEvent<HTMLElement>): void => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const rawPosition = {
      x: state.startBounds.position.x + (event.clientX - state.startClient.x) / zoom,
      y: state.startBounds.position.y + (event.clientY - state.startClient.y) / zoom
    };
    applyBounds({
      position: snapEnabled ? snapMove(rawPosition, state.startBounds.size, snapTargets) : rawPosition,
      size: state.startBounds.size
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    onBoundsChange(liveBounds.current);
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>, direction: ResizeDirection): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeState.current = {
      pointerId: event.pointerId,
      direction,
      startClient: { x: event.clientX, y: event.clientY },
      startBounds: liveBounds.current
    };
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = resizeState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = (event.clientX - state.startClient.x) / zoom;
    const deltaY = (event.clientY - state.startClient.y) / zoom;
    const raw: SessionBounds = {
      position: {
        x: state.startBounds.position.x + (state.direction.includes("w") ? deltaX : 0),
        y: state.startBounds.position.y + (state.direction.includes("n") ? deltaY : 0)
      },
      size: {
        width: state.startBounds.size.width
          + (state.direction.includes("e") ? deltaX : 0)
          - (state.direction.includes("w") ? deltaX : 0),
        height: state.startBounds.size.height
          + (state.direction.includes("s") ? deltaY : 0)
          - (state.direction.includes("n") ? deltaY : 0)
      }
    };
    const constrained = constrainBrowserResize(raw, state.direction);
    applyBounds(snapEnabled ? snapResize(constrained, state.direction, snapTargets) : constrained);
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeState.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState.current = null;
    onBoundsChange(liveBounds.current);
  };

  const applyBounds = (next: SessionBounds): void => {
    liveBounds.current = next;
    setPosition(next.position);
    setSize(next.size);
  };

  const run = (action: () => Promise<unknown>): void => {
    void action().catch((error: unknown) => {
      onError(error instanceof Error ? error.message : t(locale, "browserActionFailed"));
    });
  };

  const submitAddress = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!activeTab) return;
    run(() => window.canvasTTY.browser.navigate(activeTab.id, address));
    addressFocused.current = false;
    (event.currentTarget.elements.namedItem("address") as HTMLInputElement | null)?.blur();
  };

  return (
    <article
      className={`browser-card ${summaryMode ? "browser-card--summary" : ""}`}
      data-interactive="true"
      data-wheel-owner={summaryMode ? undefined : "local"}
      style={{
        width: size.width,
        height: size.height,
        transform: `translate(${position.x}px, ${position.y}px)`,
        "--summary-scale": summaryScale
      } as React.CSSProperties}
    >
      <header
        className="browser-card__tabs"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="browser-card__identity"><UiIcon name="browser" size={17} /><strong>{t(locale, "browser")}</strong></span>
        <div className="browser-card__tab-list">
          {browser.tabs.map((tab) => (
            <div className={`browser-card__tab ${tab.id === browser.activeTabId ? "browser-card__tab--active" : ""}`} key={tab.id}>
              <button type="button" onClick={() => run(() => window.canvasTTY.browser.selectTab(tab.id))} title={tab.title}>
                <span>{tab.title || t(locale, "newTab")}</span>
              </button>
              <button type="button" onClick={() => run(() => window.canvasTTY.browser.closeTab(tab.id))} title={t(locale, "closeTab")} aria-label={t(locale, "closeTab")}>
                <UiIcon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
        <button className="browser-card__new-tab" type="button" onClick={() => run(() => window.canvasTTY.browser.newTab())} title={t(locale, "newTab")} aria-label={t(locale, "newTab")}>
          <UiIcon name="plus" size={16} />
        </button>
        <button className="browser-card__close" type="button" onClick={onClose} title={t(locale, "close")} aria-label={t(locale, "close")}>
          <UiIcon name="close" size={16} />
        </button>
      </header>

      <nav className="browser-card__navigation" aria-label={t(locale, "browserNavigation")}>
        <button className="browser-card__back" type="button" disabled={!activeTab?.canGoBack} onClick={() => activeTab && run(() => window.canvasTTY.browser.back(activeTab.id))} title={t(locale, "back")}>
          <UiIcon name="arrow" size={16} />
        </button>
        <button type="button" disabled={!activeTab?.canGoForward} onClick={() => activeTab && run(() => window.canvasTTY.browser.forward(activeTab.id))} title={t(locale, "forward")}>
          <UiIcon name="arrow" size={16} />
        </button>
        <button type="button" disabled={!activeTab} onClick={() => activeTab && run(() => window.canvasTTY.browser.reload(activeTab.id))} title={t(locale, "reload")}>
          <UiIcon name={activeTab?.loading ? "working" : "reload"} size={16} />
        </button>
        <form onSubmit={submitAddress}>
          <input
            name="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onFocus={() => { addressFocused.current = true; }}
            onBlur={() => { addressFocused.current = false; }}
            placeholder={t(locale, "browserAddress")}
            aria-label={t(locale, "browserAddress")}
          />
        </form>
      </nav>

      <div ref={viewport} className="browser-card__viewport" />
      <button className="browser-card__summary" type="button" onClick={onActivate} aria-label={t(locale, "browser")}>
        <span><UiIcon name="browser" size={38} /><strong>{activeTab?.title || t(locale, "browser")}</strong><small>{activeTab?.url || t(locale, "newTab")}</small></span>
      </button>

      {RESIZE_DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`terminal-card__resize-handle terminal-card__resize-handle--${direction}`}
          aria-hidden="true"
          onPointerDown={(event) => startResize(event, direction)}
          onPointerMove={resize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      ))}
    </article>
  );
}

function constrainBrowserResize(bounds: SessionBounds, direction: ResizeDirection): SessionBounds {
  const right = bounds.position.x + bounds.size.width;
  const bottom = bounds.position.y + bounds.size.height;
  const width = clamp(bounds.size.width, 560, 1_600);
  const height = clamp(bounds.size.height, 380, 1_100);
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
