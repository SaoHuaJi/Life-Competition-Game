import {
  cloneBoard,
  createBoardState,
  getCell,
  resolveBoardDimensions,
  setCell,
} from "./core/board";
import type { BoardState, Position, RaceConfig } from "./core/types";

/**
 * 在调整地图大小后保留原有布子内容。
 *
 * Args:
 *   board: 原始棋盘。
 *   width: 新棋盘宽度。
 *   height: 新棋盘高度。
 *
 * Returns:
 *   BoardState: 调整尺寸后的新棋盘。
 */
export function resizeBoard(board: BoardState, width: number, height: number): BoardState {
  const dimensions = resolveBoardDimensions(width, height);
  const nextBoard = createBoardState(dimensions.width, dimensions.height);

  for (let y = 0; y < Math.min(board.height, dimensions.height); y += 1) {
    for (let x = 0; x < Math.min(board.width, dimensions.width); x += 1) {
      nextBoard.cells[y][x] = { ...board.cells[y][x] };
    }
  }

  return nextBoard;
}

/**
 * 统计某个种族在当前棋盘上的细胞数量。
 *
 * Args:
 *   board: 当前棋盘。
 *   raceId: 目标种族编号。
 *
 * Returns:
 *   number: 该种族在棋盘上的细胞总数。
 */
export function countRaceCells(board: BoardState, raceId: number): number {
  let count = 0;

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const cell = board.cells[y][x];
      if (cell.raceId === raceId && cell.hp > 0) {
        count += 1;
      }
    }
  }

  return count;
}

/**
 * 将布子历史推进一个版本。
 *
 * Args:
 *   history: 历史堆栈。
 *   board: 当前棋盘。
 *
 * Returns:
 *   BoardState[]: 更新后的历史堆栈。
 */
export function pushBoardHistory(history: BoardState[], board: BoardState): BoardState[] {
  return [...history.slice(-39), cloneBoard(board)];
}

/**
 * 返回坐标的稳定字符串键。
 *
 * Args:
 *   position: 目标坐标。
 *
 * Returns:
 *   string: 由 x 与 y 组成的唯一键。
 */
export function toPositionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

/**
 * 从坐标键恢复坐标对象。
 *
 * Args:
 *   key: 由 x,y 组成的字符串键。
 *
 * Returns:
 *   Position: 恢复后的坐标对象。
 */
export function fromPositionKey(key: string): Position {
  const [x, y] = key.split(",").map((value) => Number(value));
  return { x, y };
}

/**
 * 计算两个坐标张成的矩形区域内全部格子。
 *
 * Args:
 *   start: 起点坐标。
 *   end: 终点坐标。
 *
 * Returns:
 *   Position[]: 闭区间矩形内所有格子坐标。
 */
export function getRectanglePositions(start: Position, end: Position): Position[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const positions: Position[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      positions.push({ x, y });
    }
  }

  return positions;
}

/**
 * 对单个格子应用一次普通细胞绘制或擦除。
 *
 * Args:
 *   board: 当前布子棋盘。
 *   position: 本次经过的格子坐标。
 *   race: 当前选中的种族配置。
 *   mode: add 表示绘制，remove 表示擦除。
 *   currentRaceCellCount: 当前种族在传入棋盘上的已布子数量。
 *
 * Returns:
 *   { board: BoardState; changed: boolean; replaced: boolean; limitReached: boolean; nextRaceCellCount: number }:
 *   更新后的棋盘，以及本次是否真实修改、是否覆盖他族、是否触发初始布子上限和更新后的种族细胞数量。
 */
export function applySingleCellEdit(
  board: BoardState,
  position: Position,
  race: RaceConfig,
  mode: "add" | "remove",
  currentRaceCellCount: number,
): {
  board: BoardState;
  changed: boolean;
  replaced: boolean;
  limitReached: boolean;
  nextRaceCellCount: number;
} {
  const targetCell = getCell(board, position);
  if (targetCell === null) {
    return {
      board,
      changed: false,
      replaced: false,
      limitReached: false,
      nextRaceCellCount: currentRaceCellCount,
    };
  }

  if (mode === "remove") {
    if (targetCell.raceId === null || targetCell.hp <= 0) {
      return {
        board,
        changed: false,
        replaced: false,
        limitReached: false,
        nextRaceCellCount: currentRaceCellCount,
      };
    }

    const nextBoard = cloneBoard(board);
    setCell(nextBoard, position, null, 0);
    return {
      board: nextBoard,
      changed: true,
      replaced: false,
      limitReached: false,
      nextRaceCellCount:
        targetCell.raceId === race.id
          ? Math.max(0, currentRaceCellCount - 1)
          : currentRaceCellCount,
    };
  }

  if (targetCell.raceId === race.id && targetCell.hp > 0) {
    return {
      board,
      changed: false,
      replaced: false,
      limitReached: false,
      nextRaceCellCount: currentRaceCellCount,
    };
  }

  if (currentRaceCellCount >= race.initialCells) {
    return {
      board,
      changed: false,
      replaced: false,
      limitReached: true,
      nextRaceCellCount: currentRaceCellCount,
    };
  }

  const nextBoard = cloneBoard(board);
  const replaced = targetCell.raceId !== null && targetCell.hp > 0 && targetCell.raceId !== race.id;
  setCell(nextBoard, position, race.id, race.hpMax);
  return {
    board: nextBoard,
    changed: true,
    replaced,
    limitReached: false,
    nextRaceCellCount: currentRaceCellCount + 1,
  };
}
