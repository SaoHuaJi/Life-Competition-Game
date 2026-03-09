import { useEffect, useMemo, useRef, type ReactElement } from "react";
import type {
  BoardState,
  KeyPointState,
  MatchConfig,
  Position,
  RaceConfig,
} from "../core/types";

/**
 * 定义棋盘渲染组件属性。
 */
interface BoardViewProps {
  /**
   * 当前棋盘数据。
   */
  board: BoardState;
  /**
   * 完整对局配置。
   */
  config: MatchConfig;
  /**
   * 种族配置列表。
   */
  races: RaceConfig[];
  /**
   * 当前选中的种族编号。
   */
  selectedRaceId: number;
  /**
   * 关键点列表。
   */
  keyPoints: KeyPointState[];
  /**
   * 当前繁衍阶段的候选新增位置标记。
   */
  candidateMarkers?: Array<{
    raceId: number;
    position: Position;
    conflict: boolean;
  }>;
  /**
   * 当前单元格基础尺寸，单位为像素。
   */
  cellSize: number;
  /**
   * 是否显示生命值文本。
   */
  showHpText: boolean;
  /**
   * 是否显示网格线。
   */
  showGridLines: boolean;
  /**
   * 用于触发居中的计数器。
   */
  centerToken: number;
  /**
   * 是否允许交互修改。
   */
  interactive: boolean;
  /**
   * 左键点击单元格时的回调。
   */
  onCellClick?: (x: number, y: number) => void;
  /**
   * 右键点击单元格时的回调。
   */
  onCellRightClick?: (x: number, y: number) => void;
  /**
   * 单元格鼠标按下事件回调。
   */
  onCellMouseDown?: (x: number, y: number, button: number) => void;
  /**
   * 鼠标进入单元格时的回调。
   */
  onCellMouseEnter?: (x: number, y: number, buttons: number) => void;
  /**
   * 棋盘层鼠标释放时的回调。
   */
  onBoardMouseUp?: () => void;
  /**
   * 鼠标离开棋盘时的回调。
   */
  onBoardMouseLeave?: () => void;
  /**
   * 被选中的图样单元格列表。
   */
  selectedMarkers?: Position[];
  /**
   * 图样放置或移动的预览单元格列表。
   */
  previewMarkers?: Array<{
    position: Position;
    conflict: boolean;
    kind:
      | "place"
      | "move"
      | "cell_add"
      | "cell_remove"
      | "cell_replace"
      | "neighbor"
      | "disaster"
      | "archer";
  }>;
}

/**
 * 定义单元格几何缓存结构。
 */
interface CellGeometry {
  /**
   * 当前几何形状类型。
   */
  shapeType: "rect" | "polygon";
  /**
   * 矩形左上角横坐标。
   */
  x?: number;
  /**
   * 矩形左上角纵坐标。
   */
  y?: number;
  /**
   * 矩形宽度。
   */
  width?: number;
  /**
   * 矩形高度。
   */
  height?: number;
  /**
   * 矩形圆角横向半径。
   */
  rx?: number;
  /**
   * 矩形圆角纵向半径。
   */
  ry?: number;
  /**
   * 多边形点集字符串。
   */
  points?: string;
  /**
   * 图形中心横坐标。
   */
  centerX: number;
  /**
   * 图形中心纵坐标。
   */
  centerY: number;
}

/**
 * 返回 RGB 颜色与透明度混合后的 CSS 颜色字符串。
 *
 * Args:
 *   hexColor: 十六进制颜色。
 *   alpha: 透明度，范围为 [0, 1]。
 *
 * Returns:
 *   string: `rgba(...)` 形式的颜色字符串。
 */
function colorWithAlpha(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");
  const safeColor =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const red = Number.parseInt(safeColor.slice(0, 2), 16);
  const green = Number.parseInt(safeColor.slice(2, 4), 16);
  const blue = Number.parseInt(safeColor.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * 计算方形格子的 SVG 几何信息。
 *
 * Args:
 *   x: 列坐标。
 *   y: 行坐标。
 *   cellSize: 单元格尺寸。
 *
 * Returns:
 *   CellGeometry: 方形单元格的几何缓存数据。
 */
function getSquareShape(
  x: number,
  y: number,
  cellSize: number,
): CellGeometry {
  return {
    shapeType: "rect",
    x: x * cellSize,
    y: y * cellSize,
    width: cellSize,
    height: cellSize,
    rx: 4,
    ry: 4,
    centerX: x * cellSize + cellSize / 2,
    centerY: y * cellSize + cellSize / 2,
  };
}

/**
 * 计算六边形格子的 SVG 几何信息。
 *
 * Args:
 *   x: 列坐标。
 *   y: 行坐标。
 *   cellSize: 参考单元格尺寸。
 *
 * Returns:
 *   CellGeometry: 六边形单元格的几何缓存数据。
 */
function getHexShape(
  x: number,
  y: number,
  cellSize: number,
): CellGeometry {
  const radius = cellSize / 2;
  const hexWidth = Math.sqrt(3) * radius;
  const centerX = hexWidth * (x + 0.5 + (y % 2) * 0.5);
  const centerY = radius + y * radius * 1.5;
  const points = [
    `${centerX},${centerY - radius}`,
    `${centerX + hexWidth / 2},${centerY - radius / 2}`,
    `${centerX + hexWidth / 2},${centerY + radius / 2}`,
    `${centerX},${centerY + radius}`,
    `${centerX - hexWidth / 2},${centerY + radius / 2}`,
    `${centerX - hexWidth / 2},${centerY - radius / 2}`,
  ].join(" ");

  return {
    shapeType: "polygon",
    points,
    centerX,
    centerY,
  };
}

/**
 * 计算三角形格子的 SVG 几何信息。
 *
 * Args:
 *   x: 列坐标。
 *   y: 行坐标。
 *   cellSize: 参考单元格尺寸。
 *
 * Returns:
 *   CellGeometry: 三角形单元格的几何缓存数据。
 */
function getTriangleShape(
  x: number,
  y: number,
  cellSize: number,
): CellGeometry {
  const height = cellSize * 0.86;
  const leftX = x * (cellSize / 2);
  const topY = y * height;
  const pointUp = (x + y) % 2 === 0;
  const points = pointUp
    ? `${leftX},${topY + height} ${leftX + cellSize / 2},${topY} ${leftX + cellSize},${topY + height}`
    : `${leftX},${topY} ${leftX + cellSize},${topY} ${leftX + cellSize / 2},${topY + height}`;

  return {
    shapeType: "polygon",
    points,
    centerX: leftX + cellSize / 2,
    centerY: topY + height / 2,
  };
}

/**
 * 计算当前网格在 SVG 中的总宽高。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 对局配置。
 *   cellSize: 单元格尺寸。
 *
 * Returns:
 *   { width: number; height: number }: 画布宽高。
 */
function getCanvasSize(
  board: BoardState,
  config: MatchConfig,
  cellSize: number,
): { width: number; height: number } {
  if (config.map.gridType === "hex") {
    const radius = cellSize / 2;
    const hexWidth = Math.sqrt(3) * radius;
    return {
      width: hexWidth * (board.width + 0.5),
      height: radius * (board.height * 1.5 + 0.5),
    };
  }

  if (config.map.gridType === "triangle") {
    return {
      width: (board.width + 1) * (cellSize / 2),
      height: board.height * cellSize * 0.86 + cellSize * 0.2,
    };
  }

  return {
    width: board.width * cellSize,
    height: board.height * cellSize,
  };
}

/**
 * 获取指定格子的种族配置。
 *
 * Args:
 *   races: 种族配置列表。
 *   raceId: 种族编号。
 *
 * Returns:
 *   RaceConfig | undefined: 找到则返回对应种族配置，否则返回 undefined。
 */
function getRaceById(
  races: Map<number, RaceConfig>,
  raceId: number | null,
): RaceConfig | undefined {
  if (raceId === null) {
    return undefined;
  }

  return races.get(raceId);
}

/**
 * 渲染生命竞争棋盘。
 *
 * Args:
 *   props: 棋盘组件属性。
 *
 * Returns:
 *   JSX.Element: 棋盘 SVG 视图。
 */
export default function BoardView(props: BoardViewProps): ReactElement {
  const { width, height } = getCanvasSize(props.board, props.config, props.cellSize);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const previousCanvasSizeRef = useRef<{ width: number; height: number } | null>(null);
  const previousCenterTokenRef = useRef(props.centerToken);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const raceMap = useMemo(
    () => new Map(props.races.map((race) => [race.id, race])),
    [props.races],
  );
  const keyPointSet = useMemo(
    () => new Set(props.keyPoints.map((item) => `${item.position.x},${item.position.y}`)),
    [props.keyPoints],
  );
  const geometryGrid = useMemo(() => {
    const rows: CellGeometry[][] = [];

    for (let y = 0; y < props.board.height; y += 1) {
      const row: CellGeometry[] = [];
      for (let x = 0; x < props.board.width; x += 1) {
        row.push(
          props.config.map.gridType === "hex"
            ? getHexShape(x, y, props.cellSize)
            : props.config.map.gridType === "triangle"
              ? getTriangleShape(x, y, props.cellSize)
              : getSquareShape(x, y, props.cellSize),
        );
      }
      rows.push(row);
    }

    return rows;
  }, [props.board.height, props.board.width, props.cellSize, props.config.map.gridType]);

  /**
   * 返回指定坐标的几何缓存。
   *
   * Args:
   *   x: 单元格横坐标。
   *   y: 单元格纵坐标。
   *
   * Returns:
   *   CellGeometry: 对应格子的缓存几何信息。
   */
  function getGeometryAt(x: number, y: number): CellGeometry {
    return geometryGrid[y][x];
  }

  useEffect(() => {
    if (!shellRef.current) {
      previousCanvasSizeRef.current = { width, height };
      previousCenterTokenRef.current = props.centerToken;
      return;
    }

    const shell = shellRef.current;
    const previousSize = previousCanvasSizeRef.current;
    const previousCenterToken = previousCenterTokenRef.current;

    if (props.centerToken !== previousCenterToken || !previousSize) {
      shell.scrollLeft = Math.max(0, (shell.scrollWidth - shell.clientWidth) / 2);
      shell.scrollTop = Math.max(0, (shell.scrollHeight - shell.clientHeight) / 2);
    } else if (width !== previousSize.width || height !== previousSize.height) {
      shell.scrollLeft = Math.max(0, shell.scrollLeft + (width - previousSize.width) / 2);
      shell.scrollTop = Math.max(0, shell.scrollTop + (height - previousSize.height) / 2);
    }

    previousCanvasSizeRef.current = { width, height };
    previousCenterTokenRef.current = props.centerToken;
  }, [props.centerToken, width, height]);

  return (
    <div
      ref={shellRef}
      className="board-shell"
      onMouseDown={(event) => {
        if (event.button !== 1 || !shellRef.current) {
          return;
        }

        event.preventDefault();
        dragStateRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: shellRef.current.scrollLeft,
          scrollTop: shellRef.current.scrollTop,
        };
      }}
      onMouseMove={(event) => {
        if (!shellRef.current || !dragStateRef.current) {
          return;
        }

        shellRef.current.scrollLeft =
          dragStateRef.current.scrollLeft - (event.clientX - dragStateRef.current.startX);
        shellRef.current.scrollTop =
          dragStateRef.current.scrollTop - (event.clientY - dragStateRef.current.startY);
      }}
      onMouseUp={() => {
        dragStateRef.current = null;
      }}
      onMouseLeave={() => {
        dragStateRef.current = null;
      }}
    >
      <svg
        className={`board-svg board-${props.config.map.gridType}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        onMouseUp={() => props.onBoardMouseUp?.()}
        onMouseLeave={() => props.onBoardMouseLeave?.()}
      >
        {props.board.cells.map((row, y) =>
          row.map((cell, x) => {
            const race = getRaceById(raceMap, cell.raceId);
            const selected = cell.raceId === props.selectedRaceId;
            const alpha =
              race && race.hpMax > 0 ? Math.max(0.35, cell.hp / race.hpMax) : 0.16;
            const fillColor =
              race !== undefined ? colorWithAlpha(race.color, alpha) : "rgba(255,255,255,0.08)";
            const strokeColor = selected
              ? "#f6e05e"
              : props.showGridLines
                ? "rgba(255,255,255,0.22)"
                : "transparent";
            const geometry = getGeometryAt(x, y);
            const keyPoint = keyPointSet.has(`${x},${y}`);

            return (
              <g
                key={`${x}-${y}`}
                className={props.interactive ? "cell-group interactive" : "cell-group"}
                onMouseDown={(event) => {
                  if (!props.interactive) {
                    return;
                  }
                  event.preventDefault();
                  props.onCellMouseDown?.(x, y, event.button);
                }}
                onMouseEnter={(event) => {
                  if (!props.interactive) {
                    return;
                  }
                  props.onCellMouseEnter?.(x, y, event.buttons);
                }}
                onClick={() => props.onCellClick?.(x, y)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  props.onCellRightClick?.(x, y);
                }}
              >
                {geometry.shapeType === "rect" ? (
                  <rect
                    x={geometry.x}
                    y={geometry.y}
                    width={geometry.width}
                    height={geometry.height}
                    rx={geometry.rx}
                    ry={geometry.ry}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={selected ? 2.4 : 1}
                  />
                ) : (
                  <polygon
                    points={geometry.points}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={selected ? 2.4 : 1}
                  />
                )}
                {keyPoint ? (
                  <circle
                    cx={geometry.centerX}
                    cy={geometry.centerY}
                    r={Math.max(4, props.cellSize * 0.14)}
                    fill="rgba(246, 224, 94, 0.88)"
                    stroke="#111827"
                    strokeWidth={1.2}
                  />
                ) : null}
                {props.showHpText && cell.raceId !== null && cell.hp > 0 ? (
                  <text
                    x={geometry.centerX}
                    y={geometry.centerY + 4}
                    textAnchor="middle"
                    className="cell-text"
                  >
                    {cell.hp}
                  </text>
                ) : null}
              </g>
            );
          }),
        )}
        {(props.candidateMarkers ?? []).map((marker) => {
          const geometry = getGeometryAt(marker.position.x, marker.position.y);
          const race = getRaceById(raceMap, marker.raceId);

          return (
            <g
              key={`candidate-${marker.raceId}-${marker.position.x}-${marker.position.y}`}
              pointerEvents="none"
            >
              <circle
                cx={geometry.centerX}
                cy={geometry.centerY}
                r={Math.max(5, props.cellSize * 0.16)}
                fill={marker.conflict ? "rgba(239, 68, 68, 0.88)" : "rgba(255,255,255,0.08)"}
                stroke={marker.conflict ? "#fca5a5" : race?.color ?? "#f8fafc"}
                strokeWidth={2}
                strokeDasharray={marker.conflict ? "2 2" : "4 3"}
              />
              {marker.conflict ? (
                <>
                  <line
                    x1={geometry.centerX - Math.max(4, props.cellSize * 0.12)}
                    y1={geometry.centerY - Math.max(4, props.cellSize * 0.12)}
                    x2={geometry.centerX + Math.max(4, props.cellSize * 0.12)}
                    y2={geometry.centerY + Math.max(4, props.cellSize * 0.12)}
                    stroke="#fee2e2"
                    strokeWidth={2}
                  />
                  <line
                    x1={geometry.centerX + Math.max(4, props.cellSize * 0.12)}
                    y1={geometry.centerY - Math.max(4, props.cellSize * 0.12)}
                    x2={geometry.centerX - Math.max(4, props.cellSize * 0.12)}
                    y2={geometry.centerY + Math.max(4, props.cellSize * 0.12)}
                    stroke="#fee2e2"
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </g>
          );
        })}
        {(props.selectedMarkers ?? []).map((marker) => {
          const geometry = getGeometryAt(marker.x, marker.y);

          return (
            <g key={`selected-${marker.x}-${marker.y}`} pointerEvents="none">
              {geometry.shapeType === "rect" ? (
                <rect
                  x={geometry.x}
                  y={geometry.y}
                  width={geometry.width}
                  height={geometry.height}
                  rx={geometry.rx}
                  ry={geometry.ry}
                  fill="rgba(59, 130, 246, 0.16)"
                  stroke="#93c5fd"
                  strokeWidth={2.2}
                  strokeDasharray="5 3"
                />
              ) : (
                <polygon
                  points={geometry.points}
                  fill="rgba(59, 130, 246, 0.16)"
                  stroke="#93c5fd"
                  strokeWidth={2.2}
                  strokeDasharray="5 3"
                />
              )}
            </g>
          );
        })}
        {(props.previewMarkers ?? []).map((marker, index) => {
          const geometry = getGeometryAt(marker.position.x, marker.position.y);
          const fill =
            marker.kind === "move"
              ? marker.conflict
                ? "rgba(239, 68, 68, 0.28)"
                : "rgba(14, 165, 233, 0.22)"
              : marker.kind === "cell_add"
                ? marker.conflict
                  ? "rgba(148, 163, 184, 0.12)"
                  : "rgba(34, 197, 94, 0.24)"
                : marker.kind === "cell_replace"
                  ? marker.conflict
                    ? "rgba(148, 163, 184, 0.12)"
                    : "rgba(250, 204, 21, 0.24)"
              : marker.kind === "cell_remove"
                    ? marker.conflict
                      ? "rgba(148, 163, 184, 0.1)"
                      : "rgba(239, 68, 68, 0.18)"
              : marker.kind === "neighbor"
                ? "rgba(99, 102, 241, 0.18)"
                : marker.kind === "disaster"
                  ? marker.conflict
                    ? "rgba(239, 68, 68, 0.26)"
                    : "rgba(251, 191, 36, 0.18)"
                : marker.kind === "archer"
                  ? marker.conflict
                    ? "rgba(244, 63, 94, 0.26)"
                    : "rgba(236, 72, 153, 0.16)"
              : marker.conflict
                ? "rgba(239, 68, 68, 0.28)"
                : "rgba(34, 197, 94, 0.22)";
          const stroke =
            marker.kind === "move"
              ? marker.conflict
                ? "#fca5a5"
                : "#7dd3fc"
              : marker.kind === "cell_add"
                ? marker.conflict
                  ? "#94a3b8"
                  : "#86efac"
                : marker.kind === "cell_replace"
                  ? marker.conflict
                    ? "#94a3b8"
                    : "#fde68a"
              : marker.kind === "cell_remove"
                    ? marker.conflict
                      ? "#94a3b8"
                      : "#fca5a5"
              : marker.kind === "neighbor"
                ? "#a5b4fc"
                : marker.kind === "disaster"
                  ? marker.conflict
                    ? "#fca5a5"
                    : "#fcd34d"
                : marker.kind === "archer"
                  ? marker.conflict
                    ? "#fecdd3"
                    : "#f9a8d4"
              : marker.conflict
                ? "#fca5a5"
                : "#86efac";

          return (
            <g
              key={`preview-${marker.kind}-${marker.position.x}-${marker.position.y}-${index}`}
              pointerEvents="none"
            >
              {geometry.shapeType === "rect" ? (
                <rect
                  x={geometry.x}
                  y={geometry.y}
                  width={geometry.width}
                  height={geometry.height}
                  rx={geometry.rx}
                  ry={geometry.ry}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                />
              ) : (
                <polygon
                  points={geometry.points}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
