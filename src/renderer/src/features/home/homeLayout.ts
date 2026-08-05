import type {
  HomeGridSize,
  HomeWidgetPlacement,
  PluginGridSize,
  Size
} from "../../../../shared/contracts";
import {
  DEFAULT_HOME_GRID_SIZE,
  HOME_GRID_CELL_HEIGHT,
  HOME_GRID_CELL_WIDTH,
  HOME_GRID_GAP,
  HOME_GRID_MAX_COLUMNS,
  HOME_GRID_MAX_ROWS,
  HOME_GRID_MIN_COLUMNS,
  HOME_GRID_MIN_ROWS
} from "../../../../shared/contracts.ts";

export interface HomePlacementResult {
  placement: HomeWidgetPlacement;
  gridSize: HomeGridSize;
}

export type HomeResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface UpdateHomePlacementOptions {
  allowOutside?: boolean;
}

export function pluginWidgetId(pluginId: string, contributionId: string): string {
  return `plugin:${pluginId}:${contributionId}`;
}

export function findHomePlacement(
  placements: readonly HomeWidgetPlacement[],
  widgetId: string,
  size: PluginGridSize,
  gridSize: HomeGridSize = DEFAULT_HOME_GRID_SIZE
): HomeWidgetPlacement | null {
  const columnSpan = Math.round(size.columns);
  const rowSpan = Math.round(size.rows);
  if (
    columnSpan < 1
    || rowSpan < 1
    || columnSpan > gridSize.columns
    || rowSpan > gridSize.rows
  ) return null;

  for (let row = 0; row <= gridSize.rows - rowSpan; row += 1) {
    for (let column = 0; column <= gridSize.columns - columnSpan; column += 1) {
      const candidate = { widgetId, column, row, columnSpan, rowSpan };
      if (!placements.some((placement) => placementsOverlap(placement, candidate))) return candidate;
    }
  }
  return null;
}

export function placeHomeWidget(
  placements: readonly HomeWidgetPlacement[],
  widgetId: string,
  size: PluginGridSize,
  currentGridSize: HomeGridSize
): HomePlacementResult | null {
  const first = findHomePlacement(placements, widgetId, size, currentGridSize);
  if (first) return { placement: first, gridSize: currentGridSize };
  if (
    !Number.isFinite(size.columns)
    || !Number.isFinite(size.rows)
    || size.columns > HOME_GRID_MAX_COLUMNS
    || size.rows > HOME_GRID_MAX_ROWS
  ) return null;

  const maxColumnGrowth = HOME_GRID_MAX_COLUMNS - currentGridSize.columns;
  const maxRowGrowth = HOME_GRID_MAX_ROWS - currentGridSize.rows;
  for (let growth = 1; growth <= maxColumnGrowth + maxRowGrowth; growth += 1) {
    for (let rowGrowth = 0; rowGrowth <= Math.min(growth, maxRowGrowth); rowGrowth += 1) {
      const columnGrowth = growth - rowGrowth;
      if (columnGrowth > maxColumnGrowth) continue;
      const gridSize = {
        columns: currentGridSize.columns + columnGrowth,
        rows: currentGridSize.rows + rowGrowth
      };
      const placement = findHomePlacement(placements, widgetId, size, gridSize);
      if (placement) return { placement, gridSize };
    }
  }
  return null;
}

export function updateHomePlacement(
  placements: readonly HomeWidgetPlacement[],
  next: HomeWidgetPlacement,
  gridSize: HomeGridSize = DEFAULT_HOME_GRID_SIZE,
  options: UpdateHomePlacementOptions = {}
): HomeWidgetPlacement[] | null {
  if (!hasValidPlacementGeometry(next)) return null;
  if (!options.allowOutside && !isInsideHome(next, gridSize)) return null;
  if (placements.some((placement) => (
    placement.widgetId !== next.widgetId && placementsOverlap(placement, next)
  ))) return null;
  return placements.map((placement) => placement.widgetId === next.widgetId ? next : placement);
}

export function resizeHomePlacement(
  placement: HomeWidgetPlacement,
  direction: HomeResizeDirection,
  columnDelta: number,
  rowDelta: number
): HomeWidgetPlacement {
  const next = { ...placement };

  if (direction.includes("e")) next.columnSpan += columnDelta;
  if (direction.includes("s")) next.rowSpan += rowDelta;
  if (direction.includes("w")) {
    next.column += columnDelta;
    next.columnSpan -= columnDelta;
  }
  if (direction.includes("n")) {
    next.row += rowDelta;
    next.rowSpan -= rowDelta;
  }

  return next;
}

export function placementsOverlap(left: HomeWidgetPlacement, right: HomeWidgetPlacement): boolean {
  return left.column < right.column + right.columnSpan
    && left.column + left.columnSpan > right.column
    && left.row < right.row + right.rowSpan
    && left.row + left.rowSpan > right.row;
}

export function isInsideHome(
  placement: HomeWidgetPlacement,
  gridSize: HomeGridSize = DEFAULT_HOME_GRID_SIZE
): boolean {
  return placement.column >= 0
    && placement.row >= 0
    && placement.columnSpan > 0
    && placement.rowSpan > 0
    && placement.column + placement.columnSpan <= gridSize.columns
    && placement.row + placement.rowSpan <= gridSize.rows;
}

export function homeLayoutFitsGrid(
  placements: readonly HomeWidgetPlacement[],
  gridSize: HomeGridSize = DEFAULT_HOME_GRID_SIZE
): boolean {
  return placements.every((placement) => isInsideHome(placement, gridSize));
}

export function minimumHomeGridSize(placements: readonly HomeWidgetPlacement[]): HomeGridSize {
  return {
    columns: clamp(
      placements.reduce((maximum, placement) => Math.max(maximum, placement.column + placement.columnSpan), 0),
      HOME_GRID_MIN_COLUMNS,
      HOME_GRID_MAX_COLUMNS
    ),
    rows: clamp(
      placements.reduce((maximum, placement) => Math.max(maximum, placement.row + placement.rowSpan), 0),
      HOME_GRID_MIN_ROWS,
      HOME_GRID_MAX_ROWS
    )
  };
}

export function homeGridPixelSize(gridSize: HomeGridSize): Size {
  return {
    width: gridSize.columns * HOME_GRID_CELL_WIDTH + (gridSize.columns - 1) * HOME_GRID_GAP,
    height: gridSize.rows * HOME_GRID_CELL_HEIGHT + (gridSize.rows - 1) * HOME_GRID_GAP
  };
}

export const HOME_GRID_COLUMN_STEP = HOME_GRID_CELL_WIDTH + HOME_GRID_GAP;
export const HOME_GRID_ROW_STEP = HOME_GRID_CELL_HEIGHT + HOME_GRID_GAP;

function hasValidPlacementGeometry(placement: HomeWidgetPlacement): boolean {
  return Number.isInteger(placement.column)
    && Number.isInteger(placement.row)
    && Number.isInteger(placement.columnSpan)
    && Number.isInteger(placement.rowSpan)
    && placement.columnSpan > 0
    && placement.rowSpan > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
