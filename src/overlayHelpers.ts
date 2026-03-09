import type { Position } from "./core/types";

/**
 * 定义棋盘辅助覆盖层标记类型。
 */
export type OverlayMarkerKind = "neighbor" | "disaster" | "archer";

/**
 * 定义棋盘辅助覆盖层标记结构。
 */
export type OverlayMarker = {
  /**
   * 标记对应的棋盘坐标。
   */
  position: Position;
  /**
   * 是否需要用冲突/高风险样式高亮。
   */
  conflict: boolean;
  /**
   * 标记类别，用于决定渲染色彩。
   */
  kind: OverlayMarkerKind;
};

/**
 * 将 `x,y` 形式的坐标键转换为棋盘坐标。
 *
 * Args:
 *   key: 逗号分隔的坐标字符串。
 *
 * Returns:
 *   Position: 解析后的棋盘坐标。
 */
export function parsePositionKey(key: string): Position {
  const [xText, yText] = key.split(",");
  return {
    x: Number.parseInt(xText, 10),
    y: Number.parseInt(yText, 10),
  };
}

/**
 * 将位置列表映射为统一的覆盖层标记列表。
 *
 * Args:
 *   positions: 需要高亮的位置列表。
 *   kind: 标记类别。
 *   conflict: 是否统一使用冲突样式。
 *
 * Returns:
 *   OverlayMarker[]: 转换后的覆盖层标记列表。
 */
export function createPositionMarkers(
  positions: Position[],
  kind: OverlayMarkerKind,
  conflict = false,
): OverlayMarker[] {
  return positions.map((position) => ({
    position,
    conflict,
    kind,
  }));
}

/**
 * 将距离映射转换为覆盖层标记列表。
 *
 * Args:
 *   distanceMap: 坐标键到最短距离的映射。
 *   kind: 标记类别。
 *   conflictResolver: 根据坐标和距离判断是否以冲突样式显示。
 *
 * Returns:
 *   OverlayMarker[]: 转换后的覆盖层标记列表。
 */
export function createDistanceMarkers(
  distanceMap: Map<string, number>,
  kind: OverlayMarkerKind,
  conflictResolver: (position: Position, distance: number) => boolean,
): OverlayMarker[] {
  return [...distanceMap.entries()].map(([key, distance]) => {
    const position = parsePositionKey(key);
    return {
      position,
      conflict: conflictResolver(position, distance),
      kind,
    };
  });
}
