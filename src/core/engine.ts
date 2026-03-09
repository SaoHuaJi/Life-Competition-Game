import {
  cloneBoard,
  createBoardState,
  createEmptyCell,
  ensureInfiniteBoardMargin,
  resolveBoardDimensions,
  setCell,
} from "./board";
import { fillAIInitialPlacements, selectAIPlacements } from "./ai";
import {
  buildGraphDistanceMap,
  getLayoutVariant,
  getNeighborPositions,
  getRelativeGraphDistanceOffsets,
  projectRelativeOffsetsToBoard,
} from "./neighborhood";
import { createRandomState, nextRandom, nextRandomInt, pickRandom } from "./random";
import type {
  BirthCandidate,
  BoardState,
  CampRankingEntry,
  CampStats,
  GenerationStats,
  KeyPointState,
  MatchConfig,
  MatchLogEntry,
  RaceRankingEntry,
  MatchState,
  Position,
  RaceConfig,
  ReinforcementPlacement,
  ReplayFrame,
} from "./types";

/**
 * 基于种族编号快速索引种族配置。
 *
 * Args:
 *   config: 完整对局配置。
 *
 * Returns:
 *   Map<number, RaceConfig>: 从 raceId 到 RaceConfig 的映射表。
 */
export function buildRaceMap(config: MatchConfig): Map<number, RaceConfig> {
  return new Map(config.races.map((race) => [race.id, race]));
}

/**
 * 按配置决定是否追加一条日志。
 *
 * Args:
 *   logs: 原始日志列表。
 *   config: 完整对局配置。
 *   entry: 待追加日志。
 *
 * Returns:
 *   MatchLogEntry[]: 追加后的日志列表；若关闭日志则返回原列表。
 */
export function appendLogEntry(
  logs: MatchLogEntry[],
  config: MatchConfig,
  entry: MatchLogEntry,
): MatchLogEntry[] {
  return config.rules.logEnabled ? [...logs, entry] : logs;
}

/**
 * 对手动关键点列表做去重并裁剪到地图范围。
 *
 * Args:
 *   positions: 原始关键点位置列表。
 *   config: 完整对局配置。
 *
 * Returns:
 *   Position[]: 去重且位于地图范围内的关键点列表。
 */
export function normalizeManualKeyPoints(
  positions: Position[],
  config: MatchConfig,
): Position[] {
  const seen = new Set<string>();

  return positions.filter((position) => {
    const key = `${position.x},${position.y}`;
    if (
      seen.has(key) ||
      position.x < 0 ||
      position.x >= config.map.width ||
      position.y < 0 ||
      position.y >= config.map.height
    ) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/**
 * 返回指定种族的阵营编号。
 *
 * Args:
 *   race: 目标种族配置。
 *
 * Returns:
 *   number: 阵营编号；若未配置则退化为种族编号。
 */
export function getRaceCampId(race: RaceConfig): number {
  return race.campId > 0 ? race.campId : race.id;
}

/**
 * 判断两个种族是否属于同一友方阵营。
 *
 * Args:
 *   left: 第一个种族配置。
 *   right: 第二个种族配置。
 *
 * Returns:
 *   boolean: true 表示同阵营友军，false 表示敌对或任一缺失。
 */
export function areRacesAllied(
  left: RaceConfig | undefined,
  right: RaceConfig | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return getRaceCampId(left) === getRaceCampId(right);
}

/**
 * 计算种族在特性作用下的有效最大生命值。
 *
 * Args:
 *   race: 目标种族配置。
 *
 * Returns:
 *   number: 应用于演化与布子的有效生命上限。
 */
export function getEffectiveHpMax(race: RaceConfig): number {
  if (race.trait === "short_lived") {
    return Math.max(1, race.hpMax - 3);
  }

  if (race.trait === "long_lived") {
    return Math.max(1, race.hpMax + 3);
  }

  return Math.max(1, race.hpMax);
}

/**
 * 计算种族在特性作用下的有效繁衍周期。
 *
 * Args:
 *   race: 目标种族配置。
 *   config: 完整对局配置。
 *
 * Returns:
 *   number: 生效中的繁衍周期；0 表示禁用。
 */
export function getEffectiveReinforcementPeriod(
  race: RaceConfig,
  config: MatchConfig,
): number {
  if (config.rules.reinforcement.period <= 0) {
    return 0;
  }

  if (race.trait === "short_lived") {
    return Math.max(1, config.rules.reinforcement.period - 3);
  }

  if (race.trait === "long_lived") {
    return Math.max(1, config.rules.reinforcement.period + 3);
  }

  return config.rules.reinforcement.period;
}

/**
 * 计算种族特性对繁衍数量参数的倍率。
 *
 * Args:
 *   race: 目标种族配置。
 *
 * Returns:
 *   number: 作用在繁衍数量参数上的倍率。
 */
export function getReinforcementAmountMultiplier(race: RaceConfig): number {
  if (race.trait === "short_lived") {
    return 1.25;
  }

  return 1;
}

/**
 * 计算目标种族受到敌对攻击时的受伤倍率。
 *
 * Args:
 *   race: 目标种族配置。
 *
 * Returns:
 *   number: 伤害倍率；小于 1 表示减伤。
 */
export function getIncomingDamageMultiplier(race: RaceConfig): number {
  if (race.trait === "warrior") {
    return 0.75;
  }

  return 1;
}

/**
 * 计算攻击方种族对单次攻击造成的倍率。
 *
 * Args:
 *   race: 攻击方种族配置。
 *
 * Returns:
 *   number: 攻击倍率。
 */
export function getOutgoingDamageMultiplier(race: RaceConfig): number {
  if (race.trait === "warrior") {
    return 1.5;
  }

  return 1;
}

/**
 * 获取某个坐标图距离恰好为指定值的位置集合。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 完整对局配置。
 *   origin: 起点坐标。
 *   distance: 目标图距离。
 *
 * Returns:
 *   Position[]: 满足距离条件的位置列表。
 */
export function getPositionsAtGraphDistance(
  board: BoardState,
  config: MatchConfig,
  origin: Position,
  distance: number,
): Position[] {
  if (distance <= 0) {
    return [origin];
  }

  const visited = new Set<string>([`${origin.x},${origin.y}`]);
  let frontier = [origin];

  for (let step = 0; step < distance; step += 1) {
    const nextFrontier: Position[] = [];

    frontier.forEach((position) => {
      getNeighborPositions(board, config.map, position).forEach((neighbor) => {
        const key = `${neighbor.x},${neighbor.y}`;
        if (visited.has(key)) {
          return;
        }

        visited.add(key);
        nextFrontier.push(neighbor);
      });
    });

    frontier = nextFrontier;
  }

  return frontier;
}

/**
 * 将 odd-r 六边形坐标转换为 cube 坐标。
 *
 * Args:
 *   position: 原始 odd-r 坐标。
 *
 * Returns:
 *   { x: number; y: number; z: number }: 对应的 cube 坐标。
 */
function oddRowToCube(
  position: Position,
): { x: number; y: number; z: number } {
  const x = position.x - (position.y - (position.y & 1)) / 2;
  const z = position.y;
  const y = -x - z;

  return { x, y, z };
}

/**
 * 将 cube 六边形坐标转换回 odd-r 坐标。
 *
 * Args:
 *   cube: cube 坐标。
 *
 * Returns:
 *   Position: 对应的 odd-r 坐标。
 */
function cubeToOddRow(
  cube: { x: number; y: number; z: number },
): Position {
  return {
    x: cube.x + (cube.z - (cube.z & 1)) / 2,
    y: cube.z,
  };
}

const archerOffsetCache = new Map<string, Position[]>();

/**
 * 返回当前地图规则下的射手相对攻击偏移模板。
 *
 * Args:
 *   mapConfig: 地图配置。
 *   layoutVariant: 布局变体编号。方形恒为 0，六边形取行奇偶，三角形取朝向奇偶。
 *
 * Returns:
 *   Position[]: 相对中心点的攻击偏移列表。
 */
function getRelativeArcherOffsets(
  mapConfig: MatchConfig["map"],
  layoutVariant: number,
): Position[] {
  const cacheKey = [
    mapConfig.gridType,
    mapConfig.neighborhoodType,
    layoutVariant,
  ].join(":");
  const cached = archerOffsetCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  let offsets: Position[] = [];

  if (mapConfig.gridType === "square") {
    offsets =
      mapConfig.neighborhoodType === "moore"
        ? [
            { x: -2, y: -2 },
            { x: 0, y: -2 },
            { x: 2, y: -2 },
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: -2, y: 2 },
            { x: 0, y: 2 },
            { x: 2, y: 2 },
          ]
        : [
            { x: 0, y: -2 },
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 2 },
          ];
  } else if (mapConfig.gridType === "hex") {
    const origin = { x: 20, y: layoutVariant };
    const cubeOrigin = oddRowToCube(origin);
    const directions = [
      { x: 1, y: -1, z: 0 },
      { x: 1, y: 0, z: -1 },
      { x: 0, y: 1, z: -1 },
      { x: -1, y: 1, z: 0 },
      { x: -1, y: 0, z: 1 },
      { x: 0, y: -1, z: 1 },
    ];

    offsets = directions.map((direction) => {
      const target = cubeToOddRow({
        x: cubeOrigin.x + direction.x * 2,
        y: cubeOrigin.y + direction.y * 2,
        z: cubeOrigin.z + direction.z * 2,
      });

      return {
        x: target.x - origin.x,
        y: target.y - origin.y,
      };
    });
  } else if (mapConfig.neighborhoodType === "triangle_moore") {
    offsets = getRelativeGraphDistanceOffsets(mapConfig, 2, layoutVariant)
      .filter(
        ({ offset, distance }) => distance === 2 && (offset.x + offset.y) % 2 === 0,
      )
      .map(({ offset }) => offset);
  } else {
    offsets = layoutVariant === 0
      ? [
          { x: -3, y: -1 },
          { x: 3, y: -1 },
          { x: 0, y: 2 },
        ]
      : [
          { x: 0, y: -2 },
          { x: -3, y: 1 },
          { x: 3, y: 1 },
        ];
  }

  archerOffsetCache.set(cacheKey, offsets);
  return offsets;
}

/**
 * 计算指定位置在当前地图规则下的射手攻击范围。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 完整对局配置。
 *   origin: 攻击中心位置。
 *
 * Returns:
 *   Position[]: 射手可以攻击到的目标位置列表，已做边界处理与去重。
 */
export function getArcherAttackPositions(
  board: BoardState,
  config: MatchConfig,
  origin: Position,
): Position[] {
  return [...projectRelativeOffsetsToBoard(
    board,
    config.map,
    origin,
    getRelativeArcherOffsets(config.map, getLayoutVariant(config.map, origin)).map((offset) => ({
      offset,
      distance: 0,
    })),
  ).keys()].map((key) => {
    const [xText, yText] = key.split(",");
    return {
      x: Number.parseInt(xText, 10),
      y: Number.parseInt(yText, 10),
    };
  });
}

/**
 * 计算天灾参数对应的有效最远图距离。
 *
 * Args:
 *   config: 完整对局配置。
 *
 * Returns:
 *   number: 受影响单元格相对落点的最远图距离。范围值为 1 时仅落点受影响，因此返回 0。
 */
export function getEffectiveDisasterDistance(config: MatchConfig): number {
  return Math.max(0, config.rules.disaster.radius - 1);
}

/**
 * 判断某个位置是否位于至少一个天灾中心的影响范围内。
 *
 * Args:
 *   position: 待判断坐标。
 *   strikeCenters: 天灾中心点列表。
 *   config: 完整对局配置。
 *
 * Returns:
 *   boolean: true 表示该位置处在当前天灾半径覆盖内。
 */
export function isWithinDisasterRadius(
  board: BoardState,
  position: Position,
  strikeCenters: Position[],
  config: MatchConfig,
): boolean {
  if (!config.rules.disaster.enabled) {
    return false;
  }

  const effectiveDistance = getEffectiveDisasterDistance(config);

  return strikeCenters.some((center) =>
    (buildGraphDistanceMap(board, config.map, center, effectiveDistance).get(
      `${position.x},${position.y}`,
    ) ?? Number.POSITIVE_INFINITY) <= effectiveDistance,
  );
}

/**
 * 计算目标位置在当前世代受到的敌对伤害。
 *
 * Args:
 *   board: 当前棋盘快照。
 *   config: 完整对局配置。
 *   position: 目标位置。
 *   targetRace: 目标细胞所属种族。
 *   raceMap: 种族映射表。
 *
 * Returns:
 *   number: 对目标产生的总离散伤害值。
 */
export function calculateEnemyDamage(
  board: BoardState,
  config: MatchConfig,
  position: Position,
  targetRace: RaceConfig,
  raceMap: Map<number, RaceConfig>,
): number {
  if (!config.rules.enemyDamageEnabled || config.races.length <= 1) {
    return 0;
  }

  const adjacentPositions = getNeighborPositions(board, config.map, position);
  const archerPositions = getArcherAttackPositions(board, config, position);
  let totalDamage = 0;

  adjacentPositions.forEach((neighbor) => {
    const cell = board.cells[neighbor.y][neighbor.x];
    const attacker = cell.raceId !== null ? raceMap.get(cell.raceId) : undefined;

    if (
      !attacker ||
      cell.hp <= 0 ||
      areRacesAllied(attacker, targetRace) ||
      attacker.trait === "archer"
    ) {
      return;
    }

    totalDamage += calculateSingleEnemyAttackDamage(attacker, targetRace);
  });

  archerPositions.forEach((neighbor) => {
    const cell = board.cells[neighbor.y][neighbor.x];
    const attacker = cell.raceId !== null ? raceMap.get(cell.raceId) : undefined;

    if (
      !attacker ||
      cell.hp <= 0 ||
      areRacesAllied(attacker, targetRace) ||
      attacker.trait !== "archer"
    ) {
      return;
    }

    totalDamage += calculateSingleEnemyAttackDamage(attacker, targetRace);
  });

  return Math.floor(totalDamage);
}

/**
 * 计算单个攻击者对目标造成的一次敌对伤害贡献。
 *
 * Args:
 *   attacker: 攻击方种族配置。
 *   targetRace: 受击方种族配置。
 *
 * Returns:
 *   number: 单次攻击贡献的离散伤害值或浮点伤害值。
 *   若涉及战士特性，则在单次攻击层面按规则取整；否则保留浮点值并交给总伤害统一向下取整。
 */
export function calculateSingleEnemyAttackDamage(
  attacker: RaceConfig,
  targetRace: RaceConfig,
): number {
  const rawDamage =
    (getOutgoingDamageMultiplier(attacker) / Math.max(targetRace.enemyResistance, 0.0001)) *
    getIncomingDamageMultiplier(targetRace);

  // 战士作为攻击方时，其对敌单次伤害先向上取整。
  const attackerAdjustedDamage =
    attacker.trait === "warrior" ? Math.ceil(rawDamage) : rawDamage;

  // 战士作为受击方时，其单次受伤再向上取整。
  if (targetRace.trait === "warrior") {
    return Math.ceil(attackerAdjustedDamage);
  }

  return attackerAdjustedDamage;
}

/**
 * 计算单个细胞在当前单元格中实际承受的天灾伤害。
 *
 * Args:
 *   cellDamage: 该单元格原始天灾伤害。
 *   race: 当前细胞所属种族配置。
 *
 * Returns:
 *   number: 按天灾抗性折算后的离散伤害值。
 */
export function calculateEffectiveDisasterDamage(
  cellDamage: number,
  race: RaceConfig,
): number {
  return Math.floor(cellDamage / Math.max(race.disasterResistance, 0.0001));
}

/**
 * 判断指定种族在当前世代后是否到达自己的繁衍时机。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *   race: 目标种族配置。
 *
 * Returns:
 *   boolean: true 表示该种族应进入繁衍阶段。
 */
export function shouldRaceReinforce(
  state: MatchState,
  config: MatchConfig,
  race: RaceConfig,
): boolean {
  if (!config.rules.reinforcement.enabled) {
    return false;
  }

  const period = getEffectiveReinforcementPeriod(race, config);
  if (period <= 0 || state.generation <= 0) {
    return false;
  }

  const lastSeedGeneration = state.lastSeedGenerations[race.id] ?? 0;
  return state.generation > lastSeedGeneration &&
    (state.generation - lastSeedGeneration) % period === 0;
}

/**
 * 返回本世代后应触发繁衍的所有种族编号。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   number[]: 需要进入繁衍阶段的种族编号列表。
 */
export function getDueReinforcementRaceIds(
  state: MatchState,
  config: MatchConfig,
): number[] {
  return config.races
    .filter((race) => shouldRaceReinforce(state, config, race))
    .map((race) => race.id);
}

/**
 * 统计某个位置相对于指定种族的友军数和敌军数。
 *
 * Args:
 *   board: 当前棋盘快照。
 *   config: 完整对局配置。
 *   position: 目标坐标。
 *   raceId: 参考种族编号。
 *
 * Returns:
 *   { friendly: number; enemy: number }: 友军和敌军数量统计结果。
 */
export function countFriendlyAndEnemy(
  board: BoardState,
  config: MatchConfig,
  position: Position,
  raceId: number,
): { friendly: number; enemy: number } {
  const raceMap = buildRaceMap(config);
  const referenceRace = raceMap.get(raceId);
  const neighbors = getNeighborPositions(board, config.map, position);
  let friendly = 0;
  let enemy = 0;

  neighbors.forEach((neighbor) => {
    const cell = board.cells[neighbor.y][neighbor.x];

    if (cell.raceId === null || cell.hp <= 0) {
      return;
    }

    const neighborRace = raceMap.get(cell.raceId);
    if (areRacesAllied(referenceRace, neighborRace)) {
      friendly += 1;
    } else {
      enemy += 1;
    }
  });

  return { friendly, enemy };
}

/**
 * 计算某个位置受到的天灾伤害。
 *
 * Args:
 *   position: 待计算坐标。
 *   strikeCenters: 天灾中心点列表。
 *   config: 完整对局配置。
 *
 * Returns:
 *   number: 该位置本世代累计受到的天灾伤害。
 */
export function calculateDisasterDamage(
  board: BoardState,
  position: Position,
  strikeCenters: Position[],
  config: MatchConfig,
): number {
  if (!config.rules.disaster.enabled) {
    return 0;
  }

  const effectiveDistance = getEffectiveDisasterDistance(config);

  return strikeCenters.reduce((total, center) => {
    const distance =
      buildGraphDistanceMap(board, config.map, center, effectiveDistance).get(
        `${position.x},${position.y}`,
      ) ?? Number.POSITIVE_INFINITY;

    if (distance > effectiveDistance) {
      return total;
    }

    if (!config.rules.disaster.decay) {
      return total + config.rules.disaster.damage;
    }

    return Math.max(
      total + Math.max(config.rules.disaster.damage - distance * config.rules.disaster.decayFactor, 0),
      0,
    );
  }, 0);
}

/**
 * 基于预计算距离映射计算某个位置受到的天灾伤害。
 *
 * Args:
 *   position: 待计算坐标。
 *   distanceMaps: 每个天灾中心对应的距离映射列表。
 *   config: 完整对局配置。
 *
 * Returns:
 *   number: 该位置本世代累计受到的天灾伤害。
 */
export function calculateDisasterDamageFromMaps(
  position: Position,
  distanceMaps: Map<string, number>[],
  config: MatchConfig,
): number {
  if (!config.rules.disaster.enabled) {
    return 0;
  }

  const effectiveDistance = getEffectiveDisasterDistance(config);

  return distanceMaps.reduce((total, distanceMap) => {
    const distance = distanceMap.get(`${position.x},${position.y}`) ?? Number.POSITIVE_INFINITY;

    if (distance > effectiveDistance) {
      return total;
    }

    if (!config.rules.disaster.decay) {
      return total + config.rules.disaster.damage;
    }

    return Math.max(
      total + Math.max(config.rules.disaster.damage - distance * config.rules.disaster.decayFactor, 0),
      0,
    );
  }, 0);
}

/**
 * 生成本世代天灾中心点列表。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 完整对局配置。
 *   generation: 当前世代编号。
 *
 * Returns:
 *   Position[]: 本世代生效的天灾中心列表。
 */
export function generateDisasterCenters(
  board: BoardState,
  config: MatchConfig,
  generation: number,
): Position[] {
  if (!config.rules.disaster.enabled) {
    return [];
  }

  const randomState = createRandomState(config.rules.seed + generation * 7919);
  if (nextRandom(randomState) > config.rules.disaster.chance) {
    return [];
  }

  const strikeCount = nextRandomInt(
    randomState,
    config.rules.disaster.minStrikes,
    config.rules.disaster.maxStrikes,
  );
  const centers: Position[] = [];

  for (let index = 0; index < strikeCount; index += 1) {
    centers.push({
      x: nextRandomInt(randomState, 0, board.width - 1),
      y: nextRandomInt(randomState, 0, board.height - 1),
    });
  }

  return centers;
}

/**
 * 根据出生冲突策略选出最终出生种族。
 *
 * Args:
 *   candidates: 所有满足出生条件的候选种族。
 *   config: 完整对局配置。
 *   position: 当前待出生坐标。
 *
 * Returns:
 *   number | null: 最终出生的 raceId；若无人出生则返回 null。
 */
export function resolveBirthCandidate(
  candidates: BirthCandidate[],
  config: MatchConfig,
  position: Position,
): number | null {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0].raceId;
  }

  if (config.rules.birthConflictStrategy === "no_birth_on_tie") {
    return null;
  }

  if (config.rules.birthConflictStrategy === "priority_order") {
    return [...candidates].sort((left, right) => left.raceId - right.raceId)[0].raceId;
  }

  if (config.rules.birthConflictStrategy === "max_friendly") {
    const maxFriendly = Math.max(...candidates.map((item) => item.friendly));
    const filtered = candidates.filter((item) => item.friendly === maxFriendly);
    return filtered.length === 1 ? filtered[0].raceId : null;
  }

  if (config.rules.birthConflictStrategy === "max_net_advantage") {
    const maxNetAdvantage = Math.max(...candidates.map((item) => item.netAdvantage));
    const filtered = candidates.filter((item) => item.netAdvantage === maxNetAdvantage);
    return filtered.length === 1 ? filtered[0].raceId : null;
  }

  const randomState = createRandomState(
    config.rules.seed + position.x * 73856093 + position.y * 19349663,
  );
  return pickRandom(randomState, candidates).raceId;
}

/**
 * 统计棋盘上各个种族当前存活细胞数量。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 完整对局配置。
 *
 * Returns:
 *   Record<number, number>: 各个种族当前存活细胞数量映射。
 */
export function countAliveCellsByRace(
  board: BoardState,
  config: MatchConfig,
): Record<number, number> {
  const aliveCellsByRace = Object.fromEntries(config.races.map((race) => [race.id, 0]));

  board.cells.forEach((row) => {
    row.forEach((cell) => {
      if (cell.raceId === null || cell.hp <= 0) {
        return;
      }

      aliveCellsByRace[cell.raceId] = (aliveCellsByRace[cell.raceId] ?? 0) + 1;
    });
  });

  return aliveCellsByRace;
}

/**
 * 统计关键点当前被各个种族占领的数量。
 *
 * Args:
 *   keyPoints: 当前关键点状态列表。
 *   config: 完整对局配置。
 *
 * Returns:
 *   Record<number, number>: 各个种族当前占点数量映射。
 */
export function countControlPointsByRace(
  keyPoints: KeyPointState[],
  config: MatchConfig,
): Record<number, number> {
  const controlPointsByRace = Object.fromEntries(
    config.races.map((race) => [race.id, 0]),
  ) as Record<number, number>;

  keyPoints.forEach((keyPoint) => {
    if (keyPoint.controllingRaceId === null) {
      return;
    }

    controlPointsByRace[keyPoint.controllingRaceId] =
      (controlPointsByRace[keyPoint.controllingRaceId] ?? 0) + 1;
  });

  return controlPointsByRace;
}

/**
 * 基于上一世代进度和棋盘变化更新种族累计统计。
 *
 * Args:
 *   previousProgress: 上一世代累计进度。
 *   previousBoard: 上一世代棋盘。
 *   nextBoard: 当前世代棋盘。
 *   config: 完整对局配置。
 *   countAliveTurn: 是否将本次更新计入存活回合数。
 *
 * Returns:
 *   Record<number, { cumulativeGeneratedCells: number; aliveTurns: number }>:
 *   更新后的累计统计映射。
 */
export function updateRaceProgress(
  previousProgress: MatchState["raceProgress"],
  previousBoard: BoardState,
  nextBoard: BoardState,
  config: MatchConfig,
  countAliveTurn = true,
): MatchState["raceProgress"] {
  const nextProgress = Object.fromEntries(
    config.races.map((race) => {
      const previous = previousProgress[race.id] ?? {
        cumulativeGeneratedCells: 0,
        aliveTurns: 0,
      };
      return [
        race.id,
        {
          cumulativeGeneratedCells: previous.cumulativeGeneratedCells,
          aliveTurns: previous.aliveTurns,
        },
      ];
    }),
  ) as MatchState["raceProgress"];
  const aliveCellsByRace = countAliveCellsByRace(nextBoard, config);

  for (let y = 0; y < nextBoard.height; y += 1) {
    for (let x = 0; x < nextBoard.width; x += 1) {
      const previousCell = previousBoard.cells[y]?.[x];
      const nextCell = nextBoard.cells[y][x];

      if (
        nextCell.raceId !== null &&
        nextCell.hp > 0 &&
        (previousCell?.raceId === null || previousCell?.hp <= 0)
      ) {
        nextProgress[nextCell.raceId].cumulativeGeneratedCells += 1;
      }
    }
  }

  if (countAliveTurn) {
    Object.entries(aliveCellsByRace).forEach(([raceId, aliveCells]) => {
      if (aliveCells > 0) {
        nextProgress[Number(raceId)].aliveTurns += 1;
      }
    });
  }

  return nextProgress;
}

/**
 * 计算对局统计信息。
 *
 * Args:
 *   board: 当前棋盘。
 *   config: 完整对局配置。
  *   generation: 当前世代编号。
  *   keyPoints: 关键点状态列表。
 *   raceProgress: 各个种族的累计进度统计。
 *
 * Returns:
 *   GenerationStats: 当前世代统计结果。
 */
export function computeGenerationStats(
  board: BoardState,
  config: MatchConfig,
  generation: number,
  keyPoints: KeyPointState[],
  raceProgress: MatchState["raceProgress"],
): GenerationStats {
  const controlPointsByRace = countControlPointsByRace(keyPoints, config);
  const raceStats = config.races.map((race) => ({
    raceId: race.id,
    aliveCells: 0,
    totalHp: 0,
    controlPoints: controlPointsByRace[race.id] ?? 0,
    cumulativeGeneratedCells: raceProgress[race.id]?.cumulativeGeneratedCells ?? 0,
    aliveTurns: raceProgress[race.id]?.aliveTurns ?? 0,
  }));
  const statMap = new Map(raceStats.map((item) => [item.raceId, item]));

  board.cells.forEach((row) => {
    row.forEach((cell) => {
      if (cell.raceId === null || cell.hp <= 0) {
        return;
      }

      const target = statMap.get(cell.raceId);
      if (!target) {
        return;
      }

      target.aliveCells += 1;
      target.totalHp += cell.hp;
    });
  });

  return {
    generation,
    raceStats,
    aliveRaceIds: raceStats.filter((item) => item.aliveCells > 0).map((item) => item.raceId),
  };
}

/**
 * 将当前种族统计按阵营进行汇总。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   CampStats[]: 已按阵营聚合后的统计列表。
 */
export function getCampStats(
  state: MatchState,
  config: MatchConfig,
): CampStats[] {
  const campMap = new Map<number, CampStats>();
  const raceMap = buildRaceMap(config);

  state.stats.raceStats.forEach((raceStats) => {
    const race = raceMap.get(raceStats.raceId);
    const campId = race ? getRaceCampId(race) : raceStats.raceId;
    const current = campMap.get(campId) ?? {
      campId,
      aliveCells: 0,
      totalHp: 0,
      controlPoints: 0,
      cumulativeGeneratedCells: 0,
      aliveTurns: 0,
      raceIds: [],
    };

    current.aliveCells += raceStats.aliveCells;
    current.totalHp += raceStats.totalHp;
    current.controlPoints += raceStats.controlPoints;
    current.cumulativeGeneratedCells += raceStats.cumulativeGeneratedCells;
    current.aliveTurns += raceStats.aliveTurns;
    current.raceIds.push(raceStats.raceId);
    campMap.set(campId, current);
  });

  return [...campMap.values()].map((campStats) => ({
    ...campStats,
    raceIds: [...campStats.raceIds].sort((left, right) => left - right),
  }));
}

/**
 * 按当前玩法模式返回完整排名列表。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   RaceRankingEntry[]: 已按规则排序并带名次的排名条目。
 */
export function getRaceRankings(
  state: MatchState,
  config: MatchConfig,
): RaceRankingEntry[] {
  const sortedStats = [...state.stats.raceStats].sort((left, right) => {
    if (config.gameplay.victoryMode === "annihilation") {
      return (
        right.aliveTurns - left.aliveTurns ||
        right.cumulativeGeneratedCells - left.cumulativeGeneratedCells ||
        right.aliveCells - left.aliveCells ||
        right.totalHp - left.totalHp ||
        left.raceId - right.raceId
      );
    }

    if (config.gameplay.victoryMode === "control") {
      return (
        right.controlPoints - left.controlPoints ||
        right.aliveCells - left.aliveCells ||
        right.totalHp - left.totalHp ||
        right.cumulativeGeneratedCells - left.cumulativeGeneratedCells ||
        left.raceId - right.raceId
      );
    }

    return (
      right.aliveCells - left.aliveCells ||
      right.totalHp - left.totalHp ||
      right.cumulativeGeneratedCells - left.cumulativeGeneratedCells ||
      left.raceId - right.raceId
    );
  });

  return sortedStats.map((stats, index) => ({
    raceId: stats.raceId,
    rank: index + 1,
    stats,
  }));
}

/**
 * 按当前玩法模式返回完整阵营排名列表。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   CampRankingEntry[]: 已按规则排序并带名次的阵营排名条目。
 */
export function getCampRankings(
  state: MatchState,
  config: MatchConfig,
): CampRankingEntry[] {
  const sortedStats = getCampStats(state, config).sort((left, right) => {
    if (config.gameplay.victoryMode === "annihilation") {
      return (
        right.aliveTurns - left.aliveTurns ||
        right.cumulativeGeneratedCells - left.cumulativeGeneratedCells ||
        right.aliveCells - left.aliveCells ||
        right.totalHp - left.totalHp ||
        left.campId - right.campId
      );
    }

    if (config.gameplay.victoryMode === "control") {
      return (
        right.controlPoints - left.controlPoints ||
        right.aliveCells - left.aliveCells ||
        right.totalHp - left.totalHp ||
        right.cumulativeGeneratedCells - left.cumulativeGeneratedCells ||
        left.campId - right.campId
      );
    }

    return (
      right.aliveCells - left.aliveCells ||
      right.totalHp - left.totalHp ||
      right.cumulativeGeneratedCells - left.cumulativeGeneratedCells ||
      left.campId - right.campId
    );
  });

  return sortedStats.map((stats, index) => ({
    campId: stats.campId,
    rank: index + 1,
    stats,
  }));
}

/**
 * 创建关键点。
 *
 * Args:
 *   config: 完整对局配置。
 *
 * Returns:
 *   KeyPointState[]: 初始化关键点列表。
 */
export function createKeyPoints(config: MatchConfig): KeyPointState[] {
  if (config.gameplay.victoryMode !== "control") {
    return [];
  }

  if (config.gameplay.keyPointPlacementMode === "manual") {
    return normalizeManualKeyPoints(config.gameplay.manualKeyPoints, config)
      .slice(0, config.gameplay.keyPointCount)
      .map((position) => ({
        position,
        controllingRaceId: null,
        heldTurns: 0,
      }));
  }

  const randomState = createRandomState(config.rules.seed + 4049);
  const positions = new Set<string>();
  const keyPoints: KeyPointState[] = [];

  while (keyPoints.length < config.gameplay.keyPointCount) {
    const position = {
      x: nextRandomInt(randomState, 0, config.map.width - 1),
      y: nextRandomInt(randomState, 0, config.map.height - 1),
    };
    const key = `${position.x},${position.y}`;

    if (positions.has(key)) {
      continue;
    }

    positions.add(key);
    keyPoints.push({
      position,
      controllingRaceId: null,
      heldTurns: 0,
    });
  }

  return keyPoints;
}

/**
 * 更新关键点控制状态。
 *
 * Args:
 *   board: 当前棋盘。
 *   keyPoints: 原始关键点状态列表。
 *
 * Returns:
 *   KeyPointState[]: 更新后的关键点状态。
 */
export function updateKeyPoints(
  board: BoardState,
  keyPoints: KeyPointState[],
): KeyPointState[] {
  return keyPoints.map((keyPoint) => {
    const cell = board.cells[keyPoint.position.y][keyPoint.position.x];

    if (cell.raceId === null || cell.hp <= 0) {
      return {
        ...keyPoint,
        controllingRaceId: null,
        heldTurns: 0,
      };
    }

    if (cell.raceId === keyPoint.controllingRaceId) {
      return {
        ...keyPoint,
        heldTurns: keyPoint.heldTurns + 1,
      };
    }

    return {
      ...keyPoint,
      controllingRaceId: cell.raceId,
      heldTurns: 1,
    };
  });
}

/**
 * 检查当前对局是否满足结束条件。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   { finished: boolean; winnerRaceId: number | null; message: string | null }:
 *   结束判定结果。
 */
export function evaluateVictory(
  state: MatchState,
  config: MatchConfig,
): { finished: boolean; winnerRaceId: number | null; message: string | null } {
  const aliveRaceIds = state.stats.aliveRaceIds;

  if (config.gameplay.victoryMode === "annihilation") {
    if (aliveRaceIds.length === 1) {
      return {
        finished: true,
        winnerRaceId: aliveRaceIds[0],
        message: `种族 ${aliveRaceIds[0]} 完成全歼。`,
      };
    }
  }

  if (config.gameplay.victoryMode === "control") {
    for (const race of config.races) {
      const heldTurns = state.keyPoints
        .filter((keyPoint) => keyPoint.controllingRaceId === race.id)
        .map((keyPoint) => keyPoint.heldTurns)
        .sort((left, right) => right - left);

      if (heldTurns.length < config.gameplay.requiredControlPoints) {
        continue;
      }

      const sustainedTurns = heldTurns[config.gameplay.requiredControlPoints - 1];
      if (sustainedTurns >= config.gameplay.requiredControlTurns) {
        return {
          finished: true,
          winnerRaceId: race.id,
          message: `种族 ${race.id} 达成占点胜利。`,
        };
      }
    }

    if (!config.gameplay.allowRevive && aliveRaceIds.length === 0) {
      const rankings = getRaceRankings(state, config);
      return {
        finished: true,
        winnerRaceId: rankings[0]?.raceId ?? null,
        message: "所有种族已灭绝，按当前排名结算。",
      };
    }
  }

  const shouldUseGenerationLimit =
    config.gameplay.victoryMode === "survival" ||
    ((config.gameplay.victoryMode === "annihilation" ||
      config.gameplay.victoryMode === "control") &&
      config.gameplay.allowEarlyEnd);

  if (shouldUseGenerationLimit && state.generation >= config.gameplay.maxGenerations) {
    const rankings = getRaceRankings(state, config);
    return {
      finished: true,
      winnerRaceId: rankings[0]?.raceId ?? null,
      message: "达到最大回合，按存活数结算。",
    };
  }

  return {
    finished: false,
    winnerRaceId: null,
    message: null,
  };
}

/**
 * 返回当前对局中的人类控制种族编号列表。
 *
 * Args:
 *   config: 完整对局配置。
 *
 * Returns:
 *   number[]: 所有人类控制种族编号列表。
 */
export function getHumanRaceIds(config: MatchConfig): number[] {
  return config.gameplay.mode === "human_vs_ai" ? [config.races[0]?.id ?? 1] : [];
}

/**
 * 判断当前世代后是否应进入繁衍阶段。
 *
 * Args:
 *   generation: 当前世代编号。
 *   config: 完整对局配置。
 *
 * Returns:
 *   boolean: true 表示应进入繁衍阶段，false 表示不进入。
 */
export function isReinforcementGeneration(
  generation: number,
  config: MatchConfig,
): boolean {
  return (
    config.rules.reinforcement.enabled &&
    config.rules.reinforcement.period > 0 &&
    generation > 0 &&
    generation % config.rules.reinforcement.period === 0
  );
}

/**
 * 计算某个种族在当前繁衍阶段的可新增细胞数量。
 *
 * Args:
 *   board: 当前棋盘。
 *   race: 当前种族配置。
 *   config: 完整对局配置。
 *
 * Returns:
 *   number: 该种族本轮可新增的细胞数量。
 */
export function calculateReinforcementAmount(
  board: BoardState,
  race: RaceConfig,
  config: MatchConfig,
): number {
  const currentCount = countAliveCellsByRace(board, config)[race.id] ?? 0;
  return calculateReinforcementAmountFromCurrentCount(currentCount, race, config);
}

/**
 * 基于预先统计好的存活细胞数计算某个种族的繁衍数量。
 *
 * Args:
 *   currentCount: 该种族当前存活细胞数量。
 *   race: 当前种族配置。
 *   config: 完整对局配置。
 *
 * Returns:
 *   number: 该种族本轮可新增的细胞数量。
 */
export function calculateReinforcementAmountFromCurrentCount(
  currentCount: number,
  race: RaceConfig,
  config: MatchConfig,
): number {
  const adjustedAmount = config.rules.reinforcement.amount * getReinforcementAmountMultiplier(race);

  if (currentCount <= 0) {
    return 0;
  }

  if (adjustedAmount <= 1) {
    return Math.ceil(currentCount * adjustedAmount * 0.1);
  }

  return Math.max(Math.floor(adjustedAmount), race.initialCells);
}

/**
 * 判断当前状态是否仍有待人类放置的繁衍名额。
 *
 * Args:
 *   state: 当前对局状态。
 *
 * Returns:
 *   boolean: true 表示仍需人类手动繁衍，false 表示无需等待。
 */
export function hasPendingHumanReinforcement(state: MatchState): boolean {
  return state.humanRaceIds.some(
    (raceId) => (state.reinforcementRemaining[raceId] ?? 0) > 0,
  );
}

/**
 * 判断当前繁衍阶段是否已经完成。
 *
 * Args:
 *   state: 当前对局状态。
 *
 * Returns:
 *   boolean: true 表示所有名额已处理完毕，false 表示仍未完成。
 */
export function isReinforcementResolved(state: MatchState): boolean {
  return Object.values(state.reinforcementRemaining).every((remaining) => remaining <= 0);
}

/**
 * 判断两个位置是否完全相同。
 *
 * Args:
 *   left: 第一个坐标。
 *   right: 第二个坐标。
 *
 * Returns:
 *   boolean: true 表示坐标相同，false 表示不同。
 */
export function isSamePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

/**
 * 根据棋盘与日志重建当前世代的统计与回放帧。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *   board: 更新后的棋盘。
 *   logs: 更新后的完整日志列表。
 *   keyPoints: 更新后的关键点列表。
 *   raceProgress: 更新后的累计进度统计。
 *
 * Returns:
 *   Pick<MatchState, "stats" | "replayFrames" | "logs" | "keyPoints" | "raceProgress">:
 *   回放帧、统计、日志、关键点与累计进度的重建结果。
 */
export function rebuildCurrentGenerationArtifacts(
  state: MatchState,
  config: MatchConfig,
  board: BoardState,
  logs: MatchLogEntry[],
  keyPoints: KeyPointState[],
  raceProgress: MatchState["raceProgress"],
): Pick<MatchState, "stats" | "replayFrames" | "logs" | "keyPoints" | "raceProgress"> {
  const stats = computeGenerationStats(board, config, state.generation, keyPoints, raceProgress);
  const replayFrames = [...state.replayFrames];
  replayFrames[replayFrames.length - 1] = {
    generation: state.generation,
    board: cloneBoard(board),
    stats,
    logs: logs.filter((log) => log.generation === state.generation),
    disasterCenters: replayFrames[replayFrames.length - 1]?.disasterCenters ?? [],
  };

  return {
    stats,
    replayFrames,
    logs,
    keyPoints,
    raceProgress,
  };
}

/**
 * 计算当前繁衍阶段的候选标记列表。
 *
 * Args:
 *   state: 当前对局状态。
 *
 * Returns:
 *   Array<{ raceId: number; position: Position; conflict: boolean }>: 当前所有候选新增位置及其冲突状态。
 */
export function getReinforcementCandidateMarkers(
  state: MatchState,
): Array<{ raceId: number; position: Position; conflict: boolean }> {
  const counter = new Map<string, Set<number>>();

  Object.entries(state.reinforcementPlacements).forEach(([raceId, positions]) => {
    positions.forEach((position) => {
      const key = `${position.x},${position.y}`;
      const current = counter.get(key) ?? new Set<number>();
      current.add(Number(raceId));
      counter.set(key, current);
    });
  });

  return Object.entries(state.reinforcementPlacements).flatMap(([raceId, positions]) =>
    positions.map((position) => {
      const key = `${position.x},${position.y}`;
      return {
        raceId: Number(raceId),
        position,
        conflict: (counter.get(key)?.size ?? 0) > 1,
      };
    }),
  );
}

/**
 * 统一结算当前繁衍阶段的所有候选新增位置。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   MatchState: 应用冲突规则后的新状态。
 */
export function resolveReinforcementPhase(
  state: MatchState,
  config: MatchConfig,
): MatchState {
  if (state.phase !== "reinforcement") {
    return state;
  }

  const nextBoard = cloneBoard(state.board);
  let nextLogs = [...state.logs];
  const candidateMap = new Map<string, number[]>();
  const successfulRaceIds = new Set<number>();
  const raceMap = buildRaceMap(config);

  Object.entries(state.reinforcementPlacements).forEach(([raceId, positions]) => {
    positions.forEach((position) => {
      const key = `${position.x},${position.y}`;
      const current = candidateMap.get(key) ?? [];
      current.push(Number(raceId));
      candidateMap.set(key, current);
    });
  });

  candidateMap.forEach((raceIds, key) => {
    const [xString, yString] = key.split(",");
    const position = { x: Number(xString), y: Number(yString) };
    const originalCell = state.board.cells[position.y]?.[position.x];

    if (!originalCell || originalCell.raceId !== null) {
      nextLogs = appendLogEntry(nextLogs, config, {
        generation: state.generation,
        type: "reinforcement",
        message: `位置 (${position.x}, ${position.y}) 已被占用，繁衍无效。`,
      });
      return;
    }

    const uniqueRaceIds = [...new Set(raceIds)];
    if (uniqueRaceIds.length !== 1) {
      nextLogs = appendLogEntry(nextLogs, config, {
        generation: state.generation,
        type: "reinforcement",
        message: `位置 (${position.x}, ${position.y}) 存在多种族繁衍冲突，未产生新细胞。`,
      });
      return;
    }

    const raceId = uniqueRaceIds[0];
    const race = raceMap.get(raceId);
    if (!race) {
      return;
    }

    setCell(nextBoard, position, raceId, getEffectiveHpMax(race));
    successfulRaceIds.add(raceId);
    nextLogs = appendLogEntry(nextLogs, config, {
      generation: state.generation,
      type: "reinforcement",
      message: `${race.name} 在 (${position.x}, ${position.y}) 成功繁衍出新细胞。`,
    });
  });

  const updatedKeyPoints = updateKeyPoints(nextBoard, state.keyPoints);
  const nextRaceProgress = updateRaceProgress(
    state.raceProgress,
    state.board,
    nextBoard,
    config,
    false,
  );
  const rebuilt = rebuildCurrentGenerationArtifacts(
    state,
    config,
    nextBoard,
    nextLogs,
    updatedKeyPoints,
    nextRaceProgress,
  );

  const nextSeedGenerations = { ...state.lastSeedGenerations };
  state.reinforcementReviveRaceIds.forEach((raceId) => {
    if (successfulRaceIds.has(raceId)) {
      nextSeedGenerations[raceId] = state.generation;
    }
  });

  return {
    ...state,
    board: nextBoard,
    ...rebuilt,
    phase: "simulation",
    reinforcementRemaining: {},
    reinforcementPlacements: {},
    reinforcementPlacementHistory: [],
    reinforcementReviveRaceIds: [],
    lastSeedGenerations: nextSeedGenerations,
  };
}

/**
 * 基于当前棋盘进入繁衍阶段，并由 AI 立即提交自己的新增位置。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   MatchState: 进入繁衍阶段后的对局状态。
 */
export function beginReinforcementPhase(
  state: MatchState,
  config: MatchConfig,
): MatchState {
  let nextLogs = [...state.logs];
  const dueRaceIds = new Set(getDueReinforcementRaceIds(state, config));
  const reviveAllowed =
    config.gameplay.victoryMode === "survival" ||
    (config.gameplay.victoryMode === "control" && config.gameplay.allowRevive);
  const reinforcementRemaining: Record<number, number> = {};
  const reinforcementPlacements: Record<number, Position[]> = {};
  const reinforcementPlacementHistory: ReinforcementPlacement[] = [];
  const reinforcementReviveRaceIds: number[] = [];
  const occupiedPositions = new Set<string>();
  const aliveCellsByRace = countAliveCellsByRace(state.board, config);

  state.board.cells.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.raceId !== null && cell.hp > 0) {
        occupiedPositions.add(`${x},${y}`);
      }
    });
  });

  config.races.forEach((race) => {
    if (!dueRaceIds.has(race.id)) {
      reinforcementRemaining[race.id] = 0;
      reinforcementPlacements[race.id] = [];
      return;
    }

    const currentCount = aliveCellsByRace[race.id] ?? 0;
    const amount =
      currentCount > 0
        ? calculateReinforcementAmountFromCurrentCount(currentCount, race, config)
        : reviveAllowed
          ? race.initialCells
          : 0;
    reinforcementRemaining[race.id] = amount;
    reinforcementPlacements[race.id] = [];

    if (currentCount <= 0 && reviveAllowed && amount > 0) {
      reinforcementReviveRaceIds.push(race.id);
    }
  });

  // AI 在进入繁衍阶段时立即提交新增位置；人类名额保留给 UI 点击操作。
  config.races.forEach((race) => {
    const amount = reinforcementRemaining[race.id] ?? 0;

    if (amount <= 0 || state.humanRaceIds.includes(race.id)) {
      return;
    }

    const chosenPositions = selectAIPlacements(
      state.board,
      config,
      race,
      amount,
      occupiedPositions,
    );

    chosenPositions.forEach((position) => {
      reinforcementPlacements[race.id].push(position);
      reinforcementPlacementHistory.push({
        raceId: race.id,
        position,
        actor: "ai",
      });
    });

    reinforcementRemaining[race.id] = 0;
    nextLogs = appendLogEntry(nextLogs, config, {
      generation: state.generation,
      type: "reinforcement",
      message: `${race.name} 已提交 ${chosenPositions.length} 个繁衍候选位置。`,
    });
  });

  const nextState: MatchState = {
    ...state,
    logs: nextLogs,
    phase: isReinforcementResolved({
      ...state,
      reinforcementRemaining,
      reinforcementPlacements,
      reinforcementPlacementHistory,
    } as MatchState)
      ? "simulation"
      : "reinforcement",
    reinforcementRemaining,
    reinforcementPlacements,
    reinforcementPlacementHistory,
    reinforcementReviveRaceIds,
  };

  if (!hasPendingHumanReinforcement(nextState)) {
    return resolveReinforcementPhase(
      {
        ...nextState,
        phase: "reinforcement",
      },
      config,
    );
  }

  return nextState;
}

/**
 * 在繁衍阶段为指定种族提交一个新增位置。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *   raceId: 提交新增位置的种族编号。
 *   position: 提交位置。
 *
 * Returns:
 *   MatchState: 应用该位置后的新状态；若位置非法则返回原状态。
 */
export function submitReinforcementPlacement(
  state: MatchState,
  config: MatchConfig,
  raceId: number,
  position: Position,
): MatchState {
  if (
    state.phase !== "reinforcement" ||
    !state.humanRaceIds.includes(raceId) ||
    (state.reinforcementRemaining[raceId] ?? 0) <= 0
  ) {
    return state;
  }

  const targetCell = state.board.cells[position.y]?.[position.x];
  if (!targetCell || targetCell.raceId !== null) {
    return state;
  }

  if ((state.reinforcementPlacements[raceId] ?? []).some((item) => isSamePosition(item, position))) {
    return state;
  }

  const race = config.races.find((item) => item.id === raceId);
  if (!race) {
    return state;
  }

  const reinforcementRemaining = {
    ...state.reinforcementRemaining,
    [raceId]: Math.max((state.reinforcementRemaining[raceId] ?? 1) - 1, 0),
  };
  const reinforcementPlacements = {
    ...state.reinforcementPlacements,
    [raceId]: [...(state.reinforcementPlacements[raceId] ?? []), position],
  };
  const reinforcementPlacementHistory = [
    ...state.reinforcementPlacementHistory,
    {
      raceId,
      position,
      actor: "human" as const,
    },
  ];
  const nextLog: MatchLogEntry = {
    generation: state.generation,
    type: "reinforcement",
    message: `${race.name} 提交了 (${position.x}, ${position.y}) 作为繁衍候选位置。`,
  };
  const nextLogs = appendLogEntry([...state.logs], config, nextLog);

  const nextState: MatchState = {
    ...state,
    logs: nextLogs,
    phase: Object.values(reinforcementRemaining).every((remaining) => remaining <= 0)
      ? "simulation"
      : "reinforcement",
    reinforcementRemaining,
    reinforcementPlacements,
    reinforcementPlacementHistory,
  };

  if (Object.values(reinforcementRemaining).every((remaining) => remaining <= 0)) {
    return resolveReinforcementPhase(
      {
        ...nextState,
        phase: "reinforcement",
      },
      config,
    );
  }

  return nextState;
}

/**
 * 撤销当前繁衍阶段最近一次由人类提交的新增位置。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   MatchState: 撤销后的新状态；若不存在可撤销记录则返回原状态。
 */
export function undoLastHumanReinforcementPlacement(
  state: MatchState,
  config: MatchConfig,
): MatchState {
  if (state.phase !== "reinforcement") {
    return state;
  }

  const targetRecord = [...state.reinforcementPlacementHistory]
    .reverse()
    .find((item) => item.actor === "human" && state.humanRaceIds.includes(item.raceId));

  if (!targetRecord) {
    return state;
  }

  return removeHumanReinforcementPlacement(state, config, targetRecord.raceId, targetRecord.position);
}

/**
 * 删除当前繁衍阶段某个已提交的人类新增位置。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *   raceId: 目标种族编号。
 *   position: 需要删除的位置。
 *
 * Returns:
 *   MatchState: 删除后的新状态；若目标位置不可删除则返回原状态。
 */
export function removeHumanReinforcementPlacement(
  state: MatchState,
  config: MatchConfig,
  raceId: number,
  position: Position,
): MatchState {
  if (
    state.phase !== "reinforcement" ||
    !state.humanRaceIds.includes(raceId)
  ) {
    return state;
  }

  const placementList = state.reinforcementPlacements[raceId] ?? [];
  if (!placementList.some((item) => isSamePosition(item, position))) {
    return state;
  }

  const targetCell = state.board.cells[position.y]?.[position.x];
  if (!targetCell || targetCell.raceId !== null) {
    return state;
  }

  const reinforcementRemaining = {
    ...state.reinforcementRemaining,
    [raceId]: (state.reinforcementRemaining[raceId] ?? 0) + 1,
  };
  const reinforcementPlacements = {
    ...state.reinforcementPlacements,
    [raceId]: placementList.filter((item) => !isSamePosition(item, position)),
  };
  const reinforcementPlacementHistory = state.reinforcementPlacementHistory.filter(
    (item) =>
      !(
        item.actor === "human" &&
        item.raceId === raceId &&
        isSamePosition(item.position, position)
      ),
  );
  const race = config.races.find((item) => item.id === raceId);
  const nextLogs = appendLogEntry([...state.logs], config, {
    generation: state.generation,
    type: "reinforcement",
    message: `${race?.name ?? raceId} 撤回了 (${position.x}, ${position.y}) 的繁衍候选位置。`,
  });

  return {
    ...state,
    logs: nextLogs,
    phase: "reinforcement",
    reinforcementRemaining,
    reinforcementPlacements,
    reinforcementPlacementHistory,
  };
}

/**
 * 主动结束人类繁衍阶段，放弃剩余名额。
 *
 * Args:
 *   state: 当前对局状态。
 *
 * Returns:
 *   MatchState: 结束繁衍阶段后的新状态。
 */
export function finishReinforcementPhase(
  state: MatchState,
  config: MatchConfig,
): MatchState {
  if (state.phase !== "reinforcement") {
    return state;
  }

  const nextRemaining = { ...state.reinforcementRemaining };
  state.humanRaceIds.forEach((raceId) => {
    nextRemaining[raceId] = 0;
  });

  return resolveReinforcementPhase(
    {
      ...state,
      phase: "reinforcement",
      reinforcementRemaining: nextRemaining,
    },
    config,
  );
}

/**
 * 提前结束当前对局，并保留当前棋盘与统计结果。
 *
 * Args:
 *   state: 当前对局状态。
 *   message: 结束时写入日志的说明文本。
 *
 * Returns:
 *   MatchState: 标记为已结束的新状态。
 */
export function terminateMatch(state: MatchState, config: MatchConfig, message: string): MatchState {
  if (state.finished) {
    return state;
  }

  const nextLog: MatchLogEntry = {
    generation: state.generation,
    type: "result",
    message,
  };

  return {
    ...state,
    logs: appendLogEntry([...state.logs], config, nextLog),
    finished: true,
    winnerRaceId: state.winnerRaceId,
    phase: "simulation",
    reinforcementRemaining: {},
    reinforcementPlacements: {},
    reinforcementPlacementHistory: [],
    reinforcementReviveRaceIds: [],
  };
}

/**
 * 基于当前棋盘执行一次同步世代更新。
 *
 * Args:
 *   state: 当前对局状态。
 *   config: 完整对局配置。
 *
 * Returns:
 *   MatchState: 更新后的新对局状态。
 */
export function stepMatch(state: MatchState, config: MatchConfig): MatchState {
  if (state.finished || state.phase !== "simulation") {
    return state;
  }

  const simulationBoard =
    config.map.width === 0 && config.map.height === 0
      ? ensureInfiniteBoardMargin(state.board)
      : state.board;
  const raceMap = buildRaceMap(config);
  const strikeCenters = generateDisasterCenters(simulationBoard, config, state.generation + 1);
  const effectiveDisasterDistance = getEffectiveDisasterDistance(config);
  const disasterDistanceMaps = strikeCenters.map((center) =>
    buildGraphDistanceMap(simulationBoard, config.map, center, effectiveDisasterDistance),
  );
  const nextBoard = createBoardState(simulationBoard.width, simulationBoard.height);
  let stepLogs: MatchLogEntry[] = [];

  // 先同步计算所有格子的下一世代结果，避免按扫描顺序覆盖原状态。
  for (let y = 0; y < simulationBoard.height; y += 1) {
    for (let x = 0; x < simulationBoard.width; x += 1) {
      const position = { x, y };
      const currentCell = simulationBoard.cells[y][x];

      if (currentCell.raceId !== null && currentCell.hp > 0) {
        const race = raceMap.get(currentCell.raceId);

        if (!race) {
          nextBoard.cells[y][x] = createEmptyCell();
          continue;
        }

        const { friendly, enemy } = countFriendlyAndEnemy(
          simulationBoard,
          config,
          position,
          race.id,
        );
        const survives =
          friendly >= race.surviveRange[0] && friendly <= race.surviveRange[1];
        const enemyDamage = calculateEnemyDamage(
          simulationBoard,
          config,
          position,
          race,
          raceMap,
        );
        const disasterDamage = calculateEffectiveDisasterDamage(
          calculateDisasterDamageFromMaps(position, disasterDistanceMaps, config),
          race,
        );
        const effectiveHpMax = getEffectiveHpMax(race);
        const hpNext = Math.max(
          0,
          Math.min(
            effectiveHpMax,
            currentCell.hp +
              (survives ? race.regen : 0) -
              (survives ? 0 : 1) -
              enemyDamage -
              disasterDamage,
          ),
        );

        nextBoard.cells[y][x] =
          hpNext > 0
            ? {
                raceId: race.id,
                hp: hpNext,
              }
            : createEmptyCell();
        continue;
      }

      const candidates: BirthCandidate[] = config.races
        .map((race) => {
          const { friendly, enemy } = countFriendlyAndEnemy(
            simulationBoard,
            config,
            position,
            race.id,
          );
          const birthValue = config.rules.useNetBirth ? friendly - enemy : friendly;
          return {
            raceId: race.id,
            friendly,
            enemy,
            netAdvantage: friendly - enemy,
            birthValue,
          };
        })
        .filter((candidate) => {
          const race = raceMap.get(candidate.raceId);
          return (
            race !== undefined &&
            candidate.birthValue >= race.birthRange[0] &&
            candidate.birthValue <= race.birthRange[1]
          );
        })
        .map((candidate) => ({
          raceId: candidate.raceId,
          friendly: candidate.friendly,
          enemy: candidate.enemy,
          netAdvantage: candidate.netAdvantage,
        }));
      const winnerRaceId = resolveBirthCandidate(candidates, config, position);

      if (winnerRaceId === null) {
        nextBoard.cells[y][x] = createEmptyCell();
        continue;
      }

      const winnerRace = raceMap.get(winnerRaceId);
      nextBoard.cells[y][x] = winnerRace
        ? {
            raceId: winnerRace.id,
            hp: getEffectiveHpMax(winnerRace),
          }
        : createEmptyCell();
    }
  }

  if (strikeCenters.length > 0) {
    const strikeText = strikeCenters.map((center) => `(${center.x}, ${center.y})`).join("、");
    stepLogs = appendLogEntry(stepLogs, config, {
      generation: state.generation + 1,
      type: "disaster",
      message: `本回合触发 ${strikeCenters.length} 处天灾，落点为：${strikeText}。`,
    });
  }

  const updatedKeyPoints = updateKeyPoints(nextBoard, state.keyPoints);
  const nextRaceProgress = updateRaceProgress(
    state.raceProgress,
    simulationBoard,
    nextBoard,
    config,
  );
  const nextStats = computeGenerationStats(
    nextBoard,
    config,
    state.generation + 1,
    updatedKeyPoints,
    nextRaceProgress,
  );

  const nextFrame: ReplayFrame = {
    generation: state.generation + 1,
    board: cloneBoard(nextBoard),
    stats: nextStats,
    logs: [...stepLogs],
    disasterCenters: strikeCenters.map((center) => ({ ...center })),
  };

  const provisionalState: MatchState = {
    board: nextBoard,
    generation: state.generation + 1,
    replayFrames: [...state.replayFrames, nextFrame],
    logs: [...state.logs, ...stepLogs],
    stats: nextStats,
    keyPoints: updatedKeyPoints,
    phase: "simulation",
    humanRaceIds: state.humanRaceIds,
    reinforcementRemaining: {},
    reinforcementPlacements: {},
    reinforcementPlacementHistory: [],
    reinforcementReviveRaceIds: [],
    raceProgress: nextRaceProgress,
    lastSeedGenerations: state.lastSeedGenerations,
    winnerRaceId: null,
    finished: false,
  };

  const victory = evaluateVictory(provisionalState, config);
  const finalLogs =
    victory.message !== null
      ? appendLogEntry([...provisionalState.logs], config, {
          generation: provisionalState.generation,
          type: "result",
          message: victory.message,
        })
      : provisionalState.logs;

  return {
    ...(getDueReinforcementRaceIds(provisionalState, config).length > 0 && !victory.finished
      ? beginReinforcementPhase(
          {
            ...provisionalState,
            logs: finalLogs,
            winnerRaceId: victory.winnerRaceId,
            finished: victory.finished,
          },
          config,
        )
      : {
          ...provisionalState,
          logs: finalLogs,
          winnerRaceId: victory.winnerRaceId,
          finished: victory.finished,
        }),
  };
}

/**
 * 初始化对局状态。
 *
 * Args:
 *   config: 完整对局配置。
 *   initialBoard: 用户布子后的初始棋盘。为空时将创建空棋盘。
 *
 * Returns:
 *   MatchState: 初始对局状态。
 */
export function createMatchState(
  config: MatchConfig,
  initialBoard?: BoardState,
): MatchState {
  const seedBoard =
    initialBoard !== undefined
      ? cloneBoard(initialBoard)
      : (() => {
          const dimensions = resolveBoardDimensions(config.map.width, config.map.height);
          return createBoardState(dimensions.width, dimensions.height);
        })();
  const humanRaceIds = getHumanRaceIds(config);
  const patchedBoard =
    config.gameplay.mode === "observe"
      ? seedBoard
      : fillAIInitialPlacements(seedBoard, config, humanRaceIds);
  const keyPoints = createKeyPoints(config);
  const initialAliveCellsByRace = countAliveCellsByRace(patchedBoard, config);
  const initialRaceProgress = Object.fromEntries(
    config.races.map((race) => [
      race.id,
      {
        cumulativeGeneratedCells: initialAliveCellsByRace[race.id] ?? 0,
        aliveTurns: (initialAliveCellsByRace[race.id] ?? 0) > 0 ? 1 : 0,
      },
    ]),
  ) as MatchState["raceProgress"];
  const stats = computeGenerationStats(patchedBoard, config, 0, keyPoints, initialRaceProgress);
  const lastSeedGenerations = Object.fromEntries(
    config.races.map((race) => [race.id, 0]),
  );

  return {
    board: patchedBoard,
    generation: 0,
    replayFrames: [
      {
        generation: 0,
        board: cloneBoard(patchedBoard),
        stats,
        logs: [],
        disasterCenters: [],
      },
    ],
    logs: [],
    stats,
    keyPoints,
    phase: "simulation",
    humanRaceIds,
    reinforcementRemaining: {},
    reinforcementPlacements: {},
    reinforcementPlacementHistory: [],
    reinforcementReviveRaceIds: [],
    raceProgress: initialRaceProgress,
    lastSeedGenerations,
    winnerRaceId: null,
    finished: false,
  };
}
