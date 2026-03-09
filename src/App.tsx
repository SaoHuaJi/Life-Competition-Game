import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, ReactElement } from "react";
import BoardView from "./components/BoardView";
import { LogsPanel, StatsPanel } from "./components/DashboardPanels";
import InfoChoiceGroup from "./components/InfoChoiceGroup";
import OptionButtonRow from "./components/OptionButtonRow";
import OptionSelect from "./components/OptionSelect";
import {
  ConfigProfileSection,
  PatternPresetSection,
  PatternTemplateFileSection,
  RaceProfileSection,
  ScenePresetSection,
} from "./components/TemplateSections";
import type { HelpOption } from "./components/helpTypes";
import {
  DEFAULT_INFINITE_BOARD_HEIGHT,
  DEFAULT_INFINITE_BOARD_WIDTH,
  cloneBoard,
  collectAliveCellSnapshots,
  createBoardState,
  ensureInfiniteBoardMargin,
  getCell,
  moveSelectedCells,
  resolveBoardDimensions,
  setCell,
} from "./core/board";
import {
  createCustomScene,
  dedupeCustomScenes,
  getScenesForGridType,
  sceneRecordToTemplate,
  type CustomSceneRecord,
} from "./core/catalog";
import {
  getArcherAttackPositions,
  calculateDisasterDamageFromMaps,
  createMatchState,
  finishReinforcementPhase,
  getCampRankings,
  getEffectiveDisasterDistance,
  getReinforcementCandidateMarkers,
  getRaceRankings,
  hasPendingHumanReinforcement,
  removeHumanReinforcementPlacement,
  stepMatch,
  terminateMatch,
  submitReinforcementPlacement,
  undoLastHumanReinforcementPlacement,
} from "./core/engine";
import {
  canPlacePatternOnBoard,
  createCustomPatternFromSelection,
  placePatternOnBoard,
  getPatternsForGridType,
  type PatternTemplate,
} from "./core/patterns";
import {
  createConfigProfile,
  createRaceProfile,
  type ConfigProfileRecord,
  type RaceProfileRecord,
} from "./core/profiles";
import {
  createAIBattlePreset,
  createClassicConwayPreset,
  createDefaultConfig,
  createDefaultRace,
  createSymmetricDuelPreset,
} from "./core/presets";
import {
  buildProjectedDistanceMap,
  getNeighborPositions,
  getNeighborhoodSize,
} from "./core/neighborhood";
import { calculateBalanceRisk, validateMatchConfig } from "./core/validation";
import {
  createDistanceMarkers,
  createPositionMarkers,
  type OverlayMarker,
  type OverlayMarkerKind,
} from "./overlayHelpers";
import { FIELD_HELP } from "./parameterHelp";
import {
  applySingleCellEdit,
  countRaceCells,
  fromPositionKey,
  getRectanglePositions,
  pushBoardHistory,
  resizeBoard,
  toPositionKey,
} from "./setupHelpers";
import {
  appendImportedConfigProfiles,
  appendImportedPatterns,
  appendImportedRaceProfiles,
  exportJson,
  getPatternLabel,
  getTraitLabel,
  isCustomPattern,
  isCustomScene,
  toImportArray,
} from "./templateHelpers";
import type {
  BirthConflictStrategy,
  BoardState,
  GridType,
  MatchConfig,
  MatchState,
  NeighborhoodType,
  Position,
  RaceConfig,
  TopologyType,
} from "./core/types";

/**
 * 定义预设名称集合。
 */
type PresetName = "demo" | "human_duel" | "ai_duel";

/**
 * 定义右侧配置面板标签。
 */
type ConfigTab = "general" | "rules" | "races";

/**
 * 定义布子阶段的编辑目标。
 */
type SetupEditTarget = "cells" | "keypoints" | "pattern_select";

/**
 * 定义图样交互模式。
 */
type PatternInteractionMode = "idle" | "place" | "move";


/**
 * 定义普通细胞连续绘制的拖拽状态。
 */
type CellEditDragState = {
  /**
   * 当前拖拽模式，add 表示连续放置，remove 表示连续删除。
   */
  mode: "add" | "remove";
  /**
   * 本次拖拽已处理过的格子列表，用于界面高亮。
   */
  visitedPositions: Position[];
  /**
   * 本次拖拽实际修改的格子数量。
   */
  changedCells: number;
  /**
   * 本次拖拽中覆盖其他种族细胞的数量。
   */
  replacedCells: number;
  /**
   * 本次拖拽中发生覆盖的位置键集合。
   */
  replacedKeys: string[];
  /**
   * 本次拖拽中无效经过的格子数量。
   */
  skippedCells: number;
  /**
   * 当前拖拽过程中，所选种族在棋盘上的实时细胞数量。
   */
  currentRaceCellCount: number;
};

/**
 * 根据地图类型返回默认邻域类型。
 *
 * Args:
 *   gridType: 地图类型。
 *
 * Returns:
 *   NeighborhoodType: 对应地图的推荐默认邻域类型。
 */
function getDefaultNeighborhood(gridType: GridType): NeighborhoodType {
  if (gridType === "hex") {
    return "hex";
  }

  if (gridType === "triangle") {
    return "triangle_edge";
  }

  return "moore";
}

/**
 * 按指定数量创建或截断种族列表。
 *
 * Args:
 *   races: 原始种族列表。
 *   count: 目标种族数量。
 *
 * Returns:
 *   RaceConfig[]: 调整后的种族列表。
 */
function resizeRaces(races: RaceConfig[], count: number): RaceConfig[] {
  const palette = ["#1f9d55", "#dd6b20", "#2563eb", "#7c3aed", "#dc2626", "#0891b2"];
  const nextRaces = [...races];

  while (nextRaces.length < count) {
    const id = nextRaces.length + 1;
    nextRaces.push(createDefaultRace(id, `种族 ${id}`, palette[(id - 1) % palette.length]));
  }

  return nextRaces.slice(0, count).map((race, index) => ({
    ...race,
    id: index + 1,
  }));
}

/**
 * 构建指定预设配置。
 *
 * Args:
 *   presetName: 预设名称。
 *
 * Returns:
 *   MatchConfig: 对应预设的完整对局配置。
 */
function buildPreset(presetName: PresetName): MatchConfig {
  if (presetName === "human_duel") {
    return createSymmetricDuelPreset();
  }

  if (presetName === "ai_duel") {
    return createAIBattlePreset();
  }

  return createClassicConwayPreset();
}

/**
 * 返回预设名称对应的中文标签。
 *
 * Args:
 *   presetName: 预设名称。
 *
 * Returns:
 *   string: 中文标签。
 */
function getPresetLabel(presetName: PresetName): string {
  if (presetName === "human_duel") {
    return "人机对战";
  }

  if (presetName === "ai_duel") {
    return "AI对决";
  }

  return "演示模式";
}

/**
 * 返回地图类型的说明列表。
 *
 * Returns:
 *   HelpOption<GridType>[]: 地图类型说明项。
 */
function getGridTypeOptions(): HelpOption<GridType>[] {
  return [
    { value: "square", label: "方形", description: "经典二维方格地图，最适合复现康威生命游戏图样。" },
    { value: "hex", label: "六边形", description: "每格天然拥有六邻域，适合更平滑的扩张与包围演化。" },
    { value: "triangle", label: "三角形", description: "三角网格会改变局部连通方式，图样与规则需专门适配。" },
  ];
}

/**
 * 返回边界类型的说明列表。
 *
 * Returns:
 *   HelpOption<TopologyType>[]: 边界类型说明项。
 */
function getTopologyOptions(): HelpOption<TopologyType>[] {
  return [
    { value: "bounded", label: "有界", description: "地图边缘视为终点，靠边图样会因为越界而终止或变形。" },
    { value: "toroidal", label: "环面", description: "上下左右边界首尾相连，适合观察周期图样的跨边界演化。" },
  ];
}

/**
 * 返回出生冲突策略的说明列表。
 *
 * Returns:
 *   HelpOption<BirthConflictStrategy>[]: 出生冲突策略说明项。
 */
function getBirthConflictOptions(): HelpOption<BirthConflictStrategy>[] {
  return [
    { value: "no_birth_on_tie", label: "并列不出生", description: "多个种族竞争值并列时，该空格保持为空。" },
    { value: "priority_order", label: "固定优先级", description: "按种族编号优先级决定出生归属，编号越小越优先。" },
    { value: "max_friendly", label: "友军数优先", description: "优先选择在该空格周围拥有更多友军邻居的种族。" },
    { value: "max_net_advantage", label: "净优势优先", description: "比较友军减敌军后的净优势，优势更大的种族获胜。" },
    { value: "random", label: "随机", description: "从竞争种族中随机挑选一个出生，受随机种子影响。" },
  ];
}

/**
 * 返回当前地图类型可用邻域的说明列表。
 *
 * Args:
 *   gridType: 地图类型。
 *
 * Returns:
 *   HelpOption<NeighborhoodType>[]: 邻域类型说明项。
 */
function getNeighborhoodChoiceOptions(gridType: GridType): HelpOption<NeighborhoodType>[] {
  if (gridType === "hex") {
    return [
      {
        value: "hex",
        label: "六边形邻域",
        description: "六边形地图的标准六邻域，适合围绕六向连通关系进行演化。",
      },
    ];
  }

  if (gridType === "triangle") {
    return [
      {
        value: "triangle_edge",
        label: "冯诺伊曼邻域",
        description: "仅把共享边的三角单元格视为邻居，距离按边连通关系一圈圈扩展。",
      },
      {
        value: "triangle_moore",
        label: "摩尔邻域",
        description: "把共享边或共享点的三角单元格都视为邻居，距离按扩展邻域一圈圈扩展。",
      },
    ];
  }

  return [
    {
      value: "moore",
      label: "摩尔邻域",
      description: "统计周围八格，是经典康威生命游戏的默认邻域。",
    },
    {
      value: "von_neumann",
      label: "冯诺伊曼邻域",
      description: "只统计上下左右四格，扩张更克制、图样更稀疏。",
    },
  ];
}

/**
 * 返回顶部对局模式按钮的说明列表。
 *
 * Returns:
 *   HelpOption<MatchConfig["gameplay"]["mode"]>[]: 对局模式说明项。
 */
function getModeOptions(): HelpOption<MatchConfig["gameplay"]["mode"]>[] {
  return [
    {
      value: "observe",
      label: "演示模式",
      description: "使用演示预设，侧重规则展示、图样观察和自动演化过程查看。",
    },
    {
      value: "human_vs_ai",
      label: "人机对战",
      description: "使用人机对抗预设，由你控制首个种族，其他种族交给 AI。 ",
    },
    {
      value: "ai_vs_ai",
      label: "AI对决",
      description: "使用 AI 对战预设，所有种族都由 AI 控制，适合观察平衡性与回放。",
    },
  ];
}

/**
 * 渲染带字段问号说明的标签内容。
 *
 * Args:
 *   label: 字段名称。
 *   helpKey: 字段说明键。
 *   value: 当前字段的高亮值。
 *   options: 若字段本身就是枚举项，则可直接复用选项说明数组。
 *
 * Returns:
 *   ReactElement: 含名称与问号提示的标签节点。
 */
function renderFieldLabel(
  label: string,
  helpKey: keyof typeof FIELD_HELP,
  value?: string,
  options?: HelpOption<string>[],
): ReactElement {
  const helpOptions = [...FIELD_HELP[helpKey]];
  const activeValue = value ?? helpOptions[0]?.value ?? "info";

  return (
    <span className="field-label-row">
      <span>{label}</span>
      <InfoChoiceGroup title={`${label}说明`} value={activeValue} options={helpOptions} />
    </span>
  );
}

/**
 * 返回给定说明选项列表中某个值对应的标签。
 *
 * Args:
 *   options: 说明选项列表。
 *   value: 目标选项值。
 *
 * Returns:
 *   string: 若命中则返回标签，否则返回原始值。
 */
function getOptionLabel<TValue extends string>(
  options: HelpOption<TValue>[],
  value: TValue,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * 返回胜利模式的说明列表。
 *
 * Returns:
 *   Array<{ value: MatchConfig["gameplay"]["victoryMode"]; label: string; description: string }>:
 *   胜利模式说明项。
 */
function getVictoryModeOptions(): Array<{
  value: MatchConfig["gameplay"]["victoryMode"];
  label: string;
  description: string;
}> {
  return [
    {
      value: "none",
      label: "无",
      description: "不主动结算胜负，适合观察演化本身。",
    },
    {
      value: "annihilation",
      label: "全歼",
      description: "只剩一个阵营仍存活时获胜；若允许提前结束，可在最大回合按排名结算。",
    },
    {
      value: "survival",
      label: "生存",
      description: "达到最大回合后按存活细胞数、总生命值和累计产生细胞数排名结算。",
    },
    {
      value: "control",
      label: "占点",
      description: "当前占领点数达到目标后，按这批关键点共同维持占领的连续回合数判胜。",
    },
  ];
}

/**
 * 返回 AI 风格的说明列表。
 *
 * Returns:
 *   Array<{ value: RaceConfig["aiProfile"]; label: string; description: string }>:
 *   AI 风格说明项。
 */
function getAiProfileOptions(): Array<{
  value: RaceConfig["aiProfile"];
  label: string;
  description: string;
}> {
  return [
    { value: "balanced", label: "平衡", description: "兼顾生存、扩张与局部收益，是默认的综合型 AI。" },
    { value: "aggressive", label: "激进", description: "更偏向密集交火与高占用区域，主动制造冲突。" },
    { value: "defensive", label: "保守", description: "优先维持己方簇状结构，减少孤立和无效扩张。" },
    { value: "expansion", label: "扩张", description: "偏好中心与高几何收益位置，尽快扩大版图。" },
    { value: "control", label: "占点", description: "更重视关键点附近和维持控制的布局收益。" },
    { value: "random", label: "随机", description: "保留少量局部评估，但整体选择更不可预测。" },
  ];
}

/**
 * 返回种族特性的说明列表。
 *
 * Returns:
 *   Array<{ value: RaceConfig["trait"]; label: string; description: string }>:
 *   种族特性说明项。
 */
function getTraitOptions(): Array<{
  value: RaceConfig["trait"];
  label: string;
  description: string;
}> {
  return [
    { value: "none", label: "无特性", description: "不施加额外增益或减益，使用基础规则参数。" },
    { value: "warrior", label: "战士", description: "对敌伤害提高为 1.5 倍，受到敌伤时仅承受 0.75 倍。" },
    { value: "archer", label: "射手", description: "不攻击相邻敌人，改为攻击图距离为 2 的敌对目标。" },
    {
      value: "short_lived",
      label: "短寿",
      description: "生命上限减 3，繁衍周期减 3，最低都保持大于 0，繁衍数量乘 1.25 并向下取整。",
    },
    {
      value: "long_lived",
      label: "长生",
      description: "生命上限加 3，繁衍周期加 3，不改变额外繁衍数量倍率。",
    },
  ];
}

/**
 * 返回关键点生成方式的说明列表。
 *
 * Returns:
 *   Array<{ value: MatchConfig["gameplay"]["keyPointPlacementMode"]; label: string; description: string }>:
 *   关键点生成方式说明项。
 */
function getKeyPointPlacementOptions(): Array<{
  value: MatchConfig["gameplay"]["keyPointPlacementMode"];
  label: string;
  description: string;
}> {
  return [
    {
      value: "random",
      label: "随机生成",
      description: "开局时依据随机种子自动生成关键点位置，适合快速测试与演示。",
    },
    {
      value: "manual",
      label: "手动设定",
      description: "在布子阶段切换到关键点编辑后，直接在棋盘上添加或删除关键点。",
    },
  ];
}

/**
 * 渲染生命竞争游戏主应用。
 *
 * Returns:
 *   ReactElement: 主应用页面。
 */
export default function App(): ReactElement {
  const [config, setConfig] = useState<MatchConfig>(() => createClassicConwayPreset());
  const [setupBoard, setSetupBoard] = useState<BoardState>(() => {
    const dimensions = resolveBoardDimensions(24, 16);
    return createBoardState(dimensions.width, dimensions.height);
  });
  const [setupHistory, setSetupHistory] = useState<BoardState[]>([]);
  const [redoHistory, setRedoHistory] = useState<BoardState[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState(1);
  const [customPatterns, setCustomPatterns] = useState<PatternTemplate[]>([]);
  const [customSceneRecords, setCustomSceneRecords] = useState<CustomSceneRecord[]>([]);
  const [customRaceProfiles, setCustomRaceProfiles] = useState<RaceProfileRecord[]>([]);
  const [customConfigProfiles, setCustomConfigProfiles] = useState<ConfigProfileRecord[]>([]);
  const [customPatternLabel, setCustomPatternLabel] = useState("");
  const [customSceneLabel, setCustomSceneLabel] = useState("");
  const [customRaceProfileLabel, setCustomRaceProfileLabel] = useState("");
  const [customConfigProfileLabel, setCustomConfigProfileLabel] = useState("");
  const [selectedPatternId, setSelectedPatternId] = useState("square-glider");
  const [selectedSceneId, setSelectedSceneId] = useState("scene-classic-glider");
  const [selectedRaceProfileId, setSelectedRaceProfileId] = useState("");
  const [selectedConfigProfileId, setSelectedConfigProfileId] = useState("");
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"setup" | "match">("setup");
  const [configTab, setConfigTab] = useState<ConfigTab>("general");
  const [generalAdvancedOpen, setGeneralAdvancedOpen] = useState(false);
  const [rulesAdvancedOpen, setRulesAdvancedOpen] = useState(false);
  const [raceAdvancedOpen, setRaceAdvancedOpen] = useState<Record<number, boolean>>({});
  const [autoRunning, setAutoRunning] = useState(false);
  const [speedMs, setSpeedMs] = useState(280);
  const [cellSize, setCellSize] = useState(30);
  const [showHpText, setShowHpText] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showNeighborhoodGuide, setShowNeighborhoodGuide] = useState(false);
  const [showDisasterOverlay, setShowDisasterOverlay] = useState(false);
  const [showArcherRangePreview, setShowArcherRangePreview] = useState(false);
  const [boardCenterToken, setBoardCenterToken] = useState(0);
  const [setupEditTarget, setSetupEditTarget] = useState<SetupEditTarget>("cells");
  const [patternInteractionMode, setPatternInteractionMode] =
    useState<PatternInteractionMode>("idle");
  const [selectedPatternCells, setSelectedPatternCells] = useState<Position[]>([]);
  const [patternHoverAnchor, setPatternHoverAnchor] = useState<Position | null>(null);
  const [cellEditDragState, setCellEditDragState] = useState<CellEditDragState | null>(null);
  const [selectionDragState, setSelectionDragState] = useState<{
    mode: "add" | "remove";
    anchor: Position;
    current: Position;
    baseKeys: string[];
  } | null>(null);
  const [statusText, setStatusText] = useState("先布子，再使用自动播放或单步推进开始游戏。");
  const [setupPhaseVersion, setSetupPhaseVersion] = useState(0);
  const [placementDeadlineAt, setPlacementDeadlineAt] = useState<number | null>(null);
  const [placementTimeLeftMs, setPlacementTimeLeftMs] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const suppressSetupBoardActionRef = useRef(false);
  const setupBoardRef = useRef<BoardState>(setupBoard);
  const cellEditDragStateRef = useRef<CellEditDragState | null>(cellEditDragState);
  const cellEditOriginBoardRef = useRef<BoardState | null>(null);
  const cellEditVisitedKeysRef = useRef<Set<string>>(new Set());
  const patternImportRef = useRef<HTMLInputElement | null>(null);
  const sceneImportRef = useRef<HTMLInputElement | null>(null);
  const raceProfileImportRef = useRef<HTMLInputElement | null>(null);
  const configProfileImportRef = useRef<HTMLInputElement | null>(null);
  const [hoveredBoardPosition, setHoveredBoardPosition] = useState<Position | null>(null);

  /**
   * 基于配置计算当前校验结果。
   */
  const validationIssues = useMemo(() => validateMatchConfig(config), [config]);

  /**
   * 计算当前种族平衡风险分数。
   */
  const balanceRisks = useMemo(() => calculateBalanceRisk(config), [config]);
  const gridTypeOptions = useMemo(() => getGridTypeOptions(), []);
  const topologyOptions = useMemo(() => getTopologyOptions(), []);
  const modeOptions = useMemo(() => getModeOptions(), []);
  const neighborhoodChoiceOptions = useMemo(
    () => getNeighborhoodChoiceOptions(config.map.gridType),
    [config.map.gridType],
  );
  const birthConflictOptions = useMemo(() => getBirthConflictOptions(), []);
  const victoryModeOptions = useMemo(() => getVictoryModeOptions(), []);
  const aiProfileOptions = useMemo(() => getAiProfileOptions(), []);
  const traitOptions = useMemo(() => getTraitOptions(), []);
  const keyPointPlacementOptions = useMemo(() => getKeyPointPlacementOptions(), []);
  const raceLookup = useMemo(
    () => new Map(config.races.map((race) => [race.id, race])),
    [config.races],
  );
  const raceSelectOptions = useMemo(
    () => config.races.map((race) => ({ id: race.id, name: race.name })),
    [config.races],
  );

  /**
   * 处理单个种族卡的高级参数展开状态切换。
   *
   * Args:
   *   raceId: 目标种族编号。
   *
   * Returns:
   *   void: 无返回值。
   */
  function toggleRaceAdvanced(raceId: number): void {
    setRaceAdvancedOpen((previous) => ({
      ...previous,
      [raceId]: !previous[raceId],
    }));
  }

  /**
   * 计算当前地图类型可用的图样列表。
   */
  const availablePatterns = useMemo(
    () => getPatternsForGridType(config.map.gridType, customPatterns),
    [config.map.gridType, customPatterns],
  );
  const patternLookup = useMemo(
    () => new Map(availablePatterns.map((pattern) => [pattern.id, pattern])),
    [availablePatterns],
  );

  /**
   * 计算当前地图类型可用的场景列表。
   */
  const availableScenes = useMemo(
    () =>
      getScenesForGridType(
        config.map.gridType,
        customSceneRecords.map((record) => sceneRecordToTemplate(record)),
      ),
    [config.map.gridType, customSceneRecords],
  );
  const sceneSelectOptions = useMemo(
    () => availableScenes.map((scene) => ({ id: scene.id, label: scene.label })),
    [availableScenes],
  );
  const isObserverView = config.gameplay.mode !== "human_vs_ai";
  const revealAllPlacementsToViewer = isObserverView || config.gameplay.revealPlacements;
  const placementPhaseKey = useMemo(() => {
    if (config.gameplay.placementTimeLimitSeconds <= 0) {
      return null;
    }

    if (viewMode === "setup") {
      return `setup:${setupPhaseVersion}`;
    }

    if (
      matchState &&
      matchState.phase === "reinforcement" &&
      hasPendingHumanReinforcement(matchState)
    ) {
      return `reinforcement:${matchState.generation}`;
    }

    return null;
  }, [
    config.gameplay.placementTimeLimitSeconds,
    matchState,
    setupPhaseVersion,
    viewMode,
  ]);
  const placementSecondsLeft = placementTimeLeftMs === null
    ? null
    : Math.max(0, Math.ceil(placementTimeLeftMs / 1000));
  const visibleSetupBoard = useMemo(() => {
    if (viewMode !== "setup" || revealAllPlacementsToViewer || config.gameplay.mode !== "human_vs_ai") {
      return setupBoard;
    }

    const nextBoard = cloneBoard(setupBoard);
    for (let y = 0; y < nextBoard.height; y += 1) {
      for (let x = 0; x < nextBoard.width; x += 1) {
        const cell = nextBoard.cells[y][x];
        if (cell.raceId !== null && cell.raceId !== selectedRaceId) {
          setCell(nextBoard, { x, y }, null, 0);
        }
      }
    }

    return nextBoard;
  }, [config.gameplay.mode, revealAllPlacementsToViewer, selectedRaceId, setupBoard, viewMode]);

  /**
   * 计算当前用于展示的棋盘。
   */
  const displayedBoard = useMemo(() => {
    if (viewMode === "setup" || !matchState) {
      return visibleSetupBoard;
    }

    return matchState.replayFrames[playbackIndex]?.board ?? matchState.board;
  }, [matchState, playbackIndex, viewMode, visibleSetupBoard]);

  /**
   * 计算当前用于展示的统计结果。
   */
  const displayedStats = useMemo(() => {
    if (viewMode === "setup" || !matchState) {
      return null;
    }

    return matchState.replayFrames[playbackIndex]?.stats ?? matchState.stats;
  }, [matchState, playbackIndex, viewMode]);

  /**
   * 计算当前用于展示的日志。
   */
  const displayedLogs = useMemo(() => {
    if (viewMode === "setup" || !matchState) {
      return [];
    }

    const replayFrame = matchState.replayFrames[playbackIndex];
    if (!replayFrame) {
      return matchState.logs.slice(-10);
    }

    return matchState.logs
      .filter((log) => log.generation <= replayFrame.generation)
      .slice(-10);
  }, [matchState, playbackIndex, viewMode]);

  /**
   * 计算布子阶段应展示的手动关键点列表。
   */
  const setupKeyPoints = useMemo(() => {
    if (
      config.gameplay.victoryMode !== "control" ||
      config.gameplay.keyPointPlacementMode !== "manual"
    ) {
      return [];
    }

    return config.gameplay.manualKeyPoints
      .slice(0, config.gameplay.keyPointCount)
      .map((position) => ({
        position,
        controllingRaceId: null,
        heldTurns: 0,
      }));
  }, [
    config.gameplay.keyPointCount,
    config.gameplay.keyPointPlacementMode,
    config.gameplay.manualKeyPoints,
    config.gameplay.victoryMode,
  ]);

  /**
   * 计算当前结束态或回放末帧对应的完整排名。
   */
  const rankingEntries = useMemo(() => {
    if (!matchState) {
      return [];
    }

    return getRaceRankings(matchState, config);
  }, [config, matchState]);
  const campRankingEntries = useMemo(() => {
    if (!matchState) {
      return [];
    }

    return getCampRankings(matchState, config);
  }, [config, matchState]);

  /**
   * 计算当前人类种族在繁衍阶段的剩余额度。
   */
  const currentHumanReinforcementRemaining = useMemo(() => {
    if (!matchState) {
      return 0;
    }

    return matchState.humanRaceIds.reduce(
      (total, raceId) => total + (matchState.reinforcementRemaining[raceId] ?? 0),
      0,
    );
  }, [matchState]);

  /**
   * 计算当前繁衍阶段候选新增位置的可视化标记。
   */
  const reinforcementCandidateMarkers = useMemo(() => {
    if (!matchState) {
      return [];
    }

    const markers = getReinforcementCandidateMarkers(matchState);
    if (revealAllPlacementsToViewer || config.gameplay.mode !== "human_vs_ai") {
      return markers;
    }

    return markers
      .filter((marker) => matchState.humanRaceIds.includes(marker.raceId))
      .map((marker) => ({
        ...marker,
        conflict: false,
      }));
  }, [config.gameplay.mode, matchState, revealAllPlacementsToViewer]);

  /**
   * 计算当前是否存在可导出的图样选区。
   */
  const canSaveCustomPattern = useMemo(
    () => collectAliveCellSnapshots(setupBoard, selectedPatternCells).length > 0,
    [selectedPatternCells, setupBoard],
  );

  /**
   * 同步回放滑条到最新帧。
   */
  useEffect(() => {
    if (!matchState) {
      return;
    }

    setPlaybackIndex(matchState.replayFrames.length - 1);
  }, [matchState?.replayFrames.length]);

  /**
   * 在进入人类繁衍阶段时自动暂停，避免用户错过观察。
   */
  useEffect(() => {
    if (!matchState) {
      return;
    }

    if (matchState.finished) {
      setAutoRunning(false);
      setStatusText(matchState.logs.at(-1)?.message ?? "对局结束。");
      return;
    }

    if (matchState.phase === "reinforcement" && hasPendingHumanReinforcement(matchState)) {
      setAutoRunning(false);
      setStatusText("进入繁衍阶段，请在棋盘上点击新增位置，或手动结束繁衍阶段。");
    }
  }, [matchState]);

  /**
   * 在进入新的布子阶段或繁衍阶段时启动阶段倒计时；若配置为 0，则表示不限时。
   */
  useEffect(() => {
    if (placementPhaseKey === null) {
      setPlacementDeadlineAt(null);
      setPlacementTimeLeftMs(null);
      return;
    }

    const nextDeadline = Date.now() + config.gameplay.placementTimeLimitSeconds * 1000;
    setPlacementDeadlineAt(nextDeadline);
    setPlacementTimeLeftMs(config.gameplay.placementTimeLimitSeconds * 1000);
  }, [config.gameplay.placementTimeLimitSeconds, placementPhaseKey]);

  /**
   * 在布子阶段或繁衍阶段持续刷新剩余限时，并在超时后自动确认当前阶段状态。
   */
  useEffect(() => {
    if (placementDeadlineAt === null) {
      return;
    }

    const currentDeadlineAt = placementDeadlineAt;

    function tick(): void {
      const remaining = currentDeadlineAt - Date.now();

      if (remaining > 0) {
        setPlacementTimeLeftMs(remaining);
        return;
      }

      setPlacementTimeLeftMs(0);
      setPlacementDeadlineAt(null);

      if (viewMode === "setup") {
        const nextMatchState = createMatchState(config, setupBoardRef.current);
        setMatchState(nextMatchState);
        setViewMode("match");
        setPlaybackIndex(nextMatchState.replayFrames.length - 1);
        setStatusText("布子阶段超时，已按最后一刻的布子状态自动确认并开始对局。");
        return;
      }

      if (
        matchState &&
        matchState.phase === "reinforcement" &&
        hasPendingHumanReinforcement(matchState)
      ) {
        const nextState = finishReinforcementPhase(matchState, config);
        setMatchState(nextState);
        setStatusText("繁衍阶段超时，已按最后一刻的候选位置自动确认。");
      }
    }

    tick();
    const intervalId = window.setInterval(tick, 200);
    return () => window.clearInterval(intervalId);
  }, [config, matchState, placementDeadlineAt, viewMode]);

  /**
   * 当地图类型切换导致图样不可用时，自动切换到当前地图可用的首个图样。
   */
  useEffect(() => {
    if (selectedPatternId === "") {
      return;
    }

    if (availablePatterns.some((pattern) => pattern.id === selectedPatternId)) {
      return;
    }

    setSelectedPatternId(availablePatterns[0]?.id ?? "");
  }, [availablePatterns, selectedPatternId]);

  /**
   * 当地图类型切换导致场景不可用时，自动切换到当前地图可用的首个场景。
   */
  useEffect(() => {
    if (selectedSceneId === "") {
      return;
    }

    if (availableScenes.some((scene) => scene.id === selectedSceneId)) {
      return;
    }

    setSelectedSceneId(availableScenes[0]?.id ?? "");
  }, [availableScenes, selectedSceneId]);

  /**
   * 保证当前选中的种族模板标识始终有效。
   */
  useEffect(() => {
    if (customRaceProfiles.some((profile) => profile.id === selectedRaceProfileId)) {
      return;
    }

    setSelectedRaceProfileId(customRaceProfiles[0]?.id ?? "");
  }, [customRaceProfiles, selectedRaceProfileId]);

  /**
   * 保证当前选中的参数模板标识始终有效。
   */
  useEffect(() => {
    if (customConfigProfiles.some((profile) => profile.id === selectedConfigProfileId)) {
      return;
    }

    setSelectedConfigProfileId(customConfigProfiles[0]?.id ?? "");
  }, [customConfigProfiles, selectedConfigProfileId]);

  /**
   * 保证当前选中的种族编号始终落在现有种族范围内。
   */
  useEffect(() => {
    if (config.races.some((race) => race.id === selectedRaceId)) {
      return;
    }

    setSelectedRaceId(config.races[0]?.id ?? 1);
  }, [config.races, selectedRaceId]);

  /**
   * 当不处于手动关键点配置时，自动退回普通布子模式。
   */
  useEffect(() => {
    if (
      config.gameplay.victoryMode !== "control" ||
      config.gameplay.keyPointPlacementMode !== "manual"
    ) {
      setSetupEditTarget((previous) => (previous === "keypoints" ? "cells" : previous));
    }
  }, [config.gameplay.keyPointPlacementMode, config.gameplay.victoryMode]);

  /**
   * 当离开普通细胞编辑模式时，立即清理对应的框选拖拽状态。
   */
  useEffect(() => {
    if (setupEditTarget !== "cells" && cellEditDragState) {
      setCellEditDragState(null);
      cellEditOriginBoardRef.current = null;
      cellEditVisitedKeysRef.current = new Set<string>();
    }
  }, [cellEditDragState, setupEditTarget]);

  /**
   * 保持布子棋盘引用始终指向最新值，便于拖拽绘制同步读取。
   */
  useEffect(() => {
    setupBoardRef.current = setupBoard;
  }, [setupBoard]);

  /**
   * 同步普通细胞拖拽状态引用，供高频刷子路径读取最新数据。
   */
  useEffect(() => {
    cellEditDragStateRef.current = cellEditDragState;
  }, [cellEditDragState]);

  /**
   * 当棋盘变化后，自动清理已经失效的图样选区。
   */
  useEffect(() => {
    setSelectedPatternCells((previous) =>
      previous.filter((position) => {
        const cell = getCell(setupBoard, position);
        return cell !== null && cell.raceId !== null && cell.hp > 0;
      }),
    );
  }, [setupBoard]);

  /**
   * 在鼠标释放时结束普通细胞连续绘制拖拽，并只记录一次撤销历史。
   */
  useEffect(() => {
    if (!cellEditDragState || setupEditTarget !== "cells") {
      return;
    }

    const dragState = cellEditDragState;
    const currentRace = config.races.find((item) => item.id === selectedRaceId);

    function handleWindowMouseUp(): void {
      const originBoard = cellEditOriginBoardRef.current;
      if (dragState.changedCells > 0 && originBoard) {
        setSetupHistory((previous) => pushBoardHistory(previous, originBoard));
        setRedoHistory([]);
      }

      if (currentRace) {
        if (dragState.mode === "add") {
          if (dragState.changedCells > 0) {
            setStatusText(
              `${currentRace.name} 已连续布子 ${dragState.changedCells} 格，其中覆盖他族 ${dragState.replacedCells} 格。`,
            );
          } else {
            setStatusText(`${currentRace.name} 未新增细胞，可能已达到初始布子上限或重复经过原有细胞。`);
          }
        } else if (dragState.changedCells > 0) {
          setStatusText(`已连续擦除 ${dragState.changedCells} 个细胞。`);
        } else {
          setStatusText("本次擦除没有命中任何已布置细胞。");
        }
      }

      suppressSetupBoardActionRef.current = true;
      cellEditOriginBoardRef.current = null;
      cellEditVisitedKeysRef.current = new Set<string>();
      setCellEditDragState(null);
    }

    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [cellEditDragState, config.races, selectedRaceId, setupEditTarget]);

  /**
   * 在鼠标释放时结束图样框选拖拽。
   */
  useEffect(() => {
    if (!selectionDragState) {
      return;
    }

    const dragState = selectionDragState;

    function handleWindowMouseUp(): void {
      const rectanglePositions = getRectanglePositions(
        dragState.anchor,
        dragState.current,
      ).filter((position) => {
        if (dragState.mode === "remove") {
          return true;
        }

        const cell = getCell(setupBoard, position);
        return cell !== null && cell.raceId !== null && cell.hp > 0;
      });
      const nextKeys = new Set(dragState.baseKeys);

      rectanglePositions.forEach((position) => {
        const key = toPositionKey(position);
        if (dragState.mode === "add") {
          nextKeys.add(key);
        } else {
          nextKeys.delete(key);
        }
      });

      setSelectedPatternCells(Array.from(nextKeys).map(fromPositionKey));
      setSelectionDragState(null);
    }

    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [selectionDragState, setupBoard]);

  /**
   * 管理自动推进定时器。
   */
  useEffect(() => {
    if (
      !autoRunning ||
      !matchState ||
      matchState.finished ||
      matchState.phase !== "simulation"
    ) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      startTransition(() => {
        setMatchState((previous) => {
          if (
            !previous ||
            previous.finished ||
            previous.phase !== "simulation"
          ) {
            return previous;
          }

          return stepMatch(previous, config);
        });
      });
    }, speedMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRunning, config, matchState, speedMs]);

  /**
   * 记录一次新的布子棋盘状态，并清空重做栈。
   *
   * Args:
   *   nextBoard: 更新后的新棋盘。
   *
   * Returns:
   *   void: 无返回值。
   */
  function commitSetupBoard(nextBoard: BoardState): void {
    setSetupHistory((previous) => pushBoardHistory(previous, setupBoard));
    setRedoHistory([]);
    setupBoardRef.current = nextBoard;
    setSetupBoard(nextBoard);
  }

  /**
   * 加载指定预设。
   *
   * Args:
   *   presetName: 预设名称。
   *
   * Returns:
   *   void: 无返回值。
   */
  function applyPreset(presetName: PresetName): void {
    const nextConfig = buildPreset(presetName);
    setConfig(nextConfig);
    const dimensions = resolveBoardDimensions(nextConfig.map.width, nextConfig.map.height);
    setSetupBoard(createBoardState(dimensions.width, dimensions.height));
    setSetupHistory([]);
    setRedoHistory([]);
    setSelectedRaceId(1);
    setMatchState(null);
    setViewMode("setup");
    setSetupEditTarget("cells");
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setSelectedPatternCells([]);
    setCellEditDragState(null);
    setSelectionDragState(null);
    setAutoRunning(false);
    setSetupPhaseVersion((previous) => previous + 1);
    setStatusText(`已切换到${getPresetLabel(presetName)}预设。`);
  }

  /**
   * 将完整参数配置应用到当前编辑态。
   *
   * Args:
   *   nextConfig: 待应用的完整参数配置。
   *   statusMessage: 应用完成后显示的状态文本。
   *
   * Returns:
   *   void: 无返回值。
   */
  function applyFullConfig(nextConfig: MatchConfig, statusMessage: string): void {
    setConfig(nextConfig);
    const dimensions = resolveBoardDimensions(nextConfig.map.width, nextConfig.map.height);
    setSetupBoard(createBoardState(dimensions.width, dimensions.height));
    setSetupHistory([]);
    setRedoHistory([]);
    setSelectedRaceId(nextConfig.races[0]?.id ?? 1);
    setViewMode("setup");
    setSetupEditTarget("cells");
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setSelectedPatternCells([]);
    setCellEditDragState(null);
    setSelectionDragState(null);
    setMatchState(null);
    setAutoRunning(false);
    setSetupPhaseVersion((previous) => previous + 1);
    setStatusText(statusMessage);
  }

  /**
   * 将完整种族模板应用到当前编辑态。
   *
   * Args:
   *   races: 待应用的种族配置数组。
   *   statusMessage: 应用完成后显示的状态文本。
   *
   * Returns:
   *   void: 无返回值。
   */
  function applyRaceTemplate(races: RaceConfig[], statusMessage: string): void {
    setConfig((previous) => ({
      ...previous,
      races: JSON.parse(JSON.stringify(races)) as RaceConfig[],
    }));
    const dimensions = resolveBoardDimensions(config.map.width, config.map.height);
    setSetupBoard(createBoardState(dimensions.width, dimensions.height));
    setSetupHistory([]);
    setRedoHistory([]);
    setSelectedRaceId(races[0]?.id ?? 1);
    setViewMode("setup");
    setSetupEditTarget("cells");
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setSelectedPatternCells([]);
    setCellEditDragState(null);
    setSelectionDragState(null);
    setMatchState(null);
    setAutoRunning(false);
    setSetupPhaseVersion((previous) => previous + 1);
    setStatusText(statusMessage);
  }

  /**
   * 加载当前地图类型下选中的场景。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSelectScene(sceneId: string): void {
    setSelectedSceneId(sceneId);

    if (sceneId === "") {
      applyFullConfig(createDefaultConfig(), "已载入空场景，恢复默认参数与空棋盘。");
      return;
    }

    const scene = availableScenes.find((item) => item.id === sceneId);

    if (!scene) {
      setStatusText("当前没有可用的场景。");
      return;
    }

    const { config: nextConfig, board } = scene.create();
    setConfig(nextConfig);
    setSetupBoard(board);
    setSetupHistory([]);
    setRedoHistory([]);
    setSelectedRaceId(nextConfig.races[0]?.id ?? 1);
    setMatchState(null);
    setViewMode("setup");
    setSetupEditTarget("cells");
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setSelectedPatternCells([]);
    setCellEditDragState(null);
    setSelectionDragState(null);
    setAutoRunning(false);
    setSetupPhaseVersion((previous) => previous + 1);
    setStatusText(`已载入场景：${scene.label}。`);
  }

  /**
   * 将当前布子保存为自定义场景。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSaveCustomScene(): void {
    const label = customSceneLabel.trim() || `自定义场景 ${customSceneRecords.length + 1}`;
    const scene = createCustomScene(
      `custom-scene-${Date.now()}`,
      label,
      config,
      setupBoard,
    );
    setCustomSceneRecords((previous) => dedupeCustomScenes([...previous, scene]));
    setSelectedSceneId(scene.id);
    setCustomSceneLabel("");
    setStatusText(`已保存自定义场景：${label}。`);
  }

  /**
   * 重命名当前选中的自定义场景。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleRenameCustomScene(): void {
    const label = customSceneLabel.trim();
    if (!label || !isCustomScene(selectedSceneId, customSceneRecords)) {
      return;
    }

    setCustomSceneRecords((previous) =>
      previous.map((scene) =>
        scene.id === selectedSceneId
          ? {
              ...scene,
              label,
            }
          : scene,
      ),
    );
    setCustomSceneLabel("");
    setStatusText(`已重命名当前自定义场景为：${label}。`);
  }

  /**
   * 删除当前选中的自定义场景。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleDeleteCustomScene(): void {
    if (!isCustomScene(selectedSceneId, customSceneRecords)) {
      return;
    }

    setCustomSceneRecords((previous) => previous.filter((scene) => scene.id !== selectedSceneId));
    setCustomSceneLabel("");
    setStatusText("已删除当前自定义场景。");
  }

  /**
   * 对所有自定义场景执行去重。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleDedupeCustomScenes(): void {
    setCustomSceneRecords((previous) => dedupeCustomScenes(previous));
    setStatusText("已对自定义场景执行去重。");
  }

  /**
   * 将当前种族数组保存为自定义种族模板。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSaveCustomRaceProfile(): void {
    const label = customRaceProfileLabel.trim() || `自定义种族参数模板-${Date.now()}`;
    const profile = createRaceProfile(`custom-race-profile-${Date.now()}`, label, config.races);
    exportJson(`${label}.json`, profile);
    setCustomRaceProfileLabel("");
    setStatusText(`已导出当前种族参数模板：${label}。`);
  }

  /**
   * 导入自定义种族模板 JSON 文件。
   *
   * Args:
   *   event: 文件选择事件。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleImportCustomRaceProfiles(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file.text().then((text) => {
      try {
        const parsed = toImportArray(JSON.parse(text) as RaceProfileRecord | RaceProfileRecord[]);
        setCustomRaceProfiles((previous) => {
          const { nextProfiles, nextSelectedId } = appendImportedRaceProfiles(previous, parsed);
          setSelectedRaceProfileId(nextSelectedId);
          return nextProfiles;
        });
        setStatusText(`已导入 ${parsed.length} 个自定义种族参数模板。`);
      } catch {
        setStatusText("种族参数模板导入失败，文件格式不正确。");
      }
    });

    event.target.value = "";
  }

  /**
   * 将当前完整参数保存为自定义参数模板。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSaveCustomConfigProfile(): void {
    const label = customConfigProfileLabel.trim() || `自定义场景参数模板-${Date.now()}`;
    const profile = createConfigProfile(`custom-config-profile-${Date.now()}`, label, config);
    exportJson(`${label}.json`, profile);
    setCustomConfigProfileLabel("");
    setStatusText(`已导出当前场景参数模板：${label}。`);
  }

  /**
   * 导入自定义参数模板 JSON 文件。
   *
   * Args:
   *   event: 文件选择事件。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleImportCustomConfigProfiles(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file.text().then((text) => {
      try {
        const parsed = toImportArray(JSON.parse(text) as ConfigProfileRecord | ConfigProfileRecord[]);
        setCustomConfigProfiles((previous) => {
          const { nextProfiles, nextSelectedId } = appendImportedConfigProfiles(previous, parsed);
          setSelectedConfigProfileId(nextSelectedId);
          return nextProfiles;
        });
        setStatusText(`已导入 ${parsed.length} 个自定义场景参数模板。`);
      } catch {
        setStatusText("场景参数模板导入失败，文件格式不正确。");
      }
    });

    event.target.value = "";
  }

  /**
   * 选择种族参数模板并立即应用。
   *
   * Args:
   *   profileId: 待选择的种族模板编号，空字符串表示恢复默认模板。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSelectRaceProfile(profileId: string): void {
    setSelectedRaceProfileId(profileId);

    if (profileId === "") {
      applyRaceTemplate(createDefaultConfig().races, "已载入空种族参数模板，恢复默认种族配置。");
      return;
    }

    const profile = customRaceProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    applyRaceTemplate(profile.races, `已载入种族参数模板：${profile.label}。`);
  }

  /**
   * 选择场景参数模板并立即应用。
   *
   * Args:
   *   profileId: 待选择的参数模板编号，空字符串表示恢复默认模板。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSelectConfigProfile(profileId: string): void {
    setSelectedConfigProfileId(profileId);

    if (profileId === "") {
      applyFullConfig(createDefaultConfig(), "已载入空场景参数模板，恢复默认参数配置。");
      return;
    }

    const profile = customConfigProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    const nextConfig = JSON.parse(JSON.stringify(profile.config)) as MatchConfig;
    applyFullConfig(nextConfig, `已载入场景参数模板：${profile.label}。`);
  }

  /**
   * 更新地图配置字段，并在尺寸变化时调整布子棋盘。
   *
   * Args:
   *   field: 待更新字段名。
   *   value: 字段新值。
   *
   * Returns:
   *   void: 无返回值。
   */
  function updateMapField<K extends keyof MatchConfig["map"]>(
    field: K,
    value: MatchConfig["map"][K],
  ): void {
    setConfig((previous) => {
      const nextMap = {
        ...previous.map,
        [field]: value,
      };

      if (field === "gridType") {
        nextMap.neighborhoodType = getDefaultNeighborhood(value as GridType);
      }

      if (
        field === "width" ||
        field === "height" ||
        (field === "gridType" && previous.map.gridType !== value)
      ) {
        const width = field === "width" ? Number(value) : nextMap.width;
        const height = field === "height" ? Number(value) : nextMap.height;
        setSetupBoard((current) => resizeBoard(current, width, height));

        if (previous.gameplay.keyPointPlacementMode === "manual") {
          const manualKeyPoints = previous.gameplay.manualKeyPoints.filter(
            (position) => position.x >= 0 && position.x < width && position.y >= 0 && position.y < height,
          );
          return {
            ...previous,
            map: nextMap,
            gameplay: {
              ...previous.gameplay,
              manualKeyPoints,
            },
          };
        }
      }

      return {
        ...previous,
        map: nextMap,
      };
    });
  }

  /**
   * 调整种族数量。
   *
   * Args:
   *   raceCount: 目标种族数量。
   *
   * Returns:
   *   void: 无返回值。
   */
  function updateRaceCount(raceCount: number): void {
    setConfig((previous) => ({
      ...previous,
      races: resizeRaces(previous.races, raceCount),
    }));
    setSelectedRaceId((previous) => Math.min(previous, raceCount));
  }

  /**
   * 更新指定种族字段。
   *
   * Args:
   *   raceId: 待更新种族编号。
   *   patch: 字段补丁。
   *
   * Returns:
   *   void: 无返回值。
   */
  function updateRace(raceId: number, patch: Partial<RaceConfig>): void {
    setConfig((previous) => ({
      ...previous,
      races: previous.races.map((race) =>
        race.id === raceId
          ? {
              ...race,
              ...patch,
            }
          : race,
      ),
    }));
  }

  /**
   * 开始一次图样放置预览。
   *
   * Returns:
   *   void: 无返回值。
   */
  function beginPatternPlacement(): void {
    if (!selectedPattern) {
      setStatusText("请先选择一个图样模板。");
      return;
    }

    setPatternInteractionMode("place");
    setPatternHoverAnchor(null);
    setSetupEditTarget("cells");
    setStatusText("图样放置模式已开启：移动鼠标预览位置，左键确认，右键取消。");
  }

  /**
   * 开始一次图样移动预览。
   *
   * Returns:
   *   void: 无返回值。
   */
  function beginPatternMove(): void {
    if (selectedPatternCells.length === 0) {
      setStatusText("请先在棋盘上选择一个图样。");
      return;
    }

    setPatternInteractionMode("move");
    setPatternHoverAnchor(null);
    setSetupEditTarget("pattern_select");
    setStatusText("图样移动模式已开启：移动鼠标预览位置，左键确认，右键取消。");
  }

  /**
   * 取消当前图样交互模式。
   *
   * Returns:
   *   void: 无返回值。
   */
  function cancelPatternInteraction(): void {
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setStatusText("已取消当前图样操作。");
  }

  /**
   * 在指定坐标确认放置当前图样。
   *
   * Args:
   *   x: 目标列坐标。
   *   y: 目标行坐标。
   *
   * Returns:
   *   boolean: true 表示放置成功，false 表示未放置。
   */
  function confirmPatternPlacement(x: number, y: number): boolean {
    const race = config.races.find((item) => item.id === selectedRaceId);
    if (!selectedPattern || !race) {
      return false;
    }

    const nextBoard = placePatternOnBoard(setupBoard, selectedPattern, { x, y }, race.id, race.hpMax);
    if (!nextBoard) {
      setStatusText("该位置无法放置图样，请避开已有细胞并保持图样完整落在棋盘内。");
      return false;
    }

    commitSetupBoard(nextBoard);
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setStatusText(`已在 (${x}, ${y}) 放置图样：${selectedPattern.label}。`);
    return true;
  }

  /**
   * 在普通细胞编辑模式下对单个格子执行一次连续绘制或擦除。
   *
   * Args:
   *   position: 当前经过的格子坐标。
   *   mode: add 表示绘制，remove 表示擦除。
   *
   * Returns:
   *   void: 无返回值。
   */
  function applyCellBrush(position: Position, mode: "add" | "remove"): void {
    const race = config.races.find((item) => item.id === selectedRaceId);
    if (!race) {
      return;
    }

    const key = toPositionKey(position);
    if (cellEditVisitedKeysRef.current.has(key)) {
      return;
    }

    cellEditVisitedKeysRef.current.add(key);
    const currentRaceCellCount =
      cellEditDragStateRef.current?.currentRaceCellCount ??
      countRaceCells(setupBoardRef.current, race.id);
    const result = applySingleCellEdit(
      setupBoardRef.current,
      position,
      race,
      mode,
      currentRaceCellCount,
    );
    if (result.board !== setupBoardRef.current) {
      setupBoardRef.current = result.board;
      setSetupBoard(result.board);
    }

    setCellEditDragState((previous) =>
      previous
        ? {
            ...previous,
            visitedPositions: [...previous.visitedPositions, position],
            changedCells: previous.changedCells + (result.changed ? 1 : 0),
            replacedCells: previous.replacedCells + (result.replaced ? 1 : 0),
            replacedKeys: result.replaced
              ? [...previous.replacedKeys, key]
              : previous.replacedKeys,
            skippedCells:
              previous.skippedCells +
              (result.changed ? 0 : 1),
            currentRaceCellCount: result.nextRaceCellCount,
          }
        : previous,
    );
  }

  /**
   * 处理棋盘单元格鼠标按下事件，用于图样框选。
   *
   * Args:
   *   x: 列坐标。
   *   y: 行坐标。
   *   button: 鼠标按键编号，0 表示左键，2 表示右键。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleBoardMouseDown(x: number, y: number, button: number): void {
    if (viewMode !== "setup") {
      return;
    }

    setHoveredBoardPosition({ x, y });

    if (setupEditTarget === "cells" && patternInteractionMode === "idle") {
      if (button !== 0 && button !== 2) {
        return;
      }

      suppressSetupBoardActionRef.current = true;
      cellEditOriginBoardRef.current = cloneBoard(setupBoardRef.current);
      cellEditVisitedKeysRef.current = new Set<string>();
      setCellEditDragState({
        mode: button === 0 ? "add" : "remove",
        visitedPositions: [],
        changedCells: 0,
        replacedCells: 0,
        replacedKeys: [],
        skippedCells: 0,
        currentRaceCellCount: countRaceCells(setupBoardRef.current, selectedRaceId),
      });
      applyCellBrush({ x, y }, button === 0 ? "add" : "remove");
      return;
    }

    if (setupEditTarget !== "pattern_select") {
      if (patternInteractionMode === "place" && button === 0) {
        suppressSetupBoardActionRef.current = true;
        setPatternHoverAnchor({ x, y });
        confirmPatternPlacement(x, y);
      }
      return;
    }

    if (patternInteractionMode !== "idle") {
      setPatternHoverAnchor({ x, y });
      return;
    }

    if (button !== 0 && button !== 2) {
      return;
    }

    setSelectionDragState({
      mode: button === 0 ? "add" : "remove",
      anchor: { x, y },
      current: { x, y },
      baseKeys: selectedPatternCells.map(toPositionKey),
    });
  }

  /**
   * 处理棋盘单元格鼠标滑过事件，用于图样预览与框选。
   *
   * Args:
   *   x: 列坐标。
   *   y: 行坐标。
   *   buttons: 当前鼠标按钮位掩码。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleBoardMouseEnter(x: number, y: number, buttons: number): void {
    setHoveredBoardPosition({ x, y });

    if (viewMode !== "setup") {
      return;
    }

    if (cellEditDragState) {
      const expectedButtons = cellEditDragState.mode === "add" ? 1 : 2;
      if ((buttons & expectedButtons) !== 0) {
        applyCellBrush({ x, y }, cellEditDragState.mode);
      }
      return;
    }

    if (patternInteractionMode !== "idle") {
      setPatternHoverAnchor({ x, y });
    }

    if (!selectionDragState) {
      return;
    }

    const expectedButtons = selectionDragState.mode === "add" ? 1 : 2;
    if ((buttons & expectedButtons) === 0) {
      return;
    }

    setSelectionDragState((previous) =>
      previous
        ? {
            ...previous,
            current: { x, y },
          }
        : previous,
    );
  }

  /**
   * 结束当前图样框选拖拽。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleBoardMouseUp(): void {
    if (!selectionDragState) {
      return;
    }

    const rectanglePositions = getRectanglePositions(
      selectionDragState.anchor,
      selectionDragState.current,
    ).filter((position) => {
      if (selectionDragState.mode === "remove") {
        return true;
      }

      const cell = getCell(setupBoard, position);
      return cell !== null && cell.raceId !== null && cell.hp > 0;
    });
    const nextKeys = new Set(selectionDragState.baseKeys);

    rectanglePositions.forEach((position) => {
      const key = toPositionKey(position);
      if (selectionDragState.mode === "add") {
        nextKeys.add(key);
      } else {
        nextKeys.delete(key);
      }
    });

    setSelectedPatternCells(Array.from(nextKeys).map(fromPositionKey));
    setSelectionDragState(null);
    setCellEditDragState(null);
  }

  /**
   * 处理棋盘左键点击。
   *
   * Args:
   *   x: 列坐标。
   *   y: 行坐标。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleBoardPrimaryAction(x: number, y: number): void {
    if (viewMode === "setup") {
      if (suppressSetupBoardActionRef.current) {
        suppressSetupBoardActionRef.current = false;
        return;
      }

      if (patternInteractionMode === "place") {
        confirmPatternPlacement(x, y);
        return;
      }

      if (patternInteractionMode === "move") {
        const snapshots = collectAliveCellSnapshots(setupBoard, selectedPatternCells);
        if (snapshots.length === 0) {
          setStatusText("当前没有可移动的图样选区。");
          setPatternInteractionMode("idle");
          setPatternHoverAnchor(null);
          return;
        }

        const nextBoard = moveSelectedCells(setupBoard, snapshots, { x, y });
        if (!nextBoard) {
          setStatusText("该位置无法移动图样，请避开已有细胞并保持整体不越界。");
          return;
        }

        const originX = Math.min(...snapshots.map((snapshot) => snapshot.position.x));
        const originY = Math.min(...snapshots.map((snapshot) => snapshot.position.y));
        const nextSelectedCells = snapshots.map((snapshot) => ({
          x: x + (snapshot.position.x - originX),
          y: y + (snapshot.position.y - originY),
        }));
        commitSetupBoard(nextBoard);
        setSelectedPatternCells(nextSelectedCells);
        setPatternInteractionMode("idle");
        setPatternHoverAnchor(null);
        setStatusText(`已将选中图样移动到 (${x}, ${y})。`);
        return;
      }

      if (setupEditTarget === "pattern_select") {
        const cell = getCell(setupBoard, { x, y });
        if (cell === null || cell.raceId === null || cell.hp <= 0) {
          return;
        }

        setSelectedPatternCells((previous) => {
          const nextKeys = new Set(previous.map(toPositionKey));
          nextKeys.add(`${x},${y}`);
          return Array.from(nextKeys).map(fromPositionKey);
        });
        return;
      }

      if (
        config.gameplay.victoryMode === "control" &&
        config.gameplay.keyPointPlacementMode === "manual" &&
        setupEditTarget === "keypoints"
      ) {
        const key = `${x},${y}`;
        if (config.gameplay.manualKeyPoints.some((position) => `${position.x},${position.y}` === key)) {
          return;
        }

        if (config.gameplay.manualKeyPoints.length >= config.gameplay.keyPointCount) {
          setStatusText(`手动关键点数量上限为 ${config.gameplay.keyPointCount}。`);
          return;
        }

        setConfig((previous) => ({
          ...previous,
          gameplay: {
            ...previous.gameplay,
            manualKeyPoints: [...previous.gameplay.manualKeyPoints, { x, y }],
          },
        }));
        setStatusText(`已添加关键点 (${x}, ${y})。`);
        return;
      }

      const race = config.races.find((item) => item.id === selectedRaceId);
      if (!race) {
        return;
      }

      if (countRaceCells(setupBoard, selectedRaceId) >= race.initialCells) {
        setStatusText(`${race.name} 的初始布子上限为 ${race.initialCells}。`);
        return;
      }

      const nextBoard = cloneBoard(setupBoard);
      setCell(nextBoard, { x, y }, race.id, race.hpMax);
      commitSetupBoard(nextBoard);
      return;
    }

    if (
      !matchState ||
      matchState.phase !== "reinforcement" ||
      playbackIndex !== matchState.replayFrames.length - 1
    ) {
      return;
    }

    const remaining = matchState.reinforcementRemaining[selectedRaceId] ?? 0;
    if (remaining <= 0 || !matchState.humanRaceIds.includes(selectedRaceId)) {
      return;
    }

    const nextState = submitReinforcementPlacement(
      matchState,
      config,
      selectedRaceId,
      { x, y },
    );
    if (nextState !== matchState) {
      setMatchState(nextState);
      setStatusText("已提交一个新增位置。");
    }
  }

  /**
   * 处理棋盘右键点击。
   *
   * Args:
   *   x: 列坐标。
   *   y: 行坐标。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleBoardSecondaryAction(x: number, y: number): void {
    if (viewMode === "setup") {
      if (suppressSetupBoardActionRef.current) {
        suppressSetupBoardActionRef.current = false;
        return;
      }

      if (patternInteractionMode === "place" || patternInteractionMode === "move") {
        cancelPatternInteraction();
        return;
      }

      if (setupEditTarget === "pattern_select") {
        setSelectedPatternCells((previous) =>
          previous.filter((position) => position.x !== x || position.y !== y),
        );
        return;
      }

      if (
        config.gameplay.victoryMode === "control" &&
        config.gameplay.keyPointPlacementMode === "manual" &&
        setupEditTarget === "keypoints"
      ) {
        const key = `${x},${y}`;
        setConfig((previous) => ({
          ...previous,
          gameplay: {
            ...previous.gameplay,
            manualKeyPoints: previous.gameplay.manualKeyPoints.filter(
              (position) => `${position.x},${position.y}` !== key,
            ),
          },
        }));
        setStatusText(`已删除关键点 (${x}, ${y})。`);
        return;
      }

      const nextBoard = cloneBoard(setupBoard);
      setCell(nextBoard, { x, y }, null, 0);
      commitSetupBoard(nextBoard);
      return;
    }

    if (
      !matchState ||
      matchState.phase !== "reinforcement" ||
      playbackIndex !== matchState.replayFrames.length - 1
    ) {
      return;
    }

    const nextState = removeHumanReinforcementPlacement(
      matchState,
      config,
      selectedRaceId,
      { x, y },
    );

    if (nextState !== matchState) {
      setMatchState(nextState);
      setStatusText("已删除该新增位置。");
    }
  }

  /**
   * 撤销上一步布子操作。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleUndo(): void {
    const lastBoard = setupHistory.at(-1);
    if (!lastBoard) {
      return;
    }

    setRedoHistory((previous) => [...previous, cloneBoard(setupBoard)]);
    setSetupHistory((previous) => previous.slice(0, -1));
    setSetupBoard(cloneBoard(lastBoard));
  }

  /**
   * 重做上一步撤销操作。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleRedo(): void {
    const nextBoard = redoHistory.at(-1);
    if (!nextBoard) {
      return;
    }

    setSetupHistory((previous) => pushBoardHistory(previous, setupBoard));
    setRedoHistory((previous) => previous.slice(0, -1));
    setSetupBoard(cloneBoard(nextBoard));
  }

  /**
   * 清空当前布子棋盘。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleClearBoard(): void {
    const dimensions = resolveBoardDimensions(config.map.width, config.map.height);
    commitSetupBoard(createBoardState(dimensions.width, dimensions.height));
    setSelectedPatternCells([]);
    setPatternInteractionMode("idle");
    setPatternHoverAnchor(null);
    setCellEditDragState(null);
    setSelectionDragState(null);
  }

  /**
   * 将当前布子提取为自定义图样。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleSaveCustomPattern(): void {
    const label = customPatternLabel.trim() || `自定义图样模板-${Date.now()}`;
    const pattern = createCustomPatternFromSelection(
      setupBoard,
      selectedPatternCells,
      `custom-pattern-${Date.now()}`,
      label,
      config.map.gridType,
    );

    if (!pattern) {
      setStatusText("当前没有选中可导出的图样细胞。");
      return;
    }

    exportJson(`${label}.json`, pattern);
    setCustomPatternLabel("");
    setStatusText(`已导出当前选区图样模板：${label}。`);
  }

  /**
   * 导入自定义图样 JSON 文件。
   *
   * Args:
   *   event: 文件选择事件。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleImportCustomPatterns(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file.text().then((text) => {
      try {
        const parsed = toImportArray(JSON.parse(text) as PatternTemplate | PatternTemplate[]);
        setCustomPatterns((previous) => {
          const { nextPatterns, nextSelectedId } = appendImportedPatterns(previous, parsed);
          setSelectedPatternId(nextSelectedId);
          return nextPatterns;
        });
        setStatusText(`已导入 ${parsed.length} 个自定义图样模板。`);
      } catch {
        setStatusText("图样模板导入失败，文件格式不正确。");
      }
    });

    event.target.value = "";
  }

  /**
   * 导入自定义场景 JSON 文件。
   *
   * Args:
   *   event: 文件选择事件。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleImportCustomScenes(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as CustomSceneRecord[];
        setCustomSceneRecords((previous) => dedupeCustomScenes([...previous, ...parsed]));
        setStatusText(`已导入 ${parsed.length} 个自定义场景，并自动合并重复项。`);
      } catch {
        setStatusText("场景导入失败，文件格式不正确。");
      }
    });

    event.target.value = "";
  }

  /**
   * 从当前布子状态创建新的对局状态。
   *
   * Returns:
   *   MatchState | null: 若配置合法则返回新对局状态，否则返回 null。
   */
  function createMatchFromSetup(): MatchState | null {
    const errors = validationIssues.filter((issue) => issue.level === "error");

    if (errors.length > 0) {
      setStatusText(`配置存在 ${errors.length} 处错误，无法开始。`);
      return null;
    }

    const nextMatchState = createMatchState(config, setupBoard);
    setMatchState(nextMatchState);
    setViewMode("match");
    setPlaybackIndex(nextMatchState.replayFrames.length - 1);
    return nextMatchState;
  }

  /**
   * 重新开始当前模式，清空地图并回到布子阶段。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleRestartGame(): void {
    setAutoRunning(false);
    setMatchState(null);
    setPlaybackIndex(0);
    const dimensions = resolveBoardDimensions(config.map.width, config.map.height);
    setSetupBoard(createBoardState(dimensions.width, dimensions.height));
    setSetupHistory([]);
    setRedoHistory([]);
    setViewMode("setup");
    setSetupEditTarget("cells");
    setSetupPhaseVersion((previous) => previous + 1);
    setStatusText("已重新开始。当前模式保持不变，地图已清空并回到第 0 世代布子阶段。");
  }

  /**
   * 推进一个世代。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleStep(): void {
    const workingState = matchState ?? createMatchFromSetup();
    if (!workingState) {
      return;
    }

    if (workingState.finished) {
      setStatusText("当前游戏已经结束，请重新开始。");
      return;
    }

    if (workingState.phase === "reinforcement" && hasPendingHumanReinforcement(workingState)) {
      setStatusText("当前仍在繁衍阶段，请先布置新增位置或手动结束繁衍阶段。");
      return;
    }

    const readyState =
      workingState.phase === "reinforcement"
        ? finishReinforcementPhase(workingState, config)
        : workingState;
    const nextState = stepMatch(readyState, config);
    setMatchState(nextState);
    setStatusText("已推进一世代。");
  }

  /**
   * 手动结束当前繁衍阶段。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleFinishReinforcement(): void {
    if (!matchState) {
      return;
    }

    const nextState = finishReinforcementPhase(matchState, config);
    setMatchState(nextState);
    setStatusText("已结束本轮繁衍阶段。");
  }

  /**
   * 撤销当前繁衍阶段最近一次人工新增位置。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleUndoReinforcementPlacement(): void {
    if (!matchState) {
      return;
    }

    const nextState = undoLastHumanReinforcementPlacement(matchState, config);
    if (nextState !== matchState) {
      setMatchState(nextState);
      setStatusText("已撤销最近一次新增位置。");
    }
  }

  /**
   * 返回布子阶段。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleBackToSetup(): void {
    setAutoRunning(false);
    setViewMode("setup");
    setMatchState(null);
    setSetupEditTarget("cells");
    setSetupPhaseVersion((previous) => previous + 1);
    setStatusText("已返回布子阶段。");
  }

  /**
   * 导出日志与回放。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleExportReplay(): void {
    if (!matchState) {
      return;
    }

    exportJson("life-competition-replay.json", {
      config,
      replayFrames: matchState.replayFrames,
      logs: matchState.logs,
      winnerRaceId: matchState.winnerRaceId,
    });
  }

  /**
   * 处理自动播放开关。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleToggleAutoRun(): void {
    const workingState = matchState ?? createMatchFromSetup();
    if (!workingState) {
      return;
    }

    if (workingState.finished) {
      setStatusText("当前游戏已经结束，请重新开始。");
      return;
    }

    if (workingState.phase === "reinforcement" && hasPendingHumanReinforcement(workingState)) {
      setStatusText("当前仍在繁衍阶段，请先完成新增布子。");
      return;
    }

    if (autoRunning) {
      setAutoRunning(false);
      setStatusText("已暂停自动播放。");
      return;
    }

    setAutoRunning(true);
    setStatusText("已开始自动播放。");
  }

  /**
   * 暂停当前游戏进度。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handlePauseGame(): void {
    if (!matchState) {
      setStatusText("当前还没有开始游戏。");
      return;
    }

    setAutoRunning(false);
    setStatusText("游戏已暂停。");
  }

  /**
   * 提前结束当前游戏。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleEndGame(): void {
    if (!matchState) {
      setStatusText("当前没有正在进行的游戏。");
      return;
    }

    const nextState = terminateMatch(matchState, config, "用户提前结束了当前游戏。");
    setAutoRunning(false);
    setMatchState(nextState);
    setStatusText("已提前结束当前游戏。");
  }

  const selectedPattern = patternLookup.get(selectedPatternId);
  const isInfiniteMap = config.map.width === 0 && config.map.height === 0;
  const neighborhoodSize = getNeighborhoodSize(
    config.map.gridType,
    config.map.neighborhoodType,
  );
  const selectedRace = raceLookup.get(selectedRaceId);
  const selectedPatternIsCustom = isCustomPattern(selectedPatternId, customPatterns);
  const hasConfigErrors = validationIssues.some((issue) => issue.level === "error");
  const hasPendingHumanReinforcementPhase =
    !!matchState &&
    matchState.phase === "reinforcement" &&
    hasPendingHumanReinforcement(matchState);
  const isMatchFinished = matchState?.finished ?? false;
  const canAutoRun = !hasConfigErrors && !isMatchFinished && !hasPendingHumanReinforcementPhase;
  const canStep = !hasConfigErrors && !isMatchFinished && !hasPendingHumanReinforcementPhase;
  const canPause = autoRunning;
  const canEndGame = matchState !== null && !isMatchFinished;
  const canFinishReinforcement = matchState?.phase === "reinforcement";
  const canUndoReinforcement =
    !!matchState &&
    matchState.phase === "reinforcement" &&
    matchState.reinforcementPlacementHistory.some(
      (item) => item.actor === "human" && matchState.humanRaceIds.includes(item.raceId),
    );
  const hasSelectedPattern = selectedPattern !== undefined;
  const currentDisplayedBoard = displayedBoard;
  const selectedPatternSnapshots = useMemo(
    () => collectAliveCellSnapshots(setupBoard, selectedPatternCells),
    [selectedPatternCells, setupBoard],
  );
  const cellDragPreview = useMemo(() => {
    if (!cellEditDragState || setupEditTarget !== "cells") {
      return null;
    }

    return {
      mode: cellEditDragState.mode,
      activeCount: cellEditDragState.changedCells,
      replaceCount: cellEditDragState.replacedCells,
      inactiveCount: cellEditDragState.skippedCells,
      markers: cellEditDragState.visitedPositions.map((position) => {
        const cell = getCell(setupBoard, position);
        const key = toPositionKey(position);
        return {
          position,
          conflict: cellEditDragState.mode === "add"
            ? !(cell && cell.raceId === selectedRaceId && cell.hp > 0)
            : !!(cell && cell.raceId !== null && cell.hp > 0),
          kind:
            cellEditDragState.mode === "add"
              ? cellEditDragState.replacedKeys.includes(key)
                ? ("cell_replace" as const)
                : ("cell_add" as const)
              : ("cell_remove" as const),
        };
      }),
    };
  }, [cellEditDragState, selectedRaceId, setupBoard, setupEditTarget]);
  const displayedSelectedPatternCells = useMemo(() => {
    if (!selectionDragState) {
      return selectedPatternCells;
    }

    const rectanglePositions = getRectanglePositions(
      selectionDragState.anchor,
      selectionDragState.current,
    ).filter((position) => {
      if (selectionDragState.mode === "remove") {
        return true;
      }

      const cell = getCell(setupBoard, position);
      return cell !== null && cell.raceId !== null && cell.hp > 0;
    });
    const nextKeys = new Set(selectionDragState.baseKeys);
    rectanglePositions.forEach((position) => {
      const key = toPositionKey(position);
      if (selectionDragState.mode === "add") {
        nextKeys.add(key);
      } else {
        nextKeys.delete(key);
      }
    });
    return Array.from(nextKeys).map(fromPositionKey);
  }, [selectionDragState, selectedPatternCells, setupBoard]);
  const patternPreviewMarkers = useMemo(() => {
    if (!patternHoverAnchor) {
      return [];
    }

    if (patternInteractionMode === "place" && selectedPattern) {
      const hasConflict = !canPlacePatternOnBoard(setupBoard, selectedPattern, patternHoverAnchor);
      return selectedPattern.cells
        .map((cell) => ({
          position: {
            x: patternHoverAnchor.x + cell.x,
            y: patternHoverAnchor.y + cell.y,
          },
          conflict: hasConflict,
          kind: "place" as const,
        }))
        .filter(
          (marker) =>
            marker.position.x >= 0 &&
            marker.position.x < setupBoard.width &&
            marker.position.y >= 0 &&
            marker.position.y < setupBoard.height,
        );
    }

    if (patternInteractionMode === "move" && selectedPatternSnapshots.length > 0) {
      const originX = Math.min(...selectedPatternSnapshots.map((snapshot) => snapshot.position.x));
      const originY = Math.min(...selectedPatternSnapshots.map((snapshot) => snapshot.position.y));
      const movable = selectedPatternSnapshots.length > 0
        ? moveSelectedCells(setupBoard, selectedPatternSnapshots, patternHoverAnchor) !== null
        : false;

      return selectedPatternSnapshots
        .map((snapshot) => ({
          position: {
            x: patternHoverAnchor.x + (snapshot.position.x - originX),
            y: patternHoverAnchor.y + (snapshot.position.y - originY),
          },
          conflict: !movable,
          kind: "move" as const,
        }))
        .filter(
          (marker) =>
            marker.position.x >= 0 &&
            marker.position.x < setupBoard.width &&
            marker.position.y >= 0 &&
            marker.position.y < setupBoard.height,
        );
    }

    return [];
  }, [patternHoverAnchor, patternInteractionMode, selectedPattern, selectedPatternSnapshots, setupBoard]);
  const hoverVisualizationMarkers = useMemo(() => {
    if (!hoveredBoardPosition) {
      return [];
    }

    const markers: OverlayMarker[] = [];
    const boardForGuide = viewMode === "setup" ? setupBoard : currentDisplayedBoard;
    const effectiveDisasterDistance = getEffectiveDisasterDistance(config);
    const shouldPreviewDisaster =
      viewMode === "setup" && showDisasterOverlay && config.rules.disaster.enabled;

    if (showNeighborhoodGuide) {
      markers.push(
        ...createPositionMarkers(
          getNeighborPositions(boardForGuide, config.map, hoveredBoardPosition),
          "neighbor",
        ),
      );
    }

    if (shouldPreviewDisaster) {
      const projectedDistances = buildProjectedDistanceMap(
        boardForGuide,
        config.map,
        hoveredBoardPosition,
        effectiveDisasterDistance,
      );
      markers.push(
        ...createDistanceMarkers(projectedDistances, "disaster", (_position, distance) => {
          const damage = !config.rules.disaster.decay
            ? config.rules.disaster.damage
            : Math.max(
                config.rules.disaster.damage - distance * config.rules.disaster.decayFactor,
                0,
              );
          return damage >= config.rules.disaster.damage;
        }),
      );
    }

    if (showArcherRangePreview) {
      markers.push(
        ...createPositionMarkers(
          getArcherAttackPositions(boardForGuide, config, hoveredBoardPosition),
          "archer",
        ),
      );
    }

    return markers;
  }, [
    config,
    currentDisplayedBoard,
    hoveredBoardPosition,
    setupBoard,
    showArcherRangePreview,
    showDisasterOverlay,
    showNeighborhoodGuide,
    viewMode,
  ]);
  const replayDisasterMarkers = useMemo(() => {
    if (
      viewMode !== "match" ||
      !matchState ||
      !showDisasterOverlay ||
      !config.rules.disaster.enabled
    ) {
      return [];
    }

    const disasterCenters =
      matchState.replayFrames[playbackIndex]?.disasterCenters ?? [];
    if (disasterCenters.length === 0) {
      return [];
    }
    const effectiveDisasterDistance = getEffectiveDisasterDistance(config);

    const distanceMaps = disasterCenters.map((center) =>
      buildProjectedDistanceMap(
        currentDisplayedBoard,
        config.map,
        center,
        effectiveDisasterDistance,
      ),
    );
    const mergedDistanceMap = new Map<string, number>();

    distanceMaps.forEach((distanceMap) => {
      distanceMap.forEach((distance, key) => {
        const previousDistance = mergedDistanceMap.get(key);
        if (previousDistance === undefined || distance < previousDistance) {
          mergedDistanceMap.set(key, distance);
        }
      });
    });

    return createDistanceMarkers(mergedDistanceMap, "disaster", (position) => {
      const damage = calculateDisasterDamageFromMaps(position, distanceMaps, config);
      return damage >= config.rules.disaster.damage;
    });
  }, [
    config,
    currentDisplayedBoard,
    matchState,
    playbackIndex,
    showDisasterOverlay,
    viewMode,
  ]);
  const boardPreviewMarkers = useMemo(() => {
    if (cellDragPreview) {
      return cellDragPreview.markers;
    }

    if (patternPreviewMarkers.length > 0) {
      return patternPreviewMarkers;
    }

    if (viewMode === "setup") {
      return hoverVisualizationMarkers;
    }

    return replayDisasterMarkers;
  }, [
    cellDragPreview,
    hoverVisualizationMarkers,
    patternPreviewMarkers,
    replayDisasterMarkers,
    viewMode,
  ]);
  const reinforcementConflictCount = reinforcementCandidateMarkers.filter(
    (marker) => marker.conflict,
  ).length;
  const infiniteMapExpanded =
    isInfiniteMap &&
    (currentDisplayedBoard.width > DEFAULT_INFINITE_BOARD_WIDTH ||
      currentDisplayedBoard.height > DEFAULT_INFINITE_BOARD_HEIGHT);
  const isBoardInteractive =
    viewMode === "setup" ||
    (matchState?.phase === "reinforcement" &&
      playbackIndex === (matchState.replayFrames.length - 1) &&
      matchState.humanRaceIds.includes(selectedRaceId) &&
      (matchState.reinforcementRemaining[selectedRaceId] ?? 0) > 0);

  return (
    <div className="app-shell compact-layout">
      <header className="panel topbar">
        <div className="title-block">
          <p className="eyebrow">生命竞争游戏</p>
          <h1>单机演化与对抗面板</h1>
          <p className="panel-text status-inline">{statusText}</p>
        </div>
        <div className="topbar-actions">
          <div className="mode-choice-block">
            <div className="mode-choice-label">
              {renderFieldLabel("对局模式", "matchMode")}
            </div>
            <OptionButtonRow
              value={config.gameplay.mode}
              options={modeOptions}
              onChange={(value) => {
                if (value === "human_vs_ai") {
                  applyPreset("human_duel");
                  return;
                }

                if (value === "ai_vs_ai") {
                  applyPreset("ai_duel");
                  return;
                }

                applyPreset("demo");
              }}
            />
          </div>
          <div className="primary-actions">
            <button
              type="button"
              className={viewMode === "setup" ? "control-button active" : "control-button"}
              onClick={handleRestartGame}
            >
              重新开始
            </button>
            <button
              type="button"
              className={autoRunning ? "control-button active" : "control-button"}
              onClick={handleToggleAutoRun}
              disabled={!canAutoRun}
            >
              自动播放
            </button>
            <button
              type="button"
              className="control-button"
              onClick={handleStep}
              disabled={!canStep}
            >
              单步推进
            </button>
            <button
              type="button"
              className={canPause ? "control-button active" : "control-button"}
              onClick={handlePauseGame}
              disabled={!canPause}
            >
              暂停游戏
            </button>
            <button
              type="button"
              className={isMatchFinished ? "control-button active" : "control-button"}
              onClick={handleEndGame}
              disabled={!canEndGame}
            >
              结束游戏
            </button>
            {matchState?.phase === "reinforcement" ? (
              <button
                type="button"
                className="control-button active"
                onClick={handleUndoReinforcementPlacement}
                disabled={!canUndoReinforcement}
              >
                撤销新增
              </button>
            ) : null}
            {matchState?.phase === "reinforcement" ? (
              <button
                type="button"
                className="control-button active"
                onClick={handleFinishReinforcement}
                disabled={!canFinishReinforcement}
              >
                结束繁衍阶段
              </button>
            ) : null}
            <button type="button" className="control-button" onClick={handleBackToSetup}>
              回到布子
            </button>
            <button
              type="button"
              className="control-button"
              onClick={handleExportReplay}
              disabled={matchState === null}
            >
              导出回放
            </button>
          </div>
        </div>
      </header>

      <div className="workspace-grid">
        <main className="main-stage">
          <section className="panel board-panel prominent">
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  {viewMode === "setup" ? "布子阶段" : "对局阶段"}
                </p>
                <h2>
                  {viewMode === "setup"
                    ? "开局地图"
                    : `世代 ${matchState?.replayFrames[playbackIndex]?.generation ?? 0}`}
                </h2>
              </div>
              <div className="board-toolbar">
                <div className="toolbar-cluster">
                  <span className="toolbar-cluster-title">显示控制</span>
                  <label>
                    {renderFieldLabel("单元尺寸", "cellSize")}
                    <input
                      type="range"
                      min={18}
                      max={44}
                      value={cellSize}
                      onChange={(event) => setCellSize(Number(event.target.value))}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showHpText}
                      onChange={(event) => setShowHpText(event.target.checked)}
                    />
                    {renderFieldLabel("显示 HP", "showHp")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showGridLines}
                      onChange={(event) => setShowGridLines(event.target.checked)}
                    />
                    {renderFieldLabel("显示网格", "showGrid")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showNeighborhoodGuide}
                      onChange={(event) => setShowNeighborhoodGuide(event.target.checked)}
                    />
                    {renderFieldLabel("邻域参考", "showNeighborhoodGuide")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showDisasterOverlay}
                      onChange={(event) => setShowDisasterOverlay(event.target.checked)}
                    />
                    {renderFieldLabel("天灾区域", "showDisasterOverlay")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showArcherRangePreview}
                      onChange={(event) => setShowArcherRangePreview(event.target.checked)}
                    />
                    {renderFieldLabel("射手范围", "showArcherRangePreview")}
                  </label>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() => setBoardCenterToken((previous) => previous + 1)}
                  >
                    居中视图
                  </button>
                </div>
                <div className="toolbar-cluster">
                  <span className="toolbar-cluster-title">推进设置</span>
                  <label>
                    {renderFieldLabel("推演间隔", "autoSpeed")}
                    <input
                      type="range"
                      min={80}
                      max={800}
                      step={20}
                      value={speedMs}
                      onChange={(event) => setSpeedMs(Number(event.target.value))}
                    />
                  </label>
                </div>
                {viewMode === "setup" ? (
                  <div className="toolbar-cluster">
                    <span className="toolbar-cluster-title">布子编辑</span>
                    <button
                      type="button"
                      className={
                        setupEditTarget === "cells" ? "control-button active" : "control-button"
                      }
                      onClick={() => setSetupEditTarget("cells")}
                    >
                      编辑细胞
                    </button>
                    {config.gameplay.victoryMode === "control" &&
                    config.gameplay.keyPointPlacementMode === "manual" ? (
                      <button
                        type="button"
                        className={
                          setupEditTarget === "keypoints"
                            ? "control-button active"
                            : "control-button"
                        }
                        onClick={() => setSetupEditTarget("keypoints")}
                      >
                        编辑关键点
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={
                        setupEditTarget === "pattern_select"
                          ? "control-button active"
                          : "control-button"
                      }
                      onClick={() => {
                        setSetupEditTarget("pattern_select");
                        setPatternInteractionMode("idle");
                        setPatternHoverAnchor(null);
                      }}
                    >
                      选择图样
                    </button>
                    <button
                      type="button"
                      className={
                        patternInteractionMode === "place"
                          ? "control-button active"
                          : "control-button"
                      }
                      onClick={beginPatternPlacement}
                      disabled={!hasSelectedPattern}
                    >
                      放置图样
                    </button>
                    <button
                      type="button"
                      className={
                        patternInteractionMode === "move"
                          ? "control-button active"
                          : "control-button"
                      }
                      onClick={beginPatternMove}
                      disabled={selectedPatternCells.length === 0}
                    >
                      移动选中图样
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      onClick={() => setSelectedPatternCells([])}
                      disabled={selectedPatternCells.length === 0}
                    >
                      清空选区
                    </button>
                    {config.gameplay.victoryMode === "control" &&
                    config.gameplay.keyPointPlacementMode === "manual" ? (
                      <button
                        type="button"
                        className="control-button"
                        onClick={() =>
                          setConfig((previous) => ({
                            ...previous,
                            gameplay: {
                              ...previous.gameplay,
                              manualKeyPoints: [],
                            },
                          }))
                        }
                      >
                        清空关键点
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="control-button"
                      onClick={cancelPatternInteraction}
                      disabled={patternInteractionMode === "idle"}
                    >
                      取消图样操作
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {viewMode === "match" && matchState ? (
              <div className="match-banner">
                <span>当前阶段：{matchState.phase === "reinforcement" ? "繁衍布子" : "自动演化"}</span>
                <span>人类剩余新增名额：{currentHumanReinforcementRemaining}</span>
                <span>当前选中种族：{selectedRace?.name ?? "-"}</span>
                {isInfiniteMap ? (
                  <span className="hint-chip">
                    无限地图第一版：当前视窗 {currentDisplayedBoard.width} x {currentDisplayedBoard.height}
                    {infiniteMapExpanded ? "，已自动扩盘" : "，边缘演化时会自动扩盘"}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="match-banner">
                <span>当前模式：布子准备</span>
                <span>
                  {patternInteractionMode === "place"
                    ? "左键确认图样放置，右键取消放置"
                    : patternInteractionMode === "move"
                      ? "左键确认图样移动，右键取消移动"
                      : setupEditTarget === "keypoints"
                        ? "左键添加关键点，右键删除关键点"
                        : setupEditTarget === "pattern_select"
                          ? "左键选择、右键取消，按住拖拽可框选/框取消"
                          : "左键放置、右键删除，按住拖拽可连续布子/擦除"}
                </span>
                <span>
                  {selectedPatternCells.length > 0
                    ? `当前已选中 ${selectedPatternCells.length} 个图样单元格`
                    : "使用中键拖拽画布，自动播放或单步推进可从当前布子开始游戏"}
                </span>
                {showNeighborhoodGuide ? (
                  <span className="hint-chip">邻域参考已开启，悬停棋盘可查看当前格子的邻居范围。</span>
                ) : null}
                {showDisasterOverlay ? (
                  <span className="hint-chip">
                    {viewMode === "setup"
                      ? "天灾区域预览已开启，悬停棋盘可查看当前落点的影响范围。"
                      : "天灾区域显示已开启，回放时会高亮当前世代的实际影响范围。"}
                  </span>
                ) : null}
                {showArcherRangePreview ? (
                  <span className="hint-chip">
                    射手范围预览已开启，悬停任意格子都会以该位置为中心显示射手攻击范围，邻域不计入射手攻击范围。
                  </span>
                ) : null}
                {placementSecondsLeft !== null ? (
                  <span className="hint-chip">
                    当前阶段剩余限时 {placementSecondsLeft} 秒，超时将按最后一刻状态自动确认。
                  </span>
                ) : null}
                {!revealAllPlacementsToViewer ? (
                  <span className="hint-chip">
                    当前未公开布子位置：你只能看到本方在布子阶段与繁衍阶段提交的位置。
                  </span>
                ) : null}
                {isInfiniteMap ? (
                  <span className="hint-chip">
                    无限地图第一版：当前操作视窗 {currentDisplayedBoard.width} x {currentDisplayedBoard.height}
                    ，左/右键布子仍只作用于当前可见棋盘。
                  </span>
                ) : null}
              </div>
            )}

            <div className="board-stage">
              <BoardView
                board={displayedBoard}
                config={config}
                races={config.races}
                selectedRaceId={selectedRaceId}
                keyPoints={viewMode === "setup" ? setupKeyPoints : (matchState?.keyPoints ?? [])}
                candidateMarkers={
                  viewMode === "match" && matchState?.phase === "reinforcement"
                    ? reinforcementCandidateMarkers
                    : []
                }
                cellSize={cellSize}
                showHpText={showHpText}
                showGridLines={showGridLines}
                centerToken={boardCenterToken}
                interactive={isBoardInteractive}
                selectedMarkers={
                  viewMode === "setup"
                    ? cellEditDragState && setupEditTarget === "cells"
                      ? cellEditDragState.visitedPositions
                      : (setupEditTarget === "pattern_select" || patternInteractionMode === "move")
                        ? displayedSelectedPatternCells
                        : []
                    : []
                }
                previewMarkers={boardPreviewMarkers}
                onCellClick={handleBoardPrimaryAction}
                onCellRightClick={handleBoardSecondaryAction}
                onCellMouseDown={handleBoardMouseDown}
                onCellMouseEnter={handleBoardMouseEnter}
                onBoardMouseUp={handleBoardMouseUp}
                onBoardMouseLeave={() => {
                  setHoveredBoardPosition(null);
                  if (patternInteractionMode === "place" || patternInteractionMode === "move") {
                    setPatternHoverAnchor(null);
                  }
                }}
              />
              {cellDragPreview ? (
                <div className="board-drag-overlay">
                  <strong>
                    {cellDragPreview.mode === "add" ? "连续布子" : "连续擦除"}
                  </strong>
                  <span>
                    已经过 {cellEditDragState?.visitedPositions.length ?? 0} 格，实际生效 {cellDragPreview.activeCount} 格
                  </span>
                  <span>
                    {cellDragPreview.mode === "add"
                      ? `覆盖他族 ${cellDragPreview.replaceCount} 格，因上限或重复经过未生效 ${cellDragPreview.inactiveCount} 格`
                      : `空白或重复经过未生效 ${cellDragPreview.inactiveCount} 格`}
                  </span>
                </div>
              ) : null}
            </div>

            {viewMode === "match" && matchState?.phase === "reinforcement" ? (
              <div className="match-banner candidate-legend">
                <span>候选标记：虚线圆环表示待生效新增位置</span>
                {revealAllPlacementsToViewer ? (
                  <>
                    <span>红色虚线表示繁衍冲突</span>
                    <span>当前冲突位置数：{reinforcementConflictCount}</span>
                  </>
                ) : (
                  <span>当前未公开其它种族候选位置，仅显示你当前可见的新增位置。</span>
                )}
              </div>
            ) : null}

            {viewMode === "match" && matchState ? (
              <div className="playback-strip">
                <label>
                  {renderFieldLabel("回放浏览", "playback")}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, matchState.replayFrames.length - 1)}
                    value={playbackIndex}
                    onChange={(event) => setPlaybackIndex(Number(event.target.value))}
                  />
                </label>
              </div>
            ) : null}
          </section>

          <section className="dashboard-grid">
            <StatsPanel
              displayedStats={displayedStats}
              finished={Boolean(matchState?.finished)}
              rankingEntries={rankingEntries}
              campRankingEntries={campRankingEntries}
              getRaceName={(raceId) =>
                raceLookup.get(raceId)?.name ?? `种族 ${raceId}`
              }
              getRaceColor={(raceId) =>
                raceLookup.get(raceId)?.color
              }
            />

            <article className="panel">
              <h2>图样预设与模板</h2>
              <PatternPresetSection
                patternLabel={renderFieldLabel("图样预设", "pattern")}
                raceLabel={renderFieldLabel("当前种族", "currentRace")}
                selectedPatternId={selectedPatternId}
                patterns={availablePatterns}
                onSelectPattern={setSelectedPatternId}
                selectedRaceId={selectedRaceId}
                races={raceSelectOptions}
                onSelectRace={setSelectedRaceId}
                hasSelectedPattern={hasSelectedPattern}
                hasSelectedPatternCells={selectedPatternCells.length > 0}
                canUndo={setupHistory.length > 0}
                canRedo={redoHistory.length > 0}
                onBeginPlacement={beginPatternPlacement}
                onBeginMove={beginPatternMove}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onClearBoard={handleClearBoard}
                selectedPattern={selectedPattern ?? null}
                selectedRaceName={selectedRace?.name ?? "-"}
                selectedPatternIsCustom={selectedPatternIsCustom}
              />
              <PatternTemplateFileSection
                nameLabel={renderFieldLabel("保存图样名称", "savePatternName")}
                value={customPatternLabel}
                onValueChange={setCustomPatternLabel}
                canSave={canSaveCustomPattern}
                onSave={handleSaveCustomPattern}
                onImportClick={() => patternImportRef.current?.click()}
                importRef={patternImportRef}
                onImportChange={handleImportCustomPatterns}
              />
            </article>

            <LogsPanel logs={displayedLogs} />
          </section>
        </main>

        <aside className="config-column">
          <section className="panel">
            <div className="tab-row">
              <button
                type="button"
                className={configTab === "general" ? "tab-button active" : "tab-button"}
                onClick={() => setConfigTab("general")}
              >
                通用
              </button>
              <button
                type="button"
                className={configTab === "rules" ? "tab-button active" : "tab-button"}
                onClick={() => setConfigTab("rules")}
              >
                规则
              </button>
              <button
                type="button"
                className={configTab === "races" ? "tab-button active" : "tab-button"}
                onClick={() => setConfigTab("races")}
              >
                种族
              </button>
            </div>

            {configTab === "general" ? (
              <div className="tab-content">
                <div className="config-section-header">
                  <h3>基础参数</h3>
                  <button
                    type="button"
                    className={generalAdvancedOpen ? "control-button active" : "control-button"}
                    onClick={() => setGeneralAdvancedOpen((previous) => !previous)}
                  >
                    {generalAdvancedOpen ? "收起高级" : "展开高级"}
                  </button>
                </div>
                <div className="field-grid">
                  <label>
                    {renderFieldLabel(
                      "地图类型",
                      "mapType",
                      config.map.gridType,
                      gridTypeOptions as HelpOption<string>[],
                    )}
                    <OptionSelect
                      value={config.map.gridType}
                      options={gridTypeOptions}
                      ariaLabel="地图类型"
                      onChange={(value) => updateMapField("gridType", value)}
                    />
                  </label>
                  <label>
                    {renderFieldLabel(
                      "邻域类型",
                      "neighborhoodType",
                      config.map.neighborhoodType,
                      neighborhoodChoiceOptions as HelpOption<string>[],
                    )}
                    <OptionSelect
                      value={config.map.neighborhoodType}
                      options={neighborhoodChoiceOptions}
                      ariaLabel="邻域类型"
                      onChange={(value) => updateMapField("neighborhoodType", value)}
                    />
                  </label>
                  <label>
                    {renderFieldLabel("宽度", "mapWidth")}
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={config.map.width}
                      onChange={(event) => updateMapField("width", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    {renderFieldLabel("高度", "mapHeight")}
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={config.map.height}
                      onChange={(event) => updateMapField("height", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    {renderFieldLabel(
                      "边界",
                      "topology",
                      config.map.topology,
                      topologyOptions as HelpOption<string>[],
                    )}
                    <OptionSelect
                      value={config.map.topology}
                      options={topologyOptions}
                      ariaLabel="边界"
                      onChange={(value) => updateMapField("topology", value)}
                    />
                  </label>
                  <label>
                    {renderFieldLabel("随机种子", "seed")}
                    <input
                      type="number"
                      value={config.rules.seed}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            seed: Number(event.target.value) || 1,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {renderFieldLabel("布子限时", "placementTimeLimitSeconds")}
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={config.gameplay.placementTimeLimitSeconds}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          gameplay: {
                            ...previous.gameplay,
                            placementTimeLimitSeconds: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.rules.logEnabled}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            logEnabled: event.target.checked,
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("记录日志", "logEnabled")}
                  </label>
                  <label>
                    {renderFieldLabel(
                      "胜利模式",
                      "victoryMode",
                      config.gameplay.victoryMode,
                      victoryModeOptions as HelpOption<string>[],
                    )}
                    <OptionSelect
                      value={config.gameplay.victoryMode}
                      options={victoryModeOptions}
                      ariaLabel="胜利模式"
                      onChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          gameplay: {
                            ...previous.gameplay,
                            victoryMode: value,
                          },
                        }))
                      }
                    />
                  </label>
                  {generalAdvancedOpen ? (
                    <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.rules.disaster.enabled}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              enabled: event.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("启用天灾", "disasterEnabled")}
                  </label>
                  <label>
                    {renderFieldLabel("天灾概率", "disasterChance")}
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={config.rules.disaster.chance}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              chance: Number(event.target.value) || 0,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {renderFieldLabel("天灾伤害", "disasterDamage")}
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={config.rules.disaster.damage}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              damage: Number(event.target.value) || 0,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {renderFieldLabel("天灾最少落点", "disasterMinStrikes")}
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={config.rules.disaster.minStrikes}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              minStrikes: Number(event.target.value) || 1,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {renderFieldLabel("天灾最多落点", "disasterMaxStrikes")}
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={config.rules.disaster.maxStrikes}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              maxStrikes: Number(event.target.value) || 1,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {renderFieldLabel("天灾范围", "disasterRadius")}
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={config.rules.disaster.radius}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              radius: Number(event.target.value) || 0,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.rules.disaster.decay}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              decay: event.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("使用衰减天灾", "disasterDecay")}
                  </label>
                  <label>
                    {renderFieldLabel("天灾衰减系数", "disasterDecayFactor")}
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={config.rules.disaster.decayFactor}
                      disabled={!config.rules.disaster.decay}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            disaster: {
                              ...previous.rules.disaster,
                              decayFactor: Number(event.target.value) || 0,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                    </>
                  ) : null}
                </div>
                <ScenePresetSection
                  sceneLabel={renderFieldLabel("场景预设", "sceneDesign")}
                  selectedSceneId={selectedSceneId}
                  scenes={sceneSelectOptions}
                  onSelectScene={handleSelectScene}
                  sceneCount={availableScenes.length}
                />
                {generalAdvancedOpen ? (
                  <ConfigProfileSection
                    nameLabel={renderFieldLabel("场景参数模板名称", "configProfileName")}
                    currentLabel={<span>当前场景参数模板</span>}
                    value={customConfigProfileLabel}
                    onValueChange={setCustomConfigProfileLabel}
                    selectedId={selectedConfigProfileId}
                    profiles={customConfigProfiles}
                    onSelect={handleSelectConfigProfile}
                    onSave={handleSaveCustomConfigProfile}
                    onImportClick={() => configProfileImportRef.current?.click()}
                    importRef={configProfileImportRef}
                    onImportChange={handleImportCustomConfigProfiles}
                  />
                ) : null}
                <p className="hint">
                  当前邻域大小为 {neighborhoodSize}。通用分页只放地图、模式、天灾与场景等模式无关项。
                </p>
                <ul className="issue-list">
                  {validationIssues.length === 0 ? (
                    <li className="issue ok">未发现配置问题。</li>
                  ) : (
                    validationIssues.map((issue) => (
                      <li
                        key={`${issue.field}-${issue.message}`}
                        className={issue.level === "error" ? "issue error" : "issue warning"}
                      >
                        [{issue.level}] {issue.message}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}

            {configTab === "rules" ? (
              <div className="tab-content">
                <div className="config-section-header">
                  <h3>基础参数</h3>
                  <button
                    type="button"
                    className={rulesAdvancedOpen ? "control-button active" : "control-button"}
                    onClick={() => setRulesAdvancedOpen((previous) => !previous)}
                  >
                    {rulesAdvancedOpen ? "收起高级" : "展开高级"}
                  </button>
                </div>
                <div className="field-grid">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.rules.enemyDamageEnabled}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            enemyDamageEnabled: event.target.checked,
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("启用敌对伤害", "enemyDamageEnabled")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.rules.useNetBirth}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            useNetBirth: event.target.checked,
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("启用净优势出生", "useNetBirth")}
                  </label>
                  {rulesAdvancedOpen ? (
                    <>
                  <label>
                    {renderFieldLabel(
                      "出生冲突策略",
                      "birthConflictStrategy",
                      config.rules.birthConflictStrategy,
                      birthConflictOptions as HelpOption<string>[],
                    )}
                    <OptionSelect
                      value={config.rules.birthConflictStrategy}
                      options={birthConflictOptions}
                      ariaLabel="出生冲突策略"
                      onChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            birthConflictStrategy: value,
                          },
                        }))
                      }
                    />
                  </label>
                    </>
                  ) : null}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.rules.reinforcement.enabled}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            reinforcement: {
                              ...previous.rules.reinforcement,
                              enabled: event.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("启用额外繁衍", "reinforcementEnabled")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={config.gameplay.revealPlacements}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          gameplay: {
                            ...previous.gameplay,
                            revealPlacements: event.target.checked,
                          },
                        }))
                      }
                    />
                    {renderFieldLabel("允许公开布子位置", "revealPlacements")}
                  </label>
                  {rulesAdvancedOpen ? (
                    <>
                  <label>
                    {renderFieldLabel("繁衍周期", "reinforcementPeriod")}
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={config.rules.reinforcement.period}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            reinforcement: {
                              ...previous.rules.reinforcement,
                              period: Number(event.target.value) || 1,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {renderFieldLabel("繁衍数量", "reinforcementAmount")}
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={0.1}
                      value={config.rules.reinforcement.amount}
                      onChange={(event) =>
                        setConfig((previous) => ({
                          ...previous,
                          rules: {
                            ...previous.rules,
                            reinforcement: {
                              ...previous.rules.reinforcement,
                              amount: Number(event.target.value) || 0,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                    </>
                  ) : null}
                  {config.gameplay.victoryMode === "survival" ? (
                    <label>
                      {renderFieldLabel("生存最大回合", "survivalMaxGenerations")}
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={config.gameplay.maxGenerations}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            gameplay: {
                              ...previous.gameplay,
                              maxGenerations: Number(event.target.value) || 1,
                            },
                          }))
                        }
                      />
                    </label>
                  ) : null}
                  {rulesAdvancedOpen &&
                  (config.gameplay.victoryMode === "annihilation" ||
                  config.gameplay.victoryMode === "control") ? (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={config.gameplay.allowEarlyEnd}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            gameplay: {
                              ...previous.gameplay,
                              allowEarlyEnd: event.target.checked,
                            },
                          }))
                        }
                      />
                      {renderFieldLabel("允许最大回合提前结束", "allowEarlyEnd")}
                    </label>
                  ) : null}
                  {rulesAdvancedOpen &&
                  (config.gameplay.victoryMode === "annihilation" ||
                  config.gameplay.victoryMode === "control") ? (
                    <label>
                      {renderFieldLabel("提前结束回合", "earlyEndGenerations")}
                      <input
                        type="number"
                        min={1}
                        max={500}
                        disabled={!config.gameplay.allowEarlyEnd}
                        value={config.gameplay.maxGenerations}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            gameplay: {
                              ...previous.gameplay,
                              maxGenerations: Number(event.target.value) || 1,
                            },
                          }))
                        }
                      />
                    </label>
                  ) : null}
                  {config.gameplay.victoryMode === "control" ? (
                    <>
                      <label>
                        {renderFieldLabel("关键点数量", "keyPointCount")}
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={config.gameplay.keyPointCount}
                          onChange={(event) =>
                            setConfig((previous) => ({
                              ...previous,
                              gameplay: {
                                ...previous.gameplay,
                                keyPointCount: Number(event.target.value) || 1,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        {renderFieldLabel("占点目标数", "requiredControlPoints")}
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={config.gameplay.requiredControlPoints}
                          onChange={(event) =>
                            setConfig((previous) => ({
                              ...previous,
                              gameplay: {
                                ...previous.gameplay,
                                requiredControlPoints: Number(event.target.value) || 1,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        {renderFieldLabel("占点维持回合", "requiredControlTurns")}
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={config.gameplay.requiredControlTurns}
                          onChange={(event) =>
                            setConfig((previous) => ({
                              ...previous,
                              gameplay: {
                                ...previous.gameplay,
                                requiredControlTurns: Number(event.target.value) || 1,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        {renderFieldLabel(
                          "关键点生成方式",
                          "keyPointPlacementMode",
                          config.gameplay.keyPointPlacementMode,
                          keyPointPlacementOptions as HelpOption<string>[],
                        )}
                        <OptionSelect
                          value={config.gameplay.keyPointPlacementMode}
                          options={keyPointPlacementOptions}
                          ariaLabel="关键点生成方式"
                          onChange={(value) =>
                            setConfig((previous) => ({
                              ...previous,
                              gameplay: {
                                ...previous.gameplay,
                                keyPointPlacementMode: value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={config.gameplay.allowRevive}
                          onChange={(event) =>
                            setConfig((previous) => ({
                              ...previous,
                              gameplay: {
                                ...previous.gameplay,
                                allowRevive: event.target.checked,
                              },
                            }))
                          }
                        />
                        {renderFieldLabel("占点模式允许复活", "allowRevive")}
                      </label>
                      {config.gameplay.keyPointPlacementMode === "manual" ? (
                        <div className="scene-box">
                          <p className="hint">
                            当前已手动设置 {config.gameplay.manualKeyPoints.length} / {config.gameplay.keyPointCount} 个关键点。
                            布子阶段切换到“编辑关键点”后，可在棋盘上左键添加、右键删除关键点。
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <p className="hint">
                  规则分页只展示演化规则和当前胜利模式相关参数。额外繁衍按各自种族最近一次初始布置的世代单独计时。
                </p>
              </div>
            ) : null}

            {configTab === "races" ? (
              <div className="tab-content">
                <div className="panel-header">
                  <h2>种族配置</h2>
                  <label className="compact-label">
                    {renderFieldLabel("数量", "raceCount")}
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={config.races.length}
                      onChange={(event) => updateRaceCount(Number(event.target.value) || 1)}
                    />
                  </label>
                </div>
                <RaceProfileSection
                  editingRaceLabel={renderFieldLabel("当前编辑种族", "editingRace")}
                  nameLabel={renderFieldLabel("种族参数模板名称", "raceProfileName")}
                  currentLabel={<span>当前种族参数模板</span>}
                  selectedRaceId={selectedRaceId}
                  races={raceSelectOptions}
                  onSelectRace={setSelectedRaceId}
                  value={customRaceProfileLabel}
                  onValueChange={setCustomRaceProfileLabel}
                  selectedProfileId={selectedRaceProfileId}
                  profiles={customRaceProfiles}
                  onSelectProfile={handleSelectRaceProfile}
                  onSave={handleSaveCustomRaceProfile}
                  onImportClick={() => raceProfileImportRef.current?.click()}
                  importRef={raceProfileImportRef}
                  onImportChange={handleImportCustomRaceProfiles}
                />
                <div className="race-list">
                  {config.races.filter((race) => race.id === selectedRaceId).map((race) => (
                    <article key={race.id} className="race-card">
                      <div className="race-card-header">
                        <span
                          className="race-chip active static"
                          style={{
                            borderColor: race.color,
                            color: race.color,
                            backgroundColor: `${race.color}22`,
                            boxShadow: `inset 0 0 0 1px ${race.color}33`,
                          }}
                        >
                          {race.name}
                        </span>
                        <span className="risk-badge">
                          <span>风险 {balanceRisks[race.id]}</span>
                          <InfoChoiceGroup title="风险说明" value="info" options={FIELD_HELP.balanceRisk} />
                        </span>
                      </div>
                      <div className="field-grid compact">
                        <label>
                          {renderFieldLabel("名称", "raceName")}
                          <input
                            value={race.name}
                            onChange={(event) => updateRace(race.id, { name: event.target.value })}
                          />
                        </label>
                        <label>
                          {renderFieldLabel("颜色", "raceColor")}
                          <input
                            type="color"
                            value={race.color}
                            onChange={(event) => updateRace(race.id, { color: event.target.value })}
                          />
                        </label>
                        <label>
                          {renderFieldLabel("阵营编号", "campId")}
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={race.campId}
                            onChange={(event) =>
                              updateRace(race.id, { campId: Number(event.target.value) || 1 })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("初始细胞", "initialCells")}
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={race.initialCells}
                            onChange={(event) =>
                              updateRace(race.id, {
                                initialCells: Number(event.target.value) || 0,
                              })
                            }
                          />
                        </label>
                        <div className="field-grid-span">
                          <button
                            type="button"
                            className={
                              raceAdvancedOpen[race.id] ? "control-button active" : "control-button"
                            }
                            onClick={() => toggleRaceAdvanced(race.id)}
                          >
                            {raceAdvancedOpen[race.id] ? "收起高级参数" : "展开高级参数"}
                          </button>
                        </div>
                        {raceAdvancedOpen[race.id] ? (
                          <>
                        <label>
                          {renderFieldLabel("HP 上限", "hpMax")}
                          <input
                            type="number"
                            min={1}
                            max={9}
                            value={race.hpMax}
                            onChange={(event) =>
                              updateRace(race.id, { hpMax: Number(event.target.value) || 1 })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel(
                            "种族特性",
                            "trait",
                            race.trait,
                            traitOptions as HelpOption<string>[],
                          )}
                          <OptionSelect
                            value={race.trait}
                            options={traitOptions}
                            ariaLabel="种族特性"
                            onChange={(value) =>
                              updateRace(race.id, {
                                trait: value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("存活下限", "surviveMin")}
                          <input
                            type="number"
                            min={0}
                            max={neighborhoodSize}
                            value={race.surviveRange[0]}
                            onChange={(event) =>
                              updateRace(race.id, {
                                surviveRange: [Number(event.target.value) || 0, race.surviveRange[1]],
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("存活上限", "surviveMax")}
                          <input
                            type="number"
                            min={0}
                            max={neighborhoodSize}
                            value={race.surviveRange[1]}
                            onChange={(event) =>
                              updateRace(race.id, {
                                surviveRange: [race.surviveRange[0], Number(event.target.value) || 0],
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("出生下限", "birthMin")}
                          <input
                            type="number"
                            min={0}
                            max={neighborhoodSize}
                            value={race.birthRange[0]}
                            onChange={(event) =>
                              updateRace(race.id, {
                                birthRange: [Number(event.target.value) || 0, race.birthRange[1]],
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("出生上限", "birthMax")}
                          <input
                            type="number"
                            min={0}
                            max={neighborhoodSize}
                            value={race.birthRange[1]}
                            onChange={(event) =>
                              updateRace(race.id, {
                                birthRange: [race.birthRange[0], Number(event.target.value) || 0],
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("恢复倍率", "regen")}
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={race.regen}
                            onChange={(event) =>
                              updateRace(race.id, { regen: Number(event.target.value) || 0 })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("天灾抗性", "disasterResistance")}
                          <input
                            type="number"
                            min={1}
                            max={10}
                            step={0.5}
                            value={race.disasterResistance}
                            onChange={(event) =>
                              updateRace(race.id, {
                                disasterResistance: Number(event.target.value) || 1,
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel("对敌抗性", "enemyResistance")}
                          <input
                            type="number"
                            min={1}
                            max={10}
                            step={0.5}
                            value={race.enemyResistance}
                            onChange={(event) =>
                              updateRace(race.id, {
                                enemyResistance: Number(event.target.value) || 1,
                              })
                            }
                          />
                        </label>
                        <label>
                          {renderFieldLabel(
                            "AI 风格",
                            "aiProfile",
                            race.aiProfile,
                            aiProfileOptions as HelpOption<string>[],
                          )}
                          <OptionSelect
                            value={race.aiProfile}
                            options={aiProfileOptions}
                            ariaLabel="AI 风格"
                            onChange={(value) =>
                              updateRace(race.id, {
                                aiProfile: value,
                              })
                            }
                          />
                        </label>
                          </>
                        ) : null}
                        <div className="race-usage">
                          当前布子 {countRaceCells(setupBoard, race.id)} / {race.initialCells}，
                          当前阵营 {race.campId}，特性：{getTraitLabel(race.trait)}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
