/**
 * 定义说明项结构。
 */
export interface HelpOption<TValue extends string = string> {
  /**
   * 说明项对应的唯一值。
   */
  value: TValue;
  /**
   * 说明项标题。
   */
  label: string;
  /**
   * 说明项详细内容。
   */
  description: string;
}
