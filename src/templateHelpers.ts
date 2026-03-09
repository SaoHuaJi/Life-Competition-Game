import type { CustomSceneRecord } from "./core/catalog";
import type { PatternTemplate } from "./core/patterns";
import type {
  ConfigProfileRecord,
  RaceProfileRecord,
} from "./core/profiles";
import type { RaceConfig } from "./core/types";

/**
 * 导出 JSON 数据到本地文件。
 *
 * Args:
 *   fileName: 导出的文件名，通常包含 `.json` 后缀。
 *   data: 可被 `JSON.stringify` 序列化的任意对象。
 *
 * Returns:
 *   void: 该函数仅触发浏览器下载，无返回值。
 */
export function exportJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * 将导入内容统一转换为数组。
 *
 * Args:
 *   value: 可能是单个对象，也可能已经是对象数组。
 *
 * Returns:
 *   T[]: 始终返回数组形式，便于后续统一迭代处理。
 */
export function toImportArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * 为导入模板生成当前会话内唯一编号。
 *
 * Args:
 *   existingIds: 当前内存中已占用的编号集合。
 *   preferredId: 导入数据中自带的编号，可能为空。
 *   prefix: 当原编号缺失时使用的回退前缀。
 *   index: 当前批次导入项的序号，用于降低回退编号冲突概率。
 *
 * Returns:
 *   string: 不与已有模板编号冲突的新编号。
 */
export function createUniqueImportedId(
  existingIds: Set<string>,
  preferredId: string | undefined,
  prefix: string,
  index: number,
): string {
  const fallbackId = `${prefix}-${Date.now()}-${index}`;
  const baseId = preferredId && preferredId.trim() !== "" ? preferredId : fallbackId;

  if (!existingIds.has(baseId)) {
    existingIds.add(baseId);
    return baseId;
  }

  let suffix = 1;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  const nextId = `${baseId}-${suffix}`;
  existingIds.add(nextId);
  return nextId;
}

/**
 * 返回图样模板的展示名称。
 *
 * Args:
 *   pattern: 图样模板对象。
 *
 * Returns:
 *   string: 优先使用内置中文映射，未命中时回退到模板原名。
 */
export function getPatternLabel(pattern: PatternTemplate): string {
  const labelMap: Record<string, string> = {
    Block: "方块静物",
    Beehive: "蜂巢静物",
    Blinker: "闪烁振荡子",
    Toad: "蟾蜍振荡子",
    Glider: "滑翔机",
  };

  return labelMap[pattern.name] ?? pattern.name;
}

/**
 * 返回种族特性的中文标签。
 *
 * Args:
 *   trait: 种族特性枚举值。
 *
 * Returns:
 *   string: 用于界面显示的中文特性名称。
 */
export function getTraitLabel(trait: RaceConfig["trait"]): string {
  const labelMap: Record<RaceConfig["trait"], string> = {
    none: "无特性",
    warrior: "战士",
    archer: "射手",
    short_lived: "短寿",
    long_lived: "长生",
  };

  return labelMap[trait];
}

/**
 * 判断当前选中的图样是否来自自定义模板列表。
 *
 * Args:
 *   patternId: 当前选中的图样编号。
 *   customPatterns: 当前会话中的自定义图样模板列表。
 *
 * Returns:
 *   boolean: 若命中任意自定义图样编号则返回 true。
 */
export function isCustomPattern(
  patternId: string,
  customPatterns: PatternTemplate[],
): boolean {
  return customPatterns.some((pattern) => pattern.id === patternId);
}

/**
 * 判断当前选中的场景是否来自自定义场景列表。
 *
 * Args:
 *   sceneId: 当前选中的场景编号。
 *   customScenes: 当前会话中的自定义场景记录列表。
 *
 * Returns:
 *   boolean: 若命中任意自定义场景编号则返回 true。
 */
export function isCustomScene(
  sceneId: string,
  customScenes: CustomSceneRecord[],
): boolean {
  return customScenes.some((scene) => scene.id === sceneId);
}

/**
 * 将导入的种族参数模板整理为可直接写回状态的列表。
 *
 * Args:
 *   previousProfiles: 当前已存在的自定义种族参数模板列表。
 *   importedProfiles: 本次新导入的模板列表。
 *
 * Returns:
 *   { nextProfiles: RaceProfileRecord[]; nextSelectedId: string }:
 *   返回拼接后的模板列表，以及推荐设为当前选中的模板编号。
 */
export function appendImportedRaceProfiles(
  previousProfiles: RaceProfileRecord[],
  importedProfiles: RaceProfileRecord[],
): {
  nextProfiles: RaceProfileRecord[];
  nextSelectedId: string;
} {
  const existingIds = new Set(previousProfiles.map((profile) => profile.id));
  const normalizedProfiles = importedProfiles.map((profile, index) => ({
    ...profile,
    id: createUniqueImportedId(
      existingIds,
      profile.id,
      "imported-race-profile",
      index,
    ),
  }));

  return {
    nextProfiles: [...previousProfiles, ...normalizedProfiles],
    nextSelectedId: normalizedProfiles[0]?.id ?? previousProfiles[0]?.id ?? "",
  };
}

/**
 * 将导入的场景参数模板整理为可直接写回状态的列表。
 *
 * Args:
 *   previousProfiles: 当前已存在的自定义场景参数模板列表。
 *   importedProfiles: 本次新导入的模板列表。
 *
 * Returns:
 *   { nextProfiles: ConfigProfileRecord[]; nextSelectedId: string }:
 *   返回拼接后的模板列表，以及推荐设为当前选中的模板编号。
 */
export function appendImportedConfigProfiles(
  previousProfiles: ConfigProfileRecord[],
  importedProfiles: ConfigProfileRecord[],
): {
  nextProfiles: ConfigProfileRecord[];
  nextSelectedId: string;
} {
  const existingIds = new Set(previousProfiles.map((profile) => profile.id));
  const normalizedProfiles = importedProfiles.map((profile, index) => ({
    ...profile,
    id: createUniqueImportedId(
      existingIds,
      profile.id,
      "imported-config-profile",
      index,
    ),
  }));

  return {
    nextProfiles: [...previousProfiles, ...normalizedProfiles],
    nextSelectedId: normalizedProfiles[0]?.id ?? previousProfiles[0]?.id ?? "",
  };
}

/**
 * 将导入的图样模板整理为可直接写回状态的列表。
 *
 * Args:
 *   previousPatterns: 当前已存在的自定义图样模板列表。
 *   importedPatterns: 本次新导入的图样模板列表。
 *
 * Returns:
 *   { nextPatterns: PatternTemplate[]; nextSelectedId: string }:
 *   返回拼接后的图样列表，以及推荐设为当前选中的图样编号。
 */
export function appendImportedPatterns(
  previousPatterns: PatternTemplate[],
  importedPatterns: PatternTemplate[],
): {
  nextPatterns: PatternTemplate[];
  nextSelectedId: string;
} {
  const existingIds = new Set(previousPatterns.map((pattern) => pattern.id));
  const normalizedPatterns = importedPatterns.map((pattern, index) => ({
    ...pattern,
    id: createUniqueImportedId(
      existingIds,
      pattern.id,
      "imported-pattern",
      index,
    ),
    isCustom: true,
  }));

  return {
    nextPatterns: [...previousPatterns, ...normalizedPatterns],
    nextSelectedId: normalizedPatterns[0]?.id ?? previousPatterns[0]?.id ?? "",
  };
}
