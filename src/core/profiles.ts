import type { MatchConfig, RaceConfig } from "./types";

/**
 * 定义整套种族配置模板。
 */
export interface RaceProfileRecord {
  /**
   * 模板唯一标识。
   */
  id: string;
  /**
   * 模板显示名称。
   */
  label: string;
  /**
   * 模板说明。
   */
  description: string;
  /**
   * 模板内包含的完整种族配置数组。
   */
  races: RaceConfig[];
}

/**
 * 定义整套参数配置模板。
 */
export interface ConfigProfileRecord {
  /**
   * 模板唯一标识。
   */
  id: string;
  /**
   * 模板显示名称。
   */
  label: string;
  /**
   * 模板说明。
   */
  description: string;
  /**
   * 模板对应的完整对局配置。
   */
  config: MatchConfig;
}

/**
 * 为种族配置模板生成稳定签名，用于去重。
 *
 * Args:
 *   profile: 目标种族配置模板。
 *
 * Returns:
 *   string: 仅由模板内容构成的稳定签名。
 */
export function getRaceProfileSignature(profile: RaceProfileRecord): string {
  return JSON.stringify(profile.races);
}

/**
 * 对种族配置模板执行稳定去重。
 *
 * Args:
 *   profiles: 待去重的种族配置模板列表。
 *
 * Returns:
 *   RaceProfileRecord[]: 去重后的种族配置模板列表。
 */
export function dedupeRaceProfiles(profiles: RaceProfileRecord[]): RaceProfileRecord[] {
  const seen = new Set<string>();

  return profiles.filter((profile) => {
    const signature = getRaceProfileSignature(profile);
    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

/**
 * 为参数配置模板生成稳定签名，用于去重。
 *
 * Args:
 *   profile: 目标参数配置模板。
 *
 * Returns:
 *   string: 仅由模板内容构成的稳定签名。
 */
export function getConfigProfileSignature(profile: ConfigProfileRecord): string {
  return JSON.stringify(profile.config);
}

/**
 * 对参数配置模板执行稳定去重。
 *
 * Args:
 *   profiles: 待去重的参数配置模板列表。
 *
 * Returns:
 *   ConfigProfileRecord[]: 去重后的参数配置模板列表。
 */
export function dedupeConfigProfiles(profiles: ConfigProfileRecord[]): ConfigProfileRecord[] {
  const seen = new Set<string>();

  return profiles.filter((profile) => {
    const signature = getConfigProfileSignature(profile);
    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

/**
 * 基于当前种族配置创建可持久化模板。
 *
 * Args:
 *   id: 模板唯一标识。
 *   label: 模板显示名称。
 *   races: 当前种族配置数组。
 *
 * Returns:
 *   RaceProfileRecord: 深拷贝后的种族配置模板。
 */
export function createRaceProfile(
  id: string,
  label: string,
  races: RaceConfig[],
): RaceProfileRecord {
  return {
    id,
    label,
    description: "用户保存的自定义种族配置模板。",
    races: JSON.parse(JSON.stringify(races)) as RaceConfig[],
  };
}

/**
 * 基于当前完整参数创建可持久化模板。
 *
 * Args:
 *   id: 模板唯一标识。
 *   label: 模板显示名称。
 *   config: 当前完整对局配置。
 *
 * Returns:
 *   ConfigProfileRecord: 深拷贝后的参数配置模板。
 */
export function createConfigProfile(
  id: string,
  label: string,
  config: MatchConfig,
): ConfigProfileRecord {
  return {
    id,
    label,
    description: "用户保存的自定义参数配置模板。",
    config: JSON.parse(JSON.stringify(config)) as MatchConfig,
  };
}
