import type { BoardState, CellState, Position } from "./types";

/**
 * 无限地图模式下的默认初始棋盘宽度。
 */
export const DEFAULT_INFINITE_BOARD_WIDTH = 96;

/**
 * 无限地图模式下的默认初始棋盘高度。
 */
export const DEFAULT_INFINITE_BOARD_HEIGHT = 72;

/**
 * 定义被选中单元格的快照。
 */
export interface SelectedCellSnapshot {
  /**
   * 原始棋盘坐标。
   */
  position: Position;
  /**
   * 原始单元格内容。
   */
  cell: CellState;
}

/**
 * 创建空单元格。
 *
 * Returns:
 *   CellState: 一个 raceId 为空且 hp 为 0 的空单元格。
 */
export function createEmptyCell(): CellState {
  return {
    raceId: null,
    hp: 0,
  };
}

/**
 * 深拷贝单元格。
 *
 * Args:
 *   cell: 原始单元格状态。
 *
 * Returns:
 *   CellState: 拷贝后的单元格对象。
 */
export function cloneCell(cell: CellState): CellState {
  return {
    raceId: cell.raceId,
    hp: cell.hp,
  };
}

/**
 * 创建空棋盘。
 *
 * Args:
 *   width: 棋盘宽度，单位为单元格数量。
 *   height: 棋盘高度，单位为单元格数量。
 *
 * Returns:
 *   BoardState: 所有单元格均为空的棋盘对象。
 */
export function createBoardState(width: number, height: number): BoardState {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => createEmptyCell()),
    ),
  };
}

/**
 * 将配置宽高转换为实际可分配的棋盘尺寸。
 *
 * Args:
 *   width: 配置中的地图宽度。
 *   height: 配置中的地图高度。
 *
 * Returns:
 *   { width: number; height: number }: 实际用于创建棋盘的尺寸。
 */
export function resolveBoardDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width === 0 && height === 0) {
    return {
      width: DEFAULT_INFINITE_BOARD_WIDTH,
      height: DEFAULT_INFINITE_BOARD_HEIGHT,
    };
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/**
 * 深拷贝棋盘。
 *
 * Args:
 *   board: 原始棋盘。
 *
 * Returns:
 *   BoardState: 复制后的新棋盘。
 */
export function cloneBoard(board: BoardState): BoardState {
  return {
    width: board.width,
    height: board.height,
    cells: board.cells.map((row) => row.map((cell) => cloneCell(cell))),
  };
}

/**
 * 判断坐标是否位于棋盘边界内。
 *
 * Args:
 *   board: 当前棋盘。
 *   position: 待检查位置，x 为列坐标，y 为行坐标。
 *
 * Returns:
 *   boolean: true 表示坐标合法，false 表示越界。
 */
export function isInsideBoard(board: BoardState, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < board.width &&
    position.y >= 0 &&
    position.y < board.height
  );
}

/**
 * 在棋盘上放置细胞。
 *
 * Args:
 *   board: 目标棋盘，会在函数内部原位修改。
 *   position: 放置坐标，x 为列坐标，y 为行坐标。
 *   raceId: 放置种族编号。
 *   hp: 放置后的生命值。
 *
 * Returns:
 *   void: 无返回值。
 */
export function setCell(
  board: BoardState,
  position: Position,
  raceId: number | null,
  hp: number,
): void {
  if (!isInsideBoard(board, position)) {
    return;
  }

  board.cells[position.y][position.x] = {
    raceId,
    hp: raceId === null ? 0 : Math.max(0, hp),
  };
}

/**
 * 统计棋盘中存活细胞总数。
 *
 * Args:
 *   board: 目标棋盘。
 *
 * Returns:
 *   number: 存活细胞数量。
 */
export function countAliveCells(board: BoardState): number {
  return board.cells.reduce(
    (total, row) =>
      total + row.filter((cell) => cell.raceId !== null && cell.hp > 0).length,
    0,
  );
}

/**
 * 读取指定坐标处的单元格。
 *
 * Args:
 *   board: 当前棋盘。
 *   position: 目标坐标。
 *
 * Returns:
 *   CellState | null: 若坐标合法则返回对应单元格，否则返回 null。
 */
export function getCell(board: BoardState, position: Position): CellState | null {
  if (!isInsideBoard(board, position)) {
    return null;
  }

  return board.cells[position.y][position.x];
}

/**
 * 收集当前选区内所有存活细胞快照。
 *
 * Args:
 *   board: 当前棋盘。
 *   positions: 选区坐标列表。
 *
 * Returns:
 *   SelectedCellSnapshot[]: 所有存活细胞的原始位置与内容快照。
 */
export function collectAliveCellSnapshots(
  board: BoardState,
  positions: Position[],
): SelectedCellSnapshot[] {
  return positions
    .map((position) => ({
      position,
      cell: getCell(board, position),
    }))
    .filter(
      (
        item,
      ): item is {
        position: Position;
        cell: CellState;
      } => item.cell !== null && item.cell.raceId !== null && item.cell.hp > 0,
    )
    .map((item) => ({
      position: item.position,
      cell: cloneCell(item.cell),
    }));
}

/**
 * 计算一组坐标的最小包围盒左上角。
 *
 * Args:
 *   positions: 坐标列表。
 *
 * Returns:
 *   Position | null: 若列表非空则返回最小 x/y，否则返回 null。
 */
export function getSelectionOrigin(positions: Position[]): Position | null {
  if (positions.length === 0) {
    return null;
  }

  return {
    x: Math.min(...positions.map((position) => position.x)),
    y: Math.min(...positions.map((position) => position.y)),
  };
}

/**
 * 判断一组选中细胞是否可整体移动到新的左上角位置。
 *
 * Args:
 *   board: 当前棋盘。
 *   snapshots: 被移动的细胞快照列表。
 *   targetOrigin: 目标左上角位置。
 *
 * Returns:
 *   boolean: true 表示可以移动，false 表示越界或与未选中细胞冲突。
 */
export function canMoveSelectedCells(
  board: BoardState,
  snapshots: SelectedCellSnapshot[],
  targetOrigin: Position,
): boolean {
  const currentOrigin = getSelectionOrigin(snapshots.map((snapshot) => snapshot.position));
  if (!currentOrigin) {
    return false;
  }

  const selectedKeys = new Set(
    snapshots.map((snapshot) => `${snapshot.position.x},${snapshot.position.y}`),
  );

  return snapshots.every((snapshot) => {
    const target = {
      x: targetOrigin.x + (snapshot.position.x - currentOrigin.x),
      y: targetOrigin.y + (snapshot.position.y - currentOrigin.y),
    };
    if (!isInsideBoard(board, target)) {
      return false;
    }

    const targetKey = `${target.x},${target.y}`;
    if (selectedKeys.has(targetKey)) {
      return true;
    }

    const targetCell = getCell(board, target);
    return targetCell !== null && (targetCell.raceId === null || targetCell.hp <= 0);
  });
}

/**
 * 将一组选中细胞整体移动到新的左上角位置。
 *
 * Args:
 *   board: 当前棋盘。
 *   snapshots: 被移动的细胞快照列表。
 *   targetOrigin: 目标左上角位置。
 *
 * Returns:
 *   BoardState | null: 若移动合法则返回新棋盘，否则返回 null。
 */
export function moveSelectedCells(
  board: BoardState,
  snapshots: SelectedCellSnapshot[],
  targetOrigin: Position,
): BoardState | null {
  const currentOrigin = getSelectionOrigin(snapshots.map((snapshot) => snapshot.position));
  if (!currentOrigin || !canMoveSelectedCells(board, snapshots, targetOrigin)) {
    return null;
  }

  const nextBoard = cloneBoard(board);
  snapshots.forEach((snapshot) => {
    setCell(nextBoard, snapshot.position, null, 0);
  });

  snapshots.forEach((snapshot) => {
    setCell(
      nextBoard,
      {
        x: targetOrigin.x + (snapshot.position.x - currentOrigin.x),
        y: targetOrigin.y + (snapshot.position.y - currentOrigin.y),
      },
      snapshot.cell.raceId,
      snapshot.cell.hp,
    );
  });

  return nextBoard;
}

/**
 * 判断棋盘上的活细胞是否已经接近边缘。
 *
 * Args:
 *   board: 当前棋盘。
 *   margin: 触发扩张所需的最小安全边距。
 *
 * Returns:
 *   boolean: true 表示存在活细胞靠近边缘，需要扩张。
 */
export function needsBoardExpansion(board: BoardState, margin: number): boolean {
  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const cell = board.cells[y][x];
      if (cell.raceId === null || cell.hp <= 0) {
        continue;
      }

      if (
        x < margin ||
        y < margin ||
        x >= board.width - margin ||
        y >= board.height - margin
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 在棋盘四周增加固定厚度的空白边框。
 *
 * Args:
 *   board: 原始棋盘。
 *   padding: 四周新增的空白边框厚度。
 *
 * Returns:
 *   BoardState: 扩张后的新棋盘。
 */
export function padBoard(board: BoardState, padding: number): BoardState {
  const nextBoard = createBoardState(board.width + padding * 2, board.height + padding * 2);

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      nextBoard.cells[y + padding][x + padding] = cloneCell(board.cells[y][x]);
    }
  }

  return nextBoard;
}

/**
 * 在无限地图模式下为棋盘预留安全边距。
 *
 * Args:
 *   board: 当前棋盘。
 *   margin: 判定靠边的边距。
 *   padding: 触发扩张后每侧新增的空白厚度。
 *
 * Returns:
 *   BoardState: 若需要则返回扩张后的棋盘，否则返回原棋盘拷贝。
 */
export function ensureInfiniteBoardMargin(
  board: BoardState,
  margin = 4,
  padding = 16,
): BoardState {
  if (!needsBoardExpansion(board, margin)) {
    return board;
  }

  return padBoard(board, padding);
}
