/**
 * 线性同余随机数生成器的运行状态。
 */
export interface RandomState {
  /**
   * 当前内部状态值。
   */
  seed: number;
}

/**
 * 基于输入种子创建随机状态。
 *
 * Args:
 *   seed: 任意整数随机种子。物理意义为整局对局可复现的初始随机源。
 *
 * Returns:
 *   RandomState: 初始化后的随机状态对象。
 */
export function createRandomState(seed: number): RandomState {
  return {
    seed: Math.abs(Math.trunc(seed)) % 2147483647 || 1,
  };
}

/**
 * 生成 [0, 1) 区间的均匀随机数。
 *
 * Args:
 *   randomState: 随机状态对象，会在函数内部原位更新。
 *
 * Returns:
 *   number: 落在 [0, 1) 区间内的伪随机数。
 */
export function nextRandom(randomState: RandomState): number {
  randomState.seed = (randomState.seed * 48271) % 2147483647;
  return randomState.seed / 2147483647;
}

/**
 * 生成闭区间整数随机数。
 *
 * Args:
 *   randomState: 随机状态对象，会在函数内部原位更新。
 *   min: 结果下界，单位为整数。
 *   max: 结果上界，单位为整数。
 *
 * Returns:
 *   number: 处于 [min, max] 的整数随机值。
 */
export function nextRandomInt(
  randomState: RandomState,
  min: number,
  max: number,
): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return lower + Math.floor(nextRandom(randomState) * (upper - lower + 1));
}

/**
 * 从数组中随机选取一个元素。
 *
 * Args:
 *   randomState: 随机状态对象，会在函数内部原位更新。
 *   values: 待选择数组。
 *
 * Returns:
 *   T: 被随机选中的元素。
 */
export function pickRandom<T>(randomState: RandomState, values: T[]): T {
  return values[nextRandomInt(randomState, 0, values.length - 1)];
}
