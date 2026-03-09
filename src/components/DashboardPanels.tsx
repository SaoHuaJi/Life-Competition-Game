import type { ReactNode } from "react";
import type {
  CampStats,
  GenerationStats,
  MatchLogEntry,
  RaceStats,
} from "../core/types";

/**
 * 定义种族排名条目的渲染数据。
 */
interface RaceRankingEntry {
  /**
   * 排名名次。
   */
  rank: number;
  /**
   * 对应种族编号。
   */
  raceId: number;
  /**
   * 该种族的统计信息。
   */
  stats: RaceStats;
}

/**
 * 定义阵营排名条目的渲染数据。
 */
interface CampRankingEntry {
  /**
   * 排名名次。
   */
  rank: number;
  /**
   * 对应阵营编号。
   */
  campId: number;
  /**
   * 该阵营的统计信息。
   */
  stats: CampStats;
}

/**
 * 定义统计面板组件属性。
 */
interface StatsPanelProps {
  /**
   * 当前展示的世代统计，布子阶段可能为空。
   */
  displayedStats: GenerationStats | null;
  /**
   * 当前对局是否已结束。
   */
  finished: boolean;
  /**
   * 种族排名条目列表。
   */
  rankingEntries: RaceRankingEntry[];
  /**
   * 阵营排名条目列表。
   */
  campRankingEntries: CampRankingEntry[];
  /**
   * 根据种族编号返回展示名称。
   */
  getRaceName: (raceId: number) => string;
  /**
   * 根据种族编号返回展示颜色。
   */
  getRaceColor: (raceId: number) => string | undefined;
}

/**
 * 渲染统计与排名面板。
 *
 * Args:
 *   props: 统计、种族排名与阵营排名的全部渲染数据。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的统计面板节点。
 */
export function StatsPanel(props: StatsPanelProps): ReactNode {
  return (
    <article className="panel">
      <h2>统计</h2>
      {props.displayedStats ? (
        <div className="stat-list">
          {props.displayedStats.raceStats.map((raceStat) => (
            <div key={raceStat.raceId} className="stat-row">
              <span className="dot" style={{ backgroundColor: props.getRaceColor(raceStat.raceId) }} />
              <span>{props.getRaceName(raceStat.raceId)}</span>
              <span>细胞 {raceStat.aliveCells}</span>
              <span>总 HP {raceStat.totalHp}</span>
              <span>占点 {raceStat.controlPoints}</span>
              <span>累计产生 {raceStat.cumulativeGeneratedCells}</span>
              <span>存活回合 {raceStat.aliveTurns}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-text">布子阶段暂无世代统计。</p>
      )}
      {props.finished ? (
        <div className="ranking-box">
          <h3>种族排名</h3>
          <ul className="summary-list">
            {props.rankingEntries.map((entry) => (
              <li key={entry.raceId} className="issue ok">
                第 {entry.rank} 名 · {props.getRaceName(entry.raceId)} · 细胞 {entry.stats.aliveCells}
                · 总 HP {entry.stats.totalHp} · 占点 {entry.stats.controlPoints}
                · 累计产生 {entry.stats.cumulativeGeneratedCells} · 存活回合 {entry.stats.aliveTurns}
              </li>
            ))}
          </ul>
          <h3>阵营排名</h3>
          <ul className="summary-list">
            {props.campRankingEntries.map((entry) => {
              const memberNames = entry.stats.raceIds.map((raceId) => props.getRaceName(raceId));

              return (
                <li key={entry.campId} className="issue ok">
                  第 {entry.rank} 名 · 阵营 {entry.campId} · 成员 {memberNames.join(" / ")}
                  · 细胞 {entry.stats.aliveCells} · 总 HP {entry.stats.totalHp}
                  · 占点 {entry.stats.controlPoints} · 累计产生 {entry.stats.cumulativeGeneratedCells}
                  · 存活回合 {entry.stats.aliveTurns}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

/**
 * 定义日志面板组件属性。
 */
interface LogsPanelProps {
  /**
   * 当前需要展示的日志列表。
   */
  logs: MatchLogEntry[];
}

/**
 * 渲染日志面板。
 *
 * Args:
 *   props: 日志列表渲染所需的全部数据。
 *
 * Returns:
 *   ReactNode: 可直接挂载到页面中的日志面板节点。
 */
export function LogsPanel(props: LogsPanelProps): ReactNode {
  return (
    <article className="panel">
      <h2>日志</h2>
      <ul className="log-list">
        {props.logs.length === 0 ? (
          <li className="log-item">尚无日志。</li>
        ) : (
          props.logs.map((log, index) => (
            <li key={`${log.generation}-${log.type}-${index}`} className="log-item">
              G{log.generation} · {log.message}
            </li>
          ))
        )}
      </ul>
    </article>
  );
}
