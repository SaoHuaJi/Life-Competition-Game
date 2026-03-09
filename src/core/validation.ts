import { getNeighborhoodSize } from "./neighborhood";
import type { MatchConfig, NeighborhoodType, ValidationIssue } from "./types";

/**
 * 判断地图类型与邻域类型组合是否合法。
 *
 * Args:
 *   gridType: 地图类型。
 *   neighborhoodType: 邻域类型。
 *
 * Returns:
 *   boolean: true 表示组合合法，false 表示不合法。
 */
export function isNeighborhoodCompatible(
  gridType: MatchConfig["map"]["gridType"],
  neighborhoodType: NeighborhoodType,
): boolean {
  if (gridType === "square") {
    return neighborhoodType === "moore" || neighborhoodType === "von_neumann";
  }

  if (gridType === "hex") {
    return neighborhoodType === "hex";
  }

  return (
    neighborhoodType === "triangle_edge" ||
    neighborhoodType === "triangle_moore"
  );
}

/**
 * 生成种族平衡风险评分。
 *
 * Args:
 *   config: 完整对局配置。
 *
 * Returns:
 *   Record<number, number>: 键为 raceId，值为启发式风险分数，分数越高风险越大。
 */
export function calculateBalanceRisk(config: MatchConfig): Record<number, number> {
  return Object.fromEntries(
    config.races.map((race) => {
      const surviveWidth = race.surviveRange[1] - race.surviveRange[0] + 1;
      const birthWidth = race.birthRange[1] - race.birthRange[0] + 1;
      const score =
        surviveWidth * 1.2 +
        birthWidth * 1.6 +
        race.hpMax * 1.5 +
        race.regen * 1.3 +
        race.disasterResistance * 0.6 +
        race.enemyResistance * 0.6 +
        race.initialCells * 0.08;
      return [race.id, Number(score.toFixed(2))];
    }),
  );
}

/**
 * 校验完整对局配置。
 *
 * Args:
 *   config: 待校验配置对象。
 *
 * Returns:
 *   ValidationIssue[]: 所有错误与警告列表。存在 error 时应禁止开始对局。
 */
export function validateMatchConfig(config: MatchConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const neighborhoodSize = getNeighborhoodSize(
    config.map.gridType,
    config.map.neighborhoodType,
  );
  const isInfiniteMap = config.map.width === 0 && config.map.height === 0;

  if (
    config.map.width < 0 ||
    config.map.height < 0 ||
    (config.map.width === 0 && config.map.height > 0) ||
    (config.map.height === 0 && config.map.width > 0)
  ) {
    issues.push({
      level: "error",
      field: "map.size",
      message: "地图宽高必须同时为正数，或同时为 0 以启用无限地图。",
    });
  }

  if (isInfiniteMap && config.gameplay.victoryMode === "control") {
    issues.push({
      level: "error",
      field: "gameplay.victoryMode",
      message: "无限地图第一版暂不支持占点模式，请改用有限地图。",
    });
  }

  if (!isNeighborhoodCompatible(config.map.gridType, config.map.neighborhoodType)) {
    issues.push({
      level: "error",
      field: "map.neighborhoodType",
      message: "当前地图类型与邻域类型组合不合法。",
    });
  }

  if (config.races.length < 1) {
    issues.push({
      level: "error",
      field: "races",
      message: "至少需要配置一个种族。",
    });
  }

  if (config.gameplay.victoryMode === "control" && config.gameplay.keyPointCount <= 0) {
    issues.push({
      level: "error",
      field: "gameplay.keyPointCount",
      message: "占点模式至少需要一个关键点。",
    });
  }

  if (
    !isInfiniteMap &&
    config.gameplay.victoryMode === "control" &&
    config.gameplay.keyPointCount > config.map.width * config.map.height
  ) {
    issues.push({
      level: "error",
      field: "gameplay.keyPointCount",
      message: "关键点数量不能超过当前地图总格数。",
    });
  }

  if (
    config.gameplay.victoryMode === "control" &&
    config.gameplay.requiredControlPoints > config.gameplay.keyPointCount
  ) {
    issues.push({
      level: "error",
      field: "gameplay.requiredControlPoints",
      message: "占点目标数不能大于关键点数量。",
    });
  }

  if (config.gameplay.victoryMode === "control" && config.gameplay.keyPointPlacementMode === "manual") {
    const uniqueKeyPoints = new Set(
      config.gameplay.manualKeyPoints.map((position) => `${position.x},${position.y}`),
    );

    if (uniqueKeyPoints.size < config.gameplay.keyPointCount) {
      issues.push({
        level: "error",
        field: "gameplay.manualKeyPoints",
        message: "手动关键点数量不足，无法满足当前关键点数量要求。",
      });
    }

    config.gameplay.manualKeyPoints.forEach((position, index) => {
      if (
        position.x < 0 ||
        position.x >= config.map.width ||
        position.y < 0 ||
        position.y >= config.map.height
      ) {
        issues.push({
          level: "error",
          field: `gameplay.manualKeyPoints.${index}`,
          message: `手动关键点 (${position.x}, ${position.y}) 超出当前地图范围。`,
        });
      }
    });
  }

  const usedColors = new Set<string>();

  config.races.forEach((race, index) => {
    const fieldPrefix = `races.${index}`;

    if (race.hpMax < 1) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.hpMax`,
        message: `${race.name} 的最大生命值必须大于等于 1。`,
      });
    }

    if (race.regen < 0) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.regen`,
        message: `${race.name} 的恢复倍率不能为负数。`,
      });
    }

    if (race.disasterResistance <= 0) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.disasterResistance`,
        message: `${race.name} 的天灾抗性必须大于 0。`,
      });
    }

    if (race.enemyResistance <= 0) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.enemyResistance`,
        message: `${race.name} 的对敌抗性必须大于 0。`,
      });
    }

    if (race.campId <= 0) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.campId`,
        message: `${race.name} 的阵营编号必须大于 0。`,
      });
    }

    if (
      race.surviveRange[0] > race.surviveRange[1] ||
      race.birthRange[0] > race.birthRange[1]
    ) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.ranges`,
        message: `${race.name} 的存活范围或出生范围上下界非法。`,
      });
    }

    if (
      race.surviveRange[1] > neighborhoodSize ||
      race.birthRange[1] > neighborhoodSize
    ) {
      issues.push({
        level: "error",
        field: `${fieldPrefix}.ranges`,
        message: `${race.name} 的范围上界超出当前邻域大小 ${neighborhoodSize}。`,
      });
    }

    if (usedColors.has(race.color.toLowerCase())) {
      issues.push({
        level: "warning",
        field: `${fieldPrefix}.color`,
        message: `${race.name} 与其他种族颜色过于接近，可能影响辨识。`,
      });
    } else {
      usedColors.add(race.color.toLowerCase());
    }
  });

  if (config.races.length === 1 && config.rules.enemyDamageEnabled) {
    issues.push({
      level: "warning",
      field: "rules.enemyDamageEnabled",
      message: "单种族模式下敌对伤害恒为 0，建议关闭该选项。",
    });
  }

  const riskScores = calculateBalanceRisk(config);
  Object.entries(riskScores).forEach(([raceId, riskScore]) => {
    if (riskScore >= 12) {
      const race = config.races.find((item) => item.id === Number(raceId));
      issues.push({
        level: "warning",
        field: `races.${raceId}.balance`,
        message: `${race?.name ?? raceId} 的平衡风险偏高（${riskScore}）。`,
      });
    }
  });

  return issues;
}
