import type { MatchConfig, RaceConfig } from "./types";

/**
 * 创建默认种族配置。
 *
 * Args:
 *   id: 种族编号。
 *   name: 种族名称。
 *   color: 种族主色。
 *
 * Returns:
 *   RaceConfig: 初始化后的种族配置。
 */
export function createDefaultRace(
  id: number,
  name: string,
  color: string,
): RaceConfig {
  return {
    id,
    name,
    color,
    campId: id,
    hpMax: 1,
    surviveRange: [2, 3],
    birthRange: [3, 3],
    regen: 1,
    disasterResistance: 1,
    enemyResistance: 1,
    initialCells: 12,
    aiProfile: "balanced",
    trait: "none",
  };
}

/**
 * 创建默认对局配置。
 *
 * Returns:
 *   MatchConfig: 满足经典康威兼容默认值的完整配置。
 */
export function createDefaultConfig(): MatchConfig {
  return {
    map: {
      gridType: "square",
      width: 24,
      height: 16,
      topology: "bounded",
      neighborhoodType: "moore",
    },
    rules: {
      enemyDamageEnabled: false,
      useNetBirth: false,
      birthConflictStrategy: "no_birth_on_tie",
      seed: 20260309,
      logEnabled: true,
      disaster: {
        enabled: false,
        chance: 0.08,
        minStrikes: 1,
        maxStrikes: 3,
        radius: 1,
        damage: 1,
        decay: true,
        decayFactor: 1,
      },
      reinforcement: {
        enabled: false,
        period: 5,
        amount: 2,
      },
    },
    gameplay: {
      mode: "observe",
      victoryMode: "none",
      maxGenerations: 80,
      keyPointCount: 3,
      requiredControlPoints: 2,
      requiredControlTurns: 4,
      keyPointPlacementMode: "random",
      manualKeyPoints: [],
      allowRevive: false,
      allowEarlyEnd: true,
      revealPlacements: false,
      placementTimeLimitSeconds: 0,
    },
    races: [createDefaultRace(1, "Conway", "#1f9d55")],
  };
}

/**
 * 创建经典康威预设。
 *
 * Returns:
 *   MatchConfig: 严格兼容经典 B3/S23 的推荐配置。
 */
export function createClassicConwayPreset(): MatchConfig {
  return createDefaultConfig();
}

/**
 * 创建对称双阵营预设。
 *
 * Returns:
 *   MatchConfig: 用于人机或 AI 对战的双种族对称配置。
 */
export function createSymmetricDuelPreset(): MatchConfig {
  const config = createDefaultConfig();

  config.gameplay.mode = "human_vs_ai";
  config.gameplay.victoryMode = "annihilation";
  config.gameplay.maxGenerations = 120;
  config.rules.enemyDamageEnabled = true;
  config.races = [
    { ...createDefaultRace(1, "翠影", "#2f855a"), campId: 1, trait: "warrior" },
    { ...createDefaultRace(2, "赤焰", "#dd6b20"), campId: 2, trait: "archer" },
  ];

  return config;
}

/**
 * 创建 AI 对战预设。
 *
 * Returns:
 *   MatchConfig: 适合自动演示的三阵营 AI 对战配置。
 */
export function createAIBattlePreset(): MatchConfig {
  const config = createDefaultConfig();

  config.map.width = 28;
  config.map.height = 18;
  config.gameplay.mode = "ai_vs_ai";
  config.gameplay.victoryMode = "survival";
  config.gameplay.maxGenerations = 100;
  config.rules.enemyDamageEnabled = true;
  config.rules.reinforcement.enabled = true;
  config.rules.reinforcement.period = 6;
  config.rules.reinforcement.amount = 0.6;
  config.races = [
    {
      ...createDefaultRace(1, "苍穹", "#2563eb"),
      campId: 1,
      aiProfile: "expansion",
      trait: "long_lived",
    },
    {
      ...createDefaultRace(2, "琥珀", "#d97706"),
      campId: 2,
      aiProfile: "aggressive",
      trait: "warrior",
    },
    {
      ...createDefaultRace(3, "霜华", "#7c3aed"),
      campId: 3,
      aiProfile: "defensive",
      trait: "short_lived",
    },
  ];

  return config;
}
