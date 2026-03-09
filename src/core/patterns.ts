import { createBoardState, getCell, isInsideBoard, setCell } from "./board";
import type {
  BoardState,
  GridType,
  NeighborhoodType,
  Position,
} from "./types";

/**
 * 定义图样模板。
 */
export interface PatternTemplate {
  /**
   * 图样唯一标识。
   */
  id: string;
  /**
   * 图样英文名称或内部名称。
   */
  name: string;
  /**
   * 图样中文标签。
   */
  label: string;
  /**
   * 图样说明。
   */
  description: string;
  /**
   * 该图样适用的地图类型列表。
   */
  supportedGridTypes: GridType[];
  /**
   * 图样内部活细胞相对坐标列表。
   */
  cells: Position[];
  /**
   * 可选的推荐邻域类型列表。
   */
  recommendedNeighborhoodTypes?: NeighborhoodType[];
  /**
   * 是否为用户自定义图样。
   */
  isCustom?: boolean;
}

/**
 * 提供内置图样库。
 */
export const BUILTIN_PATTERNS: PatternTemplate[] = [
  {
    id: "square-block",
    name: "Block",
    label: "方块静物",
    description: "经典康威生命游戏中的稳定静物。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "square-beehive",
    name: "Beehive",
    label: "蜂巢静物",
    description: "经典康威生命游戏中的稳定六单元静物。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ],
  },
  {
    id: "square-loaf",
    name: "Loaf",
    label: "面包静物",
    description: "经典七细胞静物，常见于随机初态的稳定残骸。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
    ],
  },
  {
    id: "square-boat",
    name: "Boat",
    label: "小船静物",
    description: "经典五细胞静物，形状类似一艘小船。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ],
  },
  {
    id: "square-tub",
    name: "Tub",
    label: "澡盆静物",
    description: "经典四细胞空心静物，呈菱形分布。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ],
  },
  {
    id: "square-blinker",
    name: "Blinker",
    label: "闪烁振荡子",
    description: "最基础的二周期振荡子。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  {
    id: "square-beacon",
    name: "Beacon",
    label: "灯塔振荡子",
    description: "经典二周期振荡子，由两个错位方块组成。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ],
  },
  {
    id: "square-toad",
    name: "Toad",
    label: "蟾蜍振荡子",
    description: "经典二周期振荡子。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
  },
  {
    id: "square-pulsar",
    name: "Pulsar",
    label: "脉冲星振荡子",
    description: "经典三周期大型振荡子，是最常见的 p3 振荡子之一。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 9, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 2 },
      { x: 5, y: 2 },
      { x: 7, y: 2 },
      { x: 12, y: 2 },
      { x: 0, y: 3 },
      { x: 5, y: 3 },
      { x: 7, y: 3 },
      { x: 12, y: 3 },
      { x: 0, y: 4 },
      { x: 5, y: 4 },
      { x: 7, y: 4 },
      { x: 12, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 8, y: 5 },
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      { x: 2, y: 7 },
      { x: 3, y: 7 },
      { x: 4, y: 7 },
      { x: 8, y: 7 },
      { x: 9, y: 7 },
      { x: 10, y: 7 },
      { x: 0, y: 8 },
      { x: 5, y: 8 },
      { x: 7, y: 8 },
      { x: 12, y: 8 },
      { x: 0, y: 9 },
      { x: 5, y: 9 },
      { x: 7, y: 9 },
      { x: 12, y: 9 },
      { x: 0, y: 10 },
      { x: 5, y: 10 },
      { x: 7, y: 10 },
      { x: 12, y: 10 },
      { x: 2, y: 12 },
      { x: 3, y: 12 },
      { x: 4, y: 12 },
      { x: 8, y: 12 },
      { x: 9, y: 12 },
      { x: 10, y: 12 },
    ],
  },
  {
    id: "square-pentadecathlon",
    name: "Pentadecathlon",
    label: "烟花",
    description: "短暂绽放，迅速消亡。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 4 },
      { x: 2, y: 4 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 0, y: 6 },
      { x: 3, y: 6 },
      { x: 1, y: 7 },
      { x: 2, y: 7 },
    ],
  },
  {
    id: "square-glider",
    name: "Glider",
    label: "滑翔机",
    description: "经典可移动飞船图样。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ],
  },
  {
    id: "square-lwss",
    name: "LWSS",
    label: "轻型飞船",
    description: "经典正交飞船，以 c/2 速度水平移动。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 1 },
      { x: 0, y: 2 },
      { x: 4, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ],
  },
  {
    id: "square-gosper-gun",
    name: "Gosper Glider Gun",
    label: "高斯帕滑翔机枪",
    description: "首个著名无限增长构型，会周期性发射滑翔机。",
    supportedGridTypes: ["square"],
    recommendedNeighborhoodTypes: ["moore"],
    cells: [
      { x: 24, y: 0 },
      { x: 22, y: 1 },
      { x: 24, y: 1 },
      { x: 12, y: 2 },
      { x: 13, y: 2 },
      { x: 20, y: 2 },
      { x: 21, y: 2 },
      { x: 34, y: 2 },
      { x: 35, y: 2 },
      { x: 11, y: 3 },
      { x: 15, y: 3 },
      { x: 20, y: 3 },
      { x: 21, y: 3 },
      { x: 34, y: 3 },
      { x: 35, y: 3 },
      { x: 0, y: 4 },
      { x: 1, y: 4 },
      { x: 10, y: 4 },
      { x: 16, y: 4 },
      { x: 20, y: 4 },
      { x: 21, y: 4 },
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 10, y: 5 },
      { x: 14, y: 5 },
      { x: 16, y: 5 },
      { x: 17, y: 5 },
      { x: 22, y: 5 },
      { x: 24, y: 5 },
      { x: 10, y: 6 },
      { x: 16, y: 6 },
      { x: 24, y: 6 },
      { x: 11, y: 7 },
      { x: 15, y: 7 },
      { x: 12, y: 8 },
      { x: 13, y: 8 },
    ],
  },
];

/**
 * 保留旧接口，供经典方形测试与兼容逻辑继续使用。
 */
export const CLASSIC_PATTERNS: PatternTemplate[] = BUILTIN_PATTERNS.filter(
  (pattern) => pattern.supportedGridTypes.includes("square"),
);

/**
 * 获取当前地图类型可用的图样列表。
 *
 * Args:
 *   gridType: 当前地图类型。
 *   customPatterns: 用户自定义图样列表。
 *
 * Returns:
 *   PatternTemplate[]: 适用于当前地图的图样列表。
 */
export function getPatternsForGridType(
  gridType: GridType,
  customPatterns: PatternTemplate[] = [],
): PatternTemplate[] {
  return [...BUILTIN_PATTERNS, ...customPatterns].filter((pattern) =>
    pattern.supportedGridTypes.includes(gridType),
  );
}

/**
 * 生成图样的稳定签名，用于去重比较。
 *
 * Args:
 *   pattern: 目标图样模板。
 *
 * Returns:
 *   string: 可用于去重的稳定字符串签名。
 */
export function getPatternSignature(pattern: PatternTemplate): string {
  const normalizedCells = [...pattern.cells]
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((cell) => `${cell.x},${cell.y}`)
    .join("|");
  const supportedGridTypes = [...pattern.supportedGridTypes].sort().join(",");
  return `${supportedGridTypes}::${normalizedCells}`;
}

/**
 * 对图样列表执行稳定去重，保留先出现的项。
 *
 * Args:
 *   patterns: 待去重的图样列表。
 *
 * Returns:
 *   PatternTemplate[]: 去重后的图样列表。
 */
export function dedupePatterns(patterns: PatternTemplate[]): PatternTemplate[] {
  const seen = new Set<string>();

  return patterns.filter((pattern) => {
    const signature = getPatternSignature(pattern);
    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

/**
 * 从当前棋盘提取最小包围盒图样。
 *
 * Args:
 *   board: 当前棋盘。
 *   patternId: 图样标识。
 *   label: 图样显示名称。
 *   gridType: 当前地图类型。
 *
 * Returns:
 *   PatternTemplate | null: 若棋盘上存在活细胞则返回图样，否则返回 null。
 */
export function createCustomPatternFromBoard(
  board: BoardState,
  patternId: string,
  label: string,
  gridType: GridType,
): PatternTemplate | null {
  const aliveCells: Position[] = [];

  board.cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.raceId !== null && cell.hp > 0) {
        aliveCells.push({ x, y });
      }
    });
  });

  if (aliveCells.length === 0) {
    return null;
  }

  const minX = Math.min(...aliveCells.map((cell) => cell.x));
  const minY = Math.min(...aliveCells.map((cell) => cell.y));

  return {
    id: patternId,
    name: patternId,
    label,
    description: "用户从当前棋盘提取的自定义图样。",
    supportedGridTypes: [gridType],
    cells: aliveCells.map((cell) => ({
      x: cell.x - minX,
      y: cell.y - minY,
    })),
    isCustom: true,
  };
}

/**
 * 从当前棋盘的指定选区提取最小包围盒图样。
 *
 * Args:
 *   board: 当前棋盘。
 *   selectedPositions: 被选中的坐标列表。
 *   patternId: 图样标识。
 *   label: 图样显示名称。
 *   gridType: 当前地图类型。
 *
 * Returns:
 *   PatternTemplate | null: 若选区内存在活细胞则返回图样，否则返回 null。
 */
export function createCustomPatternFromSelection(
  board: BoardState,
  selectedPositions: Position[],
  patternId: string,
  label: string,
  gridType: GridType,
): PatternTemplate | null {
  const aliveCells = selectedPositions.filter((position) => {
    const cell = getCell(board, position);
    return cell !== null && cell.raceId !== null && cell.hp > 0;
  });

  if (aliveCells.length === 0) {
    return null;
  }

  const minX = Math.min(...aliveCells.map((cell) => cell.x));
  const minY = Math.min(...aliveCells.map((cell) => cell.y));

  return {
    id: patternId,
    name: patternId,
    label,
    description: "用户从当前选区提取的自定义图样。",
    supportedGridTypes: [gridType],
    cells: aliveCells.map((cell) => ({
      x: cell.x - minX,
      y: cell.y - minY,
    })),
    isCustom: true,
  };
}

/**
 * 判断图样是否能放置到当前棋盘指定位置。
 *
 * Args:
 *   board: 当前棋盘。
 *   pattern: 待放置图样。
 *   offset: 图样左上角偏移。
 *
 * Returns:
 *   boolean: true 表示所有单元格均在边界内且不会与已有细胞冲突。
 */
export function canPlacePatternOnBoard(
  board: BoardState,
  pattern: PatternTemplate,
  offset: Position,
): boolean {
  return pattern.cells.every((cell) => {
    const target = {
      x: cell.x + offset.x,
      y: cell.y + offset.y,
    };
    if (!isInsideBoard(board, target)) {
      return false;
    }

    const existingCell = getCell(board, target);
    return existingCell !== null && (existingCell.raceId === null || existingCell.hp <= 0);
  });
}

/**
 * 将图样叠加放置到现有棋盘。
 *
 * Args:
 *   board: 当前棋盘。
 *   pattern: 待放置图样。
 *   offset: 图样左上角偏移。
 *   raceId: 放置种族编号。
 *   hp: 放置生命值。
 *
 * Returns:
 *   BoardState | null: 若可放置则返回新棋盘，否则返回 null。
 */
export function placePatternOnBoard(
  board: BoardState,
  pattern: PatternTemplate,
  offset: Position,
  raceId: number,
  hp: number,
): BoardState | null {
  if (!canPlacePatternOnBoard(board, pattern, offset)) {
    return null;
  }

  const nextBoard = {
    width: board.width,
    height: board.height,
    cells: board.cells.map((row) => row.map((cell) => ({ ...cell }))),
  };

  pattern.cells.forEach((cell) => {
    setCell(
      nextBoard,
      {
        x: cell.x + offset.x,
        y: cell.y + offset.y,
      },
      raceId,
      hp,
    );
  });

  return nextBoard;
}

/**
 * 将图样绘制到指定棋盘位置。
 *
 * Args:
 *   width: 新棋盘宽度。
 *   height: 新棋盘高度。
 *   pattern: 图样模板。
 *   offset: 图样左上角偏移。
 *   raceId: 放置种族编号。
 *   hp: 放置生命值。
 *
 * Returns:
 *   BoardState: 已绘制图样的新棋盘。
 */
export function createPatternBoard(
  width: number,
  height: number,
  pattern: PatternTemplate,
  offset: Position,
  raceId: number,
  hp: number,
): BoardState {
  const board = createBoardState(width, height);

  pattern.cells.forEach((cell) => {
    setCell(
      board,
      {
        x: cell.x + offset.x,
        y: cell.y + offset.y,
      },
      raceId,
      hp,
    );
  });

  return board;
}
