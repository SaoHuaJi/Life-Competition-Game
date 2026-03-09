import type { HelpOption } from "./components/helpTypes";

/**
 * 创建单条字段说明项。
 *
 * Args:
 *   label: 字段名称。
 *   description: 字段说明内容。
 *
 * Returns:
 *   HelpOption<string>[]: 仅包含一条说明项的说明数组。
 */
function singleHelp(label: string, description: string): HelpOption<string>[] {
  return [{ value: "info", label, description }];
}

/**
 * 统一维护所有字段级参数说明。
 */
export const FIELD_HELP = {
  matchMode: singleHelp("对局模式", "决定当前是单纯观察演化、人类参与对抗，还是完全由 AI 自动对战。"),
  cellSize: singleHelp("单元尺寸", "只影响棋盘渲染大小，不影响任何演化或胜负规则。"),
  autoSpeed: singleHelp("自动速度", "控制自动播放推进世代的时间间隔，数值越小播放越快。"),
  showHp: singleHelp("显示 HP", "开启后会在棋盘单元格中显示当前细胞生命值，便于观察恢复与伤害。"),
  showGrid: singleHelp("显示网格", "控制棋盘单元格边界线是否可见，便于观察局部结构与对齐关系。"),
  showNeighborhoodGuide: singleHelp("邻域参考", "悬停棋盘格子时高亮当前格子的邻居范围，方便理解不同地图与邻域规则。"),
  showDisasterOverlay: singleHelp("天灾区域", "开启后可预览或回看天灾的影响范围，便于观察环境事件覆盖区域。"),
  showArcherRangePreview: singleHelp("射手范围", "开启后会以鼠标当前位置为中心预览射手攻击范围；普通邻域不属于射手攻击范围。"),
  playback: singleHelp("回放浏览", "拖动滑条可查看历史世代快照，不会改写当前对局状态。"),
  pattern: singleHelp("图样", "选择当前地图类型可用的图样预设或导入的自定义图样模板，并用于后续布子。"),
  currentRace: singleHelp("当前种族", "决定导入图样、手动布子和繁衍候选操作默认作用于哪个种族。"),
  savePatternName: singleHelp("保存图样名称", "用于导出当前选区图样模板文件时设置显示名称。"),
  mapType: singleHelp("地图类型", "决定棋盘的几何结构，并联动可用邻域、图样、场景和推荐规则。"),
  neighborhoodType: singleHelp("邻域类型", "决定每个细胞在演化时如何统计周围邻居。"),
  mapWidth: singleHelp("宽度", "棋盘横向单元格数量；当宽高同时为 0 时，进入无限地图第一版模式。"),
  mapHeight: singleHelp("高度", "棋盘纵向单元格数量；当宽高同时为 0 时，进入无限地图第一版模式。"),
  topology: singleHelp("边界", "有界边界会把边缘当作终点，环面边界会让上下左右首尾相连。"),
  seed: singleHelp("随机种子", "用于固定随机过程，包含天灾、随机出生冲突与随机 AI 行为。"),
  placementTimeLimitSeconds: singleHelp("布子限时", "以秒为单位限制开局布子阶段与繁衍阶段的可操作时长；取 0 表示不限时。"),
  logEnabled: singleHelp("记录日志", "关闭后不再记录对局事件日志，导出回放中的日志也会为空。"),
  victoryMode: singleHelp("胜利模式", "决定对局如何判断结束、如何排名，以及规则分页中展示哪些模式参数。"),
  disasterEnabled: singleHelp("启用天灾", "打开后每个世代会按概率触发环境打击，对范围内细胞造成伤害。"),
  disasterChance: singleHelp("天灾概率", "每一世代触发一次天灾事件的概率，范围越大事件越频繁。"),
  disasterDamage: singleHelp("天灾伤害", "天灾中心位置的基础伤害值，实际伤害还会受到范围与衰减影响。"),
  disasterMinStrikes: singleHelp("天灾最少落点", "一次天灾事件至少生成多少个独立落点。"),
  disasterMaxStrikes: singleHelp("天灾最多落点", "一次天灾事件至多生成多少个独立落点。"),
  disasterRadius: singleHelp("天灾范围", "每个天灾落点对周围扩散的距离半径。"),
  disasterDecay: singleHelp("使用衰减天灾", "开启后离中心越远伤害越低；关闭时范围内伤害恒定。"),
  disasterDecayFactor: singleHelp("天灾衰减系数", "每远离中心一格会减少的伤害值。"),
  sceneDesign: singleHelp("场景预设", "选择当前地图类型可用的预加载场景预设，并应用到布子棋盘。"),
  saveSceneName: singleHelp("保存场景名称", "用于导出当前场景相关内容时设置显示名称。"),
  enemyDamageEnabled: singleHelp("启用敌对伤害", "开启后不同阵营细胞会对彼此造成额外伤害。"),
  useNetBirth: singleHelp("启用净优势出生", "开启后出生判定会综合友军与敌军优势，而不只看传统邻居计数。"),
  birthConflictStrategy: singleHelp("出生冲突策略", "多个种族同时满足出生条件时，决定新细胞归属的处理方式。"),
  reinforcementEnabled: singleHelp("启用额外繁衍", "开启后会按种族各自的周期进入繁衍阶段，允许新增细胞。"),
  revealPlacements: singleHelp("允许公开布子位置", "决定参与游戏的种族在开局布子阶段与繁衍阶段是否能实时看到其它种族提交的位置；观测者始终可见。"),
  reinforcementPeriod: singleHelp("繁衍周期", "从该种族最近一次初始布置开始，隔多少世代触发一次繁衍机会。"),
  reinforcementAmount: singleHelp("繁衍数量", "每次繁衍可新增的名额；大于 1 的非整数会向下取整。"),
  survivalMaxGenerations: singleHelp("生存最大回合", "生存模式达到该世代后结束，并按生存模式规则进行排名。"),
  allowEarlyEnd: singleHelp("允许最大回合提前结束", "全歼和占点模式下，允许把最大回合作为提前终局条件。"),
  earlyEndGenerations: singleHelp("提前结束回合", "当允许提前结束时，对局达到该世代会立即终局并进行排名。"),
  keyPointCount: singleHelp("关键点数量", "占点模式下地图上总共存在多少个可争夺关键点。"),
  requiredControlPoints: singleHelp("占点目标数", "一个种族同时占领不少于该数量的关键点后，才开始累计维持回合。"),
  requiredControlTurns: singleHelp("占点维持回合", "满足占点目标数后，需要连续维持不失守多少回合才能获胜。"),
  keyPointPlacementMode: singleHelp("关键点生成方式", "随机生成会自动布置关键点，手动设定则在布子阶段自行编辑关键点位置。"),
  allowRevive: singleHelp("占点模式允许复活", "开启后种族灭亡后仍可在后续繁衍阶段重新获得初始布子机会。"),
  raceCount: singleHelp("数量", "参与对局的种族总数，调整后会同步增删种族配置卡片。"),
  editingRace: singleHelp("当前编辑种族", "用于切换右侧当前正在编辑的种族，避免同时展开所有种族参数。"),
  raceProfileName: singleHelp("种族模板名称", "用于导出一整套种族参数模板文件时设置显示名称。"),
  configProfileName: singleHelp("参数模板名称", "用于导出当前通用与规则参数模板文件时设置显示名称。"),
  balanceRisk: singleHelp("风险", "这是种族参数的平衡性风险分数。分数越高，说明这组参数可能更偏激、失衡或不稳定；它不是当前局势评分，也不是胜率预测。"),
  raceName: singleHelp("名称", "种族在界面、统计、日志和排名中的显示名称。"),
  raceColor: singleHelp("颜色", "种族在棋盘与统计面板中的主显示颜色。"),
  campId: singleHelp("阵营编号", "相同阵营视为友军，友军之间不会触发敌对伤害。"),
  trait: singleHelp("种族特性", "为当前种族附加固定增益或减益，会影响生命竞争行为。"),
  hpMax: singleHelp("HP 上限", "单个细胞可拥有的最大生命值。"),
  initialCells: singleHelp("初始细胞", "该种族开局可布置的最大细胞数，也是复活时重新布置的数量基准。"),
  surviveMin: singleHelp("存活下限", "友军邻居数不低于该值时，细胞才满足存活条件的下限。"),
  surviveMax: singleHelp("存活上限", "友军邻居数不高于该值时，细胞才满足存活条件的上限。"),
  birthMin: singleHelp("出生下限", "出生判定值不低于该值时，空格才可能产生新细胞。"),
  birthMax: singleHelp("出生上限", "出生判定值不高于该值时，空格才可能产生新细胞。"),
  regen: singleHelp("恢复倍率", "细胞满足存活条件后，每世代恢复时使用的生命恢复倍率。"),
  disasterResistance: singleHelp("天灾抗性", "用于折算天灾伤害，数值越高，细胞受到的实际天灾伤害越低。"),
  enemyResistance: singleHelp("对敌抗性", "用于折算敌对伤害，数值越高，细胞受到的实际敌对伤害越低。"),
  aiProfile: singleHelp("AI 风格", "决定该种族在布子与繁衍阶段的候选位置选择偏好。"),
} as const satisfies Record<string, HelpOption<string>[]>;
