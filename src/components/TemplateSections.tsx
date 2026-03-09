import type { ChangeEvent, ReactNode, RefObject } from "react";
import type { PatternTemplate } from "../core/patterns";
import type { ConfigProfileRecord, RaceProfileRecord } from "../core/profiles";

/**
 * 定义场景预设区块组件的属性。
 */
interface ScenePresetSectionProps {
  /**
   * 场景预设选择标签节点。
   */
  sceneLabel: ReactNode;
  /**
   * 当前选中的场景编号。
   */
  selectedSceneId: string;
  /**
   * 当前可用的场景预设列表。
   */
  scenes: Array<{ id: string; label: string }>;
  /**
   * 选择场景后的回调。
   */
  onSelectScene: (sceneId: string) => void;
  /**
   * 当前可用场景总数。
   */
  sceneCount: number;
}

/**
 * 渲染场景预设区块。
 *
 * Args:
 *   props: 场景预设区块所需的全部界面属性。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的场景区块节点。
 */
export function ScenePresetSection(props: ScenePresetSectionProps): ReactNode {
  return (
    <div className="scene-box">
      <h3>场景预设</h3>
      <label>
        {props.sceneLabel}
        <select
          value={props.selectedSceneId}
          onChange={(event) => props.onSelectScene(event.target.value)}
        >
          <option value="">空模板（默认空场景）</option>
          {props.scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.label}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        当前地图可用预设场景数：{props.sceneCount}。选择某个预设场景后会立即加载对应参数与开局棋盘。内置场景包含经典康威、方形知名变种，以及六边形/三角形专用设计。
      </p>
    </div>
  );
}

/**
 * 定义图样预设区块组件的属性。
 */
interface PatternPresetSectionProps {
  /**
   * 图样预设选择标签节点。
   */
  patternLabel: ReactNode;
  /**
   * 当前种族选择标签节点。
   */
  raceLabel: ReactNode;
  /**
   * 当前选中的图样编号。
   */
  selectedPatternId: string;
  /**
   * 当前可用的图样预设与模板列表。
   */
  patterns: PatternTemplate[];
  /**
   * 选择图样后的回调。
   */
  onSelectPattern: (patternId: string) => void;
  /**
   * 当前选中的种族编号。
   */
  selectedRaceId: number;
  /**
   * 当前可选种族列表。
   */
  races: Array<{ id: number; name: string }>;
  /**
   * 切换当前种族后的回调。
   */
  onSelectRace: (raceId: number) => void;
  /**
   * 是否已选中可放置图样。
   */
  hasSelectedPattern: boolean;
  /**
   * 当前是否存在图样选区。
   */
  hasSelectedPatternCells: boolean;
  /**
   * 当前是否可以撤销。
   */
  canUndo: boolean;
  /**
   * 当前是否可以重做。
   */
  canRedo: boolean;
  /**
   * 进入放置模式回调。
   */
  onBeginPlacement: () => void;
  /**
   * 进入移动模式回调。
   */
  onBeginMove: () => void;
  /**
   * 撤销回调。
   */
  onUndo: () => void;
  /**
   * 重做回调。
   */
  onRedo: () => void;
  /**
   * 清空棋盘回调。
   */
  onClearBoard: () => void;
  /**
   * 当前选中的图样对象。
   */
  selectedPattern: PatternTemplate | null;
  /**
   * 当前选中的种族名称。
   */
  selectedRaceName: string;
  /**
   * 当前图样是否为自定义模板。
   */
  selectedPatternIsCustom: boolean;
}

/**
 * 渲染图样预设区块。
 *
 * Args:
 *   props: 图样预设区块所需的全部界面属性。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的图样预设区块节点。
 */
export function PatternPresetSection(props: PatternPresetSectionProps): ReactNode {
  return (
    <div className="scene-box">
      <h3>图样预设</h3>
      <div className="toolbar-grid">
        <label>
          {props.patternLabel}
          <select
            value={props.selectedPatternId}
            onChange={(event) => props.onSelectPattern(event.target.value)}
          >
            <option value="">空模板（不放置图样）</option>
            {props.patterns.map((pattern) => (
              <option key={pattern.id} value={pattern.id}>
                {pattern.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {props.raceLabel}
          <select
            value={props.selectedRaceId}
            onChange={(event) => props.onSelectRace(Number(event.target.value))}
          >
            {props.races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="preset-row">
        <button type="button" onClick={props.onBeginPlacement} disabled={!props.hasSelectedPattern}>
          进入放置模式
        </button>
        <button type="button" onClick={props.onBeginMove} disabled={!props.hasSelectedPatternCells}>
          进入移动模式
        </button>
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
          撤销
        </button>
        <button type="button" onClick={props.onRedo} disabled={!props.canRedo}>
          重做
        </button>
        <button type="button" onClick={props.onClearBoard}>
          清空
        </button>
      </div>
      <p className="hint">
        当前图样预设/模板：{props.selectedPattern ? props.selectedPattern.label : "空模板"}。当前选中种族：
        {props.selectedRaceName || "-"}。先进入放置模式，再在棋盘上选择图样放置位置。若要导出或移动图样，请先切到“选择图样”并完成点选/框选。方形、六边形和三角形会自动过滤不适用的预加载图样。
        {props.selectedPatternIsCustom ? " 当前选中的是导入的自定义图样模板。" : ""}
      </p>
    </div>
  );
}

/**
 * 定义图样模板文件区块组件的属性。
 */
interface PatternTemplateFileSectionProps {
  /**
   * 图样名称输入框标签节点。
   */
  nameLabel: ReactNode;
  /**
   * 当前输入的图样名称。
   */
  value: string;
  /**
   * 图样名称变化回调。
   */
  onValueChange: (nextValue: string) => void;
  /**
   * 导出按钮是否可用。
   */
  canSave: boolean;
  /**
   * 执行导出图样模板的回调。
   */
  onSave: () => void;
  /**
   * 触发打开导入文件选择框的回调。
   */
  onImportClick: () => void;
  /**
   * 图样模板文件导入输入框引用。
   */
  importRef: RefObject<HTMLInputElement | null>;
  /**
   * 图样模板文件导入变更回调。
   */
  onImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * 渲染图样模板文件区块。
 *
 * Args:
 *   props: 图样模板导入导出所需的全部界面属性。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的模板区块节点。
 */
export function PatternTemplateFileSection(
  props: PatternTemplateFileSectionProps,
): ReactNode {
  return (
    <>
      <div className="scene-box">
        <h3>图样模板文件</h3>
        <div className="toolbar-grid">
          <label>
            {props.nameLabel}
            <input
              value={props.value}
              onChange={(event) => props.onValueChange(event.target.value)}
              placeholder="例如：我的六边形阵型"
            />
          </label>
          <button type="button" onClick={props.onSave} disabled={!props.canSave}>
            导出当前选区图样模板
          </button>
          <button type="button" onClick={props.onImportClick}>
            导入自定义图样模板
          </button>
        </div>
        <p className="hint">
          图样模板以文件方式导入导出。预设图样不可修改；若需要调整，请先在棋盘上选择图样后再导出为新的自定义模板文件。
        </p>
      </div>
      <input
        ref={props.importRef}
        className="hidden-input"
        type="file"
        accept="application/json"
        onChange={props.onImportChange}
      />
    </>
  );
}

/**
 * 定义场景参数模板区块组件的属性。
 */
interface ConfigProfileSectionProps {
  /**
   * 模板名称输入标签节点。
   */
  nameLabel: ReactNode;
  /**
   * 当前模板选择框标签节点。
   */
  currentLabel: ReactNode;
  /**
   * 当前输入的模板名称。
   */
  value: string;
  /**
   * 模板名称变化回调。
   */
  onValueChange: (nextValue: string) => void;
  /**
   * 当前选中的模板编号。
   */
  selectedId: string;
  /**
   * 当前可用的自定义场景参数模板列表。
   */
  profiles: ConfigProfileRecord[];
  /**
   * 选择模板后的回调。
   */
  onSelect: (profileId: string) => void;
  /**
   * 导出模板回调。
   */
  onSave: () => void;
  /**
   * 打开导入文件选择框的回调。
   */
  onImportClick: () => void;
  /**
   * 导入文件输入框引用。
   */
  importRef: RefObject<HTMLInputElement | null>;
  /**
   * 导入文件变更回调。
   */
  onImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * 渲染场景参数模板区块。
 *
 * Args:
 *   props: 场景参数模板区块所需的全部界面属性。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的模板区块节点。
 */
export function ConfigProfileSection(props: ConfigProfileSectionProps): ReactNode {
  return (
    <div className="scene-box">
      <h3>场景参数模板</h3>
      <label>
        {props.nameLabel}
        <input
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          placeholder="例如：我的场景参数模板"
        />
      </label>
      <label>
        {props.currentLabel}
        <select
          value={props.selectedId}
          onChange={(event) => props.onSelect(event.target.value)}
        >
          <option value="">空模板（默认参数）</option>
          {props.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>
      <div className="preset-row">
        <button type="button" onClick={props.onSave}>
          导出当前场景参数模板
        </button>
        <button type="button" onClick={props.onImportClick}>
          导入自定义场景参数模板
        </button>
      </div>
      <input
        ref={props.importRef}
        className="hidden-input"
        type="file"
        accept="application/json"
        onChange={props.onImportChange}
      />
      <p className="hint">
        场景参数模板会保存当前通用页与规则页里的完整参数配置，但不会保存当前棋盘布子。模板文件的重命名、删除与归档请直接在文件层面处理。
      </p>
    </div>
  );
}

/**
 * 定义种族参数模板区块组件的属性。
 */
interface RaceProfileSectionProps {
  /**
   * 当前编辑种族标签节点。
   */
  editingRaceLabel: ReactNode;
  /**
   * 模板名称输入标签节点。
   */
  nameLabel: ReactNode;
  /**
   * 当前模板选择框标签节点。
   */
  currentLabel: ReactNode;
  /**
   * 当前选中的种族编号。
   */
  selectedRaceId: number;
  /**
   * 当前可编辑的种族名称列表。
   */
  races: Array<{ id: number; name: string }>;
  /**
   * 切换当前编辑种族的回调。
   */
  onSelectRace: (raceId: number) => void;
  /**
   * 当前输入的模板名称。
   */
  value: string;
  /**
   * 模板名称变化回调。
   */
  onValueChange: (nextValue: string) => void;
  /**
   * 当前选中的模板编号。
   */
  selectedProfileId: string;
  /**
   * 当前可用的自定义种族参数模板列表。
   */
  profiles: RaceProfileRecord[];
  /**
   * 选择模板后的回调。
   */
  onSelectProfile: (profileId: string) => void;
  /**
   * 导出模板回调。
   */
  onSave: () => void;
  /**
   * 打开导入文件选择框的回调。
   */
  onImportClick: () => void;
  /**
   * 导入文件输入框引用。
   */
  importRef: RefObject<HTMLInputElement | null>;
  /**
   * 导入文件变更回调。
   */
  onImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * 渲染种族参数模板区块。
 *
 * Args:
 *   props: 种族参数模板区块所需的全部界面属性。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的模板区块节点。
 */
export function RaceProfileSection(props: RaceProfileSectionProps): ReactNode {
  return (
    <div className="scene-box">
      <h3>种族参数模板</h3>
      <label>
        {props.editingRaceLabel}
        <select
          value={props.selectedRaceId}
          onChange={(event) => props.onSelectRace(Number(event.target.value))}
        >
          {props.races.map((race) => (
            <option key={race.id} value={race.id}>
              {race.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {props.nameLabel}
        <input
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          placeholder="例如：三阵营种族参数模板"
        />
      </label>
      <label>
        {props.currentLabel}
        <select
          value={props.selectedProfileId}
          onChange={(event) => props.onSelectProfile(event.target.value)}
        >
          <option value="">空模板（默认种族）</option>
          {props.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>
      <div className="preset-row">
        <button type="button" onClick={props.onSave}>
          导出当前种族参数模板
        </button>
        <button type="button" onClick={props.onImportClick}>
          导入自定义种族参数模板
        </button>
      </div>
      <input
        ref={props.importRef}
        className="hidden-input"
        type="file"
        accept="application/json"
        onChange={props.onImportChange}
      />
      <p className="hint">
        选择种族参数模板后会立即覆盖当前所有种族配置。预设空模板会恢复默认单种族参数。模板文件的重命名、删除与归档请直接在文件层面处理。
      </p>
    </div>
  );
}
