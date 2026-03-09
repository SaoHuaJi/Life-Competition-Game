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
 * 定义按钮组选项说明组件属性。
 */
interface OptionButtonRowProps<TValue extends string> {
  /**
   * 当前选中的值。
   */
  value: TValue;
  /**
   * 选项列表。
   */
  options: HelpOption<TValue>[];
  /**
   * 点击某个按钮后的回调。
   */
  onChange: (value: TValue) => void;
}

/**
 * 将说明框位置限制在当前浏览器视口内。
 *
 * Args:
 *   x: 目标横坐标。
 *   y: 目标纵坐标。
 *   width: 说明框宽度。
 *   height: 说明框高度。
 *
 * Returns:
 *   { x: number; y: number }: 修正后的坐标。
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
 * 渲染支持选项悬停说明的按钮组。
 *
 * Args:
 *   props: 组件属性，包含当前选项、可选项和切换回调。
 *
 * Returns:
 *   ReactElement: 带悬停说明的按钮组。
 */
export default function OptionButtonRow<TValue extends string>(
  props: OptionButtonRowProps<TValue>,
): ReactElement {
  const [visibleOption, setVisibleOption] = useState<HelpOption<TValue> | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const anchorRef = useRef({ x: 0, y: 0 });

  /**
   * 清理悬停说明延时器。
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
   * 根据当前锚点刷新说明框位置。
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
   * 安排在悬停 0.5 秒后显示选项说明。
   *
   * Args:
   *   option: 当前悬停选项。
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
   * 隐藏当前说明框。
   *
   * Returns:
   *   void: 无返回值。
   */
  function hideTooltip(): void {
    clearHoverTimer();
    setVisibleOption(null);
  }

  useEffect(() => {
    if (!visibleOption) {
      return;
    }

    updateTooltipPosition();
  }, [visibleOption]);

  useEffect(() => {
    return () => {
      clearHoverTimer();
    };
  }, []);

  return (
    <div className="option-button-row">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === props.value ? "control-button active" : "control-button"}
          onClick={() => {
            props.onChange(option.value);
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
