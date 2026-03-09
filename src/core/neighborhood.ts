import type {
  BoardState,
  GridType,
  MapConfig,
  NeighborhoodType,
  Position,
  TopologyType,
} from "./types";
import { createBoardState, isInsideBoard } from "./board";

/**
 * 根据地图拓扑对坐标进行边界归一化。
 *
 * Args:
 *   board: 当前棋盘。
 *   position: 原始坐标，x 为列坐标，y 为行坐标。
 *   topology: 边界模式。bounded 为截断边界，toroidal 为环面边界。
 *
 * Returns:
 *   Position | null: 合法坐标；若为截断边界且越界，则返回 null。
 */
export function normalizePosition(
  board: BoardState,
  position: Position,
  topology: TopologyType,
): Position | null {
  if (topology === "toroidal") {
    return {
      x: ((position.x % board.width) + board.width) % board.width,
      y: ((position.y % board.height) + board.height) % board.height,
    };
  }

  return isInsideBoard(board, position) ? position : null;
}

/**
 * 返回方形网格的固定偏移列表。
 *
 * Args:
 *   neighborhoodType: 邻域类型，仅允许 moore 或 von_neumann。
 *
 * Returns:
 *   Position[]: 偏移向量列表，单位为单元格坐标差。
 */
export function getSquareOffsets(
  neighborhoodType: NeighborhoodType,
): Position[] {
  if (neighborhoodType === "von_neumann") {
    return [
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
  }

  return [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];
}

/**
 * 返回三角网格邻居偏移列表。
 *
 * Args:
 *   position: 目标位置，x 与 y 的奇偶和决定三角形朝向。
 *   neighborhoodType: triangle_edge 或 triangle_moore。
 *
 * Returns:
 *   Position[]: 基于共享边/共享点几何关系计算得到的邻居偏移列表。
 */
export function getTriangleOffsets(
  position: Position,
  neighborhoodType: NeighborhoodType,
): Position[] {
  return getTriangleNeighborOffsets(position, neighborhoodType);
}

/**
 * 返回三角单元格在整数顶点网格中的三个顶点。
 *
 * Args:
 *   position: 目标单元格坐标，x 为半宽步长索引，y 为行索引。
 *
 * Returns:
 *   Position[]: 三个整数顶点坐标。这里的坐标不是棋盘单元格坐标，而是
 *   为了判定共享边/共享点而构造的三角网格顶点坐标。
 */
export function getTriangleVertices(position: Position): Position[] {
  const isPointUp = (position.x + position.y) % 2 === 0;

  if (isPointUp) {
    return [
      { x: position.x, y: position.y + 1 },
      { x: position.x + 1, y: position.y },
      { x: position.x + 2, y: position.y + 1 },
    ];
  }

  return [
    { x: position.x, y: position.y },
    { x: position.x + 2, y: position.y },
    { x: position.x + 1, y: position.y + 1 },
  ];
}

/**
 * 统计两个三角单元格共享的顶点数量。
 *
 * Args:
 *   left: 第一个三角单元格坐标。
 *   right: 第二个三角单元格坐标。
 *
 * Returns:
 *   number: 共享顶点数量。2 表示共享边，1 表示仅共享点，0 表示完全不接触。
 */
export function countSharedTriangleVertices(
  left: Position,
  right: Position,
): number {
  const leftVertexSet = new Set(
    getTriangleVertices(left).map((vertex) => `${vertex.x},${vertex.y}`),
  );

  return getTriangleVertices(right).reduce((count, vertex) => {
    return count + (leftVertexSet.has(`${vertex.x},${vertex.y}`) ? 1 : 0);
  }, 0);
}

/**
 * 根据真实三角形几何关系返回邻居偏移列表。
 *
 * Args:
 *   position: 当前三角单元格坐标。
 *   neighborhoodType: triangle_edge 表示共享边为邻居，triangle_moore 表示共享边或共享点为邻居。
 *
 * Returns:
 *   Position[]: 相对当前坐标的邻居偏移列表。
 */
export function getTriangleNeighborOffsets(
  position: Position,
  neighborhoodType: NeighborhoodType,
): Position[] {
  const offsets: Position[] = [];

  // 三角形只可能与周围一小圈候选单元格共享边或共享点，无需扫描更大范围。
  for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
    for (let deltaX = -2; deltaX <= 2; deltaX += 1) {
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      const candidate = {
        x: position.x + deltaX,
        y: position.y + deltaY,
      };
      const sharedVertexCount = countSharedTriangleVertices(position, candidate);
      const isNeighbor = neighborhoodType === "triangle_edge"
        ? sharedVertexCount === 2
        : sharedVertexCount >= 1;

      if (isNeighbor) {
        offsets.push({ x: deltaX, y: deltaY });
      }
    }
  }

  return offsets;
}

/**
 * 返回六边形网格的邻居坐标列表。
 *
 * Args:
 *   position: 当前坐标，采用 odd-r 横向偏移布局。
 *
 * Returns:
 *   Position[]: 六边形周围 6 个邻居的偏移列表。
 */
export function getHexOffsets(position: Position): Position[] {
  const isOddRow = position.y % 2 === 1;

  return isOddRow
    ? [
        { x: 0, y: -1 },
        { x: 1, y: -1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]
    : [
        { x: -1, y: -1 },
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 1 },
        { x: 0, y: 1 },
      ];
}

/**
 * 根据网格类型和邻域类型返回邻居坐标列表。
 *
 * Args:
 *   board: 当前棋盘。
 *   mapConfig: 地图配置。
 *   position: 中心格坐标。
 *
 * Returns:
 *   Position[]: 已经过边界处理的邻居坐标列表。
 */
export function getNeighborPositions(
  board: BoardState,
  mapConfig: MapConfig,
  position: Position,
): Position[] {
  let offsets: Position[] = [];

  if (mapConfig.gridType === "square") {
    offsets = getSquareOffsets(mapConfig.neighborhoodType);
  } else if (mapConfig.gridType === "hex") {
    offsets = getHexOffsets(position);
  } else {
    offsets = getTriangleOffsets(position, mapConfig.neighborhoodType);
  }

  return offsets
    .map((offset) =>
      normalizePosition(
        board,
        {
          x: position.x + offset.x,
          y: position.y + offset.y,
        },
        mapConfig.topology,
      ),
    )
    .filter((neighbor): neighbor is Position => neighbor !== null);
}

/**
 * 返回某个地图配置对应的理论邻域大小。
 *
 * Args:
 *   gridType: 地图类型。
 *   neighborhoodType: 邻域类型。
 *
 * Returns:
 *   number: 该邻域下的理论最大邻居数量。
 */
export function getNeighborhoodSize(
  gridType: GridType,
  neighborhoodType: NeighborhoodType,
): number {
  if (gridType === "square") {
    return neighborhoodType === "von_neumann" ? 4 : 8;
  }

  if (gridType === "hex") {
    return 6;
  }

  return neighborhoodType === "triangle_edge" ? 3 : 12;
}

/**
 * 计算从起点出发、在给定最大距离内的图距离映射。
 *
 * Args:
 *   board: 当前棋盘。
 *   mapConfig: 地图配置。
 *   origin: 起点坐标。
 *   maxDistance: 需要扩展的最大图距离。
 *
 * Returns:
 *   Map<string, number>: 坐标字符串到最短图距离的映射，仅包含不超过最大距离的点。
 */
export function buildGraphDistanceMap(
  board: BoardState,
  mapConfig: MapConfig,
  origin: Position,
  maxDistance: number,
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Array<{ position: Position; distance: number }> = [
    { position: origin, distance: 0 },
  ];
  let queueIndex = 0;

  distances.set(`${origin.x},${origin.y}`, 0);

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (current.distance >= maxDistance) {
      continue;
    }

    getNeighborPositions(board, mapConfig, current.position).forEach((neighbor) => {
      const key = `${neighbor.x},${neighbor.y}`;
      if (distances.has(key)) {
        return;
      }

      const nextDistance = current.distance + 1;
      distances.set(key, nextDistance);
      queue.push({
        position: neighbor,
        distance: nextDistance,
      });
    });
  }

  return distances;
}

const relativeDistanceOffsetCache = new Map<
  string,
  Array<{ offset: Position; distance: number }>
>();

/**
 * 返回当前中心点在指定地图布局下的变体编号。
 *
 * Args:
 *   mapConfig: 地图配置。
 *   origin: 中心点坐标。
 *
 * Returns:
 *   number: 用于区分相对偏移模板的布局变体编号。
 *   三角地图返回朝向奇偶，六边形返回行奇偶，方形恒为 0。
 */
export function getLayoutVariant(
  mapConfig: MapConfig,
  origin: Position,
): number {
  if (mapConfig.gridType === "triangle") {
    return (origin.x + origin.y) % 2;
  }

  if (mapConfig.gridType === "hex") {
    return origin.y % 2;
  }

  return 0;
}

/**
 * 返回以原点为中心、在当前地图规则下不超过指定距离的相对位移集合。
 *
 * Args:
 *   mapConfig: 地图配置。
 *   maxDistance: 最大图距离。
 *   originParity: 三角地图下原点的朝向奇偶，0 表示正三角，1 表示倒三角。
 *
 * Returns:
 *   Array<{ offset: Position; distance: number }>: 相对位移与对应图距离列表。
 */
export function getRelativeGraphDistanceOffsets(
  mapConfig: MapConfig,
  maxDistance: number,
  layoutVariant = 0,
): Array<{ offset: Position; distance: number }> {
  const cacheKey = [
    mapConfig.gridType,
    mapConfig.neighborhoodType,
    mapConfig.topology,
    maxDistance,
    layoutVariant,
  ].join(":");
  const cached = relativeDistanceOffsetCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const tempBoard = createBoardState(maxDistance * 4 + 9, maxDistance * 2 + 9);
  const origin = {
    x:
      Math.floor(tempBoard.width / 2) +
      (mapConfig.gridType === "triangle" &&
      (Math.floor(tempBoard.width / 2) + Math.floor(tempBoard.height / 2)) % 2 !== layoutVariant
        ? 1
        : 0),
    y:
      Math.floor(tempBoard.height / 2) +
      (mapConfig.gridType === "hex" && Math.floor(tempBoard.height / 2) % 2 !== layoutVariant
        ? 1
        : 0),
  };
  const boundedMapConfig = {
    ...mapConfig,
    topology: "bounded" as const,
  };
  const distances = buildGraphDistanceMap(tempBoard, boundedMapConfig, origin, maxDistance);
  const offsets = [...distances.entries()].map(([key, distance]) => {
    const [xText, yText] = key.split(",");
    return {
      offset: {
        x: Number.parseInt(xText, 10) - origin.x,
        y: Number.parseInt(yText, 10) - origin.y,
      },
      distance,
    };
  });

  relativeDistanceOffsetCache.set(cacheKey, offsets);
  return offsets;
}

/**
 * 将相对偏移列表投影到实际棋盘坐标，并携带最短图距离。
 *
 * Args:
 *   board: 当前棋盘。
 *   mapConfig: 地图配置。
 *   origin: 中心点坐标。
 *   relativeOffsets: 相对偏移与距离列表。
 *
 * Returns:
 *   Map<string, number>: 实际棋盘坐标到最短距离的映射。
 */
export function projectRelativeOffsetsToBoard(
  board: BoardState,
  mapConfig: MapConfig,
  origin: Position,
  relativeOffsets: Array<{ offset: Position; distance: number }>,
): Map<string, number> {
  const positionDistanceMap = new Map<string, number>();

  relativeOffsets.forEach(({ offset, distance }) => {
    const normalized = normalizePosition(
      board,
      {
        x: origin.x + offset.x,
        y: origin.y + offset.y,
      },
      mapConfig.topology,
    );

    if (!normalized) {
      return;
    }

    const key = `${normalized.x},${normalized.y}`;
    const previousDistance = positionDistanceMap.get(key);
    if (previousDistance === undefined || distance < previousDistance) {
      positionDistanceMap.set(key, distance);
    }
  });

  return positionDistanceMap;
}

/**
 * 基于缓存的相对距离偏移，生成实际棋盘上的距离映射。
 *
 * Args:
 *   board: 当前棋盘。
 *   mapConfig: 地图配置。
 *   origin: 中心点坐标。
 *   maxDistance: 最大图距离。
 *
 * Returns:
 *   Map<string, number>: 实际棋盘坐标到最短图距离的映射。
 */
export function buildProjectedDistanceMap(
  board: BoardState,
  mapConfig: MapConfig,
  origin: Position,
  maxDistance: number,
): Map<string, number> {
  return projectRelativeOffsetsToBoard(
    board,
    mapConfig,
    origin,
    getRelativeGraphDistanceOffsets(
      mapConfig,
      maxDistance,
      getLayoutVariant(mapConfig, origin),
    ),
  );
}
