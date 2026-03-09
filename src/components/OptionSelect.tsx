import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import type { HelpOption } from "./helpTypes";

/**
 * 定义带选项说明的自定义下拉选择组件属性。
 */
interface OptionSelectProps<TValue extends string> {
  /**
   * 当前选中的值。
   */
  value: TValue;
  /**
   * 选项列表。
   */
  options: HelpOption<TValue>[];
  /**
   * 值变更回调。
   */
  onChange: (value: TValue) => void;
  /**
   * 无障碍名称。
   */
  ariaLabel: string;
}

/**
 * 将说明框位置约束在当前浏览器视口内。
 *
 * Args:
 *   x: 目标横坐标。
 *   y: 目标纵坐标。
 *   width: 说明框宽度。
 *   height: 说明框高度。
 *
 * Returns:
 *   { x: number; y: number }: 修正后的视口内坐标。
 */
function clampTooltipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const padding = 12;
  return {
    x: Math.min(Math.max(padding, x), Math.max(padding, window.innerWidth - width - padding)),
    y: Math.min(Math.max(padding, y), Math.max(padding, window.innerHeight - height - padding)),
  };
}

/**
 * 渲染支持“悬停选项 0.5 秒显示说明”的自定义下拉选择器。
 *
 * Args:
 *   props: 组件属性，包含当前值、选项列表和值变更回调。
 *
 * Returns:
 *   ReactElement: 可展开并显示选项说明的选择器。
 */
export default function OptionSelect<TValue extends string>(
  props: OptionSelectProps<TValue>,
): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [visibleOption, setVisibleOption] = useState<HelpOption<TValue> | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const anchorRef = useRef({ x: 0, y: 0 });

  /**
   * 清理当前悬停定时器。
   *
   * Returns:
   *   void: 无返回值。
   */
  function clearHoverTimer(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  /**
   * 使用当前锚点更新说明框位置，并保证其仍处于视口内。
   *
   * Returns:
   *   void: 无返回值。
   */
  function updateTooltipPosition(): void {
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 300;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 120;
    setTooltipPosition(
      clampTooltipPosition(
        anchorRef.current.x,
        anchorRef.current.y,
        tooltipWidth,
        tooltipHeight,
      ),
    );
  }

  /**
   * 安排在悬停 0.5 秒后显示指定选项说明。
   *
   * Args:
   *   option: 当前悬停的选项。
   *   clientX: 鼠标横坐标。
   *   clientY: 鼠标纵坐标。
   *
   * Returns:
   *   void: 无返回值。
   */
  function scheduleTooltip(
    option: HelpOption<TValue>,
    clientX: number,
    clientY: number,
  ): void {
    clearHoverTimer();
    anchorRef.current = { x: clientX + 14, y: clientY + 14 };
    timerRef.current = window.setTimeout(() => {
      setVisibleOption(option);
      timerRef.current = null;
    }, 500);
  }

  /**
   * 隐藏当前选项说明。
   *
   * Returns:
   *   void: 无返回值。
   */
  function hideTooltip(): void {
    clearHoverTimer();
    setVisibleOption(null);
  }

  useEffect(() => {
    /**
     * 处理点击组件外部区域时收起下拉与说明。
     *
     * Args:
     *   event: 浏览器鼠标事件。
     *
     * Returns:
     *   void: 无返回值。
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
        hideTooltip();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      clearHoverTimer();
    };
  }, []);

  useEffect(() => {
    if (!visibleOption) {
      return;
    }

    updateTooltipPosition();
  }, [visibleOption]);

  const selectedOption =
    props.options.find((option) => option.value === props.value) ?? props.options[0] ?? null;

  return (
    <div ref={rootRef} className="option-select">
      <button
        type="button"
        className={expanded ? "option-select-trigger active" : "option-select-trigger"}
        aria-label={props.ariaLabel}
        onClick={() => {
          setExpanded((previous) => !previous);
          hideTooltip();
        }}
      >
        <span>{selectedOption?.label ?? props.value}</span>
        <span className="option-select-caret">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded ? (
        <div className="option-select-menu">
          {props.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                option.value === props.value ? "option-select-item active" : "option-select-item"
              }
              onClick={() => {
                props.onChange(option.value);
                setExpanded(false);
                hideTooltip();
              }}
              onMouseEnter={(event: ReactMouseEvent<HTMLButtonElement>) =>
                scheduleTooltip(option, event.clientX, event.clientY)
              }
              onMouseMove={(event: ReactMouseEvent<HTMLButtonElement>) => {
                anchorRef.current = { x: event.clientX + 14, y: event.clientY + 14 };
                if (visibleOption?.value === option.value) {
                  updateTooltipPosition();
                }
              }}
              onMouseLeave={hideTooltip}
              onFocus={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                scheduleTooltip(option, rect.right, rect.bottom);
              }}
              onBlur={hideTooltip}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {visibleOption
        ? createPortal(
            <div
              ref={tooltipRef}
              className="field-info-tooltip"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`,
              }}
            >
              <strong>{visibleOption.label}</strong>
              <div className="field-info-list">
                <div className="field-info-option active">
                  <small>{visibleOption.description}</small>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
