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
 * 定义字段旁悬停说明入口的组件属性。
 */
interface InfoChoiceGroupProps<TValue extends string> {
  /**
   * 说明框标题。
   */
  title: string;
  /**
   * 当前选中值。
   */
  value: TValue;
  /**
   * 所有可选项。
   */
  options: HelpOption<TValue>[];
}

/**
 * 将原始鼠标坐标修正到视口内，避免说明框超出屏幕范围。
 *
 * Args:
 *   x: 说明框期望显示的横坐标，单位为像素。
 *   y: 说明框期望显示的纵坐标，单位为像素。
 *   width: 说明框实际宽度，单位为像素。
 *   height: 说明框实际高度，单位为像素。
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
 * 渲染字段旁的悬停说明入口。
 *
 * 鼠标在说明入口停留 0.5 秒后，会在鼠标附近显示该字段全部候选项的说明，并高亮当前已选项。
 *
 * Args:
 *   props: 组件属性，包含说明标题、当前选项与全部候选项。
 *
 * Returns:
 *   ReactElement: 可悬停查看详情的提示入口。
 */
export default function InfoChoiceGroup<TValue extends string>(
  props: InfoChoiceGroupProps<TValue>,
): ReactElement {
  const [visible, setVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef({ x: 0, y: 0 });
  const activeValue =
    props.options.some((option) => option.value === props.value)
      ? props.value
      : (props.options[0]?.value ?? props.value);

  /**
   * 清理当前延时显示定时器。
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
   * 使用当前锚点与说明框尺寸更新说明框位置，并确保其位于视口内。
   *
   * Returns:
   *   void: 无返回值。
   */
  function updateTooltipPosition(): void {
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 320;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 180;
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
   * 根据当前鼠标位置安排说明框延时显示。
   *
   * Args:
   *   clientX: 鼠标横坐标，单位为像素。
   *   clientY: 鼠标纵坐标，单位为像素。
   *
   * Returns:
   *   void: 无返回值。
   */
  function scheduleTooltip(clientX: number, clientY: number): void {
    clearHoverTimer();
    anchorRef.current = { x: clientX + 14, y: clientY + 14 };
    timerRef.current = window.setTimeout(() => {
      setVisible(true);
      timerRef.current = null;
    }, 500);
  }

  /**
   * 隐藏说明框并清理定时器。
   *
   * Returns:
   *   void: 无返回值。
   */
  function hideTooltip(): void {
    clearHoverTimer();
    setVisible(false);
  }

  /**
   * 处理鼠标进入说明入口时的悬停逻辑。
   *
   * Args:
   *   event: React 鼠标事件，提供当前指针在视口中的坐标。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleMouseEnter(event: ReactMouseEvent<HTMLButtonElement>): void {
    scheduleTooltip(event.clientX, event.clientY);
  }

  /**
   * 处理鼠标在说明入口上移动时的位置更新逻辑。
   *
   * Args:
   *   event: React 鼠标事件，提供当前指针在视口中的坐标。
   *
   * Returns:
   *   void: 无返回值。
   */
  function handleMouseMove(event: ReactMouseEvent<HTMLButtonElement>): void {
    anchorRef.current = { x: event.clientX + 14, y: event.clientY + 14 };
    if (visible) {
      updateTooltipPosition();
    }
  }

  useEffect(() => {
    if (!visible) {
      return;
    }

    updateTooltipPosition();
  }, [visible, props.options, props.value]);

  useEffect(() => {
    return () => {
      clearHoverTimer();
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="field-info-badge"
        aria-label={`${props.title}，悬停查看详情`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={hideTooltip}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          scheduleTooltip(rect.right, rect.bottom);
        }}
        onBlur={hideTooltip}
      >
        ?
      </button>
      {visible
        ? createPortal(
            <div
              ref={tooltipRef}
              className="field-info-tooltip"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`,
              }}
            >
              <strong>{props.title}</strong>
              <div className="field-info-list">
                {props.options.map((option) => (
                  <div
                    key={option.value}
                    className={
                      option.value === activeValue
                        ? "field-info-option active"
                        : "field-info-option"
                    }
                  >
                    <span>{option.label}</span>
                    <small>{option.description}</small>
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
