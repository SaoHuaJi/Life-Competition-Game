/**
 * 定义单元格内细胞状态。
 */
export interface CellState {
  /**
   * 当前单元格所属种族编号。为空表示该格没有细胞。
   */
  raceId: number | null;
  /**
   * 当前细胞生命值。空单元格固定为 0。
   */
  hp: number;
}

/**
 * 定义地图类型。
 */
export type GridType = "square" | "hex" | "triangle";

/**
 * 定义邻域类型。
 */
export type NeighborhoodType =
  | "moore"
  | "von_neumann"
  | "hex"
  | "triangle_edge"
  | "triangle_moore";

/**
 * 定义边界拓扑类型。
 */
export type TopologyType = "bounded" | "toroidal";

/**
 * 定义出生冲突处理策略。
 */
export type BirthConflictStrategy =
  | "no_birth_on_tie"
  | "random"
  | "max_friendly"
  | "max_net_advantage"
  | "priority_order";

/**
 * 定义对局模式。
 */
export type MatchMode = "observe" | "human_vs_ai" | "ai_vs_ai";

/**
 * 定义胜利模式。
 */
export type VictoryMode = "none" | "annihilation" | "control" | "survival";

/**
 * 定义关键点生成方式。
 */
export type KeyPointPlacementMode = "random" | "manual";

/**
 * 定义 AI 策略类型。
 */
export type AIProfile =
  | "balanced"
  | "aggressive"
  | "defensive"
  | "expansion"
  | "random"
  | "control";

/**
 * 定义种族特性类型。
 */
export type RaceTrait =
  | "none"
  | "warrior"
  | "archer"
  | "short_lived"
  | "long_lived";

/**
 * 定义地图配置。
 */
export interface MapConfig {
  /**
   * 网格类型。
   */
  gridType: GridType;
  /**
   * 地图宽度，单位为单元格数量。
   */
  width: number;
  /**
   * 地图高度，单位为单元格数量。
   */
  height: number;
  /**
   * 边界拓扑。
   */
  topology: TopologyType;
  /**
   * 邻域类型。
   */
  neighborhoodType: NeighborhoodType;
}

/**
 * 定义种族配置。
 */
export interface RaceConfig {
  /**
   * 种族唯一编号。
   */
  id: number;
  /**
   * 界面显示名称。
   */
  name: string;
  /**
   * 界面主色。
   */
  color: string;
  /**
   * 所属阵营编号。相同阵营之间视为友军。
   */
  campId: number;
  /**
   * 最大生命值。
   */
  hpMax: number;
  /**
   * 存活范围 [最小友军数, 最大友军数]。
   */
  surviveRange: [number, number];
  /**
   * 出生范围 [最小判定值, 最大判定值]。
   */
  birthRange: [number, number];
  /**
   * 满足存活条件后的生命恢复量。
   */
  regen: number;
  /**
   * 天灾抗性。真实天灾伤害按单元格天灾伤害除以该值得到。
   */
  disasterResistance: number;
  /**
   * 对敌抗性。真实敌对伤害按敌方造成伤害除以该值得到。
   */
  enemyResistance: number;
  /**
   * 开局最大布子数。
   */
  initialCells: number;
  /**
   * AI 策略类型。
   */
  aiProfile: AIProfile;
  /**
   * 种族特性。
   */
  trait: RaceTrait;
}

/**
 * 定义天灾配置。
 */
export interface DisasterConfig {
  /**
   * 是否启用天灾。
   */
  enabled: boolean;
  /**
   * 每世代触发天灾概率，范围为 [0, 1]。
   */
  chance: number;
  /**
   * 本轮天灾落点最小数量。
   */
  minStrikes: number;
  /**
   * 本轮天灾落点最大数量。
   */
  maxStrikes: number;
  /**
   * 天灾影响半径。
   */
  radius: number;
  /**
   * 中心伤害值。
   */
  damage: number;
  /**
   * 是否按距离衰减。
   */
  decay: boolean;
  /**
   * 每增加一格距离的伤害衰减量。
   */
  decayFactor: number;
}

/**
 * 定义玩法层额外繁衍配置。
 */
export interface ReinforcementConfig {
  /**
   * 是否启用额外繁衍。
   */
  enabled: boolean;
  /**
   * 触发周期。0 表示禁用。
   */
  period: number;
  /**
   * 每次额外布子系数或固定数量。
   */
  amount: number;
}

/**
 * 定义对局阶段类型。
 */
export type MatchPhase = "simulation" | "reinforcement";

/**
 * 定义玩法配置。
 */
export interface GameplayConfig {
  /**
   * 对局模式。
   */
  mode: MatchMode;
  /**
   * 胜利模式。
   */
  victoryMode: VictoryMode;
  /**
   * 生存或提前结束最大回合。
   */
  maxGenerations: number;
  /**
   * 占点模式关键点数量。
   */
  keyPointCount: number;
  /**
   * 占点获胜所需关键点数量。
   */
  requiredControlPoints: number;
  /**
   * 占点获胜所需连续控制回合数。
   */
  requiredControlTurns: number;
  /**
   * 占点模式关键点的生成方式。
   */
  keyPointPlacementMode: KeyPointPlacementMode;
  /**
   * 手动指定的关键点位置列表。
   */
  manualKeyPoints: Position[];
  /**
   * 占点模式下是否允许种族灭亡后重新布置初始细胞数继续游戏。
   */
  allowRevive: boolean;
  /**
   * 全歼与占点模式下是否允许回合上限作为提前结束条件。
   */
  allowEarlyEnd: boolean;
  /**
   * 是否允许参与对局的种族实时查看其它种族在布子阶段与繁衍阶段提交的位置。
   */
  revealPlacements: boolean;
  /**
   * 布子阶段与繁衍阶段的限时秒数。0 表示不限时。
   */
  placementTimeLimitSeconds: number;
}

/**
 * 定义规则配置。
 */
export interface RuleConfig {
  /**
   * 是否启用敌对伤害。
   */
  enemyDamageEnabled: boolean;
  /**
   * 是否使用净优势出生规则。
   */
  useNetBirth: boolean;
  /**
   * 出生冲突处理策略。
   */
  birthConflictStrategy: BirthConflictStrategy;
  /**
   * 随机种子。
   */
  seed: number;
  /**
   * 是否记录对局日志。
   */
  logEnabled: boolean;
  /**
   * 天灾配置。
   */
  disaster: DisasterConfig;
  /**
   * 额外繁衍配置。
   */
  reinforcement: ReinforcementConfig;
}

/**
 * 定义完整对局配置。
 */
export interface MatchConfig {
  /**
   * 地图配置。
   */
  map: MapConfig;
  /**
   * 规则配置。
   */
  rules: RuleConfig;
  /**
   * 玩法配置。
   */
  gameplay: GameplayConfig;
  /**
   * 所有种族配置列表。
   */
  races: RaceConfig[];
}

/**
 * 定义二维坐标。
 */
export interface Position {
  /**
   * 横向坐标。
   */
  x: number;
  /**
   * 纵向坐标。
   */
  y: number;
}

/**
 * 定义棋盘状态。
 */
export interface BoardState {
  /**
   * 地图宽度，单位为单元格数量。
   */
  width: number;
  /**
   * 地图高度，单位为单元格数量。
   */
  height: number;
  /**
   * 二维单元格数组，第一维为 y，第二维为 x。
   */
  cells: CellState[][];
}

/**
 * 定义单个种族统计信息。
 */
export interface RaceStats {
  /**
   * 对应种族编号。
   */
  raceId: number;
  /**
   * 当前存活细胞数量。
   */
  aliveCells: number;
  /**
   * 当前总生命值。
   */
  totalHp: number;
  /**
   * 当前占领关键点数量。
   */
  controlPoints: number;
  /**
   * 累计产生的细胞总数，包含开局布子、自然出生与额外繁衍。
   */
  cumulativeGeneratedCells: number;
  /**
   * 累计存活回合数。只要该世代仍有活细胞则加一。
   */
  aliveTurns: number;
}

/**
 * 定义一世代统计结果。
 */
export interface GenerationStats {
  /**
   * 当前世代编号。
   */
  generation: number;
  /**
   * 各种族统计。
   */
  raceStats: RaceStats[];
  /**
   * 当前仍存活的种族编号列表。
   */
  aliveRaceIds: number[];
}

/**
 * 定义单个阵营统计信息。
 */
export interface CampStats {
  /**
   * 对应阵营编号。
   */
  campId: number;
  /**
   * 当前阵营存活细胞数量总和。
   */
  aliveCells: number;
  /**
   * 当前阵营总生命值总和。
   */
  totalHp: number;
  /**
   * 当前阵营占领关键点数量总和。
   */
  controlPoints: number;
  /**
   * 当前阵营累计产生细胞总数。
   */
  cumulativeGeneratedCells: number;
  /**
   * 当前阵营累计存活回合总和。
   */
  aliveTurns: number;
  /**
   * 当前阵营包含的种族编号列表。
   */
  raceIds: number[];
}

/**
 * 定义一条对局日志。
 */
export interface MatchLogEntry {
  /**
   * 产生该日志的世代编号。
   */
  generation: number;
  /**
   * 日志类型。
   */
  type: string;
  /**
   * 面向用户的简短描述。
   */
  message: string;
}

/**
 * 定义繁衍阶段的一次新增布子记录。
 */
export interface ReinforcementPlacement {
  /**
   * 产生该新增位置的种族编号。
   */
  raceId: number;
  /**
   * 新增位置坐标。
   */
  position: Position;
  /**
   * 该新增位置的提交者。human 表示人类手动提交，ai 表示 AI 自动提交。
   */
  actor: "human" | "ai";
}

/**
 * 定义回放帧。
 */
export interface ReplayFrame {
  /**
   * 帧对应的世代编号。
   */
  generation: number;
  /**
   * 该帧的完整棋盘快照。
   */
  board: BoardState;
  /**
   * 该帧统计信息。
   */
  stats: GenerationStats;
  /**
   * 该帧追加日志。
   */
  logs: MatchLogEntry[];
  /**
   * 该帧内实际触发的天灾中心点列表。
   */
  disasterCenters: Position[];
}

/**
 * 定义关键点状态。
 */
export interface KeyPointState {
  /**
   * 关键点位置。
   */
  position: Position;
  /**
   * 当前控制该点的种族编号。为空表示无人控制。
   */
  controllingRaceId: number | null;
  /**
   * 当前控制连续时长。
   */
  heldTurns: number;
}

/**
 * 定义对局运行时状态。
 */
export interface MatchState {
  /**
   * 当前棋盘状态。
   */
  board: BoardState;
  /**
   * 当前世代编号。
   */
  generation: number;
  /**
   * 历史回放帧。
   */
  replayFrames: ReplayFrame[];
  /**
   * 日志列表。
   */
  logs: MatchLogEntry[];
  /**
   * 当前统计结果。
   */
  stats: GenerationStats;
  /**
   * 关键点状态列表。
   */
  keyPoints: KeyPointState[];
  /**
   * 当前对局阶段。
   */
  phase: MatchPhase;
  /**
   * 人类玩家控制的种族编号列表。
   */
  humanRaceIds: number[];
  /**
   * 当前繁衍阶段各个种族剩余可放置数量。键为种族编号，值为剩余名额。
   */
  reinforcementRemaining: Record<number, number>;
  /**
   * 当前繁衍阶段各个种族已经提交的新增位置列表。
   */
  reinforcementPlacements: Record<number, Position[]>;
  /**
   * 当前繁衍阶段的新增位置历史，用于撤销最近一次提交。
   */
  reinforcementPlacementHistory: ReinforcementPlacement[];
  /**
   * 本局内各个种族最近一次“初始布置/复活布置”完成时的世代编号。
   */
  lastSeedGenerations: Record<number, number>;
  /**
   * 当前繁衍阶段中属于“复活布置”的种族编号列表。
   */
  reinforcementReviveRaceIds: number[];
  /**
   * 各个种族在本局中的累计进度统计。
   */
  raceProgress: Record<number, { cumulativeGeneratedCells: number; aliveTurns: number }>;
  /**
   * 当前获胜种族编号。为空表示尚未结束。
   */
  winnerRaceId: number | null;
  /**
   * 对局是否已结束。
   */
  finished: boolean;
}

/**
 * 定义参数校验结果。
 */
export interface ValidationIssue {
  /**
   * 严重等级。
   */
  level: "error" | "warning";
  /**
   * 关联字段路径。
   */
  field: string;
  /**
   * 供界面展示的信息。
   */
  message: string;
}

/**
 * 定义出生判定候选。
 */
export interface BirthCandidate {
  /**
   * 候选种族编号。
   */
  raceId: number;
  /**
   * 候选友军数量。
   */
  friendly: number;
  /**
   * 候选敌军数量。
   */
  enemy: number;
  /**
   * 候选净优势值。
   */
  netAdvantage: number;
}

/**
 * 定义单个种族的最终排名条目。
 */
export interface RaceRankingEntry {
  /**
   * 对应种族编号。
   */
  raceId: number;
  /**
   * 最终排名名次，1 表示第一名。
   */
  rank: number;
  /**
   * 用于展示的种族统计快照。
   */
  stats: RaceStats;
}

/**
 * 定义单个阵营的最终排名条目。
 */
export interface CampRankingEntry {
  /**
   * 对应阵营编号。
   */
  campId: number;
  /**
   * 最终排名名次，1 表示第一名。
   */
  rank: number;
  /**
   * 用于展示的阵营统计快照。
   */
  stats: CampStats;
}
