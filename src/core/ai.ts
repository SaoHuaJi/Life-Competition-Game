import { cloneBoard, setCell } from "./board";
import { getNeighborPositions } from "./neighborhood";
import { createRandomState, nextRandom, pickRandom } from "./random";
import type {
  BoardState,
  MatchConfig,
  Position,
  RaceConfig,
} from "./types";

/**
 * 判断两个种族是否属于同一阵营。
 *
 * Args:
 *   left: 第一个种族配置。
 *   right: 第二个种族配置。
 *
 * Returns:
 *   boolean: true 表示同阵营，false 表示不同阵营。
 */
function areAllied(left: RaceConfig, right: RaceConfig): boolean {
  const leftCampId = left.campId > 0 ? left.campId : left.id;
  const rightCampId = right.campId > 0 ? right.campId : right.id;
  return leftCampId === rightCampId;
}

/**
 * 计算特性作用下的有效最大生命值。
 *
 * Args:
 *   race: 目标种族配置。
 *
 * Returns:
 *   number: 实际用于布子的生命上限。
 */
function getEffectiveHpMax(race: RaceConfig): number {
  if (race.trait === "short_lived") {
    return Math.max(1, Math.ceil(race.hpMax / 2));
  }

  if (race.trait === "long_lived") {
    return Math.max(1, race.hpMax * 2);
  }

  return Math.max(1, race.hpMax);
}

/**
 * 生成与坐标相关的稳定噪声值。
 *
 * Args:
 *   x: 横向坐标。
 *   y: 纵向坐标。
 *   raceId: 种族编号。
 *
 * Returns:
 *   number: 落在 [0, 1) 区间的稳定伪随机值。
 */
function deterministicNoise(x: number, y: number, raceId: number): number {
  const hashed = Math.sin(x * 12.9898 + y * 78.233 + raceId * 37.719) * 43758.5453;
  return hashed - Math.floor(hashed);
}

/**
 * 统计某个位置相对于指定种族的友军与敌军数量。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 对局配置。
 *   position: 目标位置。
 *   raceId: 参考种族编号。
 *
 * Returns:
 *   { friendly: number; enemy: number }: 友军数量与敌军数量。
 */
function countFriendlyEnemy(
  board: BoardState,
  config: MatchConfig,
  position: Position,
  raceId: number,
): { friendly: number; enemy: number } {
  const racesById = new Map(config.races.map((race) => [race.id, race]));
  const referenceRace = racesById.get(raceId);
  const neighbors = getNeighborPositions(board, config.map, position);
  let friendly = 0;
  let enemy = 0;

  neighbors.forEach((neighbor) => {
    const cell = board.cells[neighbor.y][neighbor.x];

    if (cell.raceId === null || cell.hp <= 0) {
      return;
    }

    const neighborRace = racesById.get(cell.raceId);
    if (referenceRace && neighborRace && areAllied(referenceRace, neighborRace)) {
      friendly += 1;
    } else {
      enemy += 1;
    }
  });

  return { friendly, enemy };
}

/**
 * 计算地图几何对候选位置的偏置分数。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 对局配置。
 *   position: 候选位置。
 *
 * Returns:
 *   number: 地图几何偏置分数。
 */
function calculateGeometryBias(
  board: BoardState,
  config: MatchConfig,
  position: Position,
): number {
  const centerBias =
    1 -
    (Math.abs(position.x - board.width / 2) + Math.abs(position.y - board.height / 2)) /
      (board.width + board.height);

  if (config.map.gridType === "hex") {
    return centerBias * 1.15 + (position.y % 2 === 0 ? 0.12 : 0);
  }

  if (config.map.gridType === "triangle") {
    return centerBias * 1.05 + ((position.x + position.y) % 2 === 0 ? 0.16 : 0.04);
  }

  return centerBias;
}

/**
 * 对候选位置做一步局部前瞻评分。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 对局配置。
 *   position: 候选位置。
 *   race: 当前评估种族。
 *
 * Returns:
 *   number: 局部前瞻得分。
 */
function simulatePlacementPreview(
  board: BoardState,
  config: MatchConfig,
  position: Position,
  race: RaceConfig,
): number {
  const previewBoard = cloneBoard(board);
  setCell(previewBoard, position, race.id, race.hpMax);
  const relatedPositions = [position, ...getNeighborPositions(previewBoard, config.map, position)];
  const uniqueKeys = new Set<string>();
  let score = 0;

  relatedPositions.forEach((candidatePosition) => {
    const key = `${candidatePosition.x},${candidatePosition.y}`;
    if (uniqueKeys.has(key)) {
      return;
    }
    uniqueKeys.add(key);

    const cell = previewBoard.cells[candidatePosition.y][candidatePosition.x];
    const { friendly, enemy } = countFriendlyEnemy(
      previewBoard,
      config,
      candidatePosition,
      race.id,
    );
    const survives =
      friendly >= race.surviveRange[0] && friendly <= race.surviveRange[1];
    const birthValue = config.rules.useNetBirth ? friendly - enemy : friendly;
    const canBirth =
      birthValue >= race.birthRange[0] && birthValue <= race.birthRange[1];

    if (cell.raceId === race.id) {
      score += survives ? 2.2 : -1.4;
      score -= enemy * 0.45;
    } else if (cell.raceId === null) {
      score += canBirth ? 1.1 : 0;
    } else {
      score -= enemy * 0.2;
    }
  });

  return score;
}

/**
 * 计算某个空位置的 AI 评分。
 *
 * Args:
 *   board: 当前棋盘快照。
 *   config: 对局配置。
 *   position: 候选位置，x 为列坐标，y 为行坐标。
 *   race: 当前评估的种族配置。
 *
 * Returns:
 *   number: 候选位置得分，分数越高越优。
 */
export function scorePlacement(
  board: BoardState,
  config: MatchConfig,
  position: Position,
  race: RaceConfig,
): number {
  const neighbors = getNeighborPositions(board, config.map, position);
  const friendly = neighbors.filter(
    (neighbor) => board.cells[neighbor.y][neighbor.x].raceId === race.id,
  ).length;
  const occupied = neighbors.filter(
    (neighbor) => board.cells[neighbor.y][neighbor.x].raceId !== null,
  ).length;
  const geometryBias = calculateGeometryBias(board, config, position);
  const previewScore = simulatePlacementPreview(board, config, position, race);

  if (race.aiProfile === "aggressive") {
    return previewScore * 1.6 + occupied * 1.5 + friendly * 0.9 + geometryBias;
  }

  if (race.aiProfile === "defensive") {
    return previewScore * 1.4 + friendly * 1.7 + geometryBias * 0.7 - Math.abs(friendly - 2);
  }

  if (race.aiProfile === "expansion") {
    return (
      previewScore * 1.3 +
      geometryBias * 1.6 +
      occupied * 0.7 +
      nextRandom(createRandomState(position.x + position.y + race.id))
    );
  }

  if (race.aiProfile === "control") {
    return previewScore * 1.45 + geometryBias * 1.35 + friendly;
  }

  if (race.aiProfile === "random") {
    return deterministicNoise(position.x, position.y, race.id) + previewScore * 0.25;
  }

  return previewScore * 1.35 + friendly * 1.1 + occupied * 0.85 + geometryBias;
}

/**
 * 计算一组候选空位的排序结果。
 *
 * Args:
 *   board: 当前棋盘快照。
 *   config: 对局配置。
 *   race: 当前评估的种族配置。
 *   reservedPositions: 需要排除的位置集合，格式为 "x,y"。
 *
 * Returns:
 *   Array<{ position: Position; score: number }>: 按得分从高到低排序的候选位置列表。
 */
export function rankCandidatePlacements(
  board: BoardState,
  config: MatchConfig,
  race: RaceConfig,
  reservedPositions: Set<string>,
): Array<{ position: Position; score: number }> {
  const candidates: Array<{ position: Position; score: number }> = [];

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const key = `${x},${y}`;
      const cell = board.cells[y][x];

      if (cell.raceId !== null || reservedPositions.has(key)) {
        continue;
      }

      candidates.push({
        position: { x, y },
        score: scorePlacement(board, config, { x, y }, race),
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score);
}

/**
 * 为指定种族选择固定数量的布子位置。
 *
 * Args:
 *   board: 当前棋盘快照。
 *   config: 对局配置。
 *   race: 当前评估的种族配置。
 *   amount: 需要选择的位置数量。
 *   reservedPositions: 需要排除的位置集合，格式为 "x,y"。
 *
 * Returns:
 *   Position[]: AI 选出的合法位置列表。
 */
export function selectAIPlacements(
  board: BoardState,
  config: MatchConfig,
  race: RaceConfig,
  amount: number,
  reservedPositions: Set<string>,
): Position[] {
  const randomState = createRandomState(config.rules.seed + race.id * 97 + amount * 13);
  const rankedCandidates = rankCandidatePlacements(board, config, race, reservedPositions);
  const selectionPool = rankedCandidates.slice(0, Math.max(amount * 4, amount));
  const selectedPositions: Position[] = [];
  const selectedKeys = new Set<string>();

  while (selectedPositions.length < amount && selectionPool.length > 0) {
    const choice = pickRandom(randomState, selectionPool);
    const key = `${choice.position.x},${choice.position.y}`;

    if (selectedKeys.has(key)) {
      selectionPool.splice(selectionPool.indexOf(choice), 1);
      continue;
    }

    selectedKeys.add(key);
    selectedPositions.push(choice.position);
  }

  return selectedPositions;
}

/**
 * 为指定种族自动生成开局布子。
 *
 * Args:
 *   board: 当前棋盘。函数内部不会修改输入棋盘，而是返回新棋盘。
 *   config: 对局配置。
 *   race: 当前要布子的种族。
 *   reservedPositions: 已被保留的位置集合，格式为 "x,y"。
 *
 * Returns:
 *   BoardState: 完成布子后的新棋盘。
 */
export function generateAIPlacements(
  board: BoardState,
  config: MatchConfig,
  race: RaceConfig,
  reservedPositions: Set<string>,
): BoardState {
  const nextBoard = cloneBoard(board);
  const selectedPositions = selectAIPlacements(
    nextBoard,
    config,
    race,
    race.initialCells,
    reservedPositions,
  );

  selectedPositions.forEach((position) => {
    const key = `${position.x},${position.y}`;
    reservedPositions.add(key);
    setCell(nextBoard, position, race.id, getEffectiveHpMax(race));
  });

  return nextBoard;
}

/**
 * 将缺失的 AI 开局布子补齐到棋盘。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 对局配置。
 *   humanRaceIds: 由人类玩家控制的种族编号列表。
 *
 * Returns:
 *   BoardState: 已经补齐 AI 开局布子的棋盘。
 */
export function fillAIInitialPlacements(
  board: BoardState,
  config: MatchConfig,
  humanRaceIds: number[],
): BoardState {
  const reservedPositions = new Set<string>();
  let nextBoard = cloneBoard(board);

  nextBoard.cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.raceId !== null) {
        reservedPositions.add(`${x},${y}`);
      }
    });
  });

  config.races.forEach((race) => {
    if (humanRaceIds.includes(race.id)) {
      return;
    }

    const currentCount = nextBoard.cells.flat().filter((cell) => cell.raceId === race.id).length;

    if (currentCount >= race.initialCells) {
      return;
    }

    const patchedRace = {
      ...race,
      initialCells: race.initialCells - currentCount,
    };

    nextBoard = generateAIPlacements(nextBoard, config, patchedRace, reservedPositions);
    nextBoard.cells.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell.raceId !== null) {
          reservedPositions.add(`${x},${y}`);
        }
      });
    });
  });

  return nextBoard;
}
