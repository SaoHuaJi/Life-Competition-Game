import { createBoardState } from "./board";
import { createPatternBoard, type PatternTemplate, getPatternsForGridType } from "./patterns";
import { createClassicConwayPreset } from "./presets";
import type { BoardState, GridType, MatchConfig } from "./types";

/**
 * 定义场景模板。
 */
export interface SceneTemplate {
  /**
   * 场景唯一标识。
   */
  id: string;
  /**
   * 场景显示名称。
   */
  label: string;
  /**
   * 场景说明。
   */
  description: string;
  /**
   * 该场景支持的地图类型列表。
   */
  supportedGridTypes: GridType[];
  /**
   * 创建该场景的完整配置与开局棋盘。
   */
  create: () => { config: MatchConfig; board: BoardState };
  /**
   * 是否为用户自定义场景。
   */
  isCustom?: boolean;
}

/**
 * 定义可序列化的自定义场景记录。
 */
export interface CustomSceneRecord {
  /**
   * 场景唯一标识。
   */
  id: string;
  /**
   * 场景显示名称。
   */
  label: string;
  /**
   * 场景说明。
   */
  description: string;
  /**
   * 支持的地图类型列表。
   */
  supportedGridTypes: GridType[];
  /**
   * 场景完整配置。
   */
  config: MatchConfig;
  /**
   * 场景开局棋盘。
   */
  board: BoardState;
}

/**
 * 提供内置场景列表。
 */
export const BUILTIN_SCENES: SceneTemplate[] = [
  {
    id: "scene-classic-glider",
    label: "经典康威：滑翔机演示",
    description: "经典 B3/S23 规则下的滑翔机演示场景。",
    supportedGridTypes: ["square"],
    create: () => {
      const config = createClassicConwayPreset();
      const pattern = getPatternsForGridType("square").find((item) => item.name === "Glider");
      const board =
        pattern !== undefined
          ? createPatternBoard(config.map.width, config.map.height, pattern, { x: 4, y: 4 }, 1, 1)
          : createBoardState(config.map.width, config.map.height);
      return { config, board };
    },
  },
];

/**
 * 获取当前地图可用的场景列表。
 *
 * Args:
 *   gridType: 当前地图类型。
 *   customScenes: 用户自定义场景列表。
 *
 * Returns:
 *   SceneTemplate[]: 当前地图可用的场景模板列表。
 */
export function getScenesForGridType(
  gridType: GridType,
  customScenes: SceneTemplate[] = [],
): SceneTemplate[] {
  return [...BUILTIN_SCENES, ...customScenes].filter((scene) =>
    scene.supportedGridTypes.includes(gridType),
  );
}

/**
 * 生成自定义场景的稳定签名，用于导入与保存时去重。
 *
 * Args:
 *   scene: 目标自定义场景记录。
 *
 * Returns:
 *   string: 仅由配置与棋盘内容构成的稳定签名。
 */
export function getSceneSignature(scene: CustomSceneRecord): string {
  const aliveCells = scene.board.cells
    .flatMap((row, y) =>
      row.map((cell, x) => ({ cell, x, y })),
    )
    .filter(({ cell }) => cell.raceId !== null && cell.hp > 0)
    .map(({ cell, x, y }) => `${x},${y},${cell.raceId},${cell.hp}`)
    .sort()
    .join("|");
  return JSON.stringify({
    gridTypes: [...scene.supportedGridTypes].sort(),
    config: scene.config,
    aliveCells,
  });
}

/**
 * 对自定义场景列表执行稳定去重，保留先出现的项。
 *
 * Args:
 *   scenes: 待去重的自定义场景列表。
 *
 * Returns:
 *   CustomSceneRecord[]: 去重后的自定义场景列表。
 */
export function dedupeCustomScenes(scenes: CustomSceneRecord[]): CustomSceneRecord[] {
  const seen = new Set<string>();

  return scenes.filter((scene) => {
    const signature = getSceneSignature(scene);
    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

/**
 * 基于当前配置和棋盘创建自定义场景模板。
 *
 * Args:
 *   id: 场景唯一标识。
 *   label: 场景显示名称。
 *   config: 当前完整配置。
 *   board: 当前棋盘。
 *
 * Returns:
 *   SceneTemplate: 生成的自定义场景模板。
 */
export function createCustomScene(
  id: string,
  label: string,
  config: MatchConfig,
  board: BoardState,
): CustomSceneRecord {
  const clonedConfig = JSON.parse(JSON.stringify(config)) as MatchConfig;
  const clonedBoard = JSON.parse(JSON.stringify(board)) as BoardState;

  return {
    id,
    label,
    description: "用户保存的自定义场景。",
    supportedGridTypes: [config.map.gridType],
    config: clonedConfig,
    board: clonedBoard,
  };
}

/**
 * 将可序列化场景记录转换为运行时场景模板。
 *
 * Args:
 *   record: 自定义场景记录。
 *
 * Returns:
 *   SceneTemplate: 可直接用于界面展示和载入的运行时模板。
 */
export function sceneRecordToTemplate(record: CustomSceneRecord): SceneTemplate {
  return {
    id: record.id,
    label: record.label,
    description: record.description,
    supportedGridTypes: record.supportedGridTypes,
    isCustom: true,
    create: () => ({
      config: JSON.parse(JSON.stringify(record.config)) as MatchConfig,
      board: JSON.parse(JSON.stringify(record.board)) as BoardState,
    }),
  };
}
